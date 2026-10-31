import {
  type ClientFrame,
  type Credential,
  type DeviceHello,
  type ErrorCode,
  type Event,
  type HubInfo,
  PROTOCOL_VERSION,
  type ProtocolError,
  type Request,
  type Response,
  type ServerFrame,
} from "@xiaoban/protocol";

export type ConnectionStatus = "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface Welcome {
  hub: HubInfo;
  deviceToken: string | null;
}

export interface HubClientOptions {
  url: string;
  device: Omit<DeviceHello, "credential">;
  credential: Credential;
  reconnect?: boolean;
  createSocket?: (url: string) => WebSocket;
}

type ResponseOf<T extends Response["type"]> = Extract<Response, { type: T }>;

interface Pending {
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

export class HubRequestError extends Error {
  readonly code: ErrorCode;

  constructor(error: ProtocolError) {
    super(error.detail);
    this.name = "HubRequestError";
    this.code = error.code;
  }
}

const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 10_000;

export class HubClient {
  readonly #options: HubClientOptions;
  #credential: Credential;
  #socket: WebSocket | null = null;
  #status: ConnectionStatus = "idle";
  #nextId = 0;
  #attempt = 0;
  #closing = false;
  #retryTimer: ReturnType<typeof setTimeout> | null = null;
  readonly #pending = new Map<number, Pending>();
  readonly #eventListeners = new Set<(event: Event) => void>();
  readonly #statusListeners = new Set<(status: ConnectionStatus) => void>();
  readonly #welcomeListeners = new Set<(welcome: Welcome) => void>();

  constructor(options: HubClientOptions) {
    this.#options = options;
    this.#credential = options.credential;
  }

  get status(): ConnectionStatus {
    return this.#status;
  }

  connect(): Promise<Welcome> {
    this.#closing = false;
    return new Promise((resolve, reject) => {
      const stop = this.onWelcome((welcome) => {
        stop();
        resolve(welcome);
      });
      this.#open(reject);
    });
  }

  close(): void {
    this.#closing = true;
    if (this.#retryTimer) {
      clearTimeout(this.#retryTimer);
      this.#retryTimer = null;
    }
    this.#socket?.close();
    this.#setStatus("closed");
  }

  async request<T extends Response["type"]>(body: Request, expect: T): Promise<ResponseOf<T>> {
    const socket = this.#socket;
    if (!socket || this.#status !== "open") {
      throw new Error("hub is not connected");
    }
    this.#nextId += 1;
    const id = this.#nextId;
    const response = await new Promise<Response>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send(socket, { type: "request", id, body });
    });
    if (response.type !== expect) {
      throw new Error(`expected ${expect} response, got ${response.type}`);
    }
    return response as ResponseOf<T>;
  }

  onEvent(listener: (event: Event) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  onStatus(listener: (status: ConnectionStatus) => void): () => void {
    this.#statusListeners.add(listener);
    return () => this.#statusListeners.delete(listener);
  }

  onWelcome(listener: (welcome: Welcome) => void): () => void {
    this.#welcomeListeners.add(listener);
    return () => this.#welcomeListeners.delete(listener);
  }

  #open(onFatal?: (error: Error) => void): void {
    this.#setStatus(this.#attempt === 0 ? "connecting" : "reconnecting");
    const create = this.#options.createSocket ?? ((url: string) => new WebSocket(url));
    const socket = create(this.#options.url);
    this.#socket = socket;

    socket.addEventListener("open", () => {
      this.#send(socket, {
        type: "hello",
        protocol: PROTOCOL_VERSION,
        device: { ...this.#options.device, credential: this.#credential },
      });
    });
    socket.addEventListener("message", (message: MessageEvent) => {
      if (typeof message.data === "string") {
        this.#receive(JSON.parse(message.data) as ServerFrame, onFatal);
      }
    });
    socket.addEventListener("close", () => this.#handleClose(socket));
  }

  #receive(frame: ServerFrame, onFatal?: (error: Error) => void): void {
    switch (frame.type) {
      case "welcome": {
        this.#attempt = 0;
        if (frame.deviceToken) {
          this.#credential = { kind: "paired", token: frame.deviceToken };
        }
        this.#setStatus("open");
        const welcome = { hub: frame.hub, deviceToken: frame.deviceToken };
        for (const listener of this.#welcomeListeners) listener(welcome);
        return;
      }
      case "response": {
        this.#pending.get(frame.id)?.resolve(frame.body);
        this.#pending.delete(frame.id);
        return;
      }
      case "error": {
        const error = new HubRequestError(frame.error);
        if (frame.id === null) {
          this.#closing = error.code === "unauthorized" || error.code === "unsupported_protocol";
          onFatal?.(error);
          return;
        }
        this.#pending.get(frame.id)?.reject(error);
        this.#pending.delete(frame.id);
        return;
      }
      case "event": {
        for (const listener of this.#eventListeners) listener(frame.event);
        return;
      }
    }
  }

  #handleClose(socket: WebSocket): void {
    if (this.#socket !== socket) return;
    this.#socket = null;
    for (const pending of this.#pending.values()) {
      pending.reject(new Error("connection closed"));
    }
    this.#pending.clear();
    if (this.#closing || this.#options.reconnect === false) {
      this.#setStatus("closed");
      return;
    }
    const delay = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** this.#attempt);
    this.#attempt += 1;
    this.#setStatus("reconnecting");
    this.#retryTimer = setTimeout(() => this.#open(), delay);
  }

  #send(socket: WebSocket, frame: ClientFrame): void {
    socket.send(JSON.stringify(frame));
  }

  #setStatus(status: ConnectionStatus): void {
    if (this.#status === status) return;
    this.#status = status;
    for (const listener of this.#statusListeners) listener(status);
  }
}
