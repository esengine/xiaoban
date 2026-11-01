use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;

use serde_json::Value;
use xiaoban_protocol::Dish;

use crate::state::SharedState;

const CACHE_KEY: &str = "kitchen.images";
const API: &str = "https://commons.wikimedia.org/w/api.php";
const TIMEOUT: Duration = Duration::from_secs(8);
const WIDTH: &str = "480";

fn client() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        xiaoban_agent::http_builder()
            .timeout(TIMEOUT)
            .user_agent(concat!("Xiaoban/", env!("CARGO_PKG_VERSION"), " (local desktop app)"))
            .build()
            .unwrap_or_default()
    })
}

async fn search(query: &str) -> Option<String> {
    let term = format!("{query} filetype:bitmap");
    let response = client()
        .get(API)
        .query(&[
            ("action", "query"),
            ("generator", "search"),
            ("gsrsearch", term.as_str()),
            ("gsrnamespace", "6"),
            ("gsrlimit", "1"),
            ("prop", "imageinfo"),
            ("iiprop", "url"),
            ("iiurlwidth", WIDTH),
            ("format", "json"),
        ])
        .send()
        .await
        .ok()?;
    let value: Value = response.json().await.ok()?;
    value["query"]["pages"]
        .as_object()?
        .values()
        .next()?["imageinfo"][0]["thumburl"]
        .as_str()
        .filter(|url| url.starts_with("https://"))
        .map(str::to_owned)
}

async fn cache(state: &SharedState) -> HashMap<String, String> {
    state
        .store
        .setting_owned(CACHE_KEY.to_owned())
        .await
        .ok()
        .flatten()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub async fn fill(state: &SharedState, mut dishes: Vec<Dish>) -> Vec<Dish> {
    let mut known = cache(state).await;
    for dish in &mut dishes {
        if let Some(url) = known.get(&dish.name) {
            dish.image = (!url.is_empty()).then(|| url.clone());
            continue;
        }
        let mut found = search(&dish.name).await;
        if found.is_none() && !dish.photo_query.trim().is_empty() {
            found = search(dish.photo_query.trim()).await;
        }
        known.insert(dish.name.clone(), found.clone().unwrap_or_default());
        dish.image = found;
    }
    let _ = state
        .store
        .set_setting_owned(CACHE_KEY.to_owned(), serde_json::to_string(&known).unwrap_or_default())
        .await;
    dishes
}
