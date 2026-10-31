import type { ClientFrame, ServerFrame } from "@xiaoban/protocol";
import { describe, expect, it } from "vitest";
import { HubClient, HubRequestError } from "../src/client.ts";
import { HubStore } from "../src/store.ts";

class FakeSocket extends EventTarget {
  readonly sent: ClientFrame[] = [];
  reply: (frame: ClientFrame) => ServerFrame[] = () => [];

  send(data: string): void {
    const frame = JSON.parse(data) as ClientFrame;
    this.sent.push(frame);
    queueMicrotask(() => {
      for (const out of this.reply(frame)) {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(out) }));
      }
    });
  }

  close(): void {
    this.dispatchEvent(new Event("close"));
  }

  open(): void {
    this.dispatchEvent(new Event("open"));
  }
}

const hub = { id: "h1", name: "小伴", version: "0.1.0" };

function connectedClient(reply: FakeSocket["reply"]) {
  const socket = new FakeSocket();
  socket.reply = reply;
  const client = new HubClient({
    url: "ws://hub",
    device: { deviceId: "phone", name: "手机", platform: "ios" },
    credential: { kind: "pairing_code", code: "123456" },
    reconnect: false,
    createSocket: () => {
      queueMicrotask(() => socket.open());
      return socket as unknown as WebSocket;
    },
  });
  return { client, socket };
}

describe("HubClient", () => {
  it("pairs, then switches to the issued token", async () => {
    const { client, socket } = connectedClient((frame) =>
      frame.type === "hello" ? [{ type: "welcome", protocol: 1, hub, deviceToken: "secret" }] : [],
    );
    const welcome = await client.connect();
    expect(welcome.deviceToken).toBe("secret");
    expect(client.status).toBe("open");
    expect(socket.sent[0]).toMatchObject({
      type: "hello",
      device: { credential: { kind: "pairing_code", code: "123456" } },
    });
  });

  it("resolves typed responses and rejects protocol errors", async () => {
    const { client } = connectedClient((frame) => {
      if (frame.type === "hello") return [{ type: "welcome", protocol: 1, hub, deviceToken: null }];
      if (frame.body.type === "list_threads") {
        return [{ type: "response", id: frame.id, body: { type: "threads", threads: [] } }];
      }
      return [
        {
          type: "error",
          id: frame.id,
          error: { code: "not_found", detail: "thread not found" },
        },
      ];
    });
    await client.connect();

    await expect(client.request({ type: "list_threads" }, "threads")).resolves.toEqual({
      type: "threads",
      threads: [],
    });
    const failure = client.request({ type: "list_messages", threadId: "x" }, "messages");
    await expect(failure).rejects.toBeInstanceOf(HubRequestError);
    await expect(failure).rejects.toMatchObject({ code: "not_found" });
  });

  it("delivers events to listeners", async () => {
    const { client, socket } = connectedClient((frame) =>
      frame.type === "hello" ? [{ type: "welcome", protocol: 1, hub, deviceToken: null }] : [],
    );
    await client.connect();
    const received: string[] = [];
    client.onEvent((event) => received.push(event.type));
    socket.dispatchEvent(
      new MessageEvent("message", {
        data: JSON.stringify({ type: "event", event: { type: "thinking", turnId: "u1" } }),
      }),
    );
    expect(received).toEqual(["thinking"]);
  });
});

describe("HubStore", () => {
  it("does not leak rejections when closed during the initial refresh", async () => {
    const { client } = connectedClient((frame) =>
      frame.type === "hello" ? [{ type: "welcome", protocol: 1, hub, deviceToken: null }] : [],
    );
    const store = new HubStore(client);
    await client.connect();
    client.close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.getSnapshot().status).toBe("closed");
  });
});
