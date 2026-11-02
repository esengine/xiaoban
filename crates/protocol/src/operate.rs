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
    SaveFile { path: String, folder: String, preview: Vec<crate::DiffLine> },
    /// Chat or payment app: may Xiaoban operate it for this one task?
    SensitiveApp { app: String, category: String },
    /// About to press send in a chat app: to whom, and exactly what.
    SendMessage { app: String, to: String, text: String },
    /// About to press the last payment button; asked twice (round 1, then round 2).
    Pay { app: String, payee: String, amount: String, round: u8 },
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
