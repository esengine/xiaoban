use std::collections::HashMap;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_protocol::{
    Coord, CostCategory, CostLine, DayWeather, PlaceDetail, Price, PriceSource, Review, Saving,
    SourceLink, StayOption, TravelMode, Trip, TripCosts, TripDay, TripLeg, TripStop,
};
use xiaoban_store::StoreError;

use crate::price::{Evidence, PriceDraft};
use crate::state::SharedState;
use crate::weather::{Day, MAX_DAYS};

const MAX_LINES: usize = 40;
const MAX_STAYS: usize = 3;
const MAX_SAVINGS: usize = 4;

#[derive(Debug, Deserialize)]
pub struct TripDraft {
    title: String,
    city: String,
    party: String,
    needs: Option<String>,
    reminder: Option<String>,
    costs: Option<CostsDraft>,
    update: Option<bool>,
    days: Vec<DayDraft>,
}

#[derive(Debug, Default, Deserialize)]
struct CostsDraft {
    lines: Option<Vec<LineDraft>>,
    stays: Option<Vec<StayDraft>>,
    people: Option<f64>,
    budget: Option<f64>,
    savings: Option<Vec<SavingDraft>>,
}

#[derive(Debug, Deserialize)]
struct LineDraft {
    category: CostCategory,
    #[serde(flatten)]
    price: PriceDraft,
}

#[derive(Debug, Deserialize)]
struct StayDraft {
    name: String,
    note: Option<String>,
    chosen: Option<bool>,
    #[serde(flatten)]
    price: PriceDraft,
}

#[derive(Debug, Deserialize)]
struct SavingDraft {
    title: String,
    detail: Option<String>,
    category: CostCategory,
    saves: Option<f64>,
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
pub struct DetailDraft {
    why: String,
    suits: Option<Vec<String>>,
    duration: Option<String>,
    quiet: Option<String>,
    tickets: Option<String>,
    tickets_source: Option<SourceDraft>,
    reviews: Option<Vec<ReviewDraft>>,
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
    let why = unmarked(&draft.why);
    if why.is_empty() {
        return None;
    }
    let reviews = if verified {
        draft
            .reviews
            .unwrap_or_default()
            .into_iter()
            .filter_map(|review| {
                let text = unmarked(&review.text);
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
            .unwrap_or_default()
            .into_iter()
            .map(|suit| unmarked(&suit))
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
    minutes: f64,
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn minutes(value: f64) -> u32 {
    if value.is_finite() {
        value.round().clamp(1.0, 24.0 * 60.0) as u32
    } else {
        1
    }
}

fn unmarked(text: &str) -> String {
    let mut out = text.replace("**", "").replace("__", "").replace('`', "");
    for heading in ["### ", "## ", "# "] {
        out = out
            .lines()
            .map(|line| line.trim_start().strip_prefix(heading).unwrap_or(line))
            .collect::<Vec<_>>()
            .join("\n");
    }
    out.trim().to_owned()
}

fn filled(text: Option<String>) -> Option<String> {
    text.map(|text| unmarked(&text))
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

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn meters(from: Coord, to: Coord) -> u32 {
    let radius = 6_371_000.0_f64;
    let (lat1, lat2) = (from.lat.to_radians(), to.lat.to_radians());
    let dlat = lat2 - lat1;
    let dlng = (to.lng - from.lng).to_radians();
    let a = (dlat / 2.0).sin().powi(2) + lat1.cos() * lat2.cos() * (dlng / 2.0).sin().powi(2);
    let distance = 2.0 * radius * a.sqrt().asin();
    distance.round().clamp(0.0, f64::from(u32::MAX)) as u32
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
fn people(value: Option<f64>) -> Option<u32> {
    value
        .filter(|value| value.is_finite() && *value >= 1.0 && *value <= 99.0)
        .map(|value| value.round() as u32)
}

fn is_user(price: &Price) -> bool {
    matches!(price.source, PriceSource::User)
}

fn voided(price: &Price) -> bool {
    matches!(price.source, PriceSource::None { voided: true, .. })
}

struct Checked {
    costs: TripCosts,
    voided: Vec<String>,
}

fn check_lines(
    lines: Vec<LineDraft>,
    evidence: &Evidence,
    earlier: Option<&TripCosts>,
    known: &[&Price],
    now: i64,
    dropped: &mut Vec<String>,
) -> Vec<CostLine> {
    lines
        .into_iter()
        .take(MAX_LINES)
        .map(|line| {
            let mut price = crate::price::check(&line.price, evidence, known, now);
            if price.known().is_none()
                && let Some(mine) = earlier.and_then(|costs| {
                    costs.lines.iter().find(|old| {
                        old.category == line.category
                            && is_user(&old.price)
                            && same_place(&old.price.label, &price.label)
                    })
                })
            {
                price = mine.price.clone();
            }
            if voided(&price) {
                dropped.push(price.label.clone());
            }
            CostLine {
                category: line.category,
                price,
            }
        })
        .filter(|line| !line.price.label.is_empty())
        .collect()
}

async fn check_costs(
    state: &SharedState,
    city: &str,
    draft: CostsDraft,
    evidence: &Evidence,
    earlier: Option<&TripCosts>,
    first: Option<Coord>,
) -> Checked {
    let now = xiaoban_store::now_ms();
    let known: Vec<&Price> = earlier
        .map(|costs| {
            costs
                .lines
                .iter()
                .map(|line| &line.price)
                .chain(costs.stays.iter().map(|stay| &stay.price))
                .collect()
        })
        .unwrap_or_default();
    let mut dropped = Vec::new();
    let lines = check_lines(
        draft.lines.unwrap_or_default(),
        evidence,
        earlier,
        &known,
        now,
        &mut dropped,
    );
    let mut stays = Vec::new();
    let mut picked = None;
    for (index, stay) in draft
        .stays
        .unwrap_or_default()
        .into_iter()
        .filter(|stay| !stay.name.trim().is_empty())
        .take(MAX_STAYS)
        .enumerate()
    {
        let name = stay.name.trim().to_owned();
        let mut price_draft = stay.price;
        if price_draft.label.trim().is_empty() {
            price_draft.label.clone_from(&name);
        }
        let mut price = crate::price::check(&price_draft, evidence, &known, now);
        let old = earlier.and_then(|costs| costs.stays.iter().find(|old| same_place(&old.name, &name)));
        if price.known().is_none()
            && let Some(old) = old.filter(|old| is_user(&old.price))
        {
            price = old.price.clone();
        }
        if voided(&price) {
            dropped.push(name.clone());
        }
        if stay.chosen == Some(true) && picked.is_none() {
            picked = Some(index);
        }
        let location = state.router.locate(city.to_owned(), name.clone()).await;
        stays.push(StayOption {
            meters: location.zip(first).map(|(at, first)| meters(at, first)),
            location,
            note: filled(stay.note),
            chosen: old.is_some_and(|old| old.chosen),
            price,
            name,
        });
    }
    let chosen = picked
        .or_else(|| stays.iter().position(|stay| stay.chosen))
        .or_else(|| stays.iter().position(|stay| stay.price.known().is_some()))
        .or_else(|| (!stays.is_empty()).then_some(0));
    for (index, stay) in stays.iter_mut().enumerate() {
        stay.chosen = Some(index) == chosen;
    }
    let savings = draft
        .savings
        .unwrap_or_default()
        .into_iter()
        .filter(|saving| !saving.title.trim().is_empty())
        .take(MAX_SAVINGS)
        .map(|saving| Saving {
            title: unmarked(&saving.title),
            detail: filled(saving.detail).unwrap_or_default(),
            category: saving.category,
            saves_cents: saving.saves.and_then(crate::price::cents).filter(|cents| *cents > 0),
        })
        .collect();
    Checked {
        costs: TripCosts {
            lines,
            stays,
            people: people(draft.people),
            budget_cents: draft.budget.and_then(crate::price::cents).filter(|cents| *cents > 0),
            savings,
        },
        voided: dropped,
    }
}

fn cost_report(costs: &TripCosts, dropped: &[String]) -> Value {
    let missing: Vec<&str> = costs
        .lines
        .iter()
        .map(|line| &line.price)
        .chain(costs.stays.iter().map(|stay| &stay.price))
        .filter(|price| price.known().is_none())
        .map(|price| price.label.as_str())
        .collect();
    #[allow(clippy::cast_precision_loss)]
    let total = costs.total_cents() as f64 / 100.0;
    let mut report = json!({
        "total_counted": total,
        "without_price": missing,
        "dropped": dropped,
    });
    if !dropped.is_empty() {
        report["why_dropped"] = json!(
            "these prices were removed: their link was not returned by web_search in this reply, or the amount was not on a screen you read in an app in this reply. Do not repeat those numbers; tell the user they are not checked yet and offer to check them in an app"
        );
    }
    report
}

#[allow(clippy::too_many_lines)]
pub async fn save(
    state: &SharedState,
    thread_id: &str,
    draft: TripDraft,
    verified: bool,
    evidence: &Evidence,
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
                    minutes: minutes(leg.minutes),
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
    let earlier = if draft.update.unwrap_or(false) {
        state
            .store
            .latest_trip_in_thread(thread_id.to_owned())
            .await?
    } else {
        None
    };
    let existing = earlier.as_ref().map(|trip| trip.id.clone());
    let first = days
        .first()
        .and_then(|day| day.stops.first())
        .and_then(|stop| stop.location);
    let checked = match draft.costs {
        Some(costs) => Some(
            check_costs(
                state,
                &city,
                costs,
                evidence,
                earlier.as_ref().and_then(|trip| trip.costs.as_ref()),
                first,
            )
            .await,
        ),
        None => None,
    };
    let dropped = checked
        .as_ref()
        .map(|checked| checked.voided.clone())
        .unwrap_or_default();
    let costs = checked
        .map(|checked| checked.costs)
        .or_else(|| earlier.and_then(|trip| trip.costs));
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
                costs,
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
    let mut report = json!({
        "saved": true,
        "version": trip.version,
        "verified": trip.verified,
        "forecast": forecast,
        "display": "the app shows this trip as a card under your reply; reply in one or two sentences and do not list the itinerary again",
    });
    if let Some(costs) = &trip.costs {
        report["costs"] = cost_report(costs, &dropped);
    }
    Ok((trip, report))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn markdown_marks_are_removed() {
        assert_eq!(
            unmarked("  **海狮表演免费**，`10:00` 开始 "),
            "海狮表演免费，10:00 开始"
        );
        assert_eq!(unmarked("## 亮点\n湖景"), "亮点\n湖景");
    }

    #[test]
    fn drafts_accept_nulls_and_fractional_minutes() {
        let draft: TripDraft = serde_json::from_str(
            r#"{"title":"杭州","city":"杭州","party":"3 人","needs":null,"reminder":null,"costs":null,"update":null,
                "days":[{"date":"2026-11-14","change":null,"stops":[
                  {"name":"断桥","time":"09:00","note":"人少","next":{"mode":"walk","minutes":15.0},
                   "detail":{"why":"湖景","suits":null,"duration":null,"quiet":null,"tickets":null,"tickets_source":null,"reviews":null}},
                  {"name":"孤山","time":"10:00","note":"草坪","next":null,"detail":null}]}]}"#,
        )
        .unwrap();
        assert_eq!(draft.update, None);
        let leg = draft.days[0].stops[0].next.as_ref().unwrap();
        assert_eq!(minutes(leg.minutes), 15);
        assert_eq!(minutes(f64::NAN), 1);
    }
}

#[derive(Debug, Deserialize)]
pub struct DetailRequest {
    day: usize,
    stop: String,
    detail: DetailDraft,
}

#[derive(Debug, thiserror::Error)]
pub enum DetailError {
    #[error("there is no trip in this conversation yet")]
    NoTrip,
    #[error("no stop named {0} on that day")]
    NoStop(String),
    #[error(transparent)]
    Store(#[from] StoreError),
}

fn same_place(a: &str, b: &str) -> bool {
    let a = a.trim();
    let b = b.trim();
    !a.is_empty() && (a == b || a.contains(b) || b.contains(a))
}

pub async fn save_detail(
    state: &SharedState,
    thread_id: &str,
    request: DetailRequest,
    verified: bool,
) -> Result<(Trip, Value), DetailError> {
    let mut trip = state
        .store
        .latest_trip_in_thread(thread_id.to_owned())
        .await?
        .ok_or(DetailError::NoTrip)?;
    let wanted = request.day.checked_sub(1);
    let stop = trip
        .days
        .iter_mut()
        .enumerate()
        .filter(|(index, _)| wanted.is_none_or(|day| day == *index))
        .flat_map(|(_, day)| day.stops.iter_mut())
        .find(|stop| same_place(&stop.name, &request.stop))
        .ok_or_else(|| DetailError::NoStop(request.stop.clone()))?;
    stop.detail = place_detail(request.detail, verified);
    let id = trip.id.clone();
    let saved = state.store.save_trip(Some(id), trip).await?;
    let report = json!({
        "saved": true,
        "version": saved.version,
        "display": "the app now shows these details in the trip; reply with one short sentence and do not repeat the details",
    });
    Ok((saved, report))
}
