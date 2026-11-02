use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum InsightKind {
    RainOutdoor,
    Fridge,
    Takeout,
    LedgerUp,
    PlanStalled,
    MailDue,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum InsightPage {
    Kitchen,
    Week,
    Ledger,
    Weather,
    Thread,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum InsightAction {
    Say { text: String, thread_id: Option<String> },
    Open { page: InsightPage, thread_id: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Insight {
    pub id: String,
    pub kind: InsightKind,
    pub subject: String,
    pub label: String,
    pub text: String,
    pub action_label: String,
    pub action: InsightAction,
    pub urgent: bool,
    #[ts(type = "number")]
    pub at: i64,
    #[ts(type = "number")]
    pub until: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct MutedInsight {
    pub kind: InsightKind,
    pub subject: String,
    pub label: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum DoneSource {
    Subthread,
    Operate,
    Import,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum DoneStatus {
    Running,
    Done,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DoneItem {
    pub id: String,
    pub source: DoneSource,
    pub title: String,
    pub summary: String,
    pub status: DoneStatus,
    pub thread_id: Option<String>,
    #[ts(type = "number")]
    pub at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct DailyFeed {
    pub insights: Vec<Insight>,
    pub done: Vec<DoneItem>,
    pub muted: Vec<MutedInsight>,
    pub todos: Vec<crate::Todo>,
    pub mail: Option<crate::MailToday>,
}
