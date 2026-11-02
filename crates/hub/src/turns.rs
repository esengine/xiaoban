use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{
    AgentError, ChatMessage, ChatRole, NoTools, StablePrefix, Transcript, TurnEvent, TurnOutcome,
    user_wire,
};
use xiaoban_i18n::keys;
use xiaoban_protocol::{
    CompactPhase, ContextNote, ErrorCode, Event, Failure, FileInfo, FileMode, Message,
    ProtocolError, ProviderId, Quote, Role,
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
    pub(crate) fn claim(&self, thread_id: &str, turn_id: &str) -> Option<CancellationToken> {
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

    pub(crate) fn release(&self, turn_id: &str) {
        let mut running = self.running.lock().unwrap();
        if let Some((thread_id, _)) = running.by_turn.remove(turn_id)
            && running
                .by_thread
                .get(&thread_id)
                .is_some_and(|current| current == turn_id)
        {
            running.by_thread.remove(&thread_id);
        }
    }

    pub fn background(&self, turn_id: &str) -> bool {
        let mut running = self.running.lock().unwrap();
        let Some((thread_id, _)) = running.by_turn.get(turn_id).cloned() else {
            return false;
        };
        if running
            .by_thread
            .get(&thread_id)
            .is_some_and(|current| current == turn_id)
        {
            running.by_thread.remove(&thread_id);
        }
        true
    }

    pub fn running_in(&self, thread_id: &str) -> Option<String> {
        self.running
            .lock()
            .unwrap()
            .by_thread
            .get(thread_id)
            .cloned()
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
        started_at: xiaoban_store::now_ms(),
    });
    tokio::spawn(run(Arc::clone(state), thread_id, turn_id, job, cancel));
}

const TITLE_CHARS: usize = 16;
const MODEL_TITLE_CHARS: usize = 12;
const TITLE_CONTEXT_CHARS: usize = 600;

fn name_thread(state: &SharedState, thread_id: &str, answer: &str) {
    if !state.auto_titles {
        return;
    }
    let state = Arc::clone(state);
    let thread_id = thread_id.to_owned();
    let answer: String = answer.chars().take(TITLE_CONTEXT_CHARS).collect();
    tokio::spawn(async move {
        let Ok(thread) = state.store.thread(thread_id.clone()).await else {
            return;
        };
        let primary = state
            .store
            .setting(crate::preferences::PRIMARY_THREAD_KEY)
            .await
            .ok()
            .flatten();
        if thread.title.is_some() || primary.as_deref() == Some(thread_id.as_str()) {
            return;
        }
        let Some(first) = state
            .store
            .list_messages(thread_id.clone())
            .await
            .ok()
            .and_then(|messages| {
                messages
                    .into_iter()
                    .find(|message| message.role == Role::User)
            })
        else {
            return;
        };
        let title = match model_title(&state, &first.text, &answer).await {
            Some(title) => Some(title),
            None => auto_title(&first.text),
        };
        let Some(title) = title else {
            return;
        };
        if let Ok(thread) = state.store.rename_thread(thread_id, title).await {
            state.publish(Event::ThreadUpdated { thread });
        }
    });
}

async fn model_title(state: &SharedState, question: &str, answer: &str) -> Option<String> {
    let prefix = StablePrefix::new(state.localizer.text(keys::PROMPT_THREAD_TITLE));
    let input = format!("[user] {question}\n[assistant] {answer}");
    let (events, _) = mpsc::channel(1);
    let outcome = state
        .active()
        .agent
        .without_thinking()
        .run_turn(
            &prefix,
            &Transcript::default(),
            &input,
            &NoTools,
            events,
            CancellationToken::new(),
        )
        .await
        .ok()?;
    let _ = state.store.record_memory_usage(outcome.usage).await;
    let title: String = outcome
        .text
        .trim()
        .trim_matches(|c: char| {
            matches!(c, '"' | '\u{201c}' | '\u{201d}' | '\u{300c}' | '\u{300d}')
        })
        .chars()
        .take(MODEL_TITLE_CHARS)
        .collect();
    (!title.trim().is_empty()).then_some(title)
}

fn auto_title(text: &str) -> Option<String> {
    let first = text
        .split(['\n', '\u{3002}', '\u{ff01}', '\u{ff1f}', '!', '?'])
        .map(str::trim)
        .find(|part| !part.is_empty())?;
    let mut title: String = first.chars().take(TITLE_CHARS).collect();
    if first.chars().count() > TITLE_CHARS {
        title.push('\u{2026}');
    }
    Some(title)
}

struct Job {
    wire: String,
    replaces: Option<String>,
    images: Vec<String>,
}

const DEEPSEEK_VISION: &str = "deepseek-v4-flash-vision-exp";
const MIMO_VISION: &str = "mimo-v2.5";

pub(crate) fn vision_model(state: &SharedState) -> Option<String> {
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
                (l.format(keys::FILE_NOTE_IMAGE, &[name, ("id", info.id.as_str())]), String::new())
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
    attachment: Option<xiaoban_protocol::Attachment>,
) -> Result<(String, Message), ProtocolError> {
    state.store.thread(thread_id.clone()).await?;
    let (paths, import_note) = crate::ledger::take_import(state, &thread_id, paths).await;
    let files = ingest(state, paths).await?;
    let (turn_id, cancel) = claim(state, &thread_id)?;
    crate::kitchen::photo(state, &thread_id, &files).await;
    let kitchen_note = crate::kitchen::note(state, &thread_id).await;
    let ledger_note = crate::ledger::note(state, &thread_id).await;
    let home_note = crate::life::home_note(state, &thread_id).await;
    let doc_note = crate::doc::note(state, &thread_id).await;
    let sheet_note = crate::sheet::note(state, &thread_id).await;
    let deck_note = crate::slides::note(state, &thread_id).await;
    let plan_note = crate::plan::note(state, &thread_id).await;
    let floor_note = crate::floorplan::note(state, &thread_id).await;
    let schedule_note = crate::schedules::note(state, &thread_id).await;
    let skills_note = crate::capability::note(state);

    let (file_notes, images) = attachments(state, &files);
    let remembered = recalled(state, &text).await;
    let history = crate::archive::recalled(state, &thread_id, &text).await;
    let wire = user_wire(
        &text,
        &notes(
            state,
            quote.as_ref().map(|quote| quote.text.as_str()),
            remembered
                .into_iter()
                .chain(history)
                .chain(file_notes)
                .chain(kitchen_note)
                .chain(ledger_note)
                .chain(home_note)
                .chain(doc_note)
                .chain(sheet_note)
                .chain(deck_note)
                .chain(plan_note)
                .chain(floor_note)
                .chain(schedule_note)
                .chain(skills_note)
                .chain(import_note)
                .chain(context)
                .collect(),
        ),
    );
    let accepted = async {
        let message = state
            .store
            .append_message(
                thread_id.clone(),
                NewMessage::user(text)
                    .quoting(quote)
                    .with_files(files)
                    .attaching(attachment),
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
        crate::schedules::after_failure(&state, &thread_id, &turn_id, &failure).await;
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

pub(crate) async fn fresh_snapshot(state: &SharedState) -> Result<Option<String>, StoreError> {
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
    let workspace = crate::workspace::for_thread(state, thread_id).await;
    let scene = crate::state::scene_of(state, thread_id).await;
    let packs = crate::packs::loaded(state, thread_id).await;
    state
        .store
        .start_epoch(
            thread_id.to_owned(),
            state.base_fingerprint_for(workspace.as_ref(), scene, &packs),
            reason,
            snapshot,
            carried.iter().map(to_wire).collect(),
        )
        .await
}

pub const COMPACT_PREFIX: &str = "compact-";

pub async fn compact(state: &SharedState, thread_id: String) -> Result<(), ProtocolError> {
    if !context_usage(state, &thread_id).await.can_compact {
        state.publish(Event::ThreadCompacting {
            thread_id,
            phase: CompactPhase::Skipped,
        });
        return Ok(());
    }
    let hold = format!("{COMPACT_PREFIX}{}", uuid::Uuid::now_v7());
    state.turns.claim(&thread_id, &hold).ok_or_else(|| {
        ProtocolError::new(
            ErrorCode::Busy,
            "a reply is still in progress in this thread",
        )
    })?;
    state.publish(Event::ThreadCompacting {
        thread_id: thread_id.clone(),
        phase: CompactPhase::Started,
    });
    let state = state.clone();
    tokio::spawn(async move {
        let phase = match compact_now(&state, &thread_id).await {
            Some((from, to)) => CompactPhase::Finished { from, to },
            None => CompactPhase::Failed,
        };
        state.turns.release(&hold);
        state.publish(Event::ThreadCompacting { thread_id, phase });
    });
    Ok(())
}

pub async fn context_usage(state: &SharedState, thread_id: &str) -> xiaoban_protocol::ContextUsage {
    let entries = state
        .store
        .latest_epoch(thread_id.to_owned())
        .await
        .ok()
        .flatten()
        .map(|(_, entries)| entries)
        .unwrap_or_default();
    let compacting = state
        .turns
        .running_in(thread_id)
        .is_some_and(|id| id.starts_with(COMPACT_PREFIX));
    crate::archive::usage(state, thread_id, &parse_transcript(&entries), compacting).await
}

fn weight(messages: &[ChatMessage]) -> usize {
    messages
        .iter()
        .map(|message| message.content.chars().count())
        .sum()
}

async fn compact_now(state: &SharedState, thread_id: &str) -> Option<(u8, u8)> {
    let workspace = crate::workspace::for_thread(state, thread_id).await;
    let scene = crate::state::scene_of(state, thread_id).await;
    let packs = crate::packs::loaded(state, thread_id).await;
    let base = state.base_fingerprint_for(workspace.as_ref(), scene, &packs);
    let (epoch, entries) = state
        .store
        .latest_epoch(thread_id.to_owned())
        .await
        .ok()??;
    let transcript = parse_transcript(&entries);
    let (from, before) = crate::archive::peak(state, thread_id).await;
    let carried = crate::archive::archive(state, thread_id, &transcript).await?;
    let reason = if epoch.prefix_fingerprint == base {
        EpochReason::Compacted
    } else {
        EpochReason::PrefixChanged
    };
    begin_epoch(state, thread_id, reason, carried.clone())
        .await
        .ok()?;
    let total = weight(transcript.entries()).max(1);
    let estimate = u64::from(before) * weight(&carried) as u64 / total as u64;
    let estimate = u32::try_from(estimate).unwrap_or(u32::MAX);
    crate::archive::remember_peak(state, thread_id, estimate).await;
    Some((from, crate::archive::percent(state, estimate)))
}

async fn current_epoch(
    state: &SharedState,
    thread_id: &str,
) -> Result<(Epoch, StablePrefix, Transcript), StoreError> {
    let workspace = crate::workspace::for_thread(state, thread_id).await;
    let workspace = workspace.as_ref();
    let scene = crate::state::scene_of(state, thread_id).await;
    let packs = crate::packs::loaded(state, thread_id).await;
    let base = state.base_fingerprint_for(workspace, scene, &packs);
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
            let transcript = parse_transcript(&entries);
            if crate::archive::due(state, thread_id).await
                && let Some(carried) = crate::archive::archive(state, thread_id, &transcript).await
            {
                let epoch =
                    begin_epoch(state, thread_id, EpochReason::Compacted, carried.clone()).await?;
                let prefix = state.prefix_for(epoch.memory_snapshot.as_deref(), workspace, scene, &packs);
                return Ok((epoch, prefix, carried.into_iter().collect()));
            }
            let prefix = state.prefix_for(epoch.memory_snapshot.as_deref(), workspace, scene, &packs);
            return Ok((epoch, prefix, transcript));
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
    let prefix = state.prefix_for(epoch.memory_snapshot.as_deref(), workspace, scene, &packs);
    Ok((epoch, prefix, carried.into_iter().collect()))
}

async fn after_answer(state: &SharedState, thread_id: &str, turn_id: &str, outcome: &TurnOutcome) {
    mark_used(state, turn_id, &outcome.text).await;
    name_thread(state, thread_id, &outcome.text);
    crate::archive::remember_peak(state, thread_id, outcome.peak_input).await;
    if state.pauses.take_report(turn_id) {
        crate::subthreads::report(state, thread_id, &outcome.text);
    }
    crate::plan::after_turn(state, thread_id, &outcome.text).await;
    crate::schedules::after_turn(state, thread_id, turn_id).await;
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

fn forward_events(
    state: &SharedState,
    turn_id: &str,
    mut rx: mpsc::Receiver<TurnEvent>,
) -> tokio::task::JoinHandle<crate::thinking::Recorder> {
    let state = Arc::clone(state);
    let turn_id = turn_id.to_owned();
    tokio::spawn(async move {
        let mut recorder = crate::thinking::Recorder::default();
        while let Some(event) = rx.recv().await {
            let turn_id = turn_id.clone();
            if let TurnEvent::ReasoningDelta(delta) = &event {
                recorder.reasoning(delta);
            } else {
                recorder.other();
            }
            state.publish(match event {
                TurnEvent::Thinking => Event::Thinking { turn_id },
                TurnEvent::TextDelta(delta) => Event::TextDelta { turn_id, delta },
                TurnEvent::ReasoningDelta(delta) => Event::ReasoningDelta { turn_id, delta },
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
        recorder
    })
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

    let effort = crate::thinking::choose(state, thread_id, &wire).await;
    let (tx, rx) = mpsc::channel(64);
    let forward = forward_events(state, turn_id, rx);
    let agent = crate::thinking::agent_for(&state.active().agent, effort);
    let tools = HubTools::new(state, thread_id, turn_id, cancel.clone())
        .with_snapshot(epoch.memory_snapshot.clone());
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
    let thinking = forward
        .await
        .ok()
        .and_then(|recorder| recorder.finish(effort));

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
    after_answer(state, thread_id, turn_id, &outcome).await;
    let message = state
        .store
        .append_message(
            thread_id.to_owned(),
            NewMessage::assistant(outcome.text)
                .replacing(replaces)
                .attaching({
                    tools.finish_changes().await;
                    tools.attachment()
                })
                .thinking(thinking),
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
