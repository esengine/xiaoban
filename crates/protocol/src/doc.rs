use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum BlockKind {
    H1,
    H2,
    H3,
    #[default]
    P,
    Bullet,
    Number,
    Quote,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct DocBlock {
    pub id: String,
    pub kind: BlockKind,
    pub text: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct DocMark {
    pub block_id: String,
    pub before: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct DocSuggestion {
    pub id: String,
    pub block_id: String,
    pub action: String,
    pub before: String,
    pub after: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct DocVersionInfo {
    pub version: u32,
    pub note: String,
    pub by_user: bool,
    #[ts(type = "number")]
    pub at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Doc {
    pub id: String,
    pub source_thread_id: String,
    pub thread_id: Option<String>,
    pub title: String,
    pub subtitle: String,
    pub outline: Vec<String>,
    pub written: u32,
    pub writing: bool,
    pub blocks: Vec<DocBlock>,
    pub version: u32,
    pub versions: Vec<DocVersionInfo>,
    pub marks: Vec<DocMark>,
    pub suggestions: Vec<DocSuggestion>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct DocSummary {
    pub id: String,
    pub source_thread_id: String,
    pub title: String,
    pub sections: Vec<String>,
    pub chars: u32,
    pub written: u32,
    pub total: u32,
    pub writing: bool,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum DocFormat {
    #[default]
    Docx,
    Markdown,
}
