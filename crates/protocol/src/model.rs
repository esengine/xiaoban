use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: String,
    pub title: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub last_message: Option<String>,
    #[serde(default)]
    pub thinking: ThinkingEffort,
    #[serde(default)]
    pub workspace_id: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ThinkingEffort {
    #[default]
    Auto,
    None,
    Low,
    High,
    Max,
}

impl ThinkingEffort {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::None => "none",
            Self::Low => "low",
            Self::High => "high",
            Self::Max => "max",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        [Self::Auto, Self::None, Self::Low, Self::High, Self::Max]
            .into_iter()
            .find(|effort| effort.as_str() == raw.trim())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Thinking {
    pub text: String,
    pub seconds: u32,
    pub effort: Option<ThinkingEffort>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Archived {
    #[ts(type = "number")]
    pub before: i64,
    pub count: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum FileMode {
    Image,
    Full,
    OnDemand,
    Unreadable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub id: String,
    pub name: String,
    pub mime: String,
    #[ts(type = "number")]
    pub size: u64,
    pub pages: Option<u32>,
    pub mode: FileMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Quote {
    pub text: String,
    #[serde(default)]
    pub from: Option<Role>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub at: Option<i64>,
    #[serde(default)]
    pub message_id: Option<String>,
}

impl Quote {
    pub fn plain(text: impl Into<String>) -> Self {
        Self {
            text: text.into(),
            from: None,
            at: None,
            message_id: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub thread_id: String,
    pub role: Role,
    pub text: String,
    pub quote: Option<Quote>,
    #[serde(default)]
    pub files: Vec<FileInfo>,
    pub replaces: Option<String>,
    pub attachment: Option<crate::Attachment>,
    #[serde(default)]
    pub thinking: Option<Thinking>,
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
    #[serde(default)]
    pub category: MemoryCategory,
    #[serde(default)]
    pub galaxy: Option<String>,
    #[serde(default)]
    pub kind: MemoryKind,
    #[serde(default = "default_importance")]
    pub importance: u8,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub aliases: Vec<String>,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub expires_at: Option<i64>,
    #[serde(default)]
    pub uses: u32,
    #[serde(default)]
    #[ts(type = "number | null")]
    pub last_used_at: Option<i64>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

const fn default_importance() -> u8 {
    2
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum MemoryKind {
    #[default]
    Fact,
    Preference,
    Constraint,
    Plan,
}

impl MemoryKind {
    pub const ALL: [Self; 4] = [Self::Fact, Self::Preference, Self::Constraint, Self::Plan];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Fact => "fact",
            Self::Preference => "preference",
            Self::Constraint => "constraint",
            Self::Plan => "plan",
        }
    }

    pub fn parse(text: &str) -> Self {
        Self::ALL
            .into_iter()
            .find(|kind| kind.as_str() == text)
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MemoryGalaxy {
    pub id: String,
    pub cluster: MemoryCategory,
    pub name: String,
    pub aliases: Vec<String>,
    pub summary: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum MemoryCategory {
    Family,
    Food,
    HomeWork,
    Likes,
    Plans,
    #[default]
    Other,
}

impl MemoryCategory {
    pub const ALL: [Self; 6] = [
        Self::Family,
        Self::Food,
        Self::HomeWork,
        Self::Likes,
        Self::Plans,
        Self::Other,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Family => "family",
            Self::Food => "food",
            Self::HomeWork => "home_work",
            Self::Likes => "likes",
            Self::Plans => "plans",
            Self::Other => "other",
        }
    }

    pub fn parse(text: &str) -> Self {
        Self::ALL
            .into_iter()
            .find(|category| category.as_str() == text)
            .unwrap_or_default()
    }
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
        #[serde(default)]
        latitude: Option<String>,
        #[serde(default)]
        longitude: Option<String>,
    },
    Denied,
    Unavailable,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ContextUsage {
    pub used: u32,
    pub window: u32,
    pub auto_percent: Option<u8>,
    pub can_compact: bool,
    pub compacting: bool,
    pub summary: Option<String>,
    pub compactions: u32,
    pub archived: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum CompactPhase {
    Started,
    Finished { from: u8, to: u8 },
    Skipped,
    Failed,
}
