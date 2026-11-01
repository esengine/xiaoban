use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum PlanStatus {
    #[default]
    Draft,
    Running,
    Paused,
    Blocked,
    Done,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum StepOwner {
    #[default]
    Xiaoban,
    You,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    #[default]
    Todo,
    Running,
    Done,
    Skipped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum StepOutputKind {
    Doc,
    Sheet,
    Deck,
    Text,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct StepOutput {
    pub kind: StepOutputKind,
    pub label: String,
    #[serde(default)]
    pub id: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct PlanStep {
    pub title: String,
    pub owner: StepOwner,
    pub due: Option<String>,
    pub status: StepStatus,
    pub detail: Option<String>,
    pub output: Option<StepOutput>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct PlanQuestion {
    pub text: String,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Plan {
    pub thread_id: String,
    pub title: String,
    pub version: u32,
    pub status: PlanStatus,
    pub steps: Vec<PlanStep>,
    pub changes: Option<String>,
    pub bounds: Option<String>,
    pub question: Option<PlanQuestion>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum PlanAction {
    Approve,
    Pause,
    Resume,
    Choose { option: String },
    StepDone { step: u32 },
    Dismiss,
}
