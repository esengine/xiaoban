use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CapabilityKind {
    #[default]
    Skill,
    RemoteMcp,
    LocalMcp,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct CapabilityInput {
    pub key: String,
    pub description: String,
    pub secret: bool,
    pub required: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Capability {
    pub id: String,
    pub name: String,
    pub title: String,
    pub kind: CapabilityKind,
    pub source: String,
    pub publisher: String,
    pub verified: bool,
    pub scanned: Option<bool>,
    pub version: String,
    pub description: String,
    pub repository: Option<String>,
    pub needs: Vec<String>,
    pub inputs: Vec<CapabilityInput>,
    pub tools: Vec<String>,
    pub installed: bool,
    pub enabled: bool,
    pub uses: u32,
    #[ts(type = "number | null")]
    pub installed_at: Option<i64>,
}
