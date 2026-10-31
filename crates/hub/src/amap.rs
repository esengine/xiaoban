use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::future::BoxFuture;
use serde::Deserialize;
use xiaoban_protocol::{Coord, Place};

use crate::services::ServiceError;

const BASE: &str = "https://restapi.amap.com/v3";
const TIMEOUT: Duration = Duration::from_secs(10);
const FOOD: &str = "050000";
const NEARBY_RADIUS_M: u32 = 1000;
const WALKABLE_M: u32 = 1500;
const CACHE_LIMIT: usize = 256;
const VERIFY_AT: &str = "116.397428,39.90923";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Travel {
    Walk { minutes: u32 },
    Drive { minutes: u32 },
}

pub trait Maps: Debug + Send + Sync + 'static {
    fn verify(&self, key: String) -> BoxFuture<'static, Result<(), ServiceError>>;

    fn find(
        &self,
        key: String,
        query: String,
        city: Option<String>,
    ) -> BoxFuture<'static, Result<Vec<Place>, ServiceError>>;
    fn nearby_food(
        &self,
        key: String,
        at: Coord,
    ) -> BoxFuture<'static, Result<Vec<Place>, ServiceError>>;
    fn travel(
        &self,
        key: String,
        from: Coord,
        to: Coord,
    ) -> BoxFuture<'static, Result<Travel, ServiceError>>;
    fn image(
        &self,
        key: String,
        center: Coord,
        zoom: u8,
        width: u32,
        height: u32,
    ) -> BoxFuture<'static, Result<Arc<[u8]>, ServiceError>>;
}

#[derive(Debug, Clone, Default)]
pub struct Amap {
    client: reqwest::Client,
    images: Arc<Mutex<HashMap<String, Arc<[u8]>>>>,
}

impl Amap {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .unwrap_or_default(),
            images: Arc::default(),
        }
    }
}

#[derive(Deserialize)]
struct Status {
    status: String,
    #[serde(default)]
    infocode: String,
}

impl Status {
    fn check(&self) -> Result<(), ServiceError> {
        if self.status == "1" {
            return Ok(());
        }
        tracing::warn!(infocode = %self.infocode, "amap request rejected");
        match self.infocode.as_str() {
            "10001" | "10003" | "10009" | "10012" => Err(ServiceError::InvalidKey),
            _ => Err(ServiceError::Unavailable),
        }
    }
}

#[derive(Deserialize)]
struct Pois {
    #[serde(flatten)]
    status: Status,
    #[serde(default)]
    pois: Vec<Poi>,
}

#[derive(Deserialize)]
struct Poi {
    name: String,
    #[serde(default, deserialize_with = "text_or_empty")]
    address: String,
    location: String,
    #[serde(default, deserialize_with = "text_or_empty")]
    r#type: String,
    #[serde(default, deserialize_with = "text_or_empty")]
    distance: String,
}

fn text_or_empty<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    Ok(match serde_json::Value::deserialize(deserializer)? {
        serde_json::Value::String(text) => text,
        _ => String::new(),
    })
}

pub fn parse_coord(text: &str) -> Option<Coord> {
    let (lng, lat) = text.split_once(',')?;
    Some(Coord {
        lng: lng.trim().parse().ok()?,
        lat: lat.trim().parse().ok()?,
    })
}

fn format_coord(coord: Coord) -> String {
    format!("{:.6},{:.6}", coord.lng, coord.lat)
}

impl Poi {
    fn place(self) -> Option<Place> {
        Some(Place {
            location: parse_coord(&self.location)?,
            kind: self.r#type.split(';').nth(1).unwrap_or_default().to_owned(),
            distance: self.distance.parse().ok(),
            name: self.name,
            address: self.address,
        })
    }
}

#[derive(Deserialize)]
struct Distances {
    #[serde(flatten)]
    status: Status,
    #[serde(default)]
    results: Vec<Distance>,
}

#[derive(Deserialize)]
struct Distance {
    distance: String,
    #[serde(default)]
    duration: String,
}

#[derive(Deserialize)]
struct Walking {
    #[serde(flatten)]
    status: Status,
    route: Option<WalkingRoute>,
}

#[derive(Deserialize)]
struct WalkingRoute {
    #[serde(default)]
    paths: Vec<Distance>,
}

fn minutes(seconds: &str) -> u32 {
    seconds
        .parse::<u32>()
        .map_or(0, |seconds| seconds.div_ceil(60).max(1))
}

impl Amap {
    async fn get<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        key: &str,
        query: &[(&str, String)],
    ) -> Result<T, ServiceError> {
        let response = self
            .client
            .get(format!("{BASE}/{path}"))
            .query(&[("key", key)])
            .query(query)
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(%error, path, "amap request failed");
                ServiceError::Unavailable
            })?;
        response.json().await.map_err(|error| {
            tracing::warn!(%error, path, "amap response unreadable");
            ServiceError::Unavailable
        })
    }

    async fn pois(
        &self,
        path: &str,
        key: &str,
        query: &[(&str, String)],
    ) -> Result<Vec<Place>, ServiceError> {
        let pois: Pois = self.get(path, key, query).await?;
        pois.status.check()?;
        Ok(pois.pois.into_iter().filter_map(Poi::place).collect())
    }

    async fn straight(
        &self,
        key: &str,
        from: Coord,
        to: Coord,
        mode: &str,
    ) -> Result<Distance, ServiceError> {
        let distances: Distances = self
            .get(
                "distance",
                key,
                &[
                    ("origins", format_coord(from)),
                    ("destination", format_coord(to)),
                    ("type", mode.to_owned()),
                ],
            )
            .await?;
        distances.status.check()?;
        distances
            .results
            .into_iter()
            .next()
            .ok_or(ServiceError::Unavailable)
    }

    async fn route(&self, key: &str, from: Coord, to: Coord) -> Result<Travel, ServiceError> {
        let line = self.straight(key, from, to, "0").await?;
        if line.distance.parse::<u32>().unwrap_or(u32::MAX) <= WALKABLE_M {
            let walking: Walking = self
                .get(
                    "direction/walking",
                    key,
                    &[
                        ("origin", format_coord(from)),
                        ("destination", format_coord(to)),
                    ],
                )
                .await?;
            walking.status.check()?;
            let path = walking
                .route
                .and_then(|route| route.paths.into_iter().next())
                .ok_or(ServiceError::Unavailable)?;
            return Ok(Travel::Walk {
                minutes: minutes(&path.duration),
            });
        }
        let driving = self.straight(key, from, to, "1").await?;
        Ok(Travel::Drive {
            minutes: minutes(&driving.duration),
        })
    }

    async fn render(
        &self,
        key: &str,
        center: Coord,
        zoom: u8,
        width: u32,
        height: u32,
    ) -> Result<Arc<[u8]>, ServiceError> {
        let cache_key = format!("{}|{zoom}|{width}x{height}", format_coord(center));
        if let Some(image) = self.images.lock().unwrap().get(&cache_key) {
            return Ok(image.clone());
        }
        let response = self
            .client
            .get(format!("{BASE}/staticmap"))
            .query(&[
                ("key", key.to_owned()),
                ("location", format_coord(center)),
                ("zoom", zoom.to_string()),
                ("size", format!("{width}*{height}")),
                ("scale", "2".to_owned()),
            ])
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(%error, "amap static map failed");
                ServiceError::Unavailable
            })?;
        let is_image = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("image/"));
        let bytes = response
            .bytes()
            .await
            .map_err(|_| ServiceError::Unavailable)?;
        if !is_image {
            let status: Status =
                serde_json::from_slice(&bytes).map_err(|_| ServiceError::Unavailable)?;
            status.check()?;
            return Err(ServiceError::Unavailable);
        }
        let image: Arc<[u8]> = Arc::from(bytes.as_ref());
        let mut images = self.images.lock().unwrap();
        if images.len() >= CACHE_LIMIT {
            images.clear();
        }
        images.insert(cache_key, image.clone());
        Ok(image)
    }
}

impl Maps for Amap {
    fn verify(&self, key: String) -> BoxFuture<'static, Result<(), ServiceError>> {
        let this = self.clone();
        Box::pin(async move {
            let status: Status = this
                .get("geocode/regeo", &key, &[("location", VERIFY_AT.to_owned())])
                .await?;
            status.check()
        })
    }

    fn find(
        &self,
        key: String,
        query: String,
        city: Option<String>,
    ) -> BoxFuture<'static, Result<Vec<Place>, ServiceError>> {
        let this = self.clone();
        Box::pin(async move {
            let mut params = vec![("keywords", query), ("offset", "5".to_owned())];
            if let Some(city) = city {
                params.push(("city", city));
                params.push(("citylimit", "true".to_owned()));
            }
            this.pois("place/text", &key, &params).await
        })
    }

    fn nearby_food(
        &self,
        key: String,
        at: Coord,
    ) -> BoxFuture<'static, Result<Vec<Place>, ServiceError>> {
        let this = self.clone();
        Box::pin(async move {
            this.pois(
                "place/around",
                &key,
                &[
                    ("location", format_coord(at)),
                    ("types", FOOD.to_owned()),
                    ("radius", NEARBY_RADIUS_M.to_string()),
                    ("sortrule", "distance".to_owned()),
                    ("offset", "10".to_owned()),
                ],
            )
            .await
        })
    }

    fn travel(
        &self,
        key: String,
        from: Coord,
        to: Coord,
    ) -> BoxFuture<'static, Result<Travel, ServiceError>> {
        let this = self.clone();
        Box::pin(async move { this.route(&key, from, to).await })
    }

    fn image(
        &self,
        key: String,
        center: Coord,
        zoom: u8,
        width: u32,
        height: u32,
    ) -> BoxFuture<'static, Result<Arc<[u8]>, ServiceError>> {
        let this = self.clone();
        Box::pin(async move { this.render(&key, center, zoom, width, height).await })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pois_tolerate_empty_arrays_in_text_fields() {
        let pois: Pois = serde_json::from_str(
            r#"{"status":"1","infocode":"10000","pois":[{"name":"断桥残雪","address":[],"location":"120.151,30.258","type":"风景名胜;公园广场;公园","distance":[]}]}"#,
        )
        .unwrap();
        let place = pois.pois.into_iter().next().unwrap().place().unwrap();
        assert_eq!(place.address, "");
        assert_eq!(place.kind, "公园广场");
        assert_eq!(place.distance, None);
        assert!((place.location.lng - 120.151).abs() < 1e-9);
    }

    #[test]
    fn invalid_key_is_reported() {
        let status: Status =
            serde_json::from_str(r#"{"status":"0","info":"INVALID_USER_KEY","infocode":"10001"}"#)
                .unwrap();
        assert_eq!(status.check(), Err(ServiceError::InvalidKey));
    }

    #[test]
    fn durations_round_up_to_minutes() {
        assert_eq!(minutes("61"), 2);
        assert_eq!(minutes("0"), 1);
    }
}
