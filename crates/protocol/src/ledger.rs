use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ExpenseSource {
    #[default]
    Said,
    Receipt,
    Import,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Expense {
    pub id: String,
    pub name: String,
    pub category: String,
    #[ts(type = "number")]
    pub cents: i64,
    #[ts(type = "number")]
    pub at: i64,
    pub source: ExpenseSource,
    pub note: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ImportStatus {
    #[default]
    New,
    Duplicate,
    Transfer,
    Refund,
    Income,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct ImportRow {
    pub id: String,
    #[ts(type = "number")]
    pub at: i64,
    pub payee: String,
    pub item: String,
    pub category: String,
    #[ts(type = "number")]
    pub cents: i64,
    pub status: ImportStatus,
    pub checked: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct ImportPreview {
    pub id: String,
    pub file: String,
    pub app: String,
    #[ts(type = "number")]
    pub from: i64,
    #[ts(type = "number")]
    pub to: i64,
    pub rows: Vec<ImportRow>,
    pub sorted: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct CategoryTotal {
    pub category: String,
    #[ts(type = "number")]
    pub cents: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Ledger {
    pub thread_id: Option<String>,
    pub month: String,
    #[ts(type = "number | null")]
    pub budget_cents: Option<i64>,
    pub entries: Vec<Expense>,
    pub previous: Vec<CategoryTotal>,
    pub muted: Vec<String>,
    pub import: Option<ImportPreview>,
    pub empty: bool,
}
