import type {
  Allowance,
  AutonomyLevel,
  Branch,
  BrowserPage,
  Capability,
  CellEdit,
  CommandRun,
  CommitInfo,
  AskAnswer,
  ConfirmChoice,
  ConflictChoice,
  ConflictFile,
  ContextNote,
  ContextUsage,
  DailyFeed,
  DailyLayout,
  Deck,
  DeckSummary,
  Device,
  DirEntry,
  Doc,
  DocBlock,
  DocFormat,
  DocSummary,
  EventDraft,
  Expense,
  Failure,
  FileDiff,
  FloorPlan,
  FoundImage,
  GithubRef,
  GitInfo,
  InsightKind,
  Interpretation,
  Kitchen,
  Ledger,
  LedgerYear,
  Location,
  MailCategory,
  MailItem,
  MailOriginal,
  MailProvider,
  MailStatus,
  Memory,
  MemoryGalaxy,
  Message,
  ModelApi,
  ModelInfo,
  NotifySettings,
  OperatePermissions,
  PageCheck,
  Plan,
  PlanAction,
  Preferences,
  ProviderId,
  ProviderOption,
  Quote,
  RecipeView,
  Response,
  Schedule,
  ServiceStatus,
  SharedItem,
  ShareSuggestion,
  SheetFormat,
  SheetOp,
  SheetTab,
  Slide,
  ThinkingEffort,
  Thread,
  Todo,
  TodoAction,
  TodoDraft,
  Transition,
  Trip,
  TripCalendar,
  Usage,
  WeatherPlace,
  WeatherRules,
  WeatherView,
  Workbook,
  WorkbookSummary,
  Workspace,
  WorkspaceSettings,
} from "@xiaoban/protocol";
import type { HubClient } from "./client.ts";
import { applyEvent, type HubState, initialHubState, tripKey, upsertWorkspace } from "./state.ts";

const PAGE = 50;

export type ExportedFile = { name: string; mime: string; data: string };

const STREAM_FRAME_MS = 100;

export class HubStore {
  readonly client: HubClient;
  #state: HubState = initialHubState;
  readonly #listeners = new Set<() => void>();
  #pending: ReturnType<typeof setTimeout> | null = null;

  constructor(client: HubClient) {
    this.client = client;
    client.onEvent((event) => {
      const streaming = event.type === "text_delta" || event.type === "reasoning_delta";
      this.#update((state) => applyEvent(state, event), streaming);
      if (event.type === "deck_updated" && this.#state.deck?.id === event.summary.id) {
        void this.loadDeck(event.summary.id).catch(() => undefined);
      }
      if (event.type === "sheet_updated" && this.#state.sheet?.id === event.summary.id) {
        void this.loadSheet(event.summary.id).catch(() => undefined);
      }
      if (event.type === "doc_updated" && this.#state.doc?.id === event.summary.id) {
        void this.loadDoc(event.summary.id).catch(() => undefined);
      }
      if (event.type === "ledger_changed") {
        void this.#reloadLedger().catch(() => undefined);
      }
      if (
        this.#state.dailyFeed &&
        (event.type === "daily_feed_changed" || event.type === "turn_completed")
      ) {
        void this.loadDailyFeed().catch(() => undefined);
      }
    });
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

  async uploadFile(name: string, data: string): Promise<string> {
    const { path } = await this.client.request({ type: "upload_file", name, data }, "uploaded");
    return path;
  }

  async suggestShare(item: SharedItem): Promise<ShareSuggestion> {
    const { suggestion } = await this.client.request(
      { type: "suggest_share", item },
      "share_suggested",
    );
    return suggestion;
  }

  async sendShare(input: {
    item: SharedItem;
    threadId: string;
    prompt: string;
    remember: boolean;
  }): Promise<{ turnId: string; threadId: string }> {
    const { turnId, message } = await this.client.request(
      { type: "send_share", ...input },
      "turn_accepted",
    );
    return { turnId, threadId: message.threadId };
  }

  async shareProviderKeys(
    publicKey: string,
  ): Promise<Extract<Response, { type: "provider_keys" }>> {
    return this.client.request({ type: "share_provider_keys", publicKey }, "provider_keys");
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
    api?: ModelApi;
  }): Promise<{ model: ModelInfo | null; failure: Failure | null }> {
    const { model: active, failure } = await this.client.request(
      {
        type: "configure_provider",
        provider: input.provider,
        apiKey: input.apiKey,
        model: input.model ?? null,
        baseUrl: input.baseUrl ?? null,
        label: input.label ?? null,
        api: input.api ?? null,
      },
      "provider_configured",
    );
    if (!failure) this.#update((state) => ({ ...state, model: active, modelLoaded: true }));
    return { model: active, failure };
  }

  async selectModel(
    provider: ProviderId,
    model: string,
  ): Promise<{ model: ModelInfo | null; failure: Failure | null }> {
    const { model: active, failure } = await this.client.request(
      { type: "select_model", provider, model },
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

  #keepTrip(trip: Trip, latest: number): Trip {
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

  async chooseTripStay(tripId: string, stay: number): Promise<Trip> {
    const { trip, latest } = await this.client.request(
      { type: "choose_trip_stay", tripId, stay },
      "trip",
    );
    return this.#keepTrip(trip, latest);
  }

  async fillTripPrice(
    tripId: string,
    target: { line: number | null; stay: number | null },
    cents: number,
  ): Promise<Trip> {
    const { trip, latest } = await this.client.request(
      { type: "fill_trip_price", tripId, line: target.line, stay: target.stay, cents },
      "trip",
    );
    return this.#keepTrip(trip, latest);
  }

  async addTripExpense(tripId: string, name: string, cents: number): Promise<void> {
    await this.client.request({ type: "add_trip_expense", tripId, name, cents }, "ack");
  }

  async tripSpending(tripId: string): Promise<{ category: string; entries: Expense[] }> {
    const { category, entries } = await this.client.request(
      { type: "trip_spending", tripId },
      "trip_spending",
    );
    return { category, entries };
  }

  async tripCalendar(tripId: string, version: number | null): Promise<TripCalendar> {
    const { calendar } = await this.client.request(
      { type: "trip_calendar", tripId, version },
      "trip_calendar",
    );
    return calendar;
  }

  async eventCalendar(event: EventDraft): Promise<TripCalendar> {
    const { calendar } = await this.client.request(
      { type: "event_calendar", event },
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

  async refreshAsks(): Promise<void> {
    const { asks } = await this.client.request({ type: "pending_asks" }, "pending_asks");
    this.#update((state) => ({ ...state, asks }));
  }

  async answerAsk(askId: string, answers: AskAnswer[]): Promise<void> {
    await this.client.request({ type: "answer_ask", askId, answers }, "ack");
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

  async loadKitchen(): Promise<Kitchen> {
    const { kitchen } = await this.client.request({ type: "kitchen" }, "kitchen");
    this.#update((state) => ({ ...state, kitchen }));
    return kitchen;
  }

  async selectDish(name: string, selected: boolean): Promise<void> {
    const { kitchen } = await this.client.request(
      { type: "select_dish", name, selected },
      "kitchen",
    );
    this.#update((state) => ({ ...state, kitchen }));
  }

  async addMissingToShopping(): Promise<void> {
    const { kitchen } = await this.client.request({ type: "add_missing_to_shopping" }, "kitchen");
    this.#update((state) => ({ ...state, kitchen }));
  }

  async toggleShopping(name: string, done: boolean): Promise<void> {
    const { kitchen } = await this.client.request(
      { type: "toggle_shopping", name, done },
      "kitchen",
    );
    this.#update((state) => ({ ...state, kitchen }));
  }

  async #kitchenRequest(request: Parameters<HubClient["request"]>[0]): Promise<void> {
    const { kitchen } = await this.client.request(request, "kitchen");
    this.#update((state) => ({ ...state, kitchen }));
  }

  cookGo(step: number): Promise<void> {
    return this.#kitchenRequest({ type: "cook_go", step });
  }

  startTimer(step: number | null, label: string, after: string, seconds: number): Promise<void> {
    return this.#kitchenRequest({ type: "start_timer", step, label, after, seconds });
  }

  extendTimer(id: string, seconds: number): Promise<void> {
    return this.#kitchenRequest({ type: "extend_timer", id, seconds });
  }

  dismissTimer(id: string): Promise<void> {
    return this.#kitchenRequest({ type: "dismiss_timer", id });
  }

  finishCooking(): Promise<void> {
    return this.#kitchenRequest({ type: "finish_cooking" });
  }

  weekToShopping(start: string): Promise<void> {
    return this.#kitchenRequest({ type: "week_to_shopping", start });
  }

  setFridgeItem(name: string, amount: string): Promise<void> {
    return this.#kitchenRequest({ type: "set_fridge_item", name, amount });
  }

  removeFridgeItem(name: string, shop: boolean): Promise<void> {
    return this.#kitchenRequest({ type: "remove_fridge_item", name, shop });
  }

  weekItemGone(start: string, name: string): Promise<void> {
    return this.#kitchenRequest({ type: "week_item_gone", start, name });
  }

  #ledgerRange: { from: string; to: string } | null = null;

  async loadLedger(month: string): Promise<Ledger> {
    this.#ledgerRange = null;
    const { ledger } = await this.client.request({ type: "ledger", month }, "ledger");
    this.#update((state) => ({ ...state, ledger }));
    return ledger;
  }

  async loadLedgerRange(from: string, to: string): Promise<Ledger> {
    this.#ledgerRange = { from, to };
    const { ledger } = await this.client.request({ type: "ledger_range", from, to }, "ledger");
    this.#update((state) => ({ ...state, ledger }));
    return ledger;
  }

  async ledgerYear(year: number): Promise<LedgerYear> {
    const result = await this.client.request({ type: "ledger_year", year }, "ledger_year");
    return result.year;
  }

  async #reloadLedger(): Promise<void> {
    const range = this.#ledgerRange;
    const month = this.#state.ledger?.month;
    if (range) await this.loadLedgerRange(range.from, range.to);
    else if (month) await this.loadLedger(month);
  }

  async #ledgerRequest(request: Parameters<HubClient["request"]>[0]): Promise<void> {
    const { ledger } = await this.client.request(request, "ledger");
    if (this.#ledgerRange) await this.#reloadLedger();
    else this.#update((state) => ({ ...state, ledger }));
  }

  setBudget(month: string, cents: number | null): Promise<void> {
    return this.#ledgerRequest({ type: "set_budget", month, cents });
  }

  updateExpense(month: string, expense: Expense): Promise<void> {
    return this.#ledgerRequest({ type: "update_expense", month, expense });
  }

  deleteExpense(month: string, id: string): Promise<void> {
    return this.#ledgerRequest({ type: "delete_expense", month, id });
  }

  muteInsight(month: string, key: string): Promise<void> {
    return this.#ledgerRequest({ type: "mute_insight", month, key });
  }

  setImportRow(month: string, id: string, checked: boolean, category: string): Promise<void> {
    return this.#ledgerRequest({ type: "set_import_row", month, id, checked, category });
  }

  commitImport(month: string): Promise<void> {
    return this.#ledgerRequest({ type: "commit_import", month });
  }

  cancelImport(month: string): Promise<void> {
    return this.#ledgerRequest({ type: "cancel_import", month });
  }

  async deckSummary(id: string): Promise<DeckSummary> {
    const { summary } = await this.client.request({ type: "deck_summary", id }, "deck_summary");
    this.#update((state) => ({ ...state, decks: { ...state.decks, [id]: summary } }));
    return summary;
  }

  async #deckRequest(request: Parameters<HubClient["request"]>[0]): Promise<Deck> {
    const { deck } = await this.client.request(request, "deck");
    this.#update((state) => ({ ...state, deck }));
    return deck;
  }

  loadDeck(id: string): Promise<Deck> {
    return this.#deckRequest({ type: "deck", id });
  }

  openDeck(id: string): Promise<Deck> {
    return this.#deckRequest({ type: "open_deck", id });
  }

  setSlides(
    id: string,
    slides: Slide[],
    theme: string | null = null,
    transition: Transition | null = null,
  ): Promise<Deck> {
    this.#update((state) =>
      state.deck?.id === id ? { ...state, deck: { ...state.deck, slides } } : state,
    );
    return this.#deckRequest({ type: "set_slides", id, slides, theme, transition });
  }

  resolveSlideChange(id: string, slideId: string, keep: boolean): Promise<Deck> {
    return this.#deckRequest({ type: "resolve_slide_change", id, slideId, keep });
  }

  restoreDeckVersion(id: string, version: number): Promise<Deck> {
    return this.#deckRequest({ type: "restore_deck_version", id, version });
  }

  async searchImages(query: string): Promise<FoundImage[]> {
    const { images } = await this.client.request({ type: "search_images", query }, "images");
    return images;
  }

  async saveExport(path: string, data: string): Promise<string> {
    const result = await this.client.request({ type: "save_export", path, data }, "exported");
    return result.path;
  }

  async sheetSummary(id: string): Promise<WorkbookSummary> {
    const { summary } = await this.client.request(
      { type: "sheet_summary", id },
      "workbook_summary",
    );
    this.#update((state) => ({ ...state, sheets: { ...state.sheets, [id]: summary } }));
    return summary;
  }

  async #sheetRequest(request: Parameters<HubClient["request"]>[0]): Promise<Workbook> {
    const { workbook } = await this.client.request(request, "workbook");
    this.#update((state) => ({ ...state, sheet: workbook }));
    return workbook;
  }

  loadSheet(id: string): Promise<Workbook> {
    return this.#sheetRequest({ type: "sheet", id });
  }

  openSheet(id: string): Promise<Workbook> {
    return this.#sheetRequest({ type: "open_sheet", id });
  }

  importSheet(threadId: string, fileId: string, name: string): Promise<Workbook> {
    return this.#sheetRequest({ type: "import_sheet", threadId, fileId, name });
  }

  setCells(id: string, tabId: string, edits: CellEdit[]): Promise<Workbook> {
    return this.#sheetRequest({ type: "set_cells", id, tabId, edits });
  }

  sheetChange(id: string, tabId: string, change: SheetOp): Promise<Workbook> {
    return this.#sheetRequest({ type: "sheet_change", id, tabId, change });
  }

  resolveSheetMarks(id: string, keep: boolean): Promise<Workbook> {
    return this.#sheetRequest({ type: "resolve_sheet_marks", id, keep });
  }

  restoreSheetVersion(id: string, version: number): Promise<Workbook> {
    return this.#sheetRequest({ type: "restore_sheet_version", id, version });
  }

  async sheetVersionTabs(id: string, version: number): Promise<SheetTab[]> {
    const { tabs } = await this.client.request(
      { type: "sheet_version_tabs", id, version },
      "sheet_tabs",
    );
    return tabs;
  }

  async exportSheet(id: string, format: SheetFormat, tabId: string, path: string): Promise<string> {
    const result = await this.client.request(
      { type: "export_sheet", id, format, tabId, path },
      "exported",
    );
    return result.path;
  }

  async exportSheetData(id: string, format: SheetFormat, tabId: string): Promise<ExportedFile> {
    const { name, mime, data } = await this.client.request(
      { type: "export_sheet_data", id, format, tabId },
      "export_data",
    );
    return { name, mime, data };
  }

  async recipe(id: string): Promise<RecipeView> {
    const { view } = await this.client.request({ type: "recipe", id }, "recipe");
    this.#update((state) => ({ ...state, recipes: { ...state.recipes, [id]: view } }));
    return view;
  }

  async cookRecipe(id: string): Promise<void> {
    return this.#kitchenRequest({ type: "cook_recipe", id });
  }

  async recipeToShopping(id: string): Promise<void> {
    const { view } = await this.client.request({ type: "recipe_to_shopping", id }, "recipe");
    this.#update((state) => ({ ...state, recipes: { ...state.recipes, [id]: view } }));
  }

  #floor(plan: FloorPlan): FloorPlan {
    this.#update((state) => ({ ...state, floorPlans: { ...state.floorPlans, [plan.id]: plan } }));
    return plan;
  }

  async floorPlan(id: string): Promise<FloorPlan> {
    const { plan } = await this.client.request({ type: "floor_plan", id }, "floor_plan");
    return this.#floor(plan);
  }

  async setFloorScheme(id: string, scheme: string): Promise<FloorPlan> {
    const { plan } = await this.client.request(
      { type: "set_floor_scheme", id, scheme },
      "floor_plan",
    );
    return this.#floor(plan);
  }

  async restoreFloorVersion(id: string, scheme: string, version: number): Promise<FloorPlan> {
    const { plan } = await this.client.request(
      { type: "restore_floor_version", id, scheme, version },
      "floor_plan",
    );
    return this.#floor(plan);
  }

  async measureFloor(id: string, measureId: string, millimeters: number): Promise<FloorPlan> {
    const { plan } = await this.client.request(
      { type: "measure_floor", id, measureId, millimeters: Math.round(millimeters) },
      "floor_plan",
    );
    return this.#floor(plan);
  }

  async docSummary(id: string): Promise<DocSummary> {
    const { summary } = await this.client.request({ type: "doc_summary", id }, "doc_summary");
    this.#update((state) => ({ ...state, docs: { ...state.docs, [id]: summary } }));
    return summary;
  }

  async loadDoc(id: string): Promise<Doc> {
    const { doc } = await this.client.request({ type: "doc", id }, "doc");
    this.#update((state) => ({ ...state, doc }));
    return doc;
  }

  async openDoc(id: string): Promise<Doc> {
    const { doc } = await this.client.request({ type: "open_doc", id }, "doc");
    this.#update((state) => ({ ...state, doc }));
    return doc;
  }

  async #docRequest(request: Parameters<HubClient["request"]>[0]): Promise<Doc> {
    const { doc } = await this.client.request(request, "doc");
    this.#update((state) => ({ ...state, doc }));
    return doc;
  }

  setDocBlocks(id: string, blocks: DocBlock[]): Promise<Doc> {
    return this.#docRequest({ type: "set_doc_blocks", id, blocks });
  }

  resolveMark(id: string, blockId: string, keep: boolean): Promise<Doc> {
    return this.#docRequest({ type: "resolve_mark", id, blockId, keep });
  }

  resolveAllMarks(id: string, keep: boolean): Promise<Doc> {
    return this.#docRequest({ type: "resolve_all_marks", id, keep });
  }

  resolveSuggestion(id: string, suggestionId: string, accept: boolean): Promise<Doc> {
    return this.#docRequest({ type: "resolve_suggestion", id, suggestionId, accept });
  }

  restoreDocVersion(id: string, version: number): Promise<Doc> {
    return this.#docRequest({ type: "restore_doc_version", id, version });
  }

  async docVersionBlocks(id: string, version: number): Promise<DocBlock[]> {
    const { blocks } = await this.client.request(
      { type: "doc_version_blocks", id, version },
      "doc_blocks",
    );
    return blocks;
  }

  async exportDoc(id: string, format: DocFormat, path: string): Promise<string> {
    const result = await this.client.request({ type: "export_doc", id, format, path }, "exported");
    return result.path;
  }

  async exportDocData(id: string, format: DocFormat): Promise<ExportedFile> {
    const { name, mime, data } = await this.client.request(
      { type: "export_doc_data", id, format },
      "export_data",
    );
    return { name, mime, data };
  }

  async loadPlan(threadId: string): Promise<Plan | null> {
    const { plan } = await this.client.request({ type: "plan", threadId }, "plan");
    this.#update((state) => ({ ...state, plans: { ...state.plans, [threadId]: plan } }));
    return plan;
  }

  async listPlans(): Promise<Plan[]> {
    const { plans } = await this.client.request({ type: "list_plans" }, "plans");
    this.#update((state) => ({
      ...state,
      plans: { ...state.plans, ...Object.fromEntries(plans.map((plan) => [plan.threadId, plan])) },
    }));
    return plans;
  }

  async planAction(threadId: string, action: PlanAction): Promise<Plan | null> {
    const { plan } = await this.client.request({ type: "plan_action", threadId, action }, "plan");
    this.#update((state) => ({ ...state, plans: { ...state.plans, [threadId]: plan } }));
    return plan;
  }

  #putSchedule(schedule: Schedule): Schedule {
    this.#update((state) => ({
      ...state,
      schedules: { ...state.schedules, [schedule.id]: schedule },
    }));
    return schedule;
  }

  async listSchedules(): Promise<Schedule[]> {
    const { schedules } = await this.client.request({ type: "list_schedules" }, "schedules");
    this.#update((state) => ({
      ...state,
      schedulesLoaded: true,
      schedules: {
        ...state.schedules,
        ...Object.fromEntries(schedules.map((schedule) => [schedule.id, schedule])),
      },
    }));
    return schedules;
  }

  async loadSchedule(id: string): Promise<Schedule> {
    const { schedule } = await this.client.request({ type: "schedule", id }, "schedule");
    return this.#putSchedule(schedule);
  }

  async startSchedule(id: string): Promise<Schedule> {
    const { schedule } = await this.client.request({ type: "start_schedule", id }, "schedule");
    return this.#putSchedule(schedule);
  }

  async updateSchedule(next: Schedule): Promise<Schedule> {
    const { schedule } = await this.client.request(
      { type: "update_schedule", schedule: next },
      "schedule",
    );
    return this.#putSchedule(schedule);
  }

  async setScheduleActive(id: string, active: boolean): Promise<Schedule> {
    const { schedule } = await this.client.request(
      { type: "set_schedule_active", id, active },
      "schedule",
    );
    return this.#putSchedule(schedule);
  }

  async runSchedule(id: string): Promise<Schedule> {
    const { schedule } = await this.client.request({ type: "run_schedule", id }, "schedule");
    return this.#putSchedule(schedule);
  }

  #putTodos(todos: readonly Todo[]): Todo[] {
    this.#update((state) => ({
      ...state,
      todos: { ...state.todos, ...Object.fromEntries(todos.map((todo) => [todo.id, todo])) },
    }));
    return [...todos];
  }

  async listTodos(): Promise<Todo[]> {
    const { todos } = await this.client.request({ type: "list_todos" }, "todos");
    this.#update((state) => ({
      ...state,
      todosLoaded: true,
      todos: Object.fromEntries(todos.map((todo) => [todo.id, todo])),
    }));
    return todos;
  }

  async browserResult(id: string, page: BrowserPage): Promise<void> {
    await this.client.request({ type: "browser_result", id, page }, "ack");
  }

  async browserStop(): Promise<void> {
    await this.client.request({ type: "browser_stop" }, "ack");
  }

  async pageCheck(hash: string): Promise<PageCheck | null> {
    const { check } = await this.client.request({ type: "page_check", hash }, "page_check");
    return check;
  }

  async addTodo(draft: TodoDraft, propose = false): Promise<Todo> {
    const { todo } = await this.client.request({ type: "add_todo", draft, propose }, "todo");
    return this.#putTodos([todo])[0] ?? todo;
  }

  async quickAddTodo(text: string): Promise<Todo> {
    const { todo } = await this.client.request({ type: "quick_add_todo", text }, "todo");
    return this.#putTodos([todo])[0] ?? todo;
  }

  async confirmTodo(id: string): Promise<Todo> {
    const { todo } = await this.client.request({ type: "confirm_todo", id }, "todo");
    return this.#putTodos([todo])[0] ?? todo;
  }

  async updateTodo(next: Todo): Promise<Todo> {
    const { todo } = await this.client.request({ type: "update_todo", todo: next }, "todo");
    return this.#putTodos([todo])[0] ?? todo;
  }

  async todoAction(id: string, action: TodoAction): Promise<Todo> {
    const { todo } = await this.client.request({ type: "todo_action", id, action }, "todo");
    return this.#putTodos([todo])[0] ?? todo;
  }

  async deleteTodo(id: string): Promise<void> {
    this.#update((state) => {
      const { [id]: _removed, ...todos } = state.todos;
      return { ...state, todos };
    });
    await this.client.request({ type: "delete_todo", id }, "ack");
  }

  async todosToShopping(ids: string[]): Promise<Todo[]> {
    const { todos } = await this.client.request({ type: "todos_to_shopping", ids }, "todos");
    return this.#putTodos(todos);
  }

  async keepTodos(ids: string[]): Promise<Todo[]> {
    const { todos } = await this.client.request({ type: "keep_todos", ids }, "todos");
    return this.#putTodos(todos);
  }

  async deleteSchedule(id: string): Promise<void> {
    await this.client.request({ type: "delete_schedule", id }, "ack");
    this.#update((state) => {
      const { [id]: _removed, ...schedules } = state.schedules;
      return { ...state, schedules };
    });
  }

  async findCapabilities(query: string): Promise<Capability[]> {
    const { capabilities } = await this.client.request(
      { type: "find_capabilities", query },
      "capabilities",
    );
    return capabilities;
  }

  async listCapabilities(): Promise<Capability[]> {
    const { capabilities } = await this.client.request(
      { type: "list_capabilities" },
      "capabilities",
    );
    this.#update((state) => ({ ...state, capabilities }));
    return capabilities;
  }

  async installCapability(
    id: string,
    secrets: Record<string, string> = {},
    acknowledgedRisk = false,
  ): Promise<Capability> {
    const { capability } = await this.client.request(
      { type: "install_capability", id, secrets, acknowledgedRisk },
      "capability",
    );
    return capability;
  }

  async setCapabilityEnabled(id: string, enabled: boolean): Promise<void> {
    await this.client.request({ type: "set_capability_enabled", id, enabled }, "ack");
  }

  async removeCapability(id: string): Promise<void> {
    await this.client.request({ type: "remove_capability", id }, "ack");
  }

  async contextUsage(threadId: string): Promise<ContextUsage> {
    const { usage } = await this.client.request(
      { type: "context_usage", threadId },
      "context_usage",
    );
    return usage;
  }

  async compact(threadId: string): Promise<void> {
    await this.client.request({ type: "compact_thread", threadId }, "ack");
  }

  async setAutoCompact(percent: number | null): Promise<void> {
    await this.client.request({ type: "set_auto_compact", percent }, "ack");
  }

  async notifySettings(): Promise<NotifySettings> {
    const { settings } = await this.client.request({ type: "notify_settings" }, "notify_settings");
    return settings;
  }

  async setNotifySettings(settings: NotifySettings): Promise<NotifySettings> {
    const result = await this.client.request(
      { type: "set_notify_settings", settings },
      "notify_settings",
    );
    return result.settings;
  }

  async dailyLayout(): Promise<DailyLayout> {
    const { layout } = await this.client.request({ type: "daily_layout" }, "daily_layout");
    return layout;
  }

  async setDailyLayout(layout: DailyLayout): Promise<DailyLayout> {
    const result = await this.client.request({ type: "set_daily_layout", layout }, "daily_layout");
    return result.layout;
  }

  async loadDailyFeed(): Promise<DailyFeed> {
    const { feed } = await this.client.request({ type: "daily_feed" }, "daily_feed");
    this.#update((state) => ({
      ...state,
      dailyFeed: feed,
      todos: { ...state.todos, ...Object.fromEntries(feed.todos.map((todo) => [todo.id, todo])) },
    }));
    return feed;
  }

  async resolveInsight(id: string, mute: boolean): Promise<DailyFeed> {
    this.#update((state) =>
      state.dailyFeed
        ? {
            ...state,
            dailyFeed: {
              ...state.dailyFeed,
              insights: state.dailyFeed.insights.filter((item) => item.id !== id),
            },
          }
        : state,
    );
    const { feed } = await this.client.request({ type: "resolve_insight", id, mute }, "daily_feed");
    this.#update((state) => ({ ...state, dailyFeed: feed }));
    return feed;
  }

  async unmuteInsight(kind: InsightKind, subject: string): Promise<DailyFeed> {
    const { feed } = await this.client.request(
      { type: "unmute_insight", kind, subject },
      "daily_feed",
    );
    this.#update((state) => ({ ...state, dailyFeed: feed }));
    return feed;
  }

  async loadMailStatus(): Promise<MailStatus> {
    const { status } = await this.client.request({ type: "mail_status" }, "mail_status");
    this.#update((state) => ({ ...state, mailStatus: status }));
    return status;
  }

  async connectMail(
    provider: MailProvider,
    address: string,
    password: string,
    host: string | null,
  ): Promise<MailStatus> {
    const { status } = await this.client.request(
      { type: "connect_mail", provider, address, password, host },
      "mail_status",
    );
    if (status.connected) this.#update((state) => ({ ...state, mailStatus: status }));
    return status;
  }

  async disconnectMail(): Promise<MailStatus> {
    const { status } = await this.client.request({ type: "disconnect_mail" }, "mail_status");
    this.#update((state) => ({
      ...state,
      mailStatus: status,
      dailyFeed: state.dailyFeed ? { ...state.dailyFeed, mail: null } : state.dailyFeed,
    }));
    return status;
  }

  async mailList(category: MailCategory | null): Promise<MailItem[]> {
    const { items } = await this.client.request({ type: "mail_list", category }, "mail_list");
    return items;
  }

  async mailOriginal(id: string): Promise<MailOriginal> {
    const { original } = await this.client.request({ type: "mail_original", id }, "mail_original");
    return original;
  }

  async loadWeather(placeId: string | null = null): Promise<WeatherView> {
    const { weather } = await this.client.request({ type: "weather", placeId }, "weather");
    this.#update((state) => ({ ...state, weather }));
    return weather;
  }

  async #weatherRequest(request: Parameters<HubClient["request"]>[0]): Promise<WeatherView> {
    const { weather } = await this.client.request(request, "weather");
    this.#update((state) => ({ ...state, weather }));
    return weather;
  }

  async searchPlaces(query: string): Promise<WeatherPlace[]> {
    const { places } = await this.client.request({ type: "search_places", query }, "places");
    return places;
  }

  addPlace(place: WeatherPlace): Promise<WeatherView> {
    return this.#weatherRequest({ type: "add_place", place });
  }

  removePlace(id: string): Promise<WeatherView> {
    return this.#weatherRequest({ type: "remove_place", id });
  }

  setWeatherRules(rules: WeatherRules): Promise<WeatherView> {
    return this.#weatherRequest({ type: "set_weather_rules", rules });
  }

  locateWeather(): Promise<WeatherView> {
    return this.#weatherRequest({ type: "locate_weather" });
  }

  async locatePlace(): Promise<WeatherPlace | null> {
    const { places } = await this.client.request({ type: "locate_place" }, "places");
    return places[0] ?? null;
  }

  updatePlace(
    id: string,
    label: string | null,
    location: WeatherPlace | null,
  ): Promise<WeatherView> {
    return this.#weatherRequest({ type: "update_place", id, label, location });
  }

  setHomePlace(id: string): Promise<WeatherView> {
    return this.#weatherRequest({ type: "set_home_place", id });
  }

  async clearBought(): Promise<void> {
    const { kitchen } = await this.client.request({ type: "clear_bought" }, "kitchen");
    this.#update((state) => ({ ...state, kitchen }));
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

  /** A new empty workspace inside the hub's own data folder, for a device with no folders to pick. */
  async newWorkspace(name: string): Promise<Workspace> {
    const { workspace } = await this.client.request({ type: "new_workspace", name }, "workspace");
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
      this.loadKitchen(),
      this.refreshModel(),
      this.refreshPreferences(),
      this.refreshMemories(),
      this.refreshDevices(),
      this.refreshServices(),
      this.refreshConfirms(),
      this.refreshAsks(),
      this.loadMailStatus(),
    ]).catch(() => undefined);
  }

  #update(next: (state: HubState) => HubState, soon = false): void {
    const updated = next(this.#state);
    if (updated === this.#state) return;
    this.#state = updated;
    if (soon) {
      this.#pending ??= setTimeout(() => this.#notify(), STREAM_FRAME_MS);
      return;
    }
    this.#notify();
  }

  #notify(): void {
    if (this.#pending !== null) {
      clearTimeout(this.#pending);
      this.#pending = null;
    }
    for (const listener of this.#listeners) listener();
  }
}
