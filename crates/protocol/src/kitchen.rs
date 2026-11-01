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
    pub keep: Keep,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Keep {
    Frozen,
    Chilled,
    Room,
    #[default]
    None,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeekDay {
    pub date: String,
    pub dish: String,
    pub minutes: u32,
    pub why: String,
    pub takeout: bool,
    pub photo_query: String,
    pub image: Option<String>,
    pub changed: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct PrepTask {
    pub date: String,
    pub time: String,
    pub text: String,
    pub notified: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeekItem {
    pub name: String,
    pub amount: String,
    pub note: String,
    pub group: String,
    pub keep: Keep,
    pub have: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeekPlan {
    pub start: String,
    pub days: Vec<WeekDay>,
    pub idea: String,
    pub prep: Vec<PrepTask>,
    pub buy: Vec<WeekItem>,
    pub added: bool,
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
    pub weeks: Vec<WeekPlan>,
    pub recipes: Vec<String>,
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
            weeks: Vec::new(),
            recipes: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct RecipeIngredient {
    pub name: String,
    pub amount: String,
    pub staple: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct RecipeStep {
    pub title: String,
    pub text: String,
    pub tip: String,
    pub heat: Heat,
    pub seconds: u32,
    pub after: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct Recipe {
    pub id: String,
    pub thread_id: String,
    pub dish: String,
    pub minutes: u32,
    pub servings: u32,
    pub style: String,
    pub ingredients: Vec<RecipeIngredient>,
    pub steps: Vec<RecipeStep>,
    pub photo_query: String,
    pub image: Option<String>,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct RecipeView {
    pub recipe: Recipe,
    pub have: Vec<String>,
    pub listed: Vec<String>,
}
