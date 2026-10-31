use std::collections::HashSet;

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{ChatMessage, ChatRole, NoTools, StablePrefix, Transcript};
use xiaoban_i18n::keys;
use xiaoban_protocol::{ContextNote, Event, Message, ProviderId, Role};

use crate::state::SharedState;

const DEEPSEEK_WINDOW: u32 = 1_000_000;
const SAFE_WINDOW: u32 = 128_000;
const DEFAULT_RATIO: f64 = 0.9;
const RATIO_KEY: &str = "context.archive_ratio";
const PEAK_KEY: &str = "context.peak.";
const BEFORE_KEY: &str = "archive.before.";
const SUMMARY_KEY: &str = "archive.summary.";
const KEEP_TURNS: usize = 10;
const CHUNK_CHARS: usize = 100_000;
const TOOL_CHARS: usize = 300;
const SNIPPET_BUDGET: usize = 800;
const SNIPPET_CHARS: usize = 300;
const SNIPPETS: usize = 3;
const RECALL_MIN: usize = 4;
pub const SEARCH_HITS: usize = 8;
pub const READ_CHARS: usize = 6_000;

fn window(state: &SharedState) -> u32 {
    match state.active().model.as_ref().map(|model| model.provider) {
        Some(ProviderId::Deepseek) => DEEPSEEK_WINDOW,
        _ => SAFE_WINDOW,
    }
}

async fn number(state: &SharedState, key: String) -> Option<f64> {
    state
        .store
        .setting_owned(key)
        .await
        .ok()
        .flatten()
        .and_then(|value| value.parse().ok())
}

pub async fn remember_peak(state: &SharedState, thread_id: &str, peak: u32) {
    if peak > 0 {
        let _ = state
            .store
            .set_setting_owned(format!("{PEAK_KEY}{thread_id}"), peak.to_string())
            .await;
    }
}

pub async fn due(state: &SharedState, thread_id: &str) -> bool {
    let peak = number(state, format!("{PEAK_KEY}{thread_id}"))
        .await
        .unwrap_or(0.0);
    let ratio = number(state, RATIO_KEY.to_owned())
        .await
        .filter(|ratio| (0.1..=0.95).contains(ratio))
        .unwrap_or(DEFAULT_RATIO);
    peak >= f64::from(window(state)) * ratio
}

pub async fn boundary(state: &SharedState, thread_id: &str) -> Option<i64> {
    state
        .store
        .setting_owned(format!("{BEFORE_KEY}{thread_id}"))
        .await
        .ok()
        .flatten()
        .and_then(|value| value.parse().ok())
}

fn split_at(messages: &[ChatMessage]) -> Option<usize> {
    let users: Vec<usize> = messages
        .iter()
        .enumerate()
        .filter(|(_, message)| message.role == ChatRole::User)
        .map(|(index, _)| index)
        .collect();
    let at = *users.get(users.len().checked_sub(KEEP_TURNS)?)?;
    (at > 0).then_some(at)
}

fn render(messages: &[ChatMessage]) -> Vec<String> {
    let mut chunks = vec![String::new()];
    for message in messages {
        let role = match message.role {
            ChatRole::User => "user",
            ChatRole::Assistant => "assistant",
            ChatRole::Tool => "tool",
            ChatRole::System => "system",
        };
        let content: String = if message.role == ChatRole::Tool {
            message.content.chars().take(TOOL_CHARS).collect()
        } else {
            message.content.clone()
        };
        let line = format!("[{role}] {content}\n");
        let last = chunks.last_mut().expect("at least one chunk");
        if last.chars().count() + line.chars().count() > CHUNK_CHARS && !last.is_empty() {
            chunks.push(line);
        } else {
            last.push_str(&line);
        }
    }
    chunks
}

async fn summarize(state: &SharedState, previous: &str, chunk: &str) -> Option<String> {
    let prefix = StablePrefix::new(state.localizer.text(keys::PROMPT_ARCHIVE));
    let input = format!(
        "{}\n{previous}\n\n{}\n{chunk}",
        state.localizer.text(keys::ARCHIVE_PREVIOUS_LABEL),
        state.localizer.text(keys::ARCHIVE_CHUNK_LABEL),
    );
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
    if let Err(failure) = state.store.record_memory_usage(outcome.usage).await {
        tracing::warn!(%failure, "could not record archive usage");
    }
    let text = outcome.text.trim();
    (!text.is_empty()).then(|| text.to_owned())
}

pub async fn archive(
    state: &SharedState,
    thread_id: &str,
    transcript: &Transcript,
) -> Option<Vec<ChatMessage>> {
    let messages = transcript.entries();
    let at = split_at(messages)?;
    let mut summary = state
        .store
        .setting_owned(format!("{SUMMARY_KEY}{thread_id}"))
        .await
        .ok()
        .flatten()
        .unwrap_or_default();
    for chunk in render(&messages[..at]) {
        summary = summarize(state, &summary, &chunk).await?;
    }
    let visible = state.store.list_messages(thread_id.to_owned()).await.ok()?;
    let users: Vec<&Message> = visible
        .iter()
        .filter(|message| message.role == Role::User)
        .collect();
    let before = users
        .get(users.len().saturating_sub(KEEP_TURNS))
        .map_or(0, |message| message.created_at);
    let store = &state.store;
    let _ = store
        .set_setting_owned(format!("{SUMMARY_KEY}{thread_id}"), summary.clone())
        .await;
    let _ = store
        .set_setting_owned(format!("{BEFORE_KEY}{thread_id}"), before.to_string())
        .await;
    let _ = store
        .set_setting_owned(format!("{PEAK_KEY}{thread_id}"), "0".to_owned())
        .await;
    state.publish(Event::ThreadArchived {
        thread_id: thread_id.to_owned(),
        before,
    });
    tracing::info!(thread = thread_id, "archived the earlier conversation");
    let mut carried = vec![ChatMessage::new(
        ChatRole::User,
        format!(
            "{}\n{summary}",
            state.localizer.text(keys::ARCHIVE_SUMMARY_LABEL)
        ),
    )];
    carried.extend(messages[at..].iter().cloned());
    Some(carried)
}

const PAIR_WEIGHT: usize = 3;
const MIN_SINGLES: usize = 2;

pub fn score(text: &str, wanted: &[String]) -> usize {
    let lower = text.to_lowercase();
    let pairs = wanted
        .iter()
        .filter(|term| !term.starts_with('#') && lower.contains(term.as_str()))
        .count();
    let singles = wanted
        .iter()
        .filter_map(|term| term.strip_prefix('#'))
        .filter(|single| lower.contains(single))
        .count();
    pairs * PAIR_WEIGHT + if singles >= MIN_SINGLES { singles } else { 0 }
}

pub fn wanted(query: &str) -> Vec<String> {
    let terms: HashSet<String> = crate::memory::terms(query).into_iter().collect();
    terms.into_iter().collect()
}

pub fn snippet(text: &str) -> String {
    text.chars().take(SNIPPET_CHARS).collect()
}

pub async fn archived(state: &SharedState, thread_id: &str) -> Vec<Message> {
    let Some(before) = boundary(state, thread_id).await else {
        return Vec::new();
    };
    state
        .store
        .list_messages(thread_id.to_owned())
        .await
        .unwrap_or_default()
        .into_iter()
        .filter(|message| message.created_at < before)
        .collect()
}

pub async fn recalled(state: &SharedState, thread_id: &str, text: &str) -> Option<ContextNote> {
    let old = archived(state, thread_id).await;
    if old.is_empty() {
        return None;
    }
    let wanted = wanted(text);
    let mut scored: Vec<(usize, &Message)> = old
        .iter()
        .map(|message| (score(&message.text, &wanted), message))
        .filter(|(hits, _)| *hits >= RECALL_MIN)
        .collect();
    scored.sort_by_key(|(hits, _)| std::cmp::Reverse(*hits));
    let mut used = 0;
    let mut lines = Vec::new();
    for (_, message) in scored.into_iter().take(SNIPPETS) {
        let line = snippet(&message.text);
        let cost = line.chars().count();
        if used + cost > SNIPPET_BUDGET {
            break;
        }
        used += cost;
        lines.push(format!("- {line}"));
    }
    (!lines.is_empty()).then(|| ContextNote {
        label: state.localizer.text(keys::ARCHIVE_RECALL_LABEL),
        body: lines.join("\n"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_last_turns_from_a_user_message() {
        let mut messages = Vec::new();
        for index in 0..14 {
            messages.push(ChatMessage::new(ChatRole::User, format!("q{index}")));
            messages.push(ChatMessage::tool_result("c", "result"));
            messages.push(ChatMessage::new(ChatRole::Assistant, format!("a{index}")));
        }
        let at = split_at(&messages).unwrap();
        assert_eq!(messages[at].content, "q4");
        assert!(split_at(&messages[..9]).is_none());
        let chunks = render(&messages[..at]);
        assert!(chunks[0].contains("[user] q0"));
        let wanted = wanted("鸡兔同笼答案");
        assert!(score("笼子里有鸡和兔共 35 只", &wanted) > 0);
        assert_eq!(score("今天天气不错", &wanted), 0);
    }
}
