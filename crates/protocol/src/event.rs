use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    ConfirmChoice, ConfirmRequest, Device, Failure, Memory, Message, ModelInfo, Thread, Usage,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Event {
    ThreadUpdated {
        thread: Thread,
    },
    ThreadDeleted {
        thread_id: String,
    },
    MessageCreated {
        message: Message,
    },
    TurnStarted {
        thread_id: String,
        turn_id: String,
        #[ts(type = "number")]
        started_at: i64,
    },
    Thinking {
        turn_id: String,
    },
    TextDelta {
        turn_id: String,
        delta: String,
    },
    ReasoningDelta {
        turn_id: String,
        delta: String,
    },
    TurnCompleted {
        turn_id: String,
        message: Message,
        usage: Usage,
    },
    TurnFailed {
        turn_id: String,
        failure: Failure,
    },
    ModelChanged {
        model: Option<ModelInfo>,
    },
    DevicePaired {
        device: Device,
    },
    ToolUsed {
        turn_id: String,
        tool: String,
        call_id: String,
        detail: Option<String>,
    },
    ToolFinished {
        turn_id: String,
        call_id: String,
        result: StepResult,
    },
    MemorySaved {
        memory: Memory,
    },
    MemoryForgotten {
        memory_id: String,
    },
    MemoriesUsed {
        turn_id: String,
        memories: Vec<Memory>,
    },
    ConfirmRequested {
        confirm: ConfirmRequest,
    },
    ConfirmResolved {
        confirm_id: String,
        choice: ConfirmChoice,
    },
    AgentProgress {
        turn_id: String,
        call_id: String,
        agent: u32,
        title: String,
        step: Option<String>,
        done: bool,
    },
    ThreadArchived {
        thread_id: String,
        archived: crate::Archived,
    },
    ThreadCompacting {
        thread_id: String,
        phase: crate::CompactPhase,
    },
    PlanUpdated {
        thread_id: String,
        plan: Option<crate::Plan>,
    },
    ScheduleUpdated {
        schedule: crate::Schedule,
    },
    ScheduleRemoved {
        id: String,
    },
    CapabilitiesChanged {
        capabilities: Vec<crate::Capability>,
    },
    CapabilitiesFound {
        thread_id: String,
        turn_id: String,
        capabilities: Vec<crate::Capability>,
    },
    CapabilityUsed {
        thread_id: String,
        turn_id: String,
        id: String,
        title: String,
        tool: String,
        uses: u32,
    },
    TurnBackgrounded {
        turn_id: String,
    },
    TurnPaused {
        turn_id: String,
        paused: bool,
        by_user: bool,
    },
    WorkspaceUpdated {
        workspace: crate::Workspace,
    },
    WorkspaceRemoved {
        workspace_id: String,
    },
    FilesChanged {
        workspace_id: String,
        thread_id: Option<String>,
        paths: Vec<String>,
    },
    CommandUpdated {
        command: crate::CommandRun,
    },
    KitchenUpdated {
        kitchen: crate::Kitchen,
    },
    TimerFired {
        timer: crate::CookTimer,
    },
    PrepDue {
        task: crate::PrepTask,
    },
    LedgerChanged,
    DocUpdated {
        summary: crate::DocSummary,
    },
    FloorPlanUpdated {
        plan: crate::FloorPlan,
    },
    SheetUpdated {
        summary: crate::WorkbookSummary,
    },
    DeckUpdated {
        summary: crate::DeckSummary,
    },
    WeatherAlert {
        title: String,
        body: String,
        #[serde(default)]
        morning: bool,
    },
    Notify {
        notice: crate::Notice,
    },
    NoticeWithdrawn {
        id: String,
    },
    DailyFeedChanged,
    InsightAlert {
        insight: crate::Insight,
    },
    MailStatusChanged {
        status: crate::MailStatus,
    },
}

impl Event {
    pub fn thread_id(&self) -> Option<&str> {
        match self {
            Self::ThreadUpdated { thread } => Some(&thread.id),
            Self::MessageCreated { message } | Self::TurnCompleted { message, .. } => {
                Some(&message.thread_id)
            }
            Self::TurnStarted { thread_id, .. }
            | Self::ThreadDeleted { thread_id }
            | Self::ThreadArchived { thread_id, .. }
            | Self::ThreadCompacting { thread_id, .. }
            | Self::PlanUpdated { thread_id, .. }
            | Self::CapabilityUsed { thread_id, .. }
            | Self::CapabilitiesFound { thread_id, .. } => Some(thread_id),
            Self::Thinking { .. }
            | Self::TextDelta { .. }
            | Self::ReasoningDelta { .. }
            | Self::TurnFailed { .. }
            | Self::ModelChanged { .. }
            | Self::DevicePaired { .. }
            | Self::ToolUsed { .. }
            | Self::ToolFinished { .. }
            | Self::MemorySaved { .. }
            | Self::MemoriesUsed { .. }
            | Self::MemoryForgotten { .. }
            | Self::ConfirmResolved { .. }
            | Self::TurnPaused { .. }
            | Self::TurnBackgrounded { .. }
            | Self::AgentProgress { .. }
            | Self::WorkspaceUpdated { .. }
            | Self::WorkspaceRemoved { .. }
            | Self::CommandUpdated { .. }
            | Self::KitchenUpdated { .. }
            | Self::TimerFired { .. }
            | Self::PrepDue { .. }
            | Self::LedgerChanged
            | Self::DocUpdated { .. }
            | Self::FloorPlanUpdated { .. }
            | Self::SheetUpdated { .. }
            | Self::DeckUpdated { .. }
            | Self::WeatherAlert { .. }
            | Self::NoticeWithdrawn { .. }
            | Self::DailyFeedChanged
            | Self::InsightAlert { .. }
            | Self::MailStatusChanged { .. }
            | Self::ScheduleUpdated { .. }
            | Self::ScheduleRemoved { .. }
            | Self::CapabilitiesChanged { .. } => None,
            Self::FilesChanged { thread_id, .. } => thread_id.as_deref(),
            Self::Notify { notice } => notice.thread_id.as_deref(),
            Self::ConfirmRequested { confirm } => Some(&confirm.thread_id),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum StepResult {
    Found {
        count: u32,
        sources: Vec<String>,
    },
    Page {
        title: String,
    },
    Saved {
        version: u32,
    },
    Matched {
        names: Vec<String>,
    },
    Failed,
    Done,
    Ran {
        exit_code: Option<i32>,
        timed_out: bool,
        tail: String,
    },
    Declined,
}
