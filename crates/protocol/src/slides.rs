use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum SlideLayout {
    Title,
    #[default]
    Bullets,
    Number,
    Chart,
    Two,
    Section,
    Flow,
    Timeline,
    Compare,
    Funnel,
    Icons,
    Quote,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Transition {
    #[default]
    Fade,
    Push,
    Zoom,
    None,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct SlideItem {
    pub text: String,
    pub note: String,
    pub icon: String,
    pub value: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct SlideColumn {
    pub title: String,
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct SlideChart {
    pub kind: crate::ChartKind,
    pub labels: Vec<String>,
    pub values: Vec<String>,
    pub highlight: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct SlideImage {
    pub url: String,
    pub credit: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Slide {
    pub id: String,
    pub layout: SlideLayout,
    pub title: String,
    pub subtitle: String,
    pub items: Vec<SlideItem>,
    pub columns: Vec<SlideColumn>,
    pub chart: Option<SlideChart>,
    pub image: Option<SlideImage>,
    pub notes: String,
    pub still: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct SlideChange {
    pub slide_id: String,
    pub before: Option<Slide>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Deck {
    pub id: String,
    pub source_thread_id: String,
    pub thread_id: Option<String>,
    pub title: String,
    pub theme: String,
    pub transition: Transition,
    pub outline: Vec<String>,
    pub writing: bool,
    pub slides: Vec<Slide>,
    pub version: u32,
    pub versions: Vec<crate::DocVersionInfo>,
    pub changes: Vec<SlideChange>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct DeckSummary {
    pub id: String,
    pub source_thread_id: String,
    pub title: String,
    pub theme: String,
    pub pages: u32,
    pub total: u32,
    pub writing: bool,
    pub preview: Vec<Slide>,
    #[ts(type = "number")]
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct FoundImage {
    pub url: String,
    pub thumb: String,
    pub credit: String,
}
