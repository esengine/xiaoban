use axum::Router;
use axum::http::{HeaderMap, StatusCode};
use axum::routing::get;
use xiaoban_agent::{AgentError, OpenAiCompatible, OpenAiConfig};

async fn models(headers: HeaderMap) -> StatusCode {
    match headers.get("authorization").and_then(|v| v.to_str().ok()) {
        Some("Bearer good") => StatusCode::OK,
        Some("Bearer broken") => StatusCode::SERVICE_UNAVAILABLE,
        _ => StatusCode::UNAUTHORIZED,
    }
}

async fn serve() -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(
        axum::serve(listener, Router::new().route("/v1/models", get(models))).into_future(),
    );
    format!("http://{addr}/v1")
}

fn provider(base_url: &str, key: &str) -> OpenAiCompatible {
    OpenAiCompatible::new(OpenAiConfig {
        base_url: base_url.into(),
        api_key: key.into(),
        model: "m".into(),
    })
}

#[tokio::test]
async fn check_distinguishes_valid_invalid_and_unavailable() {
    let base = serve().await;
    assert!(provider(&base, "good").check().await.is_ok());
    assert!(matches!(
        provider(&base, "wrong").check().await,
        Err(AgentError::InvalidKey)
    ));
    assert!(matches!(
        provider(&base, "broken").check().await,
        Err(AgentError::Status { status: 503, .. })
    ));
}
