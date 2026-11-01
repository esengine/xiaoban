use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ChartKind {
    #[default]
    Bar,
    Line,
    Pie,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct SheetChart {
    pub id: String,
    pub kind: ChartKind,
    pub title: String,
    pub labels: String,
    pub values: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct SheetTab {
    pub id: String,
    pub name: String,
    pub cells: Vec<Vec<String>>,
    pub values: Vec<Vec<String>>,
    pub charts: Vec<SheetChart>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct CellMark {
    pub tab_id: String,
    pub row: u32,
    pub col: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Workbook {
    pub id: String,
    pub source_thread_id: String,
    pub thread_id: Option<String>,
    pub title: String,
    pub tabs: Vec<SheetTab>,
    pub version: u32,
    pub versions: Vec<crate::DocVersionInfo>,
    pub marks: Vec<CellMark>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkbookSummary {
    pub id: String,
    pub source_thread_id: String,
    pub title: String,
    pub tabs: u32,
    pub rows: u32,
    pub cols: u32,
    pub preview: Vec<Vec<String>>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct CellEdit {
    pub row: u32,
    pub col: u32,
    pub value: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum SheetFormat {
    #[default]
    Xlsx,
    Csv,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "op", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum SheetOp {
    InsertRows { at: u32, count: u32 },
    DeleteRows { from: u32, to: u32 },
    InsertCols { at: u32, count: u32 },
    DeleteCols { from: u32, to: u32 },
    Sort { col: u32, desc: bool },
    AddTab { name: String },
    RenameTab { name: String },
    DeleteTab,
    AddChart { kind: ChartKind, title: String, labels: String, values: String },
    RemoveChart { id: String },
}
