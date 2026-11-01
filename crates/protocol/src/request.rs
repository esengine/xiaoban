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
