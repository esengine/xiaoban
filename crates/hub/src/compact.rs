use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{ChatMessage, ChatRole, NoTools, StablePrefix, Transcript};
use xiaoban_i18n::keys;

use crate::state::SharedState;

pub const LIMIT_CHARS: usize = 150_000;
const KEEP: usize = 10;
const SOURCE_CHARS: usize = 120_000;
const TOOL_CHARS: usize = 300;

fn size(message: &ChatMessage) -> usize {
    message.content.chars().count()
        + message
            .tool_calls
            .iter()
            .map(|call| call.function.arguments.chars().count())
            .sum::<usize>()
}

pub fn needed(transcript: &Transcript) -> bool {
    transcript.entries().iter().map(size).sum::<usize>() > LIMIT_CHARS
}

fn split_at(messages: &[ChatMessage]) -> Option<usize> {
    let mut at = messages.len().checked_sub(KEEP)?;
    while at < messages.len() && messages[at].role != ChatRole::User {
        at += 1;
    }
    (at > 0 && at < messages.len()).then_some(at)
}

fn render(messages: &[ChatMessage]) -> String {
    let lines: Vec<String> = messages
        .iter()
        .map(|message| {
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
            let calls: Vec<&str> = message
                .tool_calls
                .iter()
                .map(|call| call.function.name.as_str())
                .collect();
            if calls.is_empty() {
                format!("[{role}] {content}")
            } else {
                format!("[{role}] {content} (tools: {})", calls.join(", "))
            }
        })
        .collect();
    let text = lines.join("\n");
    let total = text.chars().count();
    text.chars()
        .skip(total.saturating_sub(SOURCE_CHARS))
        .collect()
}

pub async fn compact(state: &SharedState, transcript: &Transcript) -> Option<Vec<ChatMessage>> {
    let messages = transcript.entries();
    let at = split_at(messages)?;
    let prefix = StablePrefix::new(state.localizer.text(keys::PROMPT_COMPACT));
    let (events, _) = mpsc::channel(1);
    let outcome = state
        .active()
        .agent
        .without_thinking()
        .run_turn(
            &prefix,
            &Transcript::default(),
            &render(&messages[..at]),
            &NoTools,
            events,
            CancellationToken::new(),
        )
        .await
        .ok()?;
    if let Err(failure) = state.store.record_memory_usage(outcome.usage).await {
        tracing::warn!(%failure, "could not record compaction usage");
    }
    let summary = outcome.text.trim();
    if summary.is_empty() {
        return None;
    }
    let mut carried = vec![ChatMessage::new(
        ChatRole::User,
        format!(
            "{}\n{summary}",
            state.localizer.text(keys::COMPACT_SUMMARY_LABEL)
        ),
    )];
    carried.extend(messages[at..].iter().cloned());
    Some(carried)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_the_recent_turns_starting_at_a_user_message() {
        let mut messages = Vec::new();
        for index in 0..8 {
            messages.push(ChatMessage::new(ChatRole::User, format!("q{index}")));
            messages.push(ChatMessage::tool_result("c", "result"));
            messages.push(ChatMessage::new(ChatRole::Assistant, format!("a{index}")));
        }
        let at = split_at(&messages).unwrap();
        assert_eq!(messages[at].role, ChatRole::User);
        assert!(messages.len() - at <= KEEP);
        assert!(split_at(&messages[..4]).is_none());
        assert!(render(&messages[..at]).contains("[user] q0"));
    }
}
