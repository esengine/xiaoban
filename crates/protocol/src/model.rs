use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: String,
    pub title: Option<String>,
    pub last_message: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub thread_id: String,
    pub role: Role,
    pub text: String,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub cached_tokens: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ProviderId {
    Deepseek,
    Mimo,
    Custom,
}

impl ProviderId {
    pub const ALL: [Self; 3] = [Self::Deepseek, Self::Mimo, Self::Custom];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Deepseek => "deepseek",
            Self::Mimo => "mimo",
            Self::Custom => "custom",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|id| id.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub provider: ProviderId,
    pub model: String,
    pub label: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ProviderOption {
    pub id: ProviderId,
    pub default_model: Option<String>,
    pub models: Vec<String>,
    pub console_url: Option<String>,
    pub configured: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ContextNote {
    pub label: String,
    pub body: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Platform {
    Desktop,
    Ios,
    Android,
    Cli,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub platform: Platform,
    #[ts(type = "number")]
    pub paired_at: i64,
    #[ts(type = "number | null")]
    pub last_seen_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct HubInfo {
    pub id: String,
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum FailureKind {
    Model,
    NotConfigured,
    InvalidKey,
    UnknownModel,
    InvalidEndpoint,
    Network,
    Cancelled,
    Budget,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Failure {
    pub kind: FailureKind,
    pub retryable: bool,
    pub detail: String,
    #[serde(default)]
    pub alternatives: Vec<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum AutonomyLevel {
    Cautious,
    #[default]
    Balanced,
    HandsOff,
}

impl AutonomyLevel {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Cautious => "cautious",
            Self::Balanced => "balanced",
            Self::HandsOff => "hands_off",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        [Self::Cautious, Self::Balanced, Self::HandsOff]
            .into_iter()
            .find(|level| level.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    pub id: String,
    pub subject: String,
    pub value: String,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub autonomy: AutonomyLevel,
    pub onboarded: bool,
    pub primary_thread_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "status",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Location {
    Found {
        city: String,
        district: Option<String>,
    },
    Denied,
    Unavailable,
}
