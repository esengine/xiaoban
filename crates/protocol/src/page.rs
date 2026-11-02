use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct PageCheck {
    pub hash: String,
    pub ok: bool,
    #[ts(type = "number")]
    pub at: i64,
    pub errors: Vec<String>,
    pub overflow: bool,
    pub widths: Vec<u32>,
    pub clicked: u32,
}
