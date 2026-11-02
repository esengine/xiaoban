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

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum Sky {
    Clear,
    #[default]
    Cloudy,
    Overcast,
    Fog,
    LightRain,
    Rain,
    HeavyRain,
    Snow,
    Storm,
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
    pub detail: Option<PlaceDetail>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct SourceLink {
    pub title: String,
    pub url: String,
    pub date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub text: String,
    pub source: SourceLink,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct PlaceDetail {
    pub why: String,
    pub suits: Vec<String>,
    pub duration: Option<String>,
    pub quiet: Option<String>,
    pub tickets: Option<String>,
    pub tickets_source: Option<SourceLink>,
    pub reviews: Vec<Review>,
    #[ts(type = "number | null")]
    pub checked_at: Option<i64>,
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
    pub timezone: Option<String>,
    pub party: String,
    pub needs: Option<String>,
    pub reminder: Option<String>,
    #[serde(default)]
    pub costs: Option<TripCosts>,
    pub verified: bool,
    pub days: Vec<TripDay>,
    #[ts(type = "number")]
    pub created_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CostCategory {
    Transport,
    Stay,
    Tickets,
    Food,
    Other,
}

impl CostCategory {
    pub const ALL: [Self; 5] = [
        Self::Transport,
        Self::Stay,
        Self::Tickets,
        Self::Food,
        Self::Other,
    ];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Transport => "transport",
            Self::Stay => "stay",
            Self::Tickets => "tickets",
            Self::Food => "food",
            Self::Other => "other",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CostLine {
    pub category: CostCategory,
    pub price: crate::Price,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct StayOption {
    pub name: String,
    pub price: crate::Price,
    pub note: Option<String>,
    pub location: Option<Coord>,
    pub meters: Option<u32>,
    pub chosen: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct Saving {
    pub title: String,
    pub detail: String,
    pub category: CostCategory,
    #[ts(type = "number | null")]
    pub saves_cents: Option<i64>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase", default)]
pub struct TripCosts {
    pub lines: Vec<CostLine>,
    pub stays: Vec<StayOption>,
    pub people: Option<u32>,
    #[ts(type = "number | null")]
    pub budget_cents: Option<i64>,
    pub savings: Vec<Saving>,
}

impl TripCosts {
    pub fn category_cents(&self, category: CostCategory) -> (i64, bool) {
        let chosen = self.stays.iter().find(|stay| stay.chosen);
        if category == CostCategory::Stay
            && let Some(stay) = chosen
        {
            return (stay.price.known().unwrap_or(0), stay.price.known().is_none());
        }
        self.lines
            .iter()
            .filter(|line| line.category == category)
            .fold((0, false), |(sum, missing), line| match line.price.known() {
                Some(cents) => (sum + cents, missing),
                None => (sum, true),
            })
    }

    pub fn total_cents(&self) -> i64 {
        CostCategory::ALL
            .iter()
            .map(|category| self.category_cents(*category).0)
            .sum()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub uid: String,
    pub title: String,
    #[ts(type = "number")]
    pub start: i64,
    #[ts(type = "number")]
    pub end: i64,
    pub location: String,
    pub notes: String,
    #[serde(default)]
    pub reminder: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct TripCalendar {
    pub trip_id: String,
    pub events: Vec<CalendarEvent>,
    pub ics: String,
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
    Subthreads { thread_ids: Vec<String> },
    Report { thread_id: String, title: String },
    Changes { files: Vec<crate::ChangedFile> },
    Doc { doc_id: String },
    Sheet { sheet_id: String },
    Deck { deck_id: String },
    Recipe { recipe_id: String },
    Event { event: crate::EventDraft },
    FloorPlan { plan_id: String },
    Schedule { schedule_id: String },
    ScheduleRun { schedule_id: String, mark: crate::RunMark, #[ts(type = "number")] due_at: i64 },
    ScheduleFailed { schedule_id: String, reason: String },
    Todos { todo_ids: Vec<String> },
}
