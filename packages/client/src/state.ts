import type {
  Event,
  Failure,
  HubInfo,
  Memory,
  Message,
  ModelInfo,
  Preferences,
  Thread,
} from "@xiaoban/protocol";
import type { ConnectionStatus } from "./client.ts";

export interface Draft {
  turnId: string;
  threadId: string;
  text: string;
  startedAt: number;
  failure: Failure | null;
}

export interface HubState {
  status: ConnectionStatus;
  hub: HubInfo | null;
  model: ModelInfo | null;
  modelLoaded: boolean;
  preferences: Preferences | null;
  threads: Thread[];
  memories: Memory[];
  messages: Readonly<Record<string, Message[]>>;
  drafts: Readonly<Record<string, Draft>>;
}

export const initialHubState: HubState = {
  status: "idle",
  hub: null,
  model: null,
  modelLoaded: false,
  preferences: null,
  threads: [],
  memories: [],
  messages: {},
  drafts: {},
};

const byRecent = (a: Thread, b: Thread) => b.updatedAt - a.updatedAt;

function upsertThread(threads: Thread[], thread: Thread): Thread[] {
  return [thread, ...threads.filter((existing) => existing.id !== thread.id)].sort(byRecent);
}

function upsertMemory(memories: Memory[], memory: Memory): Memory[] {
  return memories.some((existing) => existing.id === memory.id)
    ? memories.map((existing) => (existing.id === memory.id ? memory : existing))
    : [...memories, memory];
}

function appendMessage(state: HubState, message: Message): HubState["messages"] {
  const existing = state.messages[message.threadId] ?? [];
  if (existing.some((candidate) => candidate.id === message.id)) return state.messages;
  return { ...state.messages, [message.threadId]: [...existing, message] };
}

function withoutDraft(drafts: HubState["drafts"], turnId: string): HubState["drafts"] {
  const { [turnId]: _removed, ...rest } = drafts;
  return rest;
}

export function applyEvent(state: HubState, event: Event, now = Date.now()): HubState {
  switch (event.type) {
    case "thread_updated":
      return { ...state, threads: upsertThread(state.threads, event.thread) };
    case "memory_saved":
      return { ...state, memories: upsertMemory(state.memories, event.memory) };
    case "tool_used":
      return state;
    case "message_created":
      return { ...state, messages: appendMessage(state, event.message) };
    case "turn_started":
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [event.turnId]: {
            turnId: event.turnId,
            threadId: event.threadId,
            text: "",
            startedAt: now,
            failure: null,
          },
        },
      };
    case "thinking":
      return state;
    case "text_delta": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [event.turnId]: { ...draft, text: draft.text + event.delta } },
      };
    }
    case "turn_completed":
      return {
        ...state,
        messages: appendMessage(state, event.message),
        drafts: withoutDraft(state.drafts, event.turnId),
      };
    case "device_paired":
      return state;
    case "model_changed":
      return { ...state, model: event.model, modelLoaded: true };
    case "turn_failed": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [event.turnId]: { ...draft, failure: event.failure } },
      };
    }
  }
}

export function draftsForThread(state: HubState, threadId: string): Draft[] {
  return Object.values(state.drafts).filter((draft) => draft.threadId === threadId);
}
