use std::time::Duration;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{Agent, AgentError, ScriptedProvider, TurnEvent};
use xiaoban_protocol::{Message, Role};

fn history() -> Vec<Message> {
    vec![Message {
        id: "m1".into(),
        thread_id: "t1".into(),
        role: Role::User,
        text: "明天几点出门".into(),
        created_at: 0,
    }]
}

#[tokio::test]
async fn streams_deltas_and_collects_text() {
    let agent = Agent::new(ScriptedProvider::new(["7:40", " 出门"]));
    let (tx, mut rx) = mpsc::channel(16);
    let outcome = agent
        .run_turn(&history(), tx, CancellationToken::new())
        .await
        .unwrap();

    assert_eq!(outcome.text, "7:40 出门");
    assert_eq!(outcome.usage.output_tokens, 2);
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
    let result = agent.run_turn(&history(), tx, cancel).await;
    assert!(matches!(result, Err(AgentError::Cancelled)));
}
