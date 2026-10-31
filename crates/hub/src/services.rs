use std::fmt::Debug;
use std::time::Duration;

use futures_util::future::BoxFuture;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::json;

const BASE: &str = "https://api.deepseek.com";
const TIMEOUT: Duration = Duration::from_secs(20);
const RESULTS: u8 = 8;
const PAGE_LIMIT: usize = 12_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ServiceError {
    #[error("the key was rejected")]
    InvalidKey,
    #[error("the account has no balance left")]
    NoBalance,
    #[error("nothing usable was found")]
    NotFound,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Page {
    pub title: String,
    pub content: String,
}

pub trait Web: Debug + Send + Sync + 'static {
    fn verify(&self, key: String) -> BoxFuture<'static, Result<(), ServiceError>>;
    fn search(
        &self,
        key: String,
        query: String,
        question: Option<String>,
    ) -> BoxFuture<'static, Result<Vec<Hit>, ServiceError>>;
    fn fetch(&self, key: String, url: String) -> BoxFuture<'static, Result<Page, ServiceError>>;
}

#[derive(Debug, Clone, Default)]
pub struct DeepseekWeb {
    client: reqwest::Client,
}

impl DeepseekWeb {
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
struct Results {
    #[serde(default)]
    results: Vec<Result_>,
}

#[derive(Deserialize)]
struct Result_ {
    title: String,
    url: String,
    #[serde(default)]
    site_name: Option<String>,
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    summary: Option<String>,
    #[serde(default)]
    snippet: Option<String>,
}

impl Result_ {
    fn hit(self) -> Hit {
        Hit {
            title: self.title,
            url: self.url,
            site: self.site_name.unwrap_or_default(),
            date: self.date.filter(|date| !date.is_empty()),
            summary: self
                .summary
                .filter(|summary| !summary.is_empty())
                .or(self.snippet)
                .unwrap_or_default(),
        }
    }
}

#[derive(Deserialize)]
struct Fetched {
    #[serde(default)]
    title: String,
    #[serde(default)]
    content: String,
}

fn classify(status: StatusCode) -> Result<(), ServiceError> {
    match status {
        status if status.is_success() => Ok(()),
        StatusCode::UNAUTHORIZED => Err(ServiceError::InvalidKey),
        StatusCode::PAYMENT_REQUIRED => Err(ServiceError::NoBalance),
        StatusCode::NOT_FOUND | StatusCode::FORBIDDEN => Err(ServiceError::NotFound),
        status => {
            tracing::warn!(%status, "deepseek tool request rejected");
            Err(ServiceError::Unavailable)
        }
    }
}

fn truncate(text: String) -> String {
    match text.char_indices().nth(PAGE_LIMIT) {
        Some((cut, _)) => text[..cut].to_owned(),
        None => text,
    }
}

impl DeepseekWeb {
    async fn post<T: for<'de> Deserialize<'de>>(
        &self,
        path: &str,
        key: &str,
        body: serde_json::Value,
    ) -> Result<T, ServiceError> {
        let response = self
            .client
            .post(format!("{BASE}{path}"))
            .bearer_auth(key)
            .json(&body)
            .send()
            .await
            .map_err(|error| {
                tracing::warn!(%error, path, "deepseek tool request failed");
                ServiceError::Unavailable
            })?;
        classify(response.status())?;
        response.json().await.map_err(|error| {
            tracing::warn!(%error, path, "deepseek tool response unreadable");
            ServiceError::Unavailable
        })
    }
}

impl Web for DeepseekWeb {
    fn verify(&self, key: String) -> BoxFuture<'static, Result<(), ServiceError>> {
        let client = self.client.clone();
        Box::pin(async move {
            let response = client
                .get(format!("{BASE}/models"))
                .bearer_auth(key)
                .send()
                .await
                .map_err(|_| ServiceError::Unavailable)?;
            classify(response.status())
        })
    }

    fn search(
        &self,
        key: String,
        query: String,
        question: Option<String>,
    ) -> BoxFuture<'static, Result<Vec<Hit>, ServiceError>> {
        let this = self.clone();
        Box::pin(async move {
            let mut body = json!({ "query": query, "count": RESULTS });
            if let Some(question) = question {
                body["ori_question"] = json!(question.chars().take(128).collect::<String>());
            }
            let results: Results = this.post("/v1/tools/search", &key, body).await?;
            Ok(results.results.into_iter().map(Result_::hit).collect())
        })
    }

    fn fetch(&self, key: String, url: String) -> BoxFuture<'static, Result<Page, ServiceError>> {
        let this = self.clone();
        Box::pin(async move {
            let page: Fetched = this
                .post("/v1/tools/fetch", &key, json!({ "url": url }))
                .await?;
            Ok(Page {
                title: page.title,
                content: truncate(page.content),
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn results_prefer_summary_over_snippet() {
        let results: Results = serde_json::from_str(
            r#"{"results":[{"rerank_score":2.4,"title":"灵隐寺门票","url":"https://example.com","snippet":"短","summary":"","site_name":"例子","date":""}]}"#,
        )
        .unwrap();
        let hit = results.results.into_iter().next().unwrap().hit();
        assert_eq!(hit.summary, "短");
        assert_eq!(hit.date, None);
    }

    #[test]
    fn status_codes_map_to_errors() {
        assert_eq!(
            classify(StatusCode::UNAUTHORIZED),
            Err(ServiceError::InvalidKey)
        );
        assert_eq!(
            classify(StatusCode::PAYMENT_REQUIRED),
            Err(ServiceError::NoBalance)
        );
        assert_eq!(classify(StatusCode::NOT_FOUND), Err(ServiceError::NotFound));
        assert_eq!(
            classify(StatusCode::TOO_MANY_REQUESTS),
            Err(ServiceError::Unavailable)
        );
        assert_eq!(classify(StatusCode::OK), Ok(()));
    }

    #[test]
    fn long_pages_are_cut_on_a_character_boundary() {
        let text = "灵".repeat(PAGE_LIMIT + 5);
        assert_eq!(truncate(text).chars().count(), PAGE_LIMIT);
    }
}
