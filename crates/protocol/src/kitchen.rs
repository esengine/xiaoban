use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Ingredient {
    pub name: String,
    pub amount: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Dish {
    pub name: String,
    pub minutes: u32,
    pub why: String,
    pub uses: Vec<String>,
    pub missing: Vec<String>,
    pub selected: bool,
    pub photo_query: String,
    pub image: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct ShoppingItem {
    pub name: String,
    pub amount: String,
    pub note: String,
    pub done: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Heat {
    High,
    Medium,
    Low,
    #[default]
    None,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct CookStep {
    pub dish: String,
    pub text: String,
    pub tip: String,
    pub heat: Heat,
    pub seconds: u32,
    pub after: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct CookSession {
    pub dishes: Vec<String>,
    pub servings: u32,
    pub minutes: u32,
    pub steps: Vec<CookStep>,
    pub current: u32,
    #[ts(type = "number")]
    pub started_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct CookTimer {
    pub id: String,
    pub label: String,
    pub after: String,
    pub step: Option<u32>,
    pub seconds: u32,
    #[ts(type = "number")]
    pub ends_at: i64,
    pub fired: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Kitchen {
    pub thread_id: Option<String>,
    pub photo: Option<String>,
    #[ts(type = "number | null")]
    pub photo_at: Option<i64>,
    pub fridge: Vec<Ingredient>,
    pub servings: u32,
    pub avoid: Vec<String>,
    pub max_minutes: u32,
    pub dishes: Vec<Dish>,
    pub shopping: Vec<ShoppingItem>,
    pub cook: Option<CookSession>,
    pub timers: Vec<CookTimer>,
}

impl Default for Kitchen {
    fn default() -> Self {
        Self {
            thread_id: None,
            photo: None,
            photo_at: None,
            fridge: Vec::new(),
            servings: 0,
            avoid: Vec::new(),
            max_minutes: 30,
            dishes: Vec::new(),
            shopping: Vec::new(),
            cook: None,
            timers: Vec::new(),
        }
    }
}
