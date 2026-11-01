use std::collections::{BTreeMap, HashMap};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tokio_util::sync::CancellationToken;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{
    ErrorCode, Event, Location, ProtocolError, Request, Response, Sky, TipKind, WeatherDay, WeatherHour, WeatherNow,
    WeatherPlace, WeatherReport, WeatherRules, WeatherTip, WeatherView,
};
use xiaoban_store::now_ms;

use crate::state::SharedState;

const KEY: &str = "weather";
const AIR_URL: &str = "https://air-quality-api.open-meteo.com/v1/air-quality";
const PLACES_URL: &str = "https://nominatim.openstreetmap.org/search";
const AGENT: &str = concat!("Xiaoban/", env!("CARGO_PKG_VERSION"), " (desktop weather; local app)");
const MAX_PLACES: usize = 5;
const FRESH_MS: i64 = 30 * 60 * 1000;
const CHECK_EVERY: Duration = Duration::from_secs(60);
const LATE_MS: i64 = 45 * 60 * 1000;
const PRESENT_SECS: u64 = 5 * 60;
const AWAY_MS: i64 = 4 * 3600 * 1000;
const RAIN_AHEAD_MS: i64 = 90 * 60 * 1000;
const KEEP_DAYS: usize = 21;
const RAINY: u8 = 50;
const COLD_DROP: i32 = 5;
const BAD_AIR: u32 = 150;

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
#[serde(default)]
struct Seen {
    first: i64,
    last: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default)]
struct Saved {
    places: Vec<WeatherPlace>,
    rules: WeatherRules,
    sent: BTreeMap<String, String>,
    last_seen: i64,
    days: BTreeMap<String, Seen>,
}

#[derive(Clone)]
struct Raw {
    fetched: i64,
    offset: i64,
    now: WeatherNow,
    hours: Vec<WeatherHour>,
    days: Vec<WeatherDay>,
}

fn cache() -> &'static Mutex<HashMap<String, Raw>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Raw>>> = OnceLock::new();
    CACHE.get_or_init(Mutex::default)
}

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        xiaoban_agent::http_builder()
            .timeout(Duration::from_secs(10))
            .build()
            .unwrap_or_default()
    })
}

async fn saved(state: &SharedState) -> Saved {
    state
        .store
        .setting_owned(KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

async fn save(state: &SharedState, value: &Saved) {
    let _ = state
        .store
        .set_setting_owned(KEY.to_owned(), serde_json::to_string(value).unwrap_or_default())
        .await;
}

#[derive(Deserialize)]
struct Found {
    #[serde(default)]
    results: Vec<FoundPlace>,
}

#[derive(Deserialize)]
struct FoundPlace {
    name: String,
    latitude: f64,
    longitude: f64,
    #[serde(default)]
    country: String,
    #[serde(default)]
    admin1: String,
    #[serde(default)]
    admin2: String,
}

#[derive(Deserialize)]
struct OsmPlace {
    lat: String,
    lon: String,
    #[serde(default)]
    name: String,
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    address: BTreeMap<String, String>,
}

fn pick(address: &BTreeMap<String, String>, keys: &[&str]) -> String {
    keys.iter().find_map(|key| address.get(*key).cloned()).unwrap_or_default()
}

async fn search_osm(language: &str, query: &str) -> Option<Vec<WeatherPlace>> {
    let found: Vec<OsmPlace> = client()
        .get(PLACES_URL)
        .header(reqwest::header::USER_AGENT, AGENT)
        .query(&[
            ("q", query),
            ("format", "jsonv2"),
            ("limit", "6"),
            ("addressdetails", "1"),
            ("accept-language", language),
        ])
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()?;
    Some(
        found
            .into_iter()
            .filter_map(|place| {
                let latitude = place.lat.parse::<f64>().ok()?;
                let longitude = place.lon.parse::<f64>().ok()?;
                let city = pick(&place.address, &["city", "municipality", "state", "province", "town", "county"]);
                let district = pick(&place.address, &["city_district", "district", "suburb", "county", "borough", "town"]);
                let district = if district == city { String::new() } else { district };
                let name = if place.name.is_empty() { district.clone() } else { place.name.clone() };
                let region = place
                    .display_name
                    .split(", ")
                    .skip(1)
                    .filter(|part| !part.chars().all(|c| c.is_ascii_digit()))
                    .collect::<Vec<_>>()
                    .join(" ");
                Some(WeatherPlace {
                    id: format!("{latitude:.3},{longitude:.3}"),
                    label: String::new(),
                    city: if city.is_empty() { name.clone() } else { city },
                    district: if name == district || district.is_empty() { district } else { name },
                    region,
                    latitude: format!("{latitude:.5}"),
                    longitude: format!("{longitude:.5}"),
                    located: false,
                })
            })
            .collect(),
    )
}

pub async fn search(language: &str, query: &str) -> Vec<WeatherPlace> {
    let query = query.trim();
    if query.is_empty() {
        return Vec::new();
    }
    if let Some(found) = search_osm(language, query).await.filter(|found| !found.is_empty()) {
        return found;
    }
    let Ok(response) = client()
        .get(crate::weather::GEOCODING_URL)
        .query(&[("name", query), ("count", "6"), ("language", language)])
        .send()
        .await
    else {
        return Vec::new();
    };
    let Ok(found) = response.json::<Found>().await else {
        return Vec::new();
    };
    found
        .results
        .into_iter()
        .map(|place| {
            let region = [&place.country, &place.admin1, &place.admin2]
                .into_iter()
                .filter(|part| !part.is_empty() && **part != place.name)
                .cloned()
                .collect::<Vec<_>>()
                .join(" ");
            WeatherPlace {
                id: format!("{:.3},{:.3}", place.latitude, place.longitude),
                label: String::new(),
                city: place.name,
                region,
                latitude: format!("{:.4}", place.latitude),
                longitude: format!("{:.4}", place.longitude),
                ..WeatherPlace::default()
            }
        })
        .collect()
}

#[derive(Deserialize)]
struct Forecast {
    #[serde(default)]
    utc_offset_seconds: i64,
    current: Current,
    hourly: Hourly,
    daily: Daily,
}

#[derive(Deserialize)]
struct Current {
    temperature_2m: f64,
    apparent_temperature: f64,
    weather_code: u8,
    #[serde(default)]
    uv_index: Option<f64>,
}

#[derive(Deserialize)]
struct Hourly {
    time: Vec<i64>,
    temperature_2m: Vec<f64>,
    #[serde(default)]
    precipitation_probability: Vec<Option<u8>>,
    weather_code: Vec<u8>,
}

#[derive(Deserialize)]
struct Daily {
    time: Vec<i64>,
    weather_code: Vec<u8>,
    temperature_2m_max: Vec<f64>,
    temperature_2m_min: Vec<f64>,
    #[serde(default)]
    precipitation_probability_max: Vec<Option<u8>>,
    #[serde(default)]
    sunrise: Vec<i64>,
    #[serde(default)]
    sunset: Vec<i64>,
}

#[derive(Deserialize)]
struct Air {
    current: AirNow,
}

#[derive(Deserialize)]
struct AirNow {
    #[serde(default)]
    us_aqi: Option<f64>,
}

#[allow(clippy::cast_possible_truncation)]
fn round(value: f64) -> i32 {
    value.round().clamp(-200.0, 200.0) as i32
}

fn local(seconds: i64, offset: i64) -> Option<jiff::civil::DateTime> {
    let stamp = jiff::Timestamp::from_second(seconds + offset).ok()?;
    Some(stamp.to_zoned(jiff::tz::TimeZone::UTC).datetime())
}

fn clock(seconds: i64, offset: i64) -> String {
    local(seconds, offset).map(|time| time.strftime("%H:%M").to_string()).unwrap_or_default()
}

#[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
async fn fetch(place: &WeatherPlace) -> Option<Raw> {
    let coords = [("latitude", place.latitude.as_str()), ("longitude", place.longitude.as_str())];
    let forecast: Forecast = client()
        .get(crate::weather::FORECAST_URL)
        .query(&coords)
        .query(&[
            ("current", "temperature_2m,apparent_temperature,weather_code,uv_index"),
            ("hourly", "temperature_2m,precipitation_probability,weather_code"),
            (
                "daily",
                "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
            ),
            ("timezone", "auto"),
            ("timeformat", "unixtime"),
            ("forecast_days", "8"),
        ])
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()?;
    let aqi = async {
        let air: Air = client()
            .get(AIR_URL)
            .query(&coords)
            .query(&[("current", "us_aqi")])
            .send()
            .await
            .ok()?
            .json()
            .await
            .ok()?;
        air.current.us_aqi.map(|value| value.max(0.0).round() as u32)
    }
    .await;
    let offset = forecast.utc_offset_seconds;
    let now_seconds = now_ms() / 1000;
    let hourly = forecast.hourly;
    let hours: Vec<WeatherHour> = hourly
        .time
        .iter()
        .enumerate()
        .filter(|(_, time)| **time + 3600 > now_seconds)
        .take(24)
        .filter_map(|(index, time)| {
            Some(WeatherHour {
                at: time * 1000,
                hour: local(*time, offset)?.hour() as u8,
                temp: round(*hourly.temperature_2m.get(index)?),
                rain: hourly.precipitation_probability.get(index).copied().flatten().unwrap_or(0),
                sky: crate::weather::sky(*hourly.weather_code.get(index)?),
            })
        })
        .collect();
    let daily = forecast.daily;
    let days: Vec<WeatherDay> = daily
        .time
        .iter()
        .enumerate()
        .filter_map(|(index, time)| {
            Some(WeatherDay {
                date: local(*time, offset)?.date().to_string(),
                sky: crate::weather::sky(*daily.weather_code.get(index)?),
                high: round(*daily.temperature_2m_max.get(index)?),
                low: round(*daily.temperature_2m_min.get(index)?),
                rain: daily.precipitation_probability_max.get(index).copied().flatten().unwrap_or(0),
            })
        })
        .collect();
    let current = forecast.current;
    Some(Raw {
        fetched: now_ms(),
        offset,
        now: WeatherNow {
            temp: round(current.temperature_2m),
            feels: round(current.apparent_temperature),
            sky: crate::weather::sky(current.weather_code),
            aqi,
            uv: current.uv_index.map(|value| value.max(0.0).round().min(20.0) as u8),
            sunrise: daily.sunrise.first().map(|time| clock(*time, offset)).unwrap_or_default(),
            sunset: daily.sunset.first().map(|time| clock(*time, offset)).unwrap_or_default(),
        },
        hours,
        days,
    })
}

async fn raw(place: &WeatherPlace) -> Option<Raw> {
    let cached = cache().lock().ok().and_then(|map| map.get(&place.id).cloned());
    if let Some(found) = cached.filter(|found| now_ms() - found.fetched < FRESH_MS) {
        return Some(found);
    }
    let fresh = fetch(place).await?;
    if let Ok(mut map) = cache().lock() {
        map.insert(place.id.clone(), fresh.clone());
    }
    Some(fresh)
}

fn minutes(time: &str) -> Option<i64> {
    let (hour, minute) = time.trim().split_once(':')?;
    Some(hour.parse::<i64>().ok()? * 60 + minute.parse::<i64>().ok()?)
}

pub(crate) fn sky_text(l: &Localizer, sky: Sky) -> String {
    l.text(match sky {
        Sky::Clear => keys::WEATHER_SKY_CLEAR,
        Sky::Cloudy => keys::WEATHER_SKY_CLOUDY,
        Sky::Overcast => keys::WEATHER_SKY_OVERCAST,
        Sky::Fog => keys::WEATHER_SKY_FOG,
        Sky::LightRain => keys::WEATHER_SKY_LIGHT_RAIN,
        Sky::Rain => keys::WEATHER_SKY_RAIN,
        Sky::HeavyRain => keys::WEATHER_SKY_HEAVY_RAIN,
        Sky::Snow => keys::WEATHER_SKY_SNOW,
        Sky::Storm => keys::WEATHER_SKY_STORM,
    })
}

fn weekday(l: &Localizer, date: &str) -> String {
    let Ok(date) = date.parse::<jiff::civil::Date>() else {
        return String::new();
    };
    l.text(match date.weekday() {
        jiff::civil::Weekday::Monday => keys::WEATHER_MON,
        jiff::civil::Weekday::Tuesday => keys::WEATHER_TUE,
        jiff::civil::Weekday::Wednesday => keys::WEATHER_WED,
        jiff::civil::Weekday::Thursday => keys::WEATHER_THU,
        jiff::civil::Weekday::Friday => keys::WEATHER_FRI,
        jiff::civil::Weekday::Saturday => keys::WEATHER_SAT,
        jiff::civil::Weekday::Sunday => keys::WEATHER_SUN,
    })
}

fn rain_tip(l: &Localizer, raw: &Raw) -> Option<WeatherTip> {
    let today = raw.days.first()?.date.clone();
    let today_hours: Vec<&WeatherHour> = raw
        .hours
        .iter()
        .filter(|hour| local(hour.at / 1000, raw.offset).is_some_and(|time| time.date().to_string() == today))
        .collect();
    let first = today_hours.iter().find(|hour| hour.rain >= RAINY)?;
    let peak = today_hours.iter().max_by_key(|hour| hour.rain)?;
    let first_hour = first.hour.to_string();
    let chance = first.rain.to_string();
    let detail = l.format(
        keys::WEATHER_TIP_RAIN_PEAK,
        &[("hour", &peak.hour.to_string()), ("chance", &peak.rain.to_string())],
    );
    Some(WeatherTip {
        kind: TipKind::Rain,
        title: l.format(keys::WEATHER_TIP_RAIN, &[("hour", &first_hour), ("chance", &chance)]),
        detail,
    })
}

fn cold_drop(raw: &Raw) -> Option<(i32, &WeatherDay)> {
    let today = raw.days.first()?;
    let tomorrow = raw.days.get(1)?;
    let drop = (today.high - tomorrow.high).max(today.low - tomorrow.low);
    (drop >= COLD_DROP).then_some((drop, tomorrow))
}

fn cold_tip(l: &Localizer, raw: &Raw) -> Option<WeatherTip> {
    let (drop, tomorrow) = cold_drop(raw)?;
    Some(WeatherTip {
        kind: TipKind::Cold,
        title: l.format(keys::WEATHER_TIP_COLD, &[("drop", &drop.to_string())]),
        detail: l.format(
            keys::WEATHER_TIP_COLD_DETAIL,
            &[("low", &tomorrow.low.to_string()), ("high", &tomorrow.high.to_string())],
        ),
    })
}

fn sun_tip(l: &Localizer, raw: &Raw) -> Option<WeatherTip> {
    let day = raw.days.iter().skip(1).take(6).find(|day| {
        let weekend = day
            .date
            .parse::<jiff::civil::Date>()
            .is_ok_and(|date| matches!(date.weekday(), jiff::civil::Weekday::Saturday | jiff::civil::Weekday::Sunday));
        weekend && day.sky == Sky::Clear && day.rain < 10
    })?;
    Some(WeatherTip {
        kind: TipKind::Sun,
        title: l.format(keys::WEATHER_TIP_SUN, &[("day", &weekday(l, &day.date))]),
        detail: l.text(keys::WEATHER_TIP_SUN_DETAIL),
    })
}

fn air_tip(l: &Localizer, raw: &Raw) -> Option<WeatherTip> {
    let aqi = raw.now.aqi.filter(|value| *value > BAD_AIR)?;
    Some(WeatherTip {
        kind: TipKind::Air,
        title: l.format(keys::WEATHER_TIP_AIR, &[("aqi", &aqi.to_string())]),
        detail: l.text(keys::WEATHER_TIP_AIR_DETAIL),
    })
}

fn report(l: &Localizer, place: &WeatherPlace, raw: &Raw) -> WeatherReport {
    let tips = [rain_tip(l, raw), cold_tip(l, raw), air_tip(l, raw), sun_tip(l, raw)]
        .into_iter()
        .flatten()
        .collect();
    WeatherReport {
        place_id: place.id.clone(),
        updated_at: raw.fetched,
        now: raw.now.clone(),
        hours: raw.hours.clone(),
        days: raw.days.iter().take(7).cloned().collect(),
        tips,
    }
}

pub async fn home(state: &SharedState) -> Option<WeatherPlace> {
    saved(state).await.places.into_iter().next()
}

pub async fn view(state: &SharedState, place_id: Option<&str>) -> WeatherView {
    let saved = saved(state).await;
    let place = place_id
        .and_then(|id| saved.places.iter().find(|place| place.id == id))
        .or_else(|| saved.places.first())
        .cloned();
    let mut view = WeatherView {
        places: saved.places.clone(),
        place_id: place.as_ref().map(|place| place.id.clone()),
        rules: saved.rules.clone(),
        rhythm: rhythm(&saved),
        presence: state.presence.idle_seconds().is_some(),
        ..WeatherView::default()
    };
    if let Some(place) = place {
        match raw(&place).await {
            Some(found) => view.report = Some(report(&state.localizer, &place, &found)),
            None => view.failed = true,
        }
    }
    view
}

fn language(state: &SharedState) -> &'static str {
    match state.localizer.locale() {
        xiaoban_i18n::Locale::ZhCn => "zh",
        xiaoban_i18n::Locale::En => "en",
    }
}

async fn located(state: &SharedState) -> Result<WeatherPlace, ProtocolError> {
    let Location::Found { city, district, latitude, longitude } = state.locator.locate().await else {
        return Err(ProtocolError::new(ErrorCode::NotFound, "location unavailable"));
    };
    if let (Some(latitude), Some(longitude)) = (latitude, longitude)
        && let (Ok(lat), Ok(lon)) = (latitude.parse::<f64>(), longitude.parse::<f64>())
    {
        return Ok(WeatherPlace {
            id: format!("{lat:.3},{lon:.3}"),
            label: String::new(),
            region: [city.clone(), district.clone().unwrap_or_default()].join(" ").trim().to_owned(),
            city,
            district: district.unwrap_or_default(),
            latitude,
            longitude,
            located: true,
        });
    }
    let query = [district.clone().unwrap_or_default(), city.clone()].join(" ");
    search(language(state), query.trim())
        .await
        .into_iter()
        .next()
        .map(|place| WeatherPlace { located: true, ..place })
        .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "city not found"))
}

async fn add(state: &SharedState, mut place: WeatherPlace) {
    let mut saved = saved(state).await;
    if place.latitude.parse::<f64>().is_err() || place.longitude.parse::<f64>().is_err() {
        return;
    }
    if place.label.trim().is_empty() {
        place.label = if saved.places.is_empty() {
            state.localizer.text(keys::WEATHER_HOME)
        } else if place.district.is_empty() {
            place.city.clone()
        } else {
            place.district.clone()
        };
    }
    place.label = place.label.trim().chars().take(12).collect();
    saved.places.retain(|known| known.id != place.id);
    if saved.places.len() < MAX_PLACES {
        saved.places.push(place);
    }
    save(state, &saved).await;
}

pub async fn handle(state: &SharedState, request: Request) -> Result<Response, ProtocolError> {
    let selected = match request {
        Request::Weather { place_id } => place_id,
        Request::SearchPlaces { query } => {
            return Ok(Response::Places {
                places: search(language(state), &query).await,
            });
        }
        Request::AddPlace { place } => {
            let id = place.id.clone();
            add(state, place).await;
            Some(id)
        }
        Request::RemovePlace { id } => {
            let mut saved = saved(state).await;
            saved.places.retain(|place| place.id != id);
            save(state, &saved).await;
            None
        }
        Request::SetWeatherRules { rules } => {
            let mut saved = saved(state).await;
            saved.rules = rules;
            save(state, &saved).await;
            None
        }
        Request::LocateWeather => {
            let place = located(state).await?;
            let id = place.id.clone();
            add(state, place).await;
            Some(id)
        }
        Request::LocatePlace => {
            return Ok(Response::Places {
                places: vec![located(state).await?],
            });
        }
        Request::UpdatePlace { id, label, location } => {
            let mut saved = saved(state).await;
            let mut selected = id.clone();
            if let Some(place) = saved.places.iter_mut().find(|place| place.id == id) {
                if let Some(label) = label.map(|label| label.trim().chars().take(12).collect::<String>())
                    && !label.is_empty()
                {
                    place.label = label;
                }
                if let Some(next) = location.filter(|next| next.latitude.parse::<f64>().is_ok() && next.longitude.parse::<f64>().is_ok()) {
                    selected.clone_from(&next.id);
                    *place = WeatherPlace { label: place.label.clone(), ..next };
                }
            }
            save(state, &saved).await;
            Some(selected)
        }
        Request::SetHomePlace { id } => {
            let mut saved = saved(state).await;
            if let Some(index) = saved.places.iter().position(|place| place.id == id) {
                let place = saved.places.remove(index);
                saved.places.insert(0, place);
            }
            save(state, &saved).await;
            Some(id)
        }
        _ => None,
    };
    Ok(Response::Weather {
        weather: view(state, selected.as_deref()).await,
    })
}

fn due(rule_time: &str, now_minutes: i64) -> bool {
    minutes(rule_time).is_some_and(|at| now_minutes >= at && (now_minutes - at) * 60_000 <= LATE_MS)
}

fn median(mut values: Vec<i64>) -> Option<i64> {
    values.sort_unstable();
    values.get(values.len() / 2).copied()
}

fn clock_of(minutes: i64) -> String {
    format!("{:02}:{:02}", minutes.div_euclid(60).rem_euclid(24), minutes.rem_euclid(60))
}

fn minute_of(at: i64) -> Option<i64> {
    let zoned = jiff::Timestamp::from_millisecond(at).ok()?.to_zoned(jiff::tz::TimeZone::system());
    Some(i64::from(zoned.hour()) * 60 + i64::from(zoned.minute()))
}

fn rhythm(saved: &Saved) -> Option<xiaoban_protocol::DayRhythm> {
    let recent: Vec<&Seen> = saved.days.values().rev().take(14).collect();
    if recent.len() < 3 {
        return None;
    }
    let start = median(recent.iter().filter_map(|seen| minute_of(seen.first)).collect())?;
    let end = median(
        recent
            .iter()
            .filter_map(|seen| minute_of(seen.last).map(|value| if value < 4 * 60 { value + 24 * 60 } else { value }))
            .collect(),
    )?;
    Some(xiaoban_protocol::DayRhythm {
        start: clock_of(start),
        end: clock_of(end),
    })
}

fn rain_alert(l: &Localizer, found: &Raw, now: i64) -> Option<(String, String, String)> {
    let soon = found
        .hours
        .iter()
        .filter(|hour| hour.at <= now + RAIN_AHEAD_MS && hour.at + 3600 * 1000 > now)
        .find(|hour| hour.rain >= RAINY)?;
    let episode = format!("rain-{}", soon.at);
    let started = soon.at <= now;
    let peak = found
        .hours
        .iter()
        .skip_while(|hour| hour.at < soon.at)
        .take_while(|hour| hour.rain >= RAINY)
        .max_by_key(|hour| hour.rain)
        .unwrap_or(soon);
    let title = l.text(if started { keys::WEATHER_ALERT_RAINING } else { keys::WEATHER_ALERT_RAIN });
    let body = l.format(
        keys::WEATHER_ALERT_RAIN_BODY,
        &[("hour", &soon.hour.to_string()), ("chance", &peak.rain.to_string()), ("peak", &peak.hour.to_string())],
    );
    Some((episode, title, body))
}

fn today_alert(l: &Localizer, found: &Raw) -> Option<(String, String)> {
    let day = found.days.first()?;
    let tip = rain_tip(l, found).or_else(|| cold_tip(l, found));
    Some((
        l.format(
            keys::WEATHER_ALERT_SUMMARY,
            &[("low", &day.low.to_string()), ("high", &day.high.to_string()), ("sky", &sky_text(l, day.sky))],
        ),
        tip.map(|tip| tip.title).unwrap_or_default(),
    ))
}

#[allow(clippy::too_many_lines)]
async fn check(state: &SharedState) {
    let mut saved = saved(state).await;
    let now = now_ms();
    let local_now = jiff::Zoned::now();
    let today = local_now.date().to_string();
    let hour = local_now.hour();
    let now_minutes = i64::from(hour) * 60 + i64::from(local_now.minute());
    let present = state.presence.idle_seconds().map(|idle| idle < PRESENT_SECS);
    let mut back = false;
    if present == Some(true) {
        back = saved.last_seen == 0 || now - saved.last_seen >= AWAY_MS;
        saved.last_seen = now;
        if hour >= 4 {
            let seen = saved.days.entry(today.clone()).or_insert(Seen { first: now, last: now });
            seen.last = now;
        }
        while saved.days.len() > KEEP_DAYS {
            saved.days.pop_first();
        }
    }
    saved.sent.retain(|_, date| *date == today);
    let rules = saved.rules.clone();
    let fixed = rules.fixed || present.is_none();
    let here = present.unwrap_or((7..23).contains(&hour));
    let sent = |key: &str| saved.sent.contains_key(key);
    let want_today = rules.today
        && !sent("today")
        && if fixed { due(&rules.today_time, now_minutes) } else { here && hour >= 4 && (back || hour >= 12) };
    let want_cold = rules.cold
        && !sent("cold")
        && if fixed { due(&rules.cold_time, now_minutes) } else { here && hour >= 19 };
    let want_rain = rules.rain && here;
    let want_air = rules.air && here && !sent("air") && (7..23).contains(&hour);
    let home = saved.places.first().cloned();
    if let Some(home) = home.filter(|_| want_today || want_cold || want_rain || want_air)
        && let Some(found) = raw(&home).await
    {
        let l = &state.localizer;
        let mut alerts = Vec::new();
        if want_today {
            saved.sent.insert("today".to_owned(), today.clone());
            alerts.extend(today_alert(l, &found));
        }
        if want_cold && let Some(tip) = cold_tip(l, &found) {
            saved.sent.insert("cold".to_owned(), today.clone());
            alerts.push((tip.title, tip.detail));
        }
        if want_rain
            && let Some((episode, title, body)) = rain_alert(l, &found, now)
            && !saved.sent.contains_key(&episode)
        {
            saved.sent.insert(episode, today.clone());
            alerts.push((title, body));
        }
        if want_air && let Some(tip) = air_tip(l, &found) {
            saved.sent.insert("air".to_owned(), today.clone());
            alerts.push((tip.title, tip.detail));
        }
        for (title, body) in alerts {
            state.publish(Event::WeatherAlert { title, body });
        }
    }
    save(state, &saved).await;
}

pub fn watch(state: SharedState, shutdown: CancellationToken) {
    tokio::spawn(async move {
        loop {
            check(&state).await;
            tokio::select! {
                () = shutdown.cancelled() => return,
                () = tokio::time::sleep(CHECK_EVERY) => {}
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(days: &[(i32, i32)], hours: &[(u8, u8)]) -> Raw {
        let base = jiff::civil::date(2026, 11, 2).to_datetime(jiff::civil::time(0, 0, 0, 0));
        let start = base.to_zoned(jiff::tz::TimeZone::UTC).unwrap().timestamp().as_second();
        Raw {
            fetched: 0,
            offset: 0,
            now: WeatherNow::default(),
            hours: hours
                .iter()
                .map(|(hour, rain)| WeatherHour {
                    at: (start + i64::from(*hour) * 3600) * 1000,
                    hour: *hour,
                    rain: *rain,
                    ..WeatherHour::default()
                })
                .collect(),
            days: days
                .iter()
                .enumerate()
                .map(|(index, (low, high))| WeatherDay {
                    date: format!("2026-11-{:02}", 2 + index),
                    low: *low,
                    high: *high,
                    ..WeatherDay::default()
                })
                .collect(),
        }
    }

    #[test]
    fn rain_tip_mentions_the_first_rainy_hour_and_the_peak() {
        let l = Localizer::new(xiaoban_i18n::Locale::ZhCn);
        let found = raw(&[(12, 21)], &[(14, 30), (15, 70), (17, 85), (18, 90)]);
        let tip = rain_tip(&l, &found).unwrap();
        assert!(tip.title.contains("15"));
        assert!(tip.detail.contains("18"));
        assert!(rain_tip(&l, &raw(&[(12, 21)], &[(14, 30)])).is_none());
    }

    #[test]
    fn cold_tip_needs_a_real_drop() {
        let l = Localizer::new(xiaoban_i18n::Locale::ZhCn);
        assert!(cold_tip(&l, &raw(&[(12, 21), (5, 14)], &[])).is_some());
        assert!(cold_tip(&l, &raw(&[(12, 21), (10, 19)], &[])).is_none());
    }

    #[test]
    fn reminders_fire_only_shortly_after_their_time() {
        assert!(due("07:30", 7 * 60 + 30));
        assert!(due("07:30", 7 * 60 + 50));
        assert!(!due("07:30", 7 * 60 + 29));
        assert!(!due("07:30", 9 * 60));
    }
}
