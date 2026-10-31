use std::time::Duration;

use std::sync::Mutex;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

use futures_util::future::BoxFuture;
use xiaoban_agent::{
    Agent, AgentError, ChatMessage, ChatRole, ModelChunk, NoTools, RecordingProvider,
    ScriptedProvider, StablePrefix, ToolCall, ToolRunner, Transcript, TurnEvent, prefix_reuse,
    user_wire,
};
use xiaoban_protocol::ContextNote;

async fn turn(agent: &Agent, transcript: &mut Transcript, wire: &str) -> String {
    let (tx, _rx) = mpsc::channel(64);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            transcript,
            wire,
            &NoTools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    transcript.push(ChatMessage::new(ChatRole::User, wire));
    for message in outcome.messages {
        transcript.push(message);
    }
    outcome.text
}

#[tokio::test]
async fn streams_deltas_and_collects_text() {
    let agent = Agent::new(ScriptedProvider::new(["7:40", " 出门"]));
    let (tx, mut rx) = mpsc::channel(16);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "明天几点出门",
            &NoTools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();

    assert_eq!(outcome.text, "7:40 出门");
    let mut events = Vec::new();
    while let Some(event) = rx.recv().await {
        events.push(event);
    }
    assert_eq!(
        events,
        vec![
            TurnEvent::Thinking,
            TurnEvent::TextDelta("7:40".into()),
            TurnEvent::TextDelta(" 出门".into())
        ]
    );
}

#[tokio::test]
async fn every_request_extends_the_previous_one_byte_for_byte() {
    let provider = RecordingProvider::new(ScriptedProvider::new(["好的"]));
    let agent = Agent::new(provider.clone());
    let mut transcript = Transcript::default();
    let context = [ContextNote {
        label: "页面".into(),
        body: "杭州行程 · 第 1 天".into(),
    }];

    turn(
        &agent,
        &mut transcript,
        &user_wire("下午加个亲子乐园", &context),
    )
    .await;
    turn(&agent, &mut transcript, "别太赶").await;
    turn(&agent, &mut transcript, "那晚饭呢").await;

    let requests = provider.requests();
    assert_eq!(requests.len(), 3);
    for pair in requests.windows(2) {
        let reuse = prefix_reuse(&pair[0], &pair[1]);
        assert!(reuse.is_intact(), "prefix broke: {reuse:?}");
        assert_eq!(pair[1].messages.len(), pair[0].messages.len() + 2);
    }
    assert!(requests[2].messages[1].content.contains("<context>"));
}

#[tokio::test]
async fn cancellation_stops_the_turn() {
    let provider = ScriptedProvider::new(["a", "b", "c"]).with_delay(Duration::from_millis(200));
    let agent = Agent::new(provider);
    let (tx, _rx) = mpsc::channel(16);
    let cancel = CancellationToken::new();
    let trigger = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        trigger.cancel();
    });
    let result = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "hi",
            &NoTools,
            tx,
            cancel,
        )
        .await;
    assert!(matches!(result, Err(AgentError::Cancelled)));
}

#[derive(Default)]
struct Recorder(Mutex<Vec<ToolCall>>);

impl ToolRunner for Recorder {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        self.0.lock().unwrap().push(call.clone());
        Box::pin(async { "saved".to_owned() })
    }
}

#[tokio::test]
async fn tool_calls_run_and_the_conversation_continues_append_only() {
    let call = |arguments: &str| ModelChunk::ToolCallDelta {
        index: 0,
        id: None,
        name: None,
        arguments: arguments.into(),
    };
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![
            ModelChunk::ToolCallDelta {
                index: 0,
                id: Some("c1".into()),
                name: Some("remember".into()),
                arguments: String::new(),
            },
            call(r#"{"subject":"称呼","#),
            call(r#""value":"阿哲"}"#),
        ],
        vec![ModelChunk::Text("好，阿哲".into())],
    ]));
    let agent = Agent::new(provider.clone());
    let tools = Recorder::default();
    let (tx, mut rx) = mpsc::channel(16);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "叫我阿哲",
            &tools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();

    let calls = tools.0.lock().unwrap().clone();
    assert_eq!(calls.len(), 1);
    assert_eq!(
        calls[0].function.arguments,
        r#"{"subject":"称呼","value":"阿哲"}"#
    );
    assert_eq!(outcome.text, "好，阿哲");
    assert_eq!(
        outcome.messages,
        vec![
            ChatMessage::assistant_calls("", calls.clone()),
            ChatMessage::tool_result("c1", "saved"),
            ChatMessage::new(ChatRole::Assistant, "好，阿哲"),
        ]
    );

    let mut events = Vec::new();
    while let Some(event) = rx.recv().await {
        events.push(event);
    }
    assert!(events.iter().any(
        |event| matches!(event, TurnEvent::ToolUsed(call) if call.function.name == "remember")
    ));
    assert!(events.iter().any(|event| matches!(
        event,
        TurnEvent::ToolFinished { result, .. } if result == "saved"
    )));

    let requests = provider.requests();
    assert_eq!(requests.len(), 2);
    assert!(prefix_reuse(&requests[0], &requests[1]).is_intact());
    assert_eq!(requests[1].messages.len(), requests[0].messages.len() + 2);
}

#[derive(Default)]
struct CountingTools {
    runs: Mutex<u32>,
}

impl ToolRunner for CountingTools {
    fn run<'a>(&'a self, _: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            *self.runs.lock().unwrap() += 1;
            "found".to_owned()
        })
    }
}

#[tokio::test]
async fn repeated_calls_reuse_results_and_are_cut_off() {
    let same = |id: &str| ModelChunk::ToolCallDelta {
        index: 0,
        id: Some(id.into()),
        name: Some("web_search".into()),
        arguments: r#"{ "query": "灵隐寺" }"#.into(),
    };
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![same("a")],
        vec![same("b")],
        vec![same("c")],
        vec![ModelChunk::Text("好".into())],
    ]));
    let agent = Agent::new(provider.clone());
    let tools = CountingTools::default();
    let (tx, _rx) = mpsc::channel(64);
    let outcome = agent
        .run_turn(
            &StablePrefix::new("system"),
            &Transcript::default(),
            "查一下",
            &tools,
            tx,
            CancellationToken::new(),
        )
        .await
        .unwrap();
    assert_eq!(outcome.text, "好");
    assert_eq!(*tools.runs.lock().unwrap(), 1);
    let results: Vec<_> = outcome
        .messages
        .iter()
        .filter(|message| message.role == ChatRole::Tool)
        .map(|message| message.content.as_str())
        .collect();
    assert_eq!(results[..2], ["found", "found"]);
    assert!(results[2].contains("already ran this exact call"));
}
