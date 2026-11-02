use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum TodoRepeat {
    Daily,
    Weekly { weekdays: Vec<u8> },
    Monthly { days: Vec<u8> },
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TodoSourceKind {
    #[default]
    Chat,
    Daily,
    Share,
    Email,
    Sms,
    Other,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct TodoSource {
    pub kind: TodoSourceKind,
    pub detail: String,
    pub thread_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TodoState {
    Proposed,
    #[default]
    Open,
    Done,
    Shopping,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TodoAction {
    Done,
    Reopen,
    Hour,
    Tomorrow,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct TodoDraft {
    pub title: String,
    pub date: Option<String>,
    pub minute: Option<u16>,
    pub repeat: Option<TodoRepeat>,
    pub note: String,
    pub source: TodoSource,
    pub shop_item: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Todo {
    pub id: String,
    pub title: String,
    pub date: Option<String>,
    pub minute: Option<u16>,
    pub repeat: Option<TodoRepeat>,
    pub note: String,
    pub source: TodoSource,
    pub shop_item: Option<String>,
    pub state: TodoState,
    #[ts(type = "number | null")]
    pub snooze_at: Option<i64>,
    #[ts(type = "number | null")]
    pub reminded_at: Option<i64>,
    #[ts(type = "number | null")]
    pub done_at: Option<i64>,
    #[ts(type = "number")]
    pub created_at: i64,
}
