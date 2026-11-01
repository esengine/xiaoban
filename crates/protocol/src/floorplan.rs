use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorPoint {
    pub x: f64,
    pub y: f64,
}

impl Eq for FloorPoint {}

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Eq for FloorRect {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Facing {
    North,
    NorthEast,
    East,
    SouthEast,
    South,
    SouthWest,
    West,
    NorthWest,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum OpeningKind {
    #[default]
    Door,
    Window,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorOpening {
    pub kind: OpeningKind,
    pub from: FloorPoint,
    pub to: FloorPoint,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorItem {
    pub name: String,
    pub rect: FloorRect,
    pub rotation: i32,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorRoom {
    pub id: String,
    pub name: String,
    pub points: Vec<FloorPoint>,
    pub area: f64,
    pub facing: Option<Facing>,
    pub openings: Vec<FloorOpening>,
    pub items: Vec<FloorItem>,
    pub advice: String,
    pub ideas: Vec<String>,
}

impl Eq for FloorRoom {}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorMeasure {
    pub id: String,
    pub room_id: String,
    pub label: String,
    pub note: String,
    pub from: FloorPoint,
    pub to: FloorPoint,
    pub estimate: f64,
    pub value: Option<f64>,
}

impl Eq for FloorMeasure {}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorLayout {
    pub rooms: Vec<FloorRoom>,
    pub measures: Vec<FloorMeasure>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorVersion {
    pub number: u32,
    pub note: String,
    pub by_user: bool,
    #[ts(type = "number")]
    pub at: i64,
    pub layout: FloorLayout,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorScheme {
    pub id: String,
    pub versions: Vec<FloorVersion>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FloorPlan {
    pub id: String,
    pub thread_id: String,
    pub title: String,
    pub kind: String,
    pub area: f64,
    pub source_file_id: Option<String>,
    pub scheme: String,
    pub schemes: Vec<FloorScheme>,
    #[ts(type = "number")]
    pub created_at: i64,
    #[ts(type = "number")]
    pub updated_at: i64,
}

impl Eq for FloorPlan {}
