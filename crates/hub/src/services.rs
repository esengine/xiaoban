use std::fmt::Debug;
use std::time::Duration;

use futures_util::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::json;

const BOCHA_URL: &str = "https://api.bochaai.com/v1/web-search";
const TIMEOUT: Duration = Duration::from_secs(15);
const RESULTS: u8 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ServiceError {
    #[error("the key was rejected")]
    InvalidKey,
    #[error("the service is unavailable")]
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Hit {
    pub title: String,
    pub url: String,
    pub site: String,
    pub date: Option<String>,
    pub summary: String,
}

pub trait Search: Debug + Send + Sync + 'static {
    fn search(
        &self,
        key: String,
        query: String,
    ) -> BoxFuture<'static, Result<Vec<Hit>, ServiceError>>;
}

#[derive(Debug, Clone, Default)]
pub struct Bocha {
    client: reqwest::Client,
}

impl Bocha {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .unwrap_or_default(),
        }
    }
}

#[derive(Deserialize)]
struct Answer {
    data: Option<Data>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Data {
    web_pages: Option<Pages>,
}

#[derive(Deserialize)]
struct Pages {
    #[serde(default)]
    value: Vec<Page>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Page {
    name: String,
    url: String,
    #[serde(default)]
    site_name: Option<String>,
    #[serde(default)]
    date_published: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    snippet: Option<String>,
}

impl Page {
    fn hit(self) -> Hit {
        Hit {
            title: self.name,
            url: self.url,
            site: self.site_name.unwrap_or_default(),
            date: self.date_published.filter(|date| !date.is_empty()),
            summary: self.summary.or(self.snippet).unwrap_or_default(),
        }
    }
}

impl Search for Bocha {
    fn search(
        &self,
        key: String,
        query: String,
    ) -> BoxFuture<'static, Result<Vec<Hit>, ServiceError>> {
        let client = self.client.clone();
        Box::pin(async move {
            let response = client
                .post(BOCHA_URL)
                .bearer_auth(key)
                .json(&json!({ "query": query, "summary": true, "count": RESULTS }))
                .send()
                .await
                .map_err(|error| {
                    tracing::warn!(%error, "bocha request failed");
                    ServiceError::Unavailable
                })?;
            let status = response.status();
            if status == reqwest::StatusCode::UNAUTHORIZED
                || status == reqwest::StatusCode::FORBIDDEN
            {
                return Err(ServiceError::InvalidKey);
            }
            if !status.is_success() {
                tracing::warn!(%status, "bocha request rejected");
                return Err(ServiceError::Unavailable);
            }
            let answer: Answer = response.json().await.map_err(|error| {
                tracing::warn!(%error, "bocha response unreadable");
                ServiceError::Unavailable
            })?;
            Ok(answer
                .data
                .and_then(|data| data.web_pages)
                .map(|pages| pages.value.into_iter().map(Page::hit).collect())
                .unwrap_or_default())
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pages_prefer_summary_over_snippet() {
        let answer: Answer = serde_json::from_str(
            r#"{"code":200,"data":{"webPages":{"value":[{"name":"灵隐寺门票","url":"https://example.com","siteName":"例子","datePublished":"","snippet":"短","summary":"长一点的摘要"}]}}}"#,
        )
        .unwrap();
        let hit = answer
            .data
            .unwrap()
            .web_pages
            .unwrap()
            .value
            .into_iter()
            .next()
            .unwrap()
            .hit();
        assert_eq!(hit.summary, "长一点的摘要");
        assert_eq!(hit.date, None);
    }
}
