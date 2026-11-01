use futures_util::future::BoxFuture;
use serde_json::json;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{
    Agent, Anthropic, ModelProvider, OpenAiConfig, Responses, StablePrefix, ToolCall, ToolRunner,
    ToolSpec, Transcript,
};
use xiaoban_protocol::ModelApi;

struct Weather;

impl ToolRunner for Weather {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            assert_eq!(call.function.name, "weather");
            r#"{"city":"上海","temp":18,"sky":"小雨"}"#.to_owned()
        })
    }
}

fn config(base_url: &str, api: ModelApi) -> Option<OpenAiConfig> {
    let api_key = std::env::var("LIVE_API_KEY").ok()?;
    Some(OpenAiConfig {
        base_url: base_url.to_owned(),
        api_key,
        model: std::env::var("LIVE_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".to_owned()),
        api,
    })
}

async fn round_trip(provider: impl ModelProvider) {
    let agent = Agent::new(provider);
    let prefix = StablePrefix::compose(
        "你是测试助手。用户问天气时必须先调用 weather 工具，再用一句中文回答。",
        None,
        vec![ToolSpec {
            name: "weather".into(),
            description: "查某个城市现在的天气".into(),
            parameters: json!({
                "type": "object",
                "properties": { "city": { "type": "string" } },
                "required": ["city"],
            }),
        }],
    );
    let (events, mut rx) = mpsc::channel(256);
    let drain = tokio::spawn(async move { while rx.recv().await.is_some() {} });
    let outcome = agent
        .run_turn(
            &prefix,
            &Transcript::default(),
            "上海现在天气怎么样？",
            &Weather,
            events,
            CancellationToken::new(),
        )
        .await
        .expect("turn should succeed");
    drain.await.unwrap();
    println!("answer: {}", outcome.text);
    println!("usage: {:?}", outcome.usage);
    assert!(
        outcome
            .messages
            .iter()
            .any(|message| message.tool_calls.iter().any(|call| call.function.name == "weather")),
        "model should have called the tool"
    );
    assert!(outcome.text.contains("18") || outcome.text.contains("雨"));
    assert!(outcome.usage.input_tokens > 0 && outcome.usage.output_tokens > 0);
}

#[tokio::test]
#[ignore = "calls a real model; set LIVE_API_KEY and LIVE_ANTHROPIC_URL"]
async fn anthropic_round_trip() {
    let url = std::env::var("LIVE_ANTHROPIC_URL").unwrap_or_default();
    let Some(config) = config(&url, ModelApi::Anthropic) else { return };
    round_trip(Anthropic::new(config)).await;
}

#[tokio::test]
#[ignore = "calls a real model; set LIVE_API_KEY and LIVE_RESPONSES_URL"]
async fn responses_round_trip() {
    let url = std::env::var("LIVE_RESPONSES_URL").unwrap_or_default();
    let Some(config) = config(&url, ModelApi::Responses) else { return };
    round_trip(Responses::new(config)).await;
}
