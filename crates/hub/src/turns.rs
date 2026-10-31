use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{
    AgentError, ChatMessage, ChatRole, StablePrefix, Transcript, TurnEvent, user_wire,
};
use xiaoban_i18n::keys;
use xiaoban_protocol::{ContextNote, ErrorCode, Event, Failure, Message, ProtocolError, Role};
use xiaoban_store::{Epoch, EpochReason, StoreError};

use crate::memory;
use crate::state::SharedState;
use crate::tools::HubTools;

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

fn claim(
    state: &SharedState,
    thread_id: &str,
) -> Result<(String, CancellationToken), ProtocolError> {
    let turn_id = uuid::Uuid::now_v7().to_string();
    let cancel = state.turns.claim(thread_id, &turn_id).ok_or_else(|| {
        ProtocolError::new(
            ErrorCode::Busy,
            "a reply is still in progress in this thread",
        )
    })?;
    Ok((turn_id, cancel))
}

fn launch(
    state: &SharedState,
    thread_id: String,
    turn_id: String,
    wire: String,
    cancel: CancellationToken,
) {
    state.publish(Event::TurnStarted {
        thread_id: thread_id.clone(),
        turn_id: turn_id.clone(),
    });
    tokio::spawn(run(Arc::clone(state), thread_id, turn_id, wire, cancel));
}

pub async fn start(
    state: &SharedState,
    thread_id: String,
    text: String,
    context: Vec<ContextNote>,
) -> Result<(String, Message), ProtocolError> {
    state.store.thread(thread_id.clone()).await?;
    let (turn_id, cancel) = claim(state, &thread_id)?;

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
    launch(state, thread_id, turn_id.clone(), wire, cancel);
    Ok((turn_id, message))
}

pub async fn retry(
    state: &SharedState,
    thread_id: String,
) -> Result<(String, Message), ProtocolError> {
    let messages = state.store.list_messages(thread_id.clone()).await?;
    let asked = messages
        .iter()
        .rev()
        .find(|message| message.role == Role::User)
        .cloned()
        .ok_or_else(|| ProtocolError::new(ErrorCode::BadRequest, "nothing to answer yet"))?;
    let unanswered = messages.last().is_some_and(|last| last.role == Role::User);
    let wire = if unanswered {
        asked.text.clone()
    } else {
        state.localizer.text(keys::TURN_REGENERATE)
    };
    let (turn_id, cancel) = claim(state, &thread_id)?;
    launch(state, thread_id, turn_id.clone(), wire, cancel);
    Ok((turn_id, asked))
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

fn to_wire(message: &ChatMessage) -> String {
    serde_json::to_string(message).unwrap_or_default()
}

fn parse_transcript(entries: &[String]) -> Transcript {
    entries
        .iter()
        .filter_map(|entry| match serde_json::from_str::<ChatMessage>(entry) {
            Ok(message) => Some(message),
            Err(error) => {
                tracing::error!(%error, "skipping unreadable transcript entry");
                None
            }
        })
        .collect()
}

async fn fresh_snapshot(state: &SharedState) -> Result<Option<String>, StoreError> {
    let memories = state.store.list_memories().await?;
    Ok(memory::snapshot(&state.localizer, &memories))
}

pub async fn begin_epoch(
    state: &SharedState,
    thread_id: &str,
    reason: EpochReason,
    carried: Vec<ChatMessage>,
) -> Result<Epoch, StoreError> {
    let snapshot = fresh_snapshot(state).await?;
    state
        .store
        .start_epoch(
            thread_id.to_owned(),
            state.base_fingerprint(),
            reason,
            snapshot,
            carried.iter().map(to_wire).collect(),
        )
        .await
}

async fn current_epoch(
    state: &SharedState,
    thread_id: &str,
) -> Result<(Epoch, StablePrefix, Transcript), StoreError> {
    let base = state.base_fingerprint();
    let (reason, carried) = match state.store.latest_epoch(thread_id.to_owned()).await? {
        Some((mut epoch, entries)) if epoch.prefix_fingerprint == base => {
            if entries.is_empty() {
                let snapshot = fresh_snapshot(state).await?;
                if snapshot != epoch.memory_snapshot {
                    state
                        .store
                        .set_memory_snapshot(epoch.id.clone(), snapshot.clone())
                        .await?;
                    epoch.memory_snapshot = snapshot;
                }
            }
            let prefix = state.prefix(epoch.memory_snapshot.as_deref());
            return Ok((epoch, prefix, parse_transcript(&entries)));
        }
        Some((previous, entries)) => {
            tracing::info!(
                thread = thread_id,
                from = %previous.prefix_fingerprint,
                to = %base,
                "stable prefix changed; starting a new epoch"
            );
            (EpochReason::PrefixChanged, parse_transcript(&entries))
        }
        None => (EpochReason::Started, Transcript::default()),
    };
    let carried: Vec<ChatMessage> = carried.entries().to_vec();
    let epoch = begin_epoch(state, thread_id, reason, carried.clone()).await?;
    let prefix = state.prefix(epoch.memory_snapshot.as_deref());
    Ok((epoch, prefix, carried.into_iter().collect()))
}

async fn drive(
    state: &SharedState,
    thread_id: &str,
    turn_id: &str,
    wire: String,
    cancel: CancellationToken,
) -> Result<(), Failure> {
    let (epoch, prefix, transcript) = current_epoch(state, thread_id)
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
                    TurnEvent::ToolUsed(tool) => Event::ToolUsed { turn_id, tool },
                });
            }
        })
    };
    let agent = state.active().agent;
    let outcome = agent
        .run_turn(&prefix, &transcript, &wire, &HubTools { state }, tx, cancel)
        .await;
    let _ = forward.await;

    let appended = match &outcome {
        Ok(outcome) => std::iter::once(to_wire(&ChatMessage::new(ChatRole::User, wire)))
            .chain(outcome.messages.iter().map(to_wire))
            .collect(),
        Err(AgentError::Cancelled) => vec![to_wire(&ChatMessage::new(ChatRole::User, wire))],
        Err(_) => Vec::new(),
    };
    if !appended.is_empty() {
        state
            .store
            .append_transcript(epoch.id.clone(), appended)
            .await
            .map_err(Failure::from)?;
    }
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
