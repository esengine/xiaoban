use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{
    AgentError, ChatMessage, ChatRole, StablePrefix, Transcript, TurnEvent, user_wire,
};
use xiaoban_i18n::keys;
use xiaoban_protocol::{
    ContextNote, ErrorCode, Event, Failure, FileInfo, FileMode, Message, ProtocolError, ProviderId,
    Quote, Role,
};
use xiaoban_store::{Epoch, EpochReason, NewMessage, StoreError};

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

    pub fn busy(&self) -> bool {
        !self.running.lock().unwrap().by_turn.is_empty()
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
    state.pauses.start(&turn_id);
    Ok((turn_id, cancel))
}

fn launch(
    state: &SharedState,
    thread_id: String,
    turn_id: String,
    job: Job,
    cancel: CancellationToken,
) {
    state.publish(Event::TurnStarted {
        thread_id: thread_id.clone(),
        turn_id: turn_id.clone(),
    });
    tokio::spawn(run(Arc::clone(state), thread_id, turn_id, job, cancel));
}

struct Job {
    wire: String,
    replaces: Option<String>,
    images: Vec<String>,
}

const DEEPSEEK_VISION: &str = "deepseek-v4-flash-vision-exp";
const MIMO_VISION: &str = "mimo-v2.5";

fn vision_model(state: &SharedState) -> Option<String> {
    let provider = state.active().model.as_ref()?.provider;
    match provider {
        ProviderId::Deepseek => Some(DEEPSEEK_VISION.to_owned()),
        ProviderId::Mimo => Some(MIMO_VISION.to_owned()),
        ProviderId::Custom => None,
    }
}

fn attachments(state: &SharedState, files: &[FileInfo]) -> (Vec<ContextNote>, Vec<String>) {
    let l = &state.localizer;
    let mut notes = Vec::new();
    let mut images = Vec::new();
    for info in files {
        let count = info.pages.unwrap_or(0).to_string();
        let name = ("name", info.name.as_str());
        let counted = [name, ("pages", count.as_str())];
        let (label, body) = match info.mode {
            FileMode::Image => {
                images.extend(state.files.data_url(info));
                (l.format(keys::FILE_NOTE_IMAGE, &[name]), String::new())
            }
            FileMode::Full => (
                l.format(keys::FILE_NOTE_FULL, &counted),
                state.files.pages(&info.id).unwrap_or_default().join("\n"),
            ),
            FileMode::OnDemand => {
                let pages = state.files.pages(&info.id).unwrap_or_default();
                (
                    l.format(
                        keys::FILE_NOTE_ON_DEMAND,
                        &[name, ("pages", count.as_str()), ("id", info.id.as_str())],
                    ),
                    format!(
                        "{}:\n{}\n\n{}:\n{}",
                        l.text(keys::FILE_NOTE_OUTLINE),
                        crate::files::outline(&pages),
                        l.text(keys::FILE_NOTE_PREVIEW),
                        crate::files::preview(&pages),
                    ),
                )
            }
            FileMode::Unreadable => (l.format(keys::FILE_NOTE_UNREADABLE, &[name]), String::new()),
        };
        notes.push(ContextNote { label, body });
    }
    (notes, images)
}

async fn ingest(state: &SharedState, paths: Vec<String>) -> Result<Vec<FileInfo>, ProtocolError> {
    if paths.len() > crate::files::MAX_FILES {
        return Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "at most 9 files per message",
        ));
    }
    let files = state.files.clone();
    tokio::task::spawn_blocking(move || {
        paths
            .iter()
            .map(|path| files.ingest(std::path::Path::new(path)))
            .collect::<Result<Vec<_>, _>>()
    })
    .await
    .map_err(|_| ProtocolError::new(ErrorCode::Internal, "reading the files stopped"))?
    .map_err(|failure| ProtocolError::new(ErrorCode::BadRequest, failure))
}

fn notes(state: &SharedState, quote: Option<&str>, context: Vec<ContextNote>) -> Vec<ContextNote> {
    let quote = quote.map(|quote| ContextNote {
        label: state.localizer.text(keys::QUOTE_CONTEXT_LABEL),
        body: quote.to_owned(),
    });
    let now = ContextNote {
        label: state.localizer.text(keys::NOW_CONTEXT_LABEL),
        body: jiff::Zoned::now()
            .strftime("%Y-%m-%d %A %H:%M %Q")
            .to_string(),
    };
    quote.into_iter().chain(context).chain([now]).collect()
}

pub async fn start(
    state: &SharedState,
    thread_id: String,
    text: String,
    context: Vec<ContextNote>,
    quote: Option<Quote>,
    paths: Vec<String>,
) -> Result<(String, Message), ProtocolError> {
    state.store.thread(thread_id.clone()).await?;
    let files = ingest(state, paths).await?;
    let (turn_id, cancel) = claim(state, &thread_id)?;

    let (file_notes, images) = attachments(state, &files);
    let remembered = recalled(state, &text).await;
    let wire = user_wire(
        &text,
        &notes(
            state,
            quote.as_ref().map(|quote| quote.text.as_str()),
            remembered
                .into_iter()
                .chain(file_notes)
                .chain(context)
                .collect(),
        ),
    );
    let accepted = async {
        let message = state
            .store
            .append_message(
                thread_id.clone(),
                NewMessage::user(text).quoting(quote).with_files(files),
            )
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
    let job = Job {
        wire,
        replaces: None,
        images,
    };
    launch(state, thread_id, turn_id.clone(), job, cancel);
    Ok((turn_id, message))
}

pub fn resume(state: &SharedState, thread_id: String, wire: &str) -> Result<String, ProtocolError> {
    let (turn_id, cancel) = claim(state, &thread_id)?;
    let job = Job {
        wire: user_wire(wire, &notes(state, None, Vec::new())),
        replaces: None,
        images: Vec::new(),
    };
    launch(state, thread_id, turn_id.clone(), job, cancel);
    Ok(turn_id)
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
    let (file_notes, images) = attachments(state, &asked.files);
    let remembered = recalled(state, &asked.text).await;
    let file_notes: Vec<ContextNote> = remembered.into_iter().chain(file_notes).collect();
    let job = match messages.last() {
        Some(last) if last.role == Role::Assistant => Job {
            wire: state.localizer.text(keys::TURN_REGENERATE),
            replaces: Some(last.replaces.clone().unwrap_or_else(|| last.id.clone())),
            images,
        },
        _ => Job {
            wire: user_wire(
                &asked.text,
                &notes(
                    state,
                    asked.quote.as_ref().map(|quote| quote.text.as_str()),
                    file_notes,
                ),
            ),
            replaces: None,
            images,
        },
    };
    let (turn_id, cancel) = claim(state, &thread_id)?;
    launch(state, thread_id, turn_id.clone(), job, cancel);
    Ok((turn_id, asked))
}

async fn run(
    state: SharedState,
    thread_id: String,
    turn_id: String,
    job: Job,
    cancel: CancellationToken,
) {
    let result = drive(&state, &thread_id, &turn_id, job, cancel).await;
    state.turns.release(&turn_id);
    state.pauses.forget(&turn_id);
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
    let galaxies = state.store.list_galaxies().await?;
    Ok(memory::snapshot(
        &state.localizer,
        &memories,
        &galaxies,
        xiaoban_store::now_ms(),
    ))
}

async fn recalled(state: &SharedState, text: &str) -> Option<ContextNote> {
    let memories = state.store.list_memories().await.ok()?;
    let galaxies = state.store.list_galaxies().await.ok()?;
    let links = state.store.memory_links().await.unwrap_or_default();
    let recall = memory::Recall {
        memories: &memories,
        galaxies: &galaxies,
        links: &links,
        now: xiaoban_store::now_ms(),
    };
    let found = recall.find(text, memory::RECALL_BUDGET, true);
    (!found.is_empty()).then(|| ContextNote {
        label: state.localizer.text(keys::MEMORY_RECALL_LABEL),
        body: found
            .into_iter()
            .map(memory::line)
            .collect::<Vec<_>>()
            .join("\n"),
    })
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

async fn mark_used(state: &SharedState, turn_id: &str, answer: &str) {
    let Ok(memories) = state.store.list_memories().await else {
        return;
    };
    let used = memory::used_by(answer, &memories);
    if used.is_empty() {
        return;
    }
    match state.store.mark_memories_used(used).await {
        Ok(memories) => state.publish(Event::MemoriesUsed {
            turn_id: turn_id.to_owned(),
            memories,
        }),
        Err(failure) => tracing::warn!(%failure, "could not count memory use"),
    }
}

async fn drive(
    state: &SharedState,
    thread_id: &str,
    turn_id: &str,
    job: Job,
    cancel: CancellationToken,
) -> Result<(), Failure> {
    let Job {
        wire,
        replaces,
        images,
    } = job;
    let model = (!images.is_empty()).then(|| vision_model(state)).flatten();
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
                    TurnEvent::ToolUsed(call) => Event::ToolUsed {
                        turn_id,
                        detail: crate::steps::detail(&call),
                        tool: call.function.name,
                        call_id: call.id,
                    },
                    TurnEvent::ToolFinished { call, result } => Event::ToolFinished {
                        turn_id,
                        result: crate::steps::result(&call, &result),
                        call_id: call.id,
                    },
                });
            }
        })
    };
    let agent = state.active().agent;
    let tools = HubTools::new(state, thread_id, turn_id, cancel.clone());
    let outcome = agent
        .run_turn_with(
            &prefix,
            &transcript,
            ChatMessage::new(ChatRole::User, wire.clone()).with_images(images),
            model,
            &tools,
            tx,
            cancel,
        )
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
    mark_used(state, turn_id, &outcome.text).await;
    let message = state
        .store
        .append_message(
            thread_id.to_owned(),
            NewMessage::assistant(outcome.text)
                .replacing(replaces)
                .attaching(tools.attachment()),
        )
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
