import type {
  AutonomyLevel,
  ConfirmChoice,
  ContextNote,
  Device,
  Failure,
  Interpretation,
  Location,
  Memory,
  Message,
  ModelInfo,
  OperatePermissions,
  Preferences,
  ProviderId,
  ProviderOption,
  Response,
  ServiceStatus,
  Thread,
  Trip,
  TripCalendar,
  Usage,
} from "@xiaoban/protocol";
import type { HubClient } from "./client.ts";
import { applyEvent, type HubState, initialHubState, tripKey } from "./state.ts";

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

  async send(
    threadId: string,
    text: string,
    options: { context?: ContextNote[]; quote?: string | null } = {},
  ): Promise<string> {
    const { turnId } = await this.client.request(
      {
        type: "send_message",
        threadId,
        text,
        context: options.context ?? [],
        quote: options.quote ?? null,
      },
      "turn_accepted",
    );
    return turnId;
  }

  async retry(threadId: string): Promise<string> {
    const { turnId } = await this.client.request({ type: "retry_turn", threadId }, "turn_accepted");
    return turnId;
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

  async cancel(turnId: string): Promise<void> {
    await this.client.request({ type: "cancel_turn", turnId }, "ack");
  }

  #refreshInBackground(): void {
    Promise.all([
      this.refreshThreads(),
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
