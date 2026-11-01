use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct OperatePermissions {
    pub control: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ConfirmKind {
    AllowApp { app: String },
    OpenSubthreads { titles: Vec<String>, reason: String },
    BorrowMouse { app: String },
    Action { title: String, detail: String },
    PriceCheck { app: String, item: String, detail: String, phone: bool },
    Permissions,
    RunCommand { command: String, cwd: String, rule: String },
    ReadOutside { path: String, folder: String },
    WriteOutside { path: String, folder: String, preview: Vec<crate::DiffLine> },
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
