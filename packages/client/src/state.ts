import type {
  ConfirmRequest,
  Device,
  Event,
  Failure,
  HubInfo,
  Memory,
  MemoryGalaxy,
  Message,
  ModelInfo,
  Preferences,
  ServiceStatus,
  StepResult,
  Thread,
  Trip,
} from "@xiaoban/protocol";
import type { ConnectionStatus } from "./client.ts";

export interface TraceStep {
  callId: string;
  tool: string;
  detail: string | null;
  result: StepResult | null;
}

export interface TurnTrace {
  tools: string[];
  steps: TraceStep[];
  memories: Memory[];
}

export interface Draft extends TurnTrace {
  paused?: boolean;
  reasoning?: string;
  reasoningSince?: number | undefined;
  reasoningUntil?: number | undefined;
  turnId: string;
  threadId: string;
  text: string;
  startedAt: number;
  failure: Failure | null;
}

export interface Settled extends TurnTrace {
  durationMs: number;
}

export interface HubState {
  status: ConnectionStatus;
  hub: HubInfo | null;
  usedMemories: string[];
  galaxies: MemoryGalaxy[];
  model: ModelInfo | null;
  modelLoaded: boolean;
  preferences: Preferences | null;
  threads: Thread[];
  memories: Memory[];
  devices: Device[];
  messages: Readonly<Record<string, Message[]>>;
  drafts: Readonly<Record<string, Draft>>;
  settled: Readonly<Record<string, Settled>>;
  trips: Readonly<Record<string, Trip>>;
  latestTrip: Readonly<Record<string, number>>;
  services: ServiceStatus[];
  confirms: ConfirmRequest[];
}

export const initialHubState: HubState = {
  status: "idle",
  hub: null,
  usedMemories: [],
  galaxies: [],
  model: null,
  modelLoaded: false,
  preferences: null,
  threads: [],
  memories: [],
  devices: [],
  messages: {},
  drafts: {},
  settled: {},
  trips: {},
  latestTrip: {},
  services: [],
  confirms: [],
};

export const tripKey = (tripId: string, version: number): string => `${tripId}@${version}`;

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

function withTripVersion(latest: HubState["latestTrip"], message: Message): HubState["latestTrip"] {
  const attachment = message.attachment;
  if (attachment?.kind !== "trip") return latest;
  if ((latest[attachment.tripId] ?? 0) >= attachment.version) return latest;
  return { ...latest, [attachment.tripId]: attachment.version };
}

function withoutDraft(drafts: HubState["drafts"], turnId: string): HubState["drafts"] {
  const { [turnId]: _removed, ...rest } = drafts;
  return rest;
}

export function applyEvent(state: HubState, event: Event, now = Date.now()): HubState {
  switch (event.type) {
    case "confirm_requested":
      return {
        ...state,
        confirms: [
          ...state.confirms.filter((confirm) => confirm.id !== event.confirm.id),
          event.confirm,
        ],
      };
    case "turn_paused": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [event.turnId]: { ...draft, paused: event.paused } },
      };
    }
    case "confirm_resolved":
      return {
        ...state,
        confirms: state.confirms.filter((confirm) => confirm.id !== event.confirmId),
      };
    case "thread_updated":
      return { ...state, threads: upsertThread(state.threads, event.thread) };
    case "memory_forgotten":
      return {
        ...state,
        memories: state.memories.filter((memory) => memory.id !== event.memoryId),
      };
    case "memories_used":
      return {
        ...state,
        memories: event.memories.reduce(upsertMemory, state.memories),
        usedMemories: event.memories.map((memory) => memory.id),
      };
    case "memory_saved": {
      const running = Object.values(state.drafts)
        .filter((draft) => !draft.failure)
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      return {
        ...state,
        memories: upsertMemory(state.memories, event.memory),
        drafts: running
          ? {
              ...state.drafts,
              [running.turnId]: { ...running, memories: [...running.memories, event.memory] },
            }
          : state.drafts,
      };
    }
    case "thread_deleted": {
      const { [event.threadId]: _gone, ...messages } = state.messages;
      return {
        ...state,
        threads: state.threads.filter((thread) => thread.id !== event.threadId),
        messages,
      };
    }
    case "message_created":
      return { ...state, messages: appendMessage(state, event.message) };
    case "turn_started":
      return {
        ...state,
        usedMemories: [],
        drafts: {
          ...state.drafts,
          [event.turnId]: {
            turnId: event.turnId,
            threadId: event.threadId,
            text: "",
            startedAt: now,
            failure: null,
            tools: [],
            steps: [],
            memories: [],
          },
        },
      };
    case "tool_used": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [event.turnId]: {
            ...draft,
            tools: [...draft.tools, event.tool],
            steps: [
              ...draft.steps,
              { callId: event.callId, tool: event.tool, detail: event.detail, result: null },
            ],
          },
        },
      };
    }
    case "tool_finished": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [event.turnId]: {
            ...draft,
            steps: draft.steps.map((step) =>
              step.callId === event.callId ? { ...step, result: event.result } : step,
            ),
          },
        },
      };
    }
    case "thinking":
      return state;
    case "text_delta": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      const reasoningUntil =
        draft.reasoningSince && !draft.reasoningUntil ? now : draft.reasoningUntil;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [event.turnId]: { ...draft, text: draft.text + event.delta, reasoningUntil },
        },
      };
    }
    case "reasoning_delta": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [event.turnId]: {
            ...draft,
            reasoning: (draft.reasoning ?? "") + event.delta,
            reasoningSince: draft.reasoningSince ?? now,
            reasoningUntil: undefined,
          },
        },
      };
    }
    case "turn_completed": {
      const draft = state.drafts[event.turnId];
      return {
        ...state,
        messages: appendMessage(state, event.message),
        drafts: withoutDraft(state.drafts, event.turnId),
        latestTrip: withTripVersion(state.latestTrip, event.message),
        settled: draft
          ? {
              ...state.settled,
              [event.message.id]: {
                durationMs: Math.max(0, now - draft.startedAt),
                tools: draft.tools,
                steps: draft.steps,
                memories: draft.memories,
              },
            }
          : state.settled,
      };
    }
    case "device_paired":
      return {
        ...state,
        devices: [...state.devices.filter((device) => device.id !== event.device.id), event.device],
      };
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
