use std::fmt::Debug;
use std::time::Duration;

use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use xiaoban_i18n::Locale;
use xiaoban_protocol::Sky;

pub const MAX_DAYS: u8 = 16;
pub(crate) const GEOCODING_URL: &str = "https://geocoding-api.open-meteo.com/v1/search";
pub(crate) const FORECAST_URL: &str = "https://api.open-meteo.com/v1/forecast";
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Forecast {
    pub place: String,
    pub region: String,
    pub timezone: String,
    pub now: Option<Now>,
    pub days: Vec<Day>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Now {
    pub time: String,
    pub temperature: f64,
    pub condition: &'static str,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Day {
    pub date: String,
    #[serde(skip)]
    pub sky: Sky,
    pub condition: &'static str,
    pub high: f64,
    pub low: f64,
    pub rain_chance: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum WeatherError {
    #[error("place not found")]
    NotFound,
    #[error("weather service unavailable")]
    Unavailable,
}

pub trait Weather: Debug + Send + Sync + 'static {
    fn forecast(
        &self,
        place: String,
        days: u8,
    ) -> BoxFuture<'static, Result<Forecast, WeatherError>>;
}

#[derive(Debug, Clone)]
pub struct FixedWeather(pub Forecast);

impl Weather for FixedWeather {
    fn forecast(&self, _: String, _: u8) -> BoxFuture<'static, Result<Forecast, WeatherError>> {
        let forecast = self.0.clone();
        Box::pin(async move { Ok(forecast) })
    }
}

#[derive(Debug, Clone)]
pub struct OpenMeteo {
    client: reqwest::Client,
    language: &'static str,
}

impl OpenMeteo {
    pub fn for_locale(locale: Locale) -> Self {
        let language = match locale {
            Locale::ZhCn => "zh",
            Locale::En => "en",
        };
        Self {
            client: xiaoban_agent::http_builder()
                .timeout(TIMEOUT)
                .build()
                .unwrap_or_default(),
            language,
        }
    }
}

#[derive(Deserialize)]
struct Places {
    #[serde(default)]
    results: Vec<Place>,
}

#[derive(Deserialize)]
struct Place {
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

impl Place {
    fn region(&self) -> String {
        [&self.country, &self.admin1, &self.admin2]
            .into_iter()
            .filter(|part| !part.is_empty() && **part != self.name)
            .cloned()
            .collect::<Vec<_>>()
            .join(" ")
    }
}

#[derive(Deserialize)]
struct Report {
    timezone: String,
    current: Option<CurrentReport>,
    daily: DailyReport,
}

#[derive(Deserialize)]
struct CurrentReport {
    time: String,
    temperature_2m: f64,
    weather_code: u8,
}

#[derive(Deserialize)]
struct DailyReport {
    time: Vec<String>,
    weather_code: Vec<u8>,
    temperature_2m_max: Vec<f64>,
    temperature_2m_min: Vec<f64>,
    #[serde(default)]
    precipitation_probability_max: Vec<Option<u8>>,
}

impl Weather for OpenMeteo {
    fn forecast(
        &self,
        place: String,
        days: u8,
    ) -> BoxFuture<'static, Result<Forecast, WeatherError>> {
        let this = self.clone();
        Box::pin(async move { this.lookup(&place, days.clamp(1, MAX_DAYS)).await })
    }
}

impl OpenMeteo {
    async fn lookup(&self, place: &str, days: u8) -> Result<Forecast, WeatherError> {
        let places: Places = self
            .get(
                GEOCODING_URL,
                &[
                    ("name", place.to_owned()),
                    ("count", "1".to_owned()),
                    ("language", self.language.to_owned()),
                ],
            )
            .await?;
        let place = places
            .results
            .into_iter()
            .next()
            .ok_or(WeatherError::NotFound)?;
        let report: Report = self
            .get(
                FORECAST_URL,
                &[
                    ("latitude", place.latitude.to_string()),
                    ("longitude", place.longitude.to_string()),
                    ("current", "temperature_2m,weather_code".to_owned()),
                    (
                        "daily",
                        "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
                            .to_owned(),
                    ),
                    ("timezone", "auto".to_owned()),
                    ("forecast_days", days.to_string()),
                ],
            )
            .await?;
        let daily = report.daily;
        let days = daily
            .time
            .into_iter()
            .enumerate()
            .filter_map(|(index, date)| {
                let code = *daily.weather_code.get(index)?;
                Some(Day {
                    date,
                    sky: sky(code),
                    condition: condition(code),
                    high: *daily.temperature_2m_max.get(index)?,
                    low: *daily.temperature_2m_min.get(index)?,
                    rain_chance: daily
                        .precipitation_probability_max
                        .get(index)
                        .copied()
                        .flatten(),
                })
            })
            .collect();
        Ok(Forecast {
            region: place.region(),
            place: place.name,
            timezone: report.timezone,
            now: report.current.map(|current| Now {
                time: current.time,
                temperature: current.temperature_2m,
                condition: condition(current.weather_code),
            }),
            days,
        })
    }

    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        url: &str,
        query: &[(&str, String)],
    ) -> Result<T, WeatherError> {
        let response = self
            .client
            .get(url)
            .query(query)
            .send()
            .await
            .and_then(reqwest::Response::error_for_status)
            .map_err(|error| {
                tracing::warn!(%error, url, "weather request failed");
                WeatherError::Unavailable
            })?;
        response.json().await.map_err(|error| {
            tracing::warn!(%error, url, "weather response unreadable");
            WeatherError::Unavailable
        })
    }
}

pub(crate) fn sky(code: u8) -> Sky {
    match code {
        0 | 1 => Sky::Clear,
        2 => Sky::Cloudy,
        45 | 48 => Sky::Fog,
        51..=57 | 61 | 80 => Sky::LightRain,
        63 | 66 | 81 => Sky::Rain,
        65 | 67 | 82 => Sky::HeavyRain,
        71..=77 | 85 | 86 => Sky::Snow,
        95..=99 => Sky::Storm,
        _ => Sky::Overcast,
    }
}

fn condition(code: u8) -> &'static str {
    match code {
        0 => "clear",
        1 => "mostly clear",
        2 => "partly cloudy",
        3 => "overcast",
        45 | 48 => "fog",
        51..=57 => "drizzle",
        61 | 80 => "light rain",
        63 | 81 => "rain",
        65 | 82 => "heavy rain",
        66 | 67 => "freezing rain",
        71 | 85 => "light snow",
        73 => "snow",
        75 | 86 => "heavy snow",
        77 => "snow grains",
        95 => "thunderstorm",
        96 | 99 => "thunderstorm with hail",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn region_skips_empty_and_repeated_parts() {
        let place = Place {
            name: "杭州".into(),
            latitude: 0.0,
            longitude: 0.0,
            country: "中国".into(),
            admin1: "浙江".into(),
            admin2: "杭州".into(),
        };
        assert_eq!(place.region(), "中国 浙江");
    }

    #[test]
    fn daily_report_tolerates_missing_rain_chance() {
        let report: Report = serde_json::from_str(
            r#"{"timezone":"Asia/Shanghai","daily":{"time":["2026-11-01"],"weather_code":[61],"temperature_2m_max":[29.3],"temperature_2m_min":[16.2],"precipitation_probability_max":[null]}}"#,
        )
        .unwrap();
        assert!(report.current.is_none());
        assert_eq!(report.daily.precipitation_probability_max, vec![None]);
        assert_eq!(condition(report.daily.weather_code[0]), "light rain");
    }
}
