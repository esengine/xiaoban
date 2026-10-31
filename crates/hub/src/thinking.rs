use std::time::{Duration, Instant};

use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{Agent, NoTools, StablePrefix, Transcript};
use xiaoban_i18n::keys;
use xiaoban_protocol::{ProviderId, Thinking, ThinkingEffort};

use crate::state::SharedState;

const PICK_CHARS: usize = 2_000;

pub fn supported(state: &SharedState) -> bool {
    state
        .active()
        .model
        .as_ref()
        .is_some_and(|model| model.provider == ProviderId::Deepseek)
}

pub fn parse_pick(answer: &str) -> ThinkingEffort {
    let lower = answer.to_lowercase();
    let words: Vec<&str> = lower
        .split(|c: char| !c.is_ascii_alphabetic())
        .filter(|word| !word.is_empty())
        .collect();
    words
        .iter()
        .find_map(|word| ThinkingEffort::parse(word).filter(|e| *e != ThinkingEffort::Auto))
        .unwrap_or(ThinkingEffort::High)
}

async fn pick(state: &SharedState, text: &str) -> ThinkingEffort {
    let prefix = StablePrefix::new(state.localizer.text(keys::PROMPT_THINKING_PICK));
    let input: String = text.chars().take(PICK_CHARS).collect();
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
        .await;
    match outcome {
        Ok(outcome) => {
            if let Err(failure) = state.store.record_memory_usage(outcome.usage).await {
                tracing::warn!(%failure, "could not record thinking pick usage");
            }
            parse_pick(&outcome.text)
        }
        Err(failure) => {
            tracing::warn!(%failure, "could not pick a thinking effort");
            ThinkingEffort::High
        }
    }
}

pub async fn choose(state: &SharedState, thread_id: &str, text: &str) -> Option<ThinkingEffort> {
    if !state.auto_thinking || !supported(state) {
        return None;
    }
    let setting = state
        .store
        .thread(thread_id.to_owned())
        .await
        .map(|thread| thread.thinking)
        .unwrap_or_default();
    Some(match setting {
        ThinkingEffort::Auto => pick(state, text).await,
        fixed => fixed,
    })
}

pub fn agent_for(agent: &Agent, effort: Option<ThinkingEffort>) -> Agent {
    match effort {
        Some(effort) => agent.with_effort(effort.as_str()),
        None => agent.clone(),
    }
}

#[derive(Default)]
pub struct Recorder {
    text: String,
    spent: Duration,
    since: Option<Instant>,
}

impl Recorder {
    pub fn reasoning(&mut self, delta: &str) {
        self.since.get_or_insert_with(Instant::now);
        self.text.push_str(delta);
    }

    pub fn other(&mut self) {
        if let Some(since) = self.since.take() {
            self.spent += since.elapsed();
        }
    }

    pub fn finish(mut self, effort: Option<ThinkingEffort>) -> Option<Thinking> {
        self.other();
        let text = self.text.trim().to_owned();
        (!text.is_empty()).then(|| Thinking {
            text,
            seconds: u32::try_from(self.spent.as_millis().saturating_add(500) / 1000)
                .unwrap_or(u32::MAX)
                .max(1),
            effort,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_picked_effort() {
        assert_eq!(parse_pick("low"), ThinkingEffort::Low);
        assert_eq!(parse_pick("Max."), ThinkingEffort::Max);
        assert_eq!(parse_pick("none"), ThinkingEffort::None);
        assert_eq!(parse_pick("auto"), ThinkingEffort::High);
        assert_eq!(parse_pick(""), ThinkingEffort::High);
        let mut recorder = Recorder::default();
        recorder.reasoning("先算");
        recorder.other();
        let thinking = recorder.finish(Some(ThinkingEffort::Low)).unwrap();
        assert_eq!(thinking.text, "先算");
        assert_eq!(thinking.seconds, 1);
        assert!(Recorder::default().finish(None).is_none());
    }
}
