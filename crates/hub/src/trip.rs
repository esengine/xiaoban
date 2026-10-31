use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_protocol::{DayWeather, TravelMode, Trip, TripDay, TripLeg, TripStop};
use xiaoban_store::StoreError;

use crate::state::SharedState;
use crate::weather::{Day, MAX_DAYS};

#[derive(Debug, Deserialize)]
pub struct TripDraft {
    title: String,
    city: String,
    party: String,
    needs: Option<String>,
    reminder: Option<String>,
    cost: Option<String>,
    #[serde(default)]
    update: bool,
    days: Vec<DayDraft>,
}

#[derive(Debug, Deserialize)]
struct DayDraft {
    date: String,
    change: Option<String>,
    stops: Vec<StopDraft>,
}

#[derive(Debug, Deserialize)]
struct StopDraft {
    name: String,
    time: String,
    note: String,
    next: Option<LegDraft>,
}

#[derive(Debug, Deserialize)]
struct LegDraft {
    mode: TravelMode,
    minutes: u32,
}

fn filled(text: Option<String>) -> Option<String> {
    text.map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

#[allow(clippy::cast_possible_truncation)]
fn day_weather(day: &Day) -> DayWeather {
    DayWeather {
        sky: day.sky,
        high: day.high.round() as i32,
        low: day.low.round() as i32,
        rain_chance: day.rain_chance,
    }
}

async fn forecast(state: &SharedState, city: &str) -> HashMap<String, Day> {
    match state.weather.forecast(city.to_owned(), MAX_DAYS).await {
        Ok(forecast) => forecast
            .days
            .into_iter()
            .map(|day| (day.date.clone(), day))
            .collect(),
        Err(error) => {
            tracing::warn!(%error, city, "no forecast for trip");
            HashMap::new()
        }
    }
}

async fn route_stops(state: &SharedState, city: &str, stops: &mut [TripStop]) {
    for stop in stops.iter_mut() {
        stop.location = state
            .router
            .locate(city.to_owned(), stop.name.clone())
            .await;
    }
    for index in 1..stops.len() {
        let (Some(from), Some(to)) = (stops[index - 1].location, stops[index].location) else {
            continue;
        };
        if let Some(leg) = state.router.leg(from, to).await {
            stops[index - 1].next = Some(leg);
        }
    }
}

pub async fn save(
    state: &SharedState,
    thread_id: &str,
    draft: TripDraft,
    verified: bool,
) -> Result<(Trip, Value), StoreError> {
    let city = draft.city.trim().to_owned();
    let weather = forecast(state, &city).await;
    let mut days = Vec::with_capacity(draft.days.len());
    for day in draft.days {
        let count = day.stops.len();
        let mut stops: Vec<TripStop> = day
            .stops
            .into_iter()
            .enumerate()
            .map(|(index, stop)| TripStop {
                name: stop.name.trim().to_owned(),
                time: stop.time.trim().to_owned(),
                note: stop.note.trim().to_owned(),
                location: None,
                next: stop.next.filter(|_| index + 1 < count).map(|leg| TripLeg {
                    mode: leg.mode,
                    minutes: leg.minutes.max(1),
                    estimated: true,
                }),
            })
            .collect();
        route_stops(state, &city, &mut stops).await;
        days.push(TripDay {
            weather: weather.get(&day.date).map(day_weather),
            date: day.date,
            change: filled(day.change),
            stops,
        });
    }
    let existing = if draft.update {
        state
            .store
            .latest_trip_in_thread(thread_id.to_owned())
            .await?
            .map(|trip| trip.id)
    } else {
        None
    };
    let trip = state
        .store
        .save_trip(
            existing,
            Trip {
                id: String::new(),
                thread_id: thread_id.to_owned(),
                version: 0,
                title: draft.title.trim().to_owned(),
                city,
                party: draft.party.trim().to_owned(),
                needs: filled(draft.needs),
                reminder: filled(draft.reminder),
                cost: filled(draft.cost),
                verified,
                days,
                created_at: 0,
            },
        )
        .await?;
    let forecast: Vec<_> = trip
        .days
        .iter()
        .map(|day| json!({ "date": day.date, "weather": weather.get(&day.date) }))
        .collect();
    let report = json!({
        "saved": true,
        "version": trip.version,
        "verified": trip.verified,
        "forecast": forecast,
        "display": "the app shows this trip as a card under your reply; keep the reply short and do not list the itinerary again",
    });
    Ok((trip, report))
}
