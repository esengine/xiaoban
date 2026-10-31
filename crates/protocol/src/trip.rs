use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ServiceId {
    WebSearch,
}

impl ServiceId {
    pub const ALL: [Self; 1] = [Self::WebSearch];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::WebSearch => "web_search",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct ServiceStatus {
    pub service: ServiceId,
    pub connected: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, TS)]
pub struct Coord {
    pub lng: f64,
    pub lat: f64,
}

impl Eq for Coord {}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Sky {
    Clear,
    Cloudy,
    Rain,
    Snow,
    Storm,
    Fog,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct DayWeather {
    pub sky: Sky,
    pub high: i32,
    pub low: i32,
    pub rain_chance: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TripStop {
    pub name: String,
    pub time: String,
    pub note: String,
    pub location: Option<Coord>,
    pub next: Option<TripLeg>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TravelMode {
    Walk,
    Taxi,
    Transit,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TripLeg {
    pub mode: TravelMode,
    pub minutes: u32,
    pub estimated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TripDay {
    pub date: String,
    pub weather: Option<DayWeather>,
    pub change: Option<String>,
    pub stops: Vec<TripStop>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Trip {
    pub id: String,
    pub thread_id: String,
    pub version: u32,
    pub title: String,
    pub city: String,
    pub party: String,
    pub needs: Option<String>,
    pub reminder: Option<String>,
    pub cost: Option<String>,
    pub verified: bool,
    pub days: Vec<TripDay>,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum Attachment {
    Trip { trip_id: String, version: u32 },
    ServiceNeeded { service: ServiceId },
}
