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
    TurnPaused {
        turn_id: String,
        paused: bool,
        by_user: bool,
    },
}

impl Event {
    pub fn thread_id(&self) -> Option<&str> {
        match self {
            Self::ThreadUpdated { thread } => Some(&thread.id),
            Self::MessageCreated { message } | Self::TurnCompleted { message, .. } => {
                Some(&message.thread_id)
            }
            Self::TurnStarted { thread_id, .. } | Self::ThreadDeleted { thread_id } => {
                Some(thread_id)
            }
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
            | Self::TurnPaused { .. } => None,
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
    Found { count: u32, sources: Vec<String> },
    Page { title: String },
    Saved { version: u32 },
    Matched { names: Vec<String> },
    Failed,
    Done,
}
