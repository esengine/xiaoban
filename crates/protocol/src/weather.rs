use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::Sky;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherPlace {
    pub id: String,
    pub label: String,
    pub city: String,
    pub district: String,
    pub region: String,
    pub located: bool,
    pub latitude: String,
    pub longitude: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherHour {
    #[ts(type = "number")]
    pub at: i64,
    pub hour: u8,
    pub temp: i32,
    pub rain: u8,
    pub sky: Sky,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherDay {
    pub date: String,
    pub sky: Sky,
    pub high: i32,
    pub low: i32,
    pub rain: u8,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherNow {
    pub temp: i32,
    pub feels: i32,
    pub sky: Sky,
    pub aqi: Option<u32>,
    pub uv: Option<u8>,
    pub sunrise: String,
    pub sunset: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TipKind {
    #[default]
    Rain,
    Cold,
    Sun,
    Air,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherTip {
    pub kind: TipKind,
    pub title: String,
    pub detail: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherReport {
    pub place_id: String,
    #[ts(type = "number")]
    pub updated_at: i64,
    pub now: WeatherNow,
    pub hours: Vec<WeatherHour>,
    pub days: Vec<WeatherDay>,
    pub tips: Vec<WeatherTip>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
#[allow(clippy::struct_excessive_bools)]
pub struct WeatherRules {
    pub today: bool,
    pub rain: bool,
    pub cold: bool,
    pub air: bool,
    pub fixed: bool,
    pub today_time: String,
    pub cold_time: String,
}

impl Default for WeatherRules {
    fn default() -> Self {
        Self {
            today: true,
            rain: true,
            cold: true,
            air: false,
            fixed: false,
            today_time: "07:30".to_owned(),
            cold_time: "21:00".to_owned(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct DayRhythm {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherView {
    pub places: Vec<WeatherPlace>,
    pub place_id: Option<String>,
    pub report: Option<WeatherReport>,
    pub rules: WeatherRules,
    pub rhythm: Option<DayRhythm>,
    pub presence: bool,
    pub failed: bool,
}
