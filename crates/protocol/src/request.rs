use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    AutonomyLevel, ContextNote, Device, Failure, Location, Memory, Message, ModelInfo, Preferences,
    ProviderId, ProviderOption, Thread, Usage,
};
use crate::{
    ConfirmChoice, ConfirmRequest, OperatePermissions, ServiceId, ServiceStatus, Trip, TripCalendar,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Request {
    ListThreads,
    CreateThread {
        title: Option<String>,
        #[serde(default)]
        workspace_id: Option<String>,
    },
    ListMessages {
        thread_id: String,
        #[serde(default)]
        #[ts(type = "number | null")]
        before: Option<i64>,
        #[serde(default)]
        limit: Option<u32>,
    },
    SendMessage {
        thread_id: String,
        text: String,
        #[serde(default)]
        context: Vec<ContextNote>,
        #[serde(default)]
        quote: Option<crate::Quote>,
        #[serde(default)]
        files: Vec<String>,
        #[serde(default)]
        threads: Vec<String>,
    },
    CancelTurn {
        turn_id: String,
    },
    RetryTurn {
        thread_id: String,
    },
    RenameThread {
        thread_id: String,
        title: String,
    },
    DeleteThread {
        thread_id: String,
    },
    CreatePairingCode,
    ListDevices,
    RevokeDevice {
        device_id: String,
    },
    UsageSummary,
    ModelStatus,
    ListProviders,
    ConfigureProvider {
        provider: ProviderId,
        api_key: String,
        model: Option<String>,
        base_url: Option<String>,
        label: Option<String>,
        #[serde(default)]
        api: Option<crate::ModelApi>,
    },
    SelectModel {
        provider: ProviderId,
        model: String,
    },
    ShareProviderKeys {
        public_key: String,
    },
    UploadFile {
        name: String,
        data: String,
    },
    Preferences,
    SetAutonomy {
        level: AutonomyLevel,
    },
    Remember {
        subject: String,
        value: String,
    },
    ListMemories,
    CompleteOnboarding,
    InterpretAnswer {
        subject: String,
        question: String,
        answer: String,
        follow_up: Option<String>,
        can_locate: bool,
    },
    Services,
    ConfigureService {
        service: ServiceId,
        api_key: String,
        resume_thread_id: Option<String>,
    },
    DeclineService {
        service: ServiceId,
        thread_id: String,
    },
    GetTrip {
        trip_id: String,
        version: Option<u32>,
    },
    TripCalendar {
        trip_id: String,
        version: Option<u32>,
    },
    EventCalendar {
        event: crate::EventDraft,
    },
    ChooseTripStay {
        trip_id: String,
        stay: u32,
    },
    FillTripPrice {
        trip_id: String,
        line: Option<u32>,
        stay: Option<u32>,
        #[ts(type = "number")]
        cents: i64,
    },
    AddTripExpense {
        trip_id: String,
        name: String,
        #[ts(type = "number")]
        cents: i64,
    },
    TripSpending {
        trip_id: String,
    },
    AnswerConfirm {
        confirm_id: String,
        choice: ConfirmChoice,
    },
    PendingConfirms,
    OperateStatus,
    BackgroundTurn {
        turn_id: String,
    },
    PauseTurn {
        turn_id: String,
    },
    ResumeTurn {
        turn_id: String,
    },
    AddNote {
        turn_id: String,
        text: String,
    },
    Locate,
    ForgetMemory {
        subject: String,
    },
    ListGalaxies,
    PinMemory {
        memory_id: String,
        pinned: bool,
    },
    TidyMemories,
    FileData {
        file_id: String,
    },
    FilePath {
        file_id: String,
        name: String,
    },
    SetThinking {
        thread_id: String,
        effort: crate::ThinkingEffort,
    },
    ListWorkspaces,
    CreateWorkspace {
        path: String,
    },
    RenameWorkspace {
        workspace_id: String,
        name: String,
    },
    RemoveWorkspace {
        workspace_id: String,
    },
    ListDir {
        workspace_id: String,
        path: String,
    },
    ReadWorkspaceFile {
        workspace_id: String,
        path: String,
    },
    ThreadChanges {
        thread_id: String,
    },
    RevertChange {
        thread_id: String,
        path: String,
        #[serde(default)]
        hunk: Option<u32>,
    },
    GitInfo {
        workspace_id: String,
    },
    ListCommands {
        workspace_id: String,
    },
    RunCommand {
        workspace_id: String,
        command: String,
    },
    StopCommand {
        command_id: String,
    },
    ListBranches {
        workspace_id: String,
    },
    SwitchBranch {
        workspace_id: String,
        name: String,
        #[serde(default)]
        create: bool,
        #[serde(default)]
        stash: bool,
    },
    PullBranch {
        workspace_id: String,
    },
    RestoreStash {
        workspace_id: String,
    },
    WorkspaceImage {
        workspace_id: String,
        path: String,
    },
    GithubRefs {
        workspace_id: String,
        numbers: Vec<u32>,
    },
    ThreadPins {
        thread_id: String,
    },
    PinRef {
        thread_id: String,
        number: u32,
        pinned: bool,
    },
    GitLog {
        workspace_id: String,
        #[serde(default)]
        all: bool,
    },
    CommitFiles {
        workspace_id: String,
        #[serde(default)]
        hash: Option<String>,
    },
    DraftCommit {
        workspace_id: String,
        paths: Vec<String>,
    },
    Commit {
        workspace_id: String,
        message: String,
        paths: Vec<String>,
        #[serde(default)]
        push: bool,
    },
    InitGit {
        workspace_id: String,
    },
    CreatePullRequest {
        workspace_id: String,
    },
    Conflicts {
        workspace_id: String,
    },
    ResolveConflict {
        workspace_id: String,
        path: String,
        index: u32,
        choice: crate::ConflictChoice,
        #[serde(default)]
        text: Option<String>,
    },
    FinishMerge {
        workspace_id: String,
    },
    AbortMerge {
        workspace_id: String,
    },
    InspectFolder {
        path: String,
    },
    RestoreChange {
        thread_id: String,
        path: String,
    },
    WorkspaceSettings {
        workspace_id: String,
    },
    RemoveAllowance {
        workspace_id: String,
        kind: crate::Allowance,
        value: String,
    },
    SetEditor {
        workspace_id: String,
        editor: String,
    },
    Kitchen,
    SelectDish {
        name: String,
        selected: bool,
    },
    AddMissingToShopping,
    ToggleShopping {
        name: String,
        done: bool,
    },
    ClearBought,
    ResetKitchen,
    CookGo {
        step: u32,
    },
    StartTimer {
        step: Option<u32>,
        label: String,
        after: String,
        seconds: u32,
    },
    ExtendTimer {
        id: String,
        seconds: u32,
    },
    DismissTimer {
        id: String,
    },
    FinishCooking,
    WeekToShopping {
        start: String,
    },
    SetFridgeItem {
        name: String,
        amount: String,
    },
    RemoveFridgeItem {
        name: String,
        shop: bool,
    },
    WeekItemGone {
        start: String,
        name: String,
    },
    Recipe {
        id: String,
    },
    CookRecipe {
        id: String,
    },
    RecipeToShopping {
        id: String,
    },
    FloorPlan {
        id: String,
    },
    SetFloorScheme {
        id: String,
        scheme: String,
    },
    RestoreFloorVersion {
        id: String,
        scheme: String,
        version: u32,
    },
    MeasureFloor {
        id: String,
        measure_id: String,
        millimeters: u32,
    },
    Ledger {
        month: String,
    },
    LedgerRange {
        from: String,
        to: String,
    },
    LedgerYear {
        year: i32,
    },
    Weather {
        place_id: Option<String>,
    },
    SearchPlaces {
        query: String,
    },
    AddPlace {
        place: crate::WeatherPlace,
    },
    RemovePlace {
        id: String,
    },
    SetWeatherRules {
        rules: crate::WeatherRules,
    },
    LocateWeather,
    DailyLayout,
    Doc {
        id: String,
    },
    DocSummary {
        id: String,
    },
    OpenDoc {
        id: String,
    },
    SetDocBlocks {
        id: String,
        blocks: Vec<crate::DocBlock>,
    },
    ResolveMark {
        id: String,
        block_id: String,
        keep: bool,
    },
    ResolveAllMarks {
        id: String,
        keep: bool,
    },
    ResolveSuggestion {
        id: String,
        suggestion_id: String,
        accept: bool,
    },
    RestoreDocVersion {
        id: String,
        version: u32,
    },
    DocVersionBlocks {
        id: String,
        version: u32,
    },
    Sheet {
        id: String,
    },
    SheetSummary {
        id: String,
    },
    OpenSheet {
        id: String,
    },
    SetCells {
        id: String,
        tab_id: String,
        edits: Vec<crate::CellEdit>,
    },
    SheetChange {
        id: String,
        tab_id: String,
        change: crate::SheetOp,
    },
    ResolveSheetMarks {
        id: String,
        keep: bool,
    },
    RestoreSheetVersion {
        id: String,
        version: u32,
    },
    SheetVersionTabs {
        id: String,
        version: u32,
    },
    ExportSheet {
        id: String,
        format: crate::SheetFormat,
        tab_id: String,
        path: String,
    },
    ImportSheet {
        thread_id: String,
        file_id: String,
        name: String,
    },
    Deck {
        id: String,
    },
    DeckSummary {
        id: String,
    },
    OpenDeck {
        id: String,
    },
    SetSlides {
        id: String,
        slides: Vec<crate::Slide>,
        theme: Option<String>,
        transition: Option<crate::Transition>,
    },
    ResolveSlideChange {
        id: String,
        slide_id: String,
        keep: bool,
    },
    RestoreDeckVersion {
        id: String,
        version: u32,
    },
    SearchImages {
        query: String,
    },
    SaveExport {
        path: String,
        data: String,
    },
    ExportDoc {
        id: String,
        format: crate::DocFormat,
        path: String,
    },
    ExportDocData {
        id: String,
        format: crate::DocFormat,
    },
    ExportSheetData {
        id: String,
        format: crate::SheetFormat,
        tab_id: String,
    },
    NotifySettings,
    SetNotifySettings {
        settings: crate::NotifySettings,
    },
    SetDailyLayout {
        layout: crate::DailyLayout,
    },
    DailyFeed,
    ResolveInsight {
        id: String,
        mute: bool,
    },
    UnmuteInsight {
        kind: crate::InsightKind,
        subject: String,
    },
    ContextUsage {
        thread_id: String,
    },
    Plan {
        thread_id: String,
    },
    ListPlans,
    ListSchedules,
    Schedule {
        id: String,
    },
    StartSchedule {
        id: String,
    },
    UpdateSchedule {
        schedule: Box<crate::Schedule>,
    },
    SetScheduleActive {
        id: String,
        active: bool,
    },
    RunSchedule {
        id: String,
    },
    DeleteSchedule {
        id: String,
    },
    ListTodos,
    AddTodo {
        draft: crate::TodoDraft,
        #[serde(default)]
        propose: bool,
    },
    QuickAddTodo {
        text: String,
    },
    ConfirmTodo {
        id: String,
    },
    UpdateTodo {
        todo: Box<crate::Todo>,
    },
    TodoAction {
        id: String,
        action: crate::TodoAction,
    },
    DeleteTodo {
        id: String,
    },
    TodosToShopping {
        ids: Vec<String>,
    },
    KeepTodos {
        ids: Vec<String>,
    },
    PlanAction {
        thread_id: String,
        action: crate::PlanAction,
    },
    FindCapabilities {
        query: String,
    },
    ListCapabilities,
    InstallCapability {
        id: String,
        #[serde(default)]
        secrets: std::collections::HashMap<String, String>,
        #[serde(default)]
        acknowledged_risk: bool,
    },
    SetCapabilityEnabled {
        id: String,
        enabled: bool,
    },
    RemoveCapability {
        id: String,
    },
    CompactThread {
        thread_id: String,
    },
    SetAutoCompact {
        percent: Option<u8>,
    },
    LocatePlace,
    UpdatePlace {
        id: String,
        label: Option<String>,
        location: Option<crate::WeatherPlace>,
    },
    SetHomePlace {
        id: String,
    },
    SetBudget {
        month: String,
        #[ts(type = "number | null")]
        cents: Option<i64>,
    },
    UpdateExpense {
        month: String,
        expense: crate::Expense,
    },
    DeleteExpense {
        month: String,
        id: String,
    },
    MuteInsight {
        month: String,
        key: String,
    },
    SetImportRow {
        month: String,
        id: String,
        checked: bool,
        category: String,
    },
    CommitImport {
        month: String,
    },
    CancelImport {
        month: String,
    },
    SuggestShare {
        item: crate::SharedItem,
    },
    SendShare {
        item: crate::SharedItem,
        thread_id: String,
        prompt: String,
        #[serde(default)]
        remember: bool,
    },
    MailStatus,
    ConnectMail {
        provider: crate::MailProvider,
        address: String,
        password: String,
        #[serde(default)]
        host: Option<String>,
    },
    DisconnectMail,
    MailList {
        #[serde(default)]
        category: Option<crate::MailCategory>,
    },
    MailOriginal {
        id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Response {
    Ack,
    FileData {
        url: String,
    },
    FilePath {
        path: String,
    },
    Galaxies {
        galaxies: Vec<crate::MemoryGalaxy>,
    },
    MemoriesTidied {
        merged: u32,
        replaced: u32,
        moved: u32,
        summaries: u32,
    },
    Threads {
        threads: Vec<Thread>,
    },
    Thread {
        thread: Thread,
    },
    Messages {
        messages: Vec<Message>,
        #[serde(default)]
        more: bool,
        #[serde(default)]
        archived: Option<crate::Archived>,
    },
    TurnAccepted {
        turn_id: String,
        message: Message,
    },
    PairingCode {
        code: String,
        #[ts(type = "number")]
        expires_at: i64,
        addresses: Vec<String>,
        port: u16,
    },
    Devices {
        devices: Vec<Device>,
    },
    Usage {
        usage: Usage,
        turns: u32,
        #[serde(default)]
        memory: Usage,
    },
    ModelStatus {
        model: Option<ModelInfo>,
    },
    Providers {
        providers: Vec<ProviderOption>,
    },
    ProviderConfigured {
        model: Option<ModelInfo>,
        failure: Option<Failure>,
    },
    Preferences {
        preferences: Preferences,
    },
    Memory {
        memory: Memory,
    },
    Memories {
        memories: Vec<Memory>,
    },
    Interpreted {
        interpretation: Interpretation,
    },
    Located {
        location: Location,
    },
    Services {
        services: Vec<ServiceStatus>,
    },
    ServiceConfigured {
        connected: bool,
        services: Vec<ServiceStatus>,
    },
    Trip {
        trip: Trip,
        latest: u32,
    },
    TripCalendar {
        calendar: TripCalendar,
    },
    TripSpending {
        category: String,
        entries: Vec<crate::Expense>,
    },
    PendingConfirms {
        confirms: Vec<ConfirmRequest>,
    },
    OperateStatus {
        permissions: OperatePermissions,
    },
    Workspaces {
        workspaces: Vec<crate::Workspace>,
    },
    Workspace {
        workspace: crate::Workspace,
    },
    Dir {
        entries: Vec<crate::DirEntry>,
    },
    WorkspaceFile {
        text: String,
        truncated: bool,
        binary: bool,
    },
    Changes {
        files: Vec<crate::FileDiff>,
    },
    Git {
        git: crate::GitInfo,
    },
    Commands {
        commands: Vec<crate::CommandRun>,
    },
    Command {
        command: crate::CommandRun,
    },
    Branches {
        branches: Vec<crate::Branch>,
    },
    GithubRefs {
        refs: Vec<crate::GithubRef>,
    },
    Pins {
        pinned: Vec<u32>,
        hidden: Vec<u32>,
    },
    Commits {
        commits: Vec<crate::CommitInfo>,
    },
    CommitDraft {
        message: Option<String>,
    },
    PullRequest {
        url: String,
    },
    Conflicts {
        files: Vec<crate::ConflictFile>,
    },
    WorkspaceSettings {
        settings: crate::WorkspaceSettings,
    },
    Kitchen {
        kitchen: crate::Kitchen,
    },
    Recipe {
        view: crate::RecipeView,
    },
    FloorPlan {
        plan: crate::FloorPlan,
    },
    Ledger {
        ledger: crate::Ledger,
    },
    LedgerYear {
        year: crate::LedgerYear,
    },
    Weather {
        weather: crate::WeatherView,
    },
    NotifySettings {
        settings: crate::NotifySettings,
    },
    DailyLayout {
        layout: crate::DailyLayout,
    },
    DailyFeed {
        feed: crate::DailyFeed,
    },
    ContextUsage {
        usage: crate::ContextUsage,
    },
    Uploaded {
        path: String,
    },
    ShareSuggested {
        suggestion: crate::ShareSuggestion,
    },
    ProviderKeys {
        public_key: String,
        nonce: String,
        ciphertext: String,
        model: Option<ModelInfo>,
    },
    Plan {
        plan: Option<crate::Plan>,
    },
    Plans {
        plans: Vec<crate::Plan>,
    },
    Schedule {
        schedule: crate::Schedule,
    },
    Schedules {
        schedules: Vec<crate::Schedule>,
    },
    Todo {
        todo: crate::Todo,
    },
    Todos {
        todos: Vec<crate::Todo>,
    },
    Capabilities {
        capabilities: Vec<crate::Capability>,
    },
    Capability {
        capability: crate::Capability,
    },
    Doc {
        doc: crate::Doc,
    },
    DocSummary {
        summary: crate::DocSummary,
    },
    DocBlocks {
        blocks: Vec<crate::DocBlock>,
    },
    Workbook {
        workbook: crate::Workbook,
    },
    WorkbookSummary {
        summary: crate::WorkbookSummary,
    },
    SheetTabs {
        tabs: Vec<crate::SheetTab>,
    },
    Deck {
        deck: crate::Deck,
    },
    DeckSummary {
        summary: crate::DeckSummary,
    },
    Images {
        images: Vec<crate::FoundImage>,
    },
    Exported {
        path: String,
    },
    ExportData {
        name: String,
        mime: String,
        data: String,
    },
    Places {
        places: Vec<crate::WeatherPlace>,
    },
    Folder {
        path: String,
        name: String,
        exists: bool,
        git: crate::GitInfo,
    },
    WorkspaceImage {
        url: String,
        #[ts(type = "number")]
        bytes: u64,
    },
    MailStatus {
        status: crate::MailStatus,
    },
    MailList {
        items: Vec<crate::MailItem>,
    },
    MailOriginal {
        original: Box<crate::MailOriginal>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "outcome",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Interpretation {
    Remembered { memory: Memory },
    Declined,
    Locate,
    Unclear { reply: Option<String> },
    Failed { failure: Failure },
}
