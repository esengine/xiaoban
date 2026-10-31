use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::TurnEvent;
use xiaoban_protocol::{Event, Message, ProtocolError, Role};

use crate::state::SharedState;

#[derive(Debug, Default)]
pub struct Turns {
    running: Mutex<HashMap<String, CancellationToken>>,
}

impl Turns {
    fn register(&self, turn_id: &str) -> CancellationToken {
        let token = CancellationToken::new();
        self.running
            .lock()
            .unwrap()
            .insert(turn_id.to_owned(), token.clone());
        token
    }

    fn finish(&self, turn_id: &str) {
        self.running.lock().unwrap().remove(turn_id);
    }

    pub fn cancel(&self, turn_id: &str) -> bool {
        self.running
            .lock()
            .unwrap()
            .get(turn_id)
            .map(CancellationToken::cancel)
            .is_some()
    }
}

pub async fn start(
    state: &SharedState,
    thread_id: String,
    text: String,
) -> Result<(String, Message), ProtocolError> {
    state.store.thread(thread_id.clone()).await?;
    let message = state
        .store
        .append_message(thread_id.clone(), Role::User, text)
        .await?;
    let thread = state.store.touch_thread(thread_id.clone()).await?;
    let turn_id = uuid::Uuid::now_v7().to_string();
    let cancel = state.turns.register(&turn_id);

    state.publish(Event::MessageCreated {
        message: message.clone(),
    });
    state.publish(Event::ThreadUpdated { thread });
    state.publish(Event::TurnStarted {
        thread_id: thread_id.clone(),
        turn_id: turn_id.clone(),
    });

    tokio::spawn(run(Arc::clone(state), thread_id, turn_id.clone(), cancel));
    Ok((turn_id, message))
}

async fn run(state: SharedState, thread_id: String, turn_id: String, cancel: CancellationToken) {
    let result = drive(&state, &thread_id, &turn_id, cancel).await;
    state.turns.finish(&turn_id);
    if let Err(failure) = result {
        state.publish(Event::TurnFailed { turn_id, failure });
    }
}

async fn drive(
    state: &SharedState,
    thread_id: &str,
    turn_id: &str,
    cancel: CancellationToken,
) -> Result<(), xiaoban_protocol::Failure> {
    let internal = |error: xiaoban_store::StoreError| xiaoban_protocol::Failure {
        kind: xiaoban_protocol::FailureKind::Internal,
        message: error.to_string(),
        retryable: false,
    };
    let history = state
        .store
        .list_messages(thread_id.to_owned())
        .await
        .map_err(internal)?;

    let (tx, mut rx) = mpsc::channel(64);
    let forward = {
        let state = Arc::clone(state);
        let turn_id = turn_id.to_owned();
        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                let turn_id = turn_id.clone();
                state.publish(match event {
                    TurnEvent::Thinking => Event::Thinking { turn_id },
                    TurnEvent::TextDelta(delta) => Event::TextDelta { turn_id, delta },
                });
            }
        })
    };

    let outcome = state.agent.run_turn(&history, tx, cancel).await;
    let _ = forward.await;
    let outcome = outcome.map_err(|error| error.to_failure())?;

    let message = state
        .store
        .append_message(thread_id.to_owned(), Role::Assistant, outcome.text)
        .await
        .map_err(internal)?;
    let thread = state
        .store
        .touch_thread(thread_id.to_owned())
        .await
        .map_err(internal)?;
    state.publish(Event::TurnCompleted {
        turn_id: turn_id.to_owned(),
        message,
        usage: outcome.usage,
    });
    state.publish(Event::ThreadUpdated { thread });
    Ok(())
}
