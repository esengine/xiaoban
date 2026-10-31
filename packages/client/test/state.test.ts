import type { Message, Thread } from "@xiaoban/protocol";
import { describe, expect, it } from "vitest";
import { applyEvent, initialHubState } from "../src/state.ts";

const thread: Thread = { id: "t1", title: "出门", lastMessage: null, createdAt: 1, updatedAt: 1 };
const reply: Message = {
  id: "m2",
  threadId: "t1",
  role: "assistant",
  text: "7:40 出门",
  createdAt: 3,
};

describe("applyEvent", () => {
  it("streams a draft and replaces it with the completed message", () => {
    let state = applyEvent(initialHubState, { type: "thread_updated", thread });
    state = applyEvent(state, { type: "turn_started", threadId: "t1", turnId: "u1" }, 10);
    state = applyEvent(state, { type: "text_delta", turnId: "u1", delta: "7:40" });
    state = applyEvent(state, { type: "text_delta", turnId: "u1", delta: " 出门" });
    expect(state.drafts.u1?.text).toBe("7:40 出门");

    state = applyEvent(state, {
      type: "turn_completed",
      turnId: "u1",
      message: reply,
      usage: { inputTokens: 1, outputTokens: 2, cachedTokens: 0 },
    });
    expect(state.drafts).toEqual({});
    expect(state.messages.t1).toEqual([reply]);
  });

  it("keeps failed drafts so the UI can offer a retry", () => {
    let state = applyEvent(initialHubState, { type: "turn_started", threadId: "t1", turnId: "u1" });
    state = applyEvent(state, {
      type: "turn_failed",
      turnId: "u1",
      failure: { kind: "network", retryable: true, detail: "offline", alternatives: [] },
    });
    expect(state.drafts.u1?.failure?.retryable).toBe(true);
  });

  it("ignores duplicate messages", () => {
    const once = applyEvent(initialHubState, { type: "message_created", message: reply });
    const twice = applyEvent(once, { type: "message_created", message: reply });
    expect(twice.messages.t1).toHaveLength(1);
  });

  it("orders threads by most recent activity", () => {
    const older: Thread = { ...thread, id: "t0", updatedAt: 0 };
    let state = applyEvent(initialHubState, { type: "thread_updated", thread: older });
    state = applyEvent(state, { type: "thread_updated", thread });
    expect(state.threads.map((t) => t.id)).toEqual(["t1", "t0"]);
  });

  it("collects memories the agent saves and updates them in place", () => {
    const memory = { id: "k1", subject: "称呼", value: "阿哲", updatedAt: 1 };
    let state = applyEvent(initialHubState, { type: "memory_saved", memory });
    state = applyEvent(state, { type: "memory_saved", memory: { ...memory, value: "哲哥" } });
    expect(state.memories).toEqual([{ ...memory, value: "哲哥" }]);
  });

  it("keeps the tools and memories of a turn after it completes", () => {
    const memory = { id: "k1", subject: "称呼", value: "阿哲", updatedAt: 1 };
    let state = applyEvent(
      initialHubState,
      { type: "turn_started", threadId: "t1", turnId: "u1" },
      10,
    );
    state = applyEvent(state, { type: "tool_used", turnId: "u1", tool: "remember" });
    state = applyEvent(state, { type: "memory_saved", memory });
    state = applyEvent(
      state,
      {
        type: "turn_completed",
        turnId: "u1",
        message: reply,
        usage: { inputTokens: 1, outputTokens: 2, cachedTokens: 0 },
      },
      1810,
    );
    expect(state.settled.m2).toEqual({ durationMs: 1800, tools: ["remember"], memories: [memory] });
    expect(state.memories).toEqual([memory]);
  });

  it("drops a deleted thread with its messages", () => {
    let state = applyEvent(initialHubState, { type: "thread_updated", thread });
    state = applyEvent(state, { type: "message_created", message: reply });
    state = applyEvent(state, { type: "thread_deleted", threadId: "t1" });
    expect(state.threads).toEqual([]);
    expect(state.messages.t1).toBeUndefined();
  });
});
