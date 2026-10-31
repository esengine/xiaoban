use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{Device, Failure, Memory, Message, ModelInfo, Thread, Usage};

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
    },
    MemorySaved {
        memory: Memory,
    },
}

impl Event {
    pub fn thread_id(&self) -> Option<&str> {
        match self {
            Self::ThreadUpdated { thread } => Some(&thread.id),
            Self::MessageCreated { message } | Self::TurnCompleted { message, .. } => {
                Some(&message.thread_id)
            }
            Self::TurnStarted { thread_id, .. } => Some(thread_id),
            Self::Thinking { .. }
            | Self::TextDelta { .. }
            | Self::TurnFailed { .. }
            | Self::ModelChanged { .. }
            | Self::DevicePaired { .. }
            | Self::ToolUsed { .. }
            | Self::MemorySaved { .. } => None,
        }
    }
}
