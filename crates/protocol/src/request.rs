use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    AutonomyLevel, ContextNote, Device, Failure, Location, Memory, Message, ModelInfo, Preferences,
    ProviderId, ProviderOption, Thread, Usage,
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
    Locate,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
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
        addresses: Vec<String>,
        port: u16,
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
