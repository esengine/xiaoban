import type { ContextNote, Message, Thread, Usage } from "@xiaoban/protocol";
import type { HubClient } from "./client.ts";
import { applyEvent, type HubState, initialHubState } from "./state.ts";

export class HubStore {
  readonly client: HubClient;
  #state: HubState = initialHubState;
  readonly #listeners = new Set<() => void>();

  constructor(client: HubClient) {
    this.client = client;
    client.onEvent((event) => this.#update((state) => applyEvent(state, event)));
    client.onStatus((status) => this.#update((state) => ({ ...state, status })));
    client.onWelcome(({ hub }) => {
      this.#update((state) => ({ ...state, hub }));
      void this.refreshThreads();
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): HubState => this.#state;

  async refreshThreads(): Promise<Thread[]> {
    const { threads } = await this.client.request({ type: "list_threads" }, "threads");
    this.#update((state) => ({ ...state, threads }));
    return threads;
  }

  async createThread(title?: string): Promise<Thread> {
    const { thread } = await this.client.request(
      { type: "create_thread", title: title ?? null },
      "thread",
    );
    return thread;
  }

  async loadMessages(threadId: string): Promise<Message[]> {
    const { messages } = await this.client.request({ type: "list_messages", threadId }, "messages");
    this.#update((state) => ({ ...state, messages: { ...state.messages, [threadId]: messages } }));
    return messages;
  }

  async send(threadId: string, text: string, context: ContextNote[] = []): Promise<string> {
    const { turnId } = await this.client.request(
      { type: "send_message", threadId, text, context },
      "turn_accepted",
    );
    return turnId;
  }

  async usage(): Promise<{ usage: Usage; turns: number }> {
    const { usage, turns } = await this.client.request({ type: "usage_summary" }, "usage");
    return { usage, turns };
  }

  async cancel(turnId: string): Promise<void> {
    await this.client.request({ type: "cancel_turn", turnId }, "ack");
  }

  #update(next: (state: HubState) => HubState): void {
    const updated = next(this.#state);
    if (updated === this.#state) return;
    this.#state = updated;
    for (const listener of this.#listeners) listener();
  }
}
