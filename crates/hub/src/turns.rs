use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{ChatMessage, ChatRole, Transcript, TurnEvent, user_wire};
use xiaoban_protocol::{ContextNote, ErrorCode, Event, Failure, Message, ProtocolError, Role};
use xiaoban_store::{EntryRole, Epoch, EpochReason, StoreError, TranscriptEntry};

use crate::state::SharedState;

#[derive(Debug, Default)]
struct Running {
    by_turn: HashMap<String, (String, CancellationToken)>,
    by_thread: HashMap<String, String>,
}

#[derive(Debug, Default)]
pub struct Turns {
    running: Mutex<Running>,
}

impl Turns {
    fn claim(&self, thread_id: &str, turn_id: &str) -> Option<CancellationToken> {
        let mut running = self.running.lock().unwrap();
        if running.by_thread.contains_key(thread_id) {
            return None;
        }
        let token = CancellationToken::new();
        running
            .by_thread
            .insert(thread_id.to_owned(), turn_id.to_owned());
        running
            .by_turn
            .insert(turn_id.to_owned(), (thread_id.to_owned(), token.clone()));
        Some(token)
    }

    fn release(&self, turn_id: &str) {
        let mut running = self.running.lock().unwrap();
        if let Some((thread_id, _)) = running.by_turn.remove(turn_id) {
            running.by_thread.remove(&thread_id);
        }
    }

    pub fn cancel(&self, turn_id: &str) -> bool {
        self.running
            .lock()
            .unwrap()
            .by_turn
            .get(turn_id)
            .map(|(_, token)| token.cancel())
            .is_some()
    }
}

pub async fn start(
    state: &SharedState,
    thread_id: String,
    text: String,
    context: Vec<ContextNote>,
) -> Result<(String, Message), ProtocolError> {
    state.store.thread(thread_id.clone()).await?;
    let turn_id = uuid::Uuid::now_v7().to_string();
    let cancel = state.turns.claim(&thread_id, &turn_id).ok_or_else(|| {
        ProtocolError::new(
            ErrorCode::Busy,
            "a reply is still in progress in this thread",
        )
    })?;

    let wire = user_wire(&text, &context);
    let accepted = async {
        let message = state
            .store
            .append_message(thread_id.clone(), Role::User, text)
            .await?;
        let thread = state.store.touch_thread(thread_id.clone()).await?;
        Ok::<_, StoreError>((message, thread))
    }
    .await;
    let (message, thread) = match accepted {
        Ok(accepted) => accepted,
        Err(error) => {
            state.turns.release(&turn_id);
            return Err(error.into());
        }
    };

    state.publish(Event::MessageCreated {
        message: message.clone(),
    });
    state.publish(Event::ThreadUpdated { thread });
    state.publish(Event::TurnStarted {
        thread_id: thread_id.clone(),
        turn_id: turn_id.clone(),
    });

    tokio::spawn(run(
        Arc::clone(state),
        thread_id,
        turn_id.clone(),
        wire,
        cancel,
    ));
    Ok((turn_id, message))
}

async fn run(
    state: SharedState,
    thread_id: String,
    turn_id: String,
    wire: String,
    cancel: CancellationToken,
) {
    let result = drive(&state, &thread_id, &turn_id, wire, cancel).await;
    state.turns.release(&turn_id);
    if let Err(failure) = result {
        state.publish(Event::TurnFailed { turn_id, failure });
    }
}

fn to_chat(entry: TranscriptEntry) -> ChatMessage {
    let role = match entry.role {
        EntryRole::User => ChatRole::User,
        EntryRole::Assistant => ChatRole::Assistant,
    };
    ChatMessage::new(role, entry.content)
}

async fn current_epoch(
    state: &SharedState,
    thread_id: &str,
) -> Result<(Epoch, Transcript), StoreError> {
    let fingerprint = state.prefix.fingerprint().to_owned();
    let (reason, carried) = match state.store.latest_epoch(thread_id.to_owned()).await? {
        Some((epoch, entries)) if epoch.prefix_fingerprint == fingerprint => {
            return Ok((epoch, entries.into_iter().map(to_chat).collect()));
        }
        Some((previous, entries)) => {
            tracing::info!(
                thread = thread_id,
                from = %previous.prefix_fingerprint,
                to = %fingerprint,
                "stable prefix changed; starting a new epoch"
            );
            (EpochReason::PrefixChanged, entries)
        }
        None => (EpochReason::Started, Vec::new()),
    };
    let epoch = state
        .store
        .start_epoch(thread_id.to_owned(), fingerprint, reason, carried.clone())
        .await?;
    Ok((epoch, carried.into_iter().map(to_chat).collect()))
}

async fn drive(
    state: &SharedState,
    thread_id: &str,
    turn_id: &str,
    wire: String,
    cancel: CancellationToken,
) -> Result<(), Failure> {
    let (epoch, transcript) = current_epoch(state, thread_id)
        .await
        .map_err(Failure::from)?;

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
    let agent = state.active().agent;
    let outcome = agent.run_turn(&transcript, &wire, tx, cancel).await;
    let _ = forward.await;

    let mut appended = vec![TranscriptEntry::new(EntryRole::User, wire)];
    if let Ok(outcome) = &outcome {
        appended.push(TranscriptEntry::new(
            EntryRole::Assistant,
            outcome.text.clone(),
        ));
    }
    state
        .store
        .append_transcript(epoch.id.clone(), appended)
        .await
        .map_err(Failure::from)?;
    let outcome = outcome.map_err(|error| error.to_failure())?;

    state
        .store
        .record_turn_usage(
            turn_id.to_owned(),
            thread_id.to_owned(),
            epoch.id,
            outcome.usage,
        )
        .await
        .map_err(Failure::from)?;
    let message = state
        .store
        .append_message(thread_id.to_owned(), Role::Assistant, outcome.text)
        .await
        .map_err(Failure::from)?;
    let thread = state
        .store
        .touch_thread(thread_id.to_owned())
        .await
        .map_err(Failure::from)?;
    state.publish(Event::TurnCompleted {
        turn_id: turn_id.to_owned(),
        message,
        usage: outcome.usage,
    });
    state.publish(Event::ThreadUpdated { thread });
    Ok(())
}
