import type {
  Allowance,
  AutonomyLevel,
  Branch,
  CommandRun,
  CommitInfo,
  ConfirmChoice,
  ConflictChoice,
  ConflictFile,
  ContextNote,
  Device,
  DirEntry,
  Failure,
  FileDiff,
  GithubRef,
  GitInfo,
  Interpretation,
  Location,
  Memory,
  MemoryGalaxy,
  Message,
  ModelInfo,
  OperatePermissions,
  Preferences,
  ProviderId,
  ProviderOption,
  Quote,
  Response,
  ServiceStatus,
  ThinkingEffort,
  Thread,
  Trip,
  TripCalendar,
  Usage,
  Workspace,
  WorkspaceSettings,
} from "@xiaoban/protocol";
import type { HubClient } from "./client.ts";
import { applyEvent, type HubState, initialHubState, tripKey, upsertWorkspace } from "./state.ts";

const PAGE = 50;

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
      this.#refreshInBackground();
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

  async refreshModel(): Promise<void> {
    const { model } = await this.client.request({ type: "model_status" }, "model_status");
    this.#update((state) => ({ ...state, model, modelLoaded: true }));
  }

  async refreshPreferences(): Promise<Preferences> {
    const { preferences } = await this.client.request({ type: "preferences" }, "preferences");
    this.#update((state) => ({ ...state, preferences }));
    return preferences;
  }

  async setAutonomy(level: AutonomyLevel): Promise<void> {
    await this.client.request({ type: "set_autonomy", level }, "ack");
    this.#update((state) =>
      state.preferences
        ? { ...state, preferences: { ...state.preferences, autonomy: level } }
        : state,
    );
  }

  async remember(subject: string, value: string): Promise<Memory> {
    const { memory } = await this.client.request({ type: "remember", subject, value }, "memory");
    return memory;
  }

  async refreshDevices(): Promise<Device[]> {
    const { devices } = await this.client.request({ type: "list_devices" }, "devices");
    this.#update((state) => ({ ...state, devices }));
    return devices;
  }

  async refreshMemories(): Promise<Memory[]> {
    const { memories } = await this.client.request({ type: "list_memories" }, "memories");
    this.#update((state) => ({ ...state, memories }));
    return memories;
  }

  async refreshGalaxies(): Promise<MemoryGalaxy[]> {
    const { galaxies } = await this.client.request({ type: "list_galaxies" }, "galaxies");
    this.#update((state) => ({ ...state, galaxies }));
    return galaxies;
  }

  async pinMemory(memoryId: string, pinned: boolean): Promise<void> {
    await this.client.request({ type: "pin_memory", memoryId, pinned }, "ack");
  }

  async forgetMemory(subject: string): Promise<void> {
    await this.client.request({ type: "forget_memory", subject }, "ack");
  }

  async interpretAnswer(input: {
    subject: string;
    question: string;
    answer: string;
    followUp: string | null;
    canLocate: boolean;
  }): Promise<Interpretation> {
    const { interpretation } = await this.client.request(
      { type: "interpret_answer", ...input },
      "interpreted",
    );
    return interpretation;
  }

  async locate(): Promise<Location> {
    const { location } = await this.client.request({ type: "locate" }, "located");
    return location;
  }

  async completeOnboarding(): Promise<void> {
    await this.client.request({ type: "complete_onboarding" }, "ack");
    await Promise.all([this.refreshPreferences(), this.refreshThreads()]);
  }

  async createPairingCode(): Promise<Extract<Response, { type: "pairing_code" }>> {
    return this.client.request({ type: "create_pairing_code" }, "pairing_code");
  }

  async listProviders(): Promise<ProviderOption[]> {
    const { providers } = await this.client.request({ type: "list_providers" }, "providers");
    return providers;
  }

  async configureProvider(input: {
    provider: ProviderId;
    apiKey: string;
    model?: string;
    baseUrl?: string;
    label?: string;
  }): Promise<{ model: ModelInfo | null; failure: Failure | null }> {
    const { model: active, failure } = await this.client.request(
      {
        type: "configure_provider",
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model ?? null,
        baseUrl: input.baseUrl ?? null,
        label: input.label ?? null,
      },
      "provider_configured",
    );
    if (!failure) this.#update((state) => ({ ...state, model: active, modelLoaded: true }));
    return { model: active, failure };
  }

  async createThread(title?: string, workspaceId?: string): Promise<Thread> {
    const { thread } = await this.client.request(
      { type: "create_thread", title: title ?? null, workspaceId: workspaceId ?? null },
      "thread",
    );
    return thread;
  }

  async loadMessages(threadId: string): Promise<Message[]> {
    const { messages, more, archived } = await this.client.request(
      { type: "list_messages", threadId, before: null, limit: PAGE },
      "messages",
    );
    this.#update((state) => {
      const { [threadId]: _, ...others } = state.archived;
      return {
        ...state,
        messages: { ...state.messages, [threadId]: messages },
        olderMessages: { ...state.olderMessages, [threadId]: more },
        archived: archived ? { ...others, [threadId]: archived } : others,
      };
    });
    return messages;
  }

  async loadOlderMessages(threadId: string): Promise<number> {
    const current = this.#state.messages[threadId] ?? [];
    const first = current[0];
    if (!first || !this.#state.olderMessages[threadId]) return 0;
    const { messages, more } = await this.client.request(
      { type: "list_messages", threadId, before: first.createdAt, limit: PAGE },
      "messages",
    );
    this.#update((state) => {
      const known = new Set((state.messages[threadId] ?? []).map((message) => message.id));
      return {
        ...state,
        messages: {
          ...state.messages,
          [threadId]: [
            ...messages.filter((message) => !known.has(message.id)),
            ...(state.messages[threadId] ?? []),
          ],
        },
        olderMessages: { ...state.olderMessages, [threadId]: more },
      };
    });
    return messages.length;
  }

  async send(
    threadId: string,
    text: string,
    options: {
      context?: ContextNote[];
      quote?: Quote | null;
      files?: string[];
      threads?: string[];
    } = {},
  ): Promise<string> {
    const { turnId } = await this.client.request(
      {
        type: "send_message",
        threadId,
        text,
        context: options.context ?? [],
        quote: options.quote ?? null,
        files: options.files ?? [],
        threads: options.threads ?? [],
      },
      "turn_accepted",
    );
    return turnId;
  }

  async retry(threadId: string): Promise<string> {
    const { turnId } = await this.client.request({ type: "retry_turn", threadId }, "turn_accepted");
    return turnId;
  }

  async setThinking(threadId: string, effort: ThinkingEffort): Promise<void> {
    await this.client.request({ type: "set_thinking", threadId, effort }, "ack");
  }

  async renameThread(threadId: string, title: string): Promise<Thread> {
    const { thread } = await this.client.request(
      { type: "rename_thread", threadId, title },
      "thread",
    );
    return thread;
  }

  async deleteThread(threadId: string): Promise<void> {
    await this.client.request({ type: "delete_thread", threadId }, "ack");
  }

  dropDraft(turnId: string): void {
    this.#update((state) => {
      const { [turnId]: _dropped, ...drafts } = state.drafts;
      return { ...state, drafts };
    });
  }

  async usage(): Promise<{ usage: Usage; turns: number }> {
    const { usage, turns } = await this.client.request({ type: "usage_summary" }, "usage");
    return { usage, turns };
  }

  async loadTrip(tripId: string, version: number | null = null): Promise<Trip> {
    const cached = version === null ? null : this.#state.trips[tripKey(tripId, version)];
    if (cached) return cached;
    const { trip, latest } = await this.client.request(
      { type: "get_trip", tripId, version },
      "trip",
    );
    this.#update((state) => ({
      ...state,
      trips: { ...state.trips, [tripKey(trip.id, trip.version)]: trip },
      latestTrip: {
        ...state.latestTrip,
        [trip.id]: Math.max(latest, state.latestTrip[trip.id] ?? 0),
      },
    }));
    return trip;
  }

  async tripCalendar(tripId: string, version: number | null): Promise<TripCalendar> {
    const { calendar } = await this.client.request(
      { type: "trip_calendar", tripId, version },
      "trip_calendar",
    );
    return calendar;
  }

  async refreshConfirms(): Promise<void> {
    const { confirms } = await this.client.request(
      { type: "pending_confirms" },
      "pending_confirms",
    );
    this.#update((state) => ({ ...state, confirms }));
  }

  async answerConfirm(confirmId: string, choice: ConfirmChoice): Promise<void> {
    await this.client.request({ type: "answer_confirm", confirmId, choice }, "ack");
    this.#update((state) => ({
      ...state,
      confirms: state.confirms.filter((confirm) => confirm.id !== confirmId),
    }));
  }

  async operateStatus(): Promise<OperatePermissions> {
    const { permissions } = await this.client.request({ type: "operate_status" }, "operate_status");
    return permissions;
  }

  async refreshServices(): Promise<ServiceStatus[]> {
    const { services } = await this.client.request({ type: "services" }, "services");
    this.#update((state) => ({ ...state, services }));
    return services;
  }

  async configureSearch(apiKey: string, resumeThreadId: string | null): Promise<boolean> {
    const { connected, services } = await this.client.request(
      { type: "configure_service", service: "web_search", apiKey, resumeThreadId },
      "service_configured",
    );
    this.#update((state) => ({ ...state, services }));
    return connected;
  }

  async declineSearch(threadId: string): Promise<void> {
    await this.client.request({ type: "decline_service", service: "web_search", threadId }, "ack");
  }

  async fileData(fileId: string): Promise<string> {
    const { url } = await this.client.request({ type: "file_data", fileId }, "file_data");
    return url;
  }

  async filePath(fileId: string, name: string): Promise<string> {
    const { path } = await this.client.request({ type: "file_path", fileId, name }, "file_path");
    return path;
  }

  async cancel(turnId: string): Promise<void> {
    await this.client.request({ type: "cancel_turn", turnId }, "ack");
  }

  async background(turnId: string): Promise<void> {
    await this.client.request({ type: "background_turn", turnId }, "ack");
  }

  async pause(turnId: string): Promise<void> {
    await this.client.request({ type: "pause_turn", turnId }, "ack");
  }

  async resume(turnId: string): Promise<void> {
    await this.client.request({ type: "resume_turn", turnId }, "ack");
  }

  async addNote(turnId: string, text: string): Promise<void> {
    await this.client.request({ type: "add_note", turnId, text }, "ack");
  }

  async refreshWorkspaces(): Promise<Workspace[]> {
    const { workspaces } = await this.client.request({ type: "list_workspaces" }, "workspaces");
    this.#update((state) => ({ ...state, workspaces }));
    return workspaces;
  }

  async inspectFolder(
    path: string,
  ): Promise<{ path: string; name: string; exists: boolean; git: GitInfo }> {
    const folder = await this.client.request({ type: "inspect_folder", path }, "folder");
    return { path: folder.path, name: folder.name, exists: folder.exists, git: folder.git };
  }

  async createWorkspace(path: string): Promise<Workspace> {
    const { workspace } = await this.client.request(
      { type: "create_workspace", path },
      "workspace",
    );
    this.#update((state) => ({
      ...state,
      workspaces: upsertWorkspace(state.workspaces, workspace),
    }));
    return workspace;
  }

  async renameWorkspace(workspaceId: string, name: string): Promise<void> {
    await this.client.request({ type: "rename_workspace", workspaceId, name }, "workspace");
  }

  async removeWorkspace(workspaceId: string): Promise<void> {
    await this.client.request({ type: "remove_workspace", workspaceId }, "ack");
  }

  async listDir(workspaceId: string, path: string): Promise<DirEntry[]> {
    const { entries } = await this.client.request({ type: "list_dir", workspaceId, path }, "dir");
    return entries;
  }

  async readWorkspaceFile(
    workspaceId: string,
    path: string,
  ): Promise<{ text: string; truncated: boolean; binary: boolean }> {
    const { text, truncated, binary } = await this.client.request(
      { type: "read_workspace_file", workspaceId, path },
      "workspace_file",
    );
    return { text, truncated, binary };
  }

  async workspaceImage(workspaceId: string, path: string): Promise<{ url: string; bytes: number }> {
    const { url, bytes } = await this.client.request(
      { type: "workspace_image", workspaceId, path },
      "workspace_image",
    );
    return { url, bytes };
  }

  async githubRefs(workspaceId: string, numbers: number[]): Promise<GithubRef[]> {
    const { refs } = await this.client.request(
      { type: "github_refs", workspaceId, numbers },
      "github_refs",
    );
    return refs;
  }

  async threadPins(threadId: string): Promise<{ pinned: number[]; hidden: number[] }> {
    const { pinned, hidden } = await this.client.request({ type: "thread_pins", threadId }, "pins");
    return { pinned, hidden };
  }

  async pinRef(
    threadId: string,
    number: number,
    pinned: boolean,
  ): Promise<{ pinned: number[]; hidden: number[] }> {
    const result = await this.client.request({ type: "pin_ref", threadId, number, pinned }, "pins");
    return { pinned: result.pinned, hidden: result.hidden };
  }

  async gitLog(workspaceId: string, all = false): Promise<CommitInfo[]> {
    const { commits } = await this.client.request({ type: "git_log", workspaceId, all }, "commits");
    return commits;
  }

  async commitFiles(workspaceId: string, hash: string | null): Promise<FileDiff[]> {
    const { files } = await this.client.request(
      { type: "commit_files", workspaceId, hash },
      "changes",
    );
    return files;
  }

  async draftCommit(workspaceId: string, paths: string[]): Promise<string | null> {
    const { message } = await this.client.request(
      { type: "draft_commit", workspaceId, paths },
      "commit_draft",
    );
    return message;
  }

  async commit(
    workspaceId: string,
    message: string,
    paths: string[],
    push: boolean,
  ): Promise<GitInfo> {
    const { git } = await this.client.request(
      { type: "commit", workspaceId, message, paths, push },
      "git",
    );
    return git;
  }

  async initGit(workspaceId: string): Promise<GitInfo> {
    const { git } = await this.client.request({ type: "init_git", workspaceId }, "git");
    return git;
  }

  async createPullRequest(workspaceId: string): Promise<string> {
    const { url } = await this.client.request(
      { type: "create_pull_request", workspaceId },
      "pull_request",
    );
    return url;
  }

  async conflicts(workspaceId: string): Promise<ConflictFile[]> {
    const { files } = await this.client.request({ type: "conflicts", workspaceId }, "conflicts");
    return files;
  }

  async resolveConflict(
    workspaceId: string,
    path: string,
    index: number,
    choice: ConflictChoice,
    text: string | null = null,
  ): Promise<ConflictFile[]> {
    const { files } = await this.client.request(
      { type: "resolve_conflict", workspaceId, path, index, choice, text },
      "conflicts",
    );
    return files;
  }

  async finishMerge(workspaceId: string): Promise<GitInfo> {
    const { git } = await this.client.request({ type: "finish_merge", workspaceId }, "git");
    return git;
  }

  async abortMerge(workspaceId: string): Promise<GitInfo> {
    const { git } = await this.client.request({ type: "abort_merge", workspaceId }, "git");
    return git;
  }

  async threadChanges(threadId: string): Promise<FileDiff[]> {
    const { files } = await this.client.request({ type: "thread_changes", threadId }, "changes");
    return files;
  }

  async revertChange(threadId: string, path: string, hunk: number | null): Promise<FileDiff[]> {
    const { files } = await this.client.request(
      { type: "revert_change", threadId, path, hunk },
      "changes",
    );
    return files;
  }

  async restoreChange(threadId: string, path: string): Promise<FileDiff[]> {
    const { files } = await this.client.request(
      { type: "restore_change", threadId, path },
      "changes",
    );
    return files;
  }

  async workspaceSettings(workspaceId: string): Promise<WorkspaceSettings> {
    const { settings } = await this.client.request(
      { type: "workspace_settings", workspaceId },
      "workspace_settings",
    );
    return settings;
  }

  async removeAllowance(
    workspaceId: string,
    kind: Allowance,
    value: string,
  ): Promise<WorkspaceSettings> {
    const { settings } = await this.client.request(
      { type: "remove_allowance", workspaceId, kind, value },
      "workspace_settings",
    );
    return settings;
  }

  async setEditor(workspaceId: string, editor: string): Promise<WorkspaceSettings> {
    const { settings } = await this.client.request(
      { type: "set_editor", workspaceId, editor },
      "workspace_settings",
    );
    return settings;
  }

  async gitInfo(workspaceId: string): Promise<GitInfo> {
    const { git } = await this.client.request({ type: "git_info", workspaceId }, "git");
    return git;
  }

  async loadCommands(workspaceId: string): Promise<CommandRun[]> {
    const { commands } = await this.client.request(
      { type: "list_commands", workspaceId },
      "commands",
    );
    this.#update((state) => ({
      ...state,
      commands: { ...state.commands, [workspaceId]: commands },
    }));
    return commands;
  }

  async listBranches(workspaceId: string): Promise<Branch[]> {
    const { branches } = await this.client.request(
      { type: "list_branches", workspaceId },
      "branches",
    );
    return branches;
  }

  async switchBranch(
    workspaceId: string,
    name: string,
    options: { create?: boolean; stash?: boolean } = {},
  ): Promise<GitInfo> {
    const { git } = await this.client.request(
      {
        type: "switch_branch",
        workspaceId,
        name,
        create: options.create ?? false,
        stash: options.stash ?? false,
      },
      "git",
    );
    return git;
  }

  async restoreStash(workspaceId: string): Promise<GitInfo> {
    const { git } = await this.client.request({ type: "restore_stash", workspaceId }, "git");
    return git;
  }

  async pullBranch(workspaceId: string): Promise<GitInfo> {
    const { git } = await this.client.request({ type: "pull_branch", workspaceId }, "git");
    return git;
  }

  async stopCommand(commandId: string): Promise<void> {
    await this.client.request({ type: "stop_command", commandId }, "ack");
  }

  async runCommand(workspaceId: string, command: string): Promise<void> {
    await this.client.request({ type: "run_command", workspaceId, command }, "ack");
  }

  #refreshInBackground(): void {
    Promise.all([
      this.refreshThreads(),
      this.refreshWorkspaces(),
      this.refreshModel(),
      this.refreshPreferences(),
      this.refreshMemories(),
      this.refreshDevices(),
      this.refreshServices(),
      this.refreshConfirms(),
    ]).catch(() => undefined);
  }

  #update(next: (state: HubState) => HubState): void {
    const updated = next(this.#state);
    if (updated === this.#state) return;
    this.#state = updated;
    for (const listener of this.#listeners) listener();
  }
}
