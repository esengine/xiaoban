use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_i18n::keys;
use xiaoban_protocol::{DayWeather, Trip, TripDay, TripStop};
use xiaoban_store::StoreError;

use crate::amap::Travel;
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

fn hop_text(state: &SharedState, travel: Travel) -> String {
    let (key, minutes) = match travel {
        Travel::Walk { minutes } => (keys::TRIP_HOP_WALK, minutes),
        Travel::Drive { minutes } => (keys::TRIP_HOP_DRIVE, minutes),
    };
    state
        .localizer
        .format(key, &[("minutes", &minutes.to_string())])
}

async fn locate_stops(
    state: &SharedState,
    key: &str,
    city: &str,
    stops: &mut [TripStop],
    unresolved: &mut Vec<String>,
) {
    for stop in stops.iter_mut() {
        match state
            .maps
            .find(key.to_owned(), stop.name.clone(), Some(city.to_owned()))
            .await
        {
            Ok(places) => match places.into_iter().next() {
                Some(place) => {
                    stop.location = Some(place.location);
                    stop.address = Some(place.address).filter(|address| !address.is_empty());
                }
                None => unresolved.push(stop.name.clone()),
            },
            Err(error) => {
                tracing::warn!(%error, stop = %stop.name, "could not locate stop");
                unresolved.push(stop.name.clone());
            }
        }
    }
    for index in 1..stops.len() {
        let (Some(from), Some(to)) = (stops[index - 1].location, stops[index].location) else {
            continue;
        };
        match state.maps.travel(key.to_owned(), from, to).await {
            Ok(travel) => stops[index - 1].hop = Some(hop_text(state, travel)),
            Err(error) => tracing::warn!(%error, "could not measure hop"),
        }
    }
}

pub async fn save(
    state: &SharedState,
    thread_id: &str,
    draft: TripDraft,
    key: Option<String>,
) -> Result<(Trip, Value), StoreError> {
    let city = draft.city.trim().to_owned();
    let weather = forecast(state, &city).await;
    let mut unresolved = Vec::new();
    let mut days = Vec::with_capacity(draft.days.len());
    for day in draft.days {
        let mut stops: Vec<TripStop> = day
            .stops
            .into_iter()
            .map(|stop| TripStop {
                name: stop.name.trim().to_owned(),
                time: stop.time.trim().to_owned(),
                note: stop.note.trim().to_owned(),
                address: None,
                location: None,
                hop: None,
            })
            .collect();
        if let Some(key) = &key {
            locate_stops(state, key, &city, &mut stops, &mut unresolved).await;
        }
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
                verified: key.is_some(),
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
        "unresolved_stops": unresolved,
        "forecast": forecast,
        "display": "the app shows this trip as a card under your reply; keep the reply short and do not list the itinerary again",
    });
    Ok((trip, report))
}
