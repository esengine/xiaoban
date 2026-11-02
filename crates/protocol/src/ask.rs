use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AskOption {
    pub label: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AskQuestion {
    pub text: String,
    pub note: Option<String>,
    pub options: Vec<AskOption>,
    pub multiple: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum AskAnswer {
    Chosen { labels: Vec<String> },
    Typed { text: String },
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct AskRequest {
    pub id: String,
    pub turn_id: String,
    pub thread_id: String,
    pub questions: Vec<AskQuestion>,
}
