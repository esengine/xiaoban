use axum::http::{HeaderMap, StatusCode};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{Value, json};
use xiaoban_agent::{AgentError, OpenAiCompatible, OpenAiConfig};

fn key(headers: &HeaderMap) -> &str {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .unwrap_or_default()
}

async fn models(headers: HeaderMap) -> (StatusCode, Json<Value>) {
    match key(&headers) {
        "good" => (
            StatusCode::OK,
            Json(json!({ "data": [{ "id": "m" }, { "id": "n" }] })),
        ),
        "broken" => (StatusCode::SERVICE_UNAVAILABLE, Json(json!({}))),
        _ => (StatusCode::UNAUTHORIZED, Json(json!({}))),
    }
}

async fn completions(headers: HeaderMap, Json(body): Json<Value>) -> StatusCode {
    if key(&headers) != "good" {
        return StatusCode::UNAUTHORIZED;
    }
    if body["model"] == "m" && body["max_tokens"] == 1 {
        StatusCode::OK
    } else {
        StatusCode::NOT_FOUND
    }
}

async fn serve(router: Router) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(axum::serve(listener, router).into_future());
    format!("http://{addr}/v1")
}

fn provider(base_url: &str, key: &str, model: &str) -> OpenAiCompatible {
    OpenAiCompatible::new(OpenAiConfig {
        base_url: base_url.into(),
        api_key: key.into(),
        model: model.into(),
    })
}

#[tokio::test]
async fn check_distinguishes_valid_invalid_and_unavailable() {
    let base = serve(Router::new().route("/v1/models", get(models))).await;
    assert!(provider(&base, "good", "m").check(false).await.is_ok());
    assert!(matches!(
        provider(&base, "wrong", "m").check(false).await,
        Err(AgentError::InvalidKey)
    ));
    assert!(matches!(
        provider(&base, "broken", "m").check(false).await,
        Err(AgentError::Status { status: 503, .. })
    ));
}

#[tokio::test]
async fn check_verifies_the_model_against_the_listing_when_asked() {
    let base = serve(Router::new().route("/v1/models", get(models))).await;
    assert!(provider(&base, "good", "n").check(true).await.is_ok());
    assert!(matches!(
        provider(&base, "good", "typo").check(true).await,
        Err(AgentError::UnknownModel(model)) if model == "typo"
    ));
    assert!(provider(&base, "good", "typo").check(false).await.is_ok());
}

#[tokio::test]
async fn relays_without_a_model_listing_fall_back_to_a_tiny_completion() {
    let base = serve(Router::new().route("/v1/chat/completions", post(completions))).await;
    assert!(provider(&base, "good", "m").check(true).await.is_ok());
    assert!(matches!(
        provider(&base, "good", "missing").check(true).await,
        Err(AgentError::UnknownModel(_))
    ));
    assert!(matches!(
        provider(&base, "bad", "m").check(true).await,
        Err(AgentError::InvalidKey)
    ));
}
