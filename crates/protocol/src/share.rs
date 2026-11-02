use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ShareKind {
    Image,
    Link,
    File,
    Text,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SharedItem {
    pub kind: ShareKind,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub subject: Option<String>,
    #[serde(default)]
    pub files: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ShareAction {
    pub label: String,
    pub hint: Option<String>,
    pub prompt: String,
    pub done: String,
    #[serde(default)]
    pub remember: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ShareSuggestion {
    pub title: String,
    pub source: Option<String>,
    pub pages: Option<u32>,
    pub chars: Option<u32>,
    #[ts(type = "number | null")]
    pub size: Option<u64>,
    pub actions: Vec<ShareAction>,
    pub thread_id: String,
    pub thread_title: Option<String>,
}
