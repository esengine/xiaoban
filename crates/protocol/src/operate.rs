use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct OperatePermissions {
    pub control: bool,
    pub capture: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ConfirmKind {
    AllowApp { app: String },
    Action { title: String, detail: String },
    Permissions,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ConfirmRequest {
    pub id: String,
    pub turn_id: String,
    pub thread_id: String,
    pub kind: ConfirmKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ConfirmChoice {
    Once,
    Always,
    Yes,
    Edit,
    No,
}
