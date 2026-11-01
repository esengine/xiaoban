import type {
  Archived,
  Capability,
  CommandRun,
  CompactPhase,
  ConfirmRequest,
  Deck,
  DeckSummary,
  Device,
  Doc,
  DocSummary,
  Event,
  Failure,
  FloorPlan,
  HubInfo,
  Kitchen,
  Ledger,
  Memory,
  MemoryGalaxy,
  Message,
  ModelInfo,
  Plan,
  Preferences,
  RecipeView,
  ServiceStatus,
  StepResult,
  Thread,
  Trip,
  WeatherView,
  Workbook,
  WorkbookSummary,
  Workspace,
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

export interface AgentState {
  title: string;
  step: string | null;
  steps: number;
  done: boolean;
}

export interface Draft extends TurnTrace {
  paused?: boolean;
  agents?: Record<string, AgentState[]>;
  background?: boolean;
  reasoning?: string;
  reasoningSince?: number | undefined;
  reasoningUntil?: number | undefined;
  turnId: string;
  threadId: string;
  text: string;
  startedAt: number;
  hubStartedAt: number;
  failure: Failure | null;
}

export interface Settled extends TurnTrace {
  durationMs: number;
}

export interface HubState {
  status: ConnectionStatus;
  hub: HubInfo | null;
  usedMemories: string[];
  archived: Record<string, Archived>;
  compacting: Readonly<Record<string, CompactPhase>>;
  plans: Readonly<Record<string, Plan | null>>;
  capabilities: Capability[];
  foundCapabilities: Readonly<Record<string, Capability[]>>;
  usedCapabilities: Readonly<Record<string, string[]>>;
  olderMessages: Record<string, boolean>;
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
  workspaces: Workspace[];
  commands: Readonly<Record<string, CommandRun[]>>;
  filesVersion: Readonly<Record<string, number>>;
  kitchen: Kitchen | null;
  ledger: Ledger | null;
  weather: WeatherView | null;
  docs: Readonly<Record<string, DocSummary>>;
  recipes: Readonly<Record<string, RecipeView>>;
  floorPlans: Readonly<Record<string, FloorPlan>>;
  doc: Doc | null;
  sheets: Readonly<Record<string, WorkbookSummary>>;
  sheet: Workbook | null;
  decks: Readonly<Record<string, DeckSummary>>;
  deck: Deck | null;
}

export const initialHubState: HubState = {
  status: "idle",
  hub: null,
  usedMemories: [],
  archived: {},
  compacting: {},
  plans: {},
  capabilities: [],
  foundCapabilities: {},
  usedCapabilities: {},
  olderMessages: {},
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
  workspaces: [],
  commands: {},
  filesVersion: {},
  kitchen: null,
  ledger: null,
  weather: null,
  docs: {},
  recipes: {},
  floorPlans: {},
  doc: null,
  sheets: {},
  sheet: null,
  decks: {},
  deck: null,
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
    case "plan_updated":
      return { ...state, plans: { ...state.plans, [event.threadId]: event.plan } };
    case "capabilities_changed":
      return { ...state, capabilities: event.capabilities };
    case "capabilities_found":
      return {
        ...state,
        foundCapabilities: { ...state.foundCapabilities, [event.turnId]: event.capabilities },
      };
    case "capability_used": {
      const used = state.usedCapabilities[event.turnId] ?? [];
      return {
        ...state,
        capabilities: state.capabilities.map((capability) =>
          capability.id === event.id ? { ...capability, uses: event.uses } : capability,
        ),
        usedCapabilities: {
          ...state.usedCapabilities,
          [event.turnId]: used.includes(event.id) ? used : [...used, event.id],
        },
      };
    }
    case "thread_compacting":
      return {
        ...state,
        compacting: { ...state.compacting, [event.threadId]: event.phase },
      };
    case "thread_archived":
      return {
        ...state,
        archived: { ...state.archived, [event.threadId]: event.archived },
      };
    case "agent_progress": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      const list = [...(draft.agents?.[event.callId] ?? [])];
      const previous = list[event.agent];
      list[event.agent] = {
        title: event.title,
        step: event.step ?? previous?.step ?? null,
        steps: (previous?.steps ?? 0) + (event.step ? 1 : 0),
        done: event.done,
      };
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [event.turnId]: { ...draft, agents: { ...draft.agents, [event.callId]: list } },
        },
      };
    }
    case "turn_backgrounded": {
      const draft = state.drafts[event.turnId];
      if (!draft) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [event.turnId]: { ...draft, background: true } },
      };
    }
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
            hubStartedAt: event.startedAt,
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
                durationMs: Math.max(0, event.message.createdAt - draft.hubStartedAt),
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
    case "workspace_updated":
      return { ...state, workspaces: upsertWorkspace(state.workspaces, event.workspace) };
    case "workspace_removed":
      return {
        ...state,
        workspaces: state.workspaces.filter((workspace) => workspace.id !== event.workspaceId),
      };
    case "files_changed":
      return {
        ...state,
        filesVersion: {
          ...state.filesVersion,
          [event.workspaceId]: (state.filesVersion[event.workspaceId] ?? 0) + 1,
        },
      };
    case "kitchen_updated":
      return { ...state, kitchen: event.kitchen };
    case "deck_updated":
      return { ...state, decks: { ...state.decks, [event.summary.id]: event.summary } };
    case "sheet_updated":
      return { ...state, sheets: { ...state.sheets, [event.summary.id]: event.summary } };
    case "doc_updated":
      return { ...state, docs: { ...state.docs, [event.summary.id]: event.summary } };
    case "floor_plan_updated":
      return { ...state, floorPlans: { ...state.floorPlans, [event.plan.id]: event.plan } };
    case "notify":
    case "notice_withdrawn":
    case "timer_fired":
    case "prep_due":
    case "ledger_changed":
    case "weather_alert":
      return state;
    case "command_updated": {
      const list = state.commands[event.command.workspaceId] ?? [];
      const others = list.filter((run) => run.id !== event.command.id);
      return {
        ...state,
        commands: {
          ...state.commands,
          [event.command.workspaceId]: [...others, event.command].sort(
            (a, b) => a.startedAt - b.startedAt,
          ),
        },
      };
    }
  }
}

export function upsertWorkspace(list: Workspace[], workspace: Workspace): Workspace[] {
  return [...list.filter((item) => item.id !== workspace.id), workspace].sort(
    (a, b) => b.activeAt - a.activeAt,
  );
}

export function draftsForThread(state: HubState, threadId: string): Draft[] {
  return Object.values(state.drafts).filter((draft) => draft.threadId === threadId);
}
