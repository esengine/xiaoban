use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{
    Agent, AgentError, ChatMessage, ChatRole, RecordingProvider, ScriptedProvider, StablePrefix,
    Transcript, TurnEvent, prefix_reuse, user_wire,
};
use xiaoban_protocol::ContextNote;

async fn turn(agent: &Agent, transcript: &mut Transcript, wire: &str) -> String {
    let (tx, _rx) = mpsc::channel(64);
    let outcome = agent
        .run_turn(transcript, wire, tx, CancellationToken::new())
        .await
        .unwrap();
    transcript.push(ChatMessage::new(ChatRole::User, wire));
    transcript.push(ChatMessage::new(ChatRole::Assistant, outcome.text.clone()));
    outcome.text
}

#[tokio::test]
async fn streams_deltas_and_collects_text() {
    let agent = Agent::new(
        ScriptedProvider::new(["7:40", " 出门"]),
        StablePrefix::new("system"),
    );
    let (tx, mut rx) = mpsc::channel(16);
    let outcome = agent
        .run_turn(
            &Transcript::default(),
            "明天几点出门",
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
    let agent = Agent::new(provider.clone(), StablePrefix::new("system"));
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
    let agent = Agent::new(provider, StablePrefix::new("system"));
    let (tx, _rx) = mpsc::channel(16);
    let cancel = CancellationToken::new();
    let trigger = cancel.clone();
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_millis(50)).await;
        trigger.cancel();
    });
    let result = agent
        .run_turn(&Transcript::default(), "hi", tx, cancel)
        .await;
    assert!(matches!(result, Err(AgentError::Cancelled)));
}
