use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum BrowserAction {
    Open { url: String },
    Read,
    Click { index: u32 },
    Type { index: u32, text: String },
    Scroll { down: bool },
    Back,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct BrowserElement {
    pub index: u32,
    pub role: String,
    pub label: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct BrowserPage {
    pub url: String,
    pub title: String,
    pub text: String,
    pub elements: Vec<BrowserElement>,
    pub sensitive: bool,
    pub error: Option<String>,
}
