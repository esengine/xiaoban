use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{ContextNote, Device, Message, ModelInfo, Thread, Usage};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum Request {
    ListThreads,
    CreateThread {
        title: Option<String>,
    },
    ListMessages {
        thread_id: String,
    },
    SendMessage {
        thread_id: String,
        text: String,
        #[serde(default)]
        context: Vec<ContextNote>,
    },
    CancelTurn {
        turn_id: String,
    },
    CreatePairingCode,
    ListDevices,
    RevokeDevice {
        device_id: String,
    },
    UsageSummary,
    ModelStatus,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
#[ts(export)]
pub enum Response {
    Ack,
    Threads {
        threads: Vec<Thread>,
    },
    Thread {
        thread: Thread,
    },
    Messages {
        messages: Vec<Message>,
    },
    TurnAccepted {
        turn_id: String,
        message: Message,
    },
    PairingCode {
        code: String,
        #[ts(type = "number")]
        expires_at: i64,
    },
    Devices {
        devices: Vec<Device>,
    },
    Usage {
        usage: Usage,
        turns: u32,
    },
    ModelStatus {
        model: Option<ModelInfo>,
    },
}
