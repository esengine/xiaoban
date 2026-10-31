use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_protocol::{
    DayWeather, PlaceDetail, Review, SourceLink, TravelMode, Trip, TripDay, TripLeg, TripStop,
};
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
    detail: Option<DetailDraft>,
}

#[derive(Debug, Deserialize)]
struct SourceDraft {
    title: String,
    url: String,
    date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ReviewDraft {
    text: String,
    source: SourceDraft,
}

#[derive(Debug, Deserialize)]
struct DetailDraft {
    why: String,
    #[serde(default)]
    suits: Vec<String>,
    duration: Option<String>,
    quiet: Option<String>,
    tickets: Option<String>,
    tickets_source: Option<SourceDraft>,
    #[serde(default)]
    reviews: Vec<ReviewDraft>,
}

fn source(draft: SourceDraft) -> Option<SourceLink> {
    let url = draft.url.trim().to_owned();
    (url.starts_with("http://") || url.starts_with("https://")).then(|| SourceLink {
        title: draft.title.trim().to_owned(),
        url,
        date: filled(draft.date),
    })
}

fn place_detail(draft: DetailDraft, verified: bool) -> Option<PlaceDetail> {
    let why = draft.why.trim().to_owned();
    if why.is_empty() {
        return None;
    }
    let reviews = if verified {
        draft
            .reviews
            .into_iter()
            .filter_map(|review| {
                let text = review.text.trim().to_owned();
                Some(Review {
                    source: source(review.source)?,
                    text,
                })
                .filter(|review| !review.text.is_empty())
            })
            .collect()
    } else {
        Vec::new()
    };
    let tickets_source = draft.tickets_source.and_then(source).filter(|_| verified);
    Some(PlaceDetail {
        why,
        suits: draft
            .suits
            .into_iter()
            .map(|suit| suit.trim().to_owned())
            .filter(|suit| !suit.is_empty())
            .collect(),
        duration: filled(draft.duration),
        quiet: filled(draft.quiet),
        tickets: filled(draft.tickets),
        checked_at: tickets_source.is_some().then(xiaoban_store::now_ms),
        tickets_source,
        reviews,
    })
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

async fn forecast(state: &SharedState, city: &str) -> (HashMap<String, Day>, Option<String>) {
    match state.weather.forecast(city.to_owned(), MAX_DAYS).await {
        Ok(forecast) => (
            forecast
                .days
                .into_iter()
                .map(|day| (day.date.clone(), day))
                .collect(),
            Some(forecast.timezone).filter(|zone| !zone.is_empty()),
        ),
        Err(error) => {
            tracing::warn!(%error, city, "no forecast for trip");
            (HashMap::new(), None)
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
    let (weather, timezone) = forecast(state, &city).await;
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
                detail: stop
                    .detail
                    .and_then(|detail| place_detail(detail, verified)),
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
                timezone,
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
