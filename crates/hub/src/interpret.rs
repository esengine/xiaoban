use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{NoTools, StablePrefix, Transcript};
use xiaoban_protocol::{Event, Interpretation, Response};
use xiaoban_store::StoreError;

use crate::state::SharedState;

#[derive(Debug, Default, Deserialize, PartialEq, Eq)]
struct Verdict {
    value: Option<String>,
    #[serde(default)]
    skip: bool,
    #[serde(default)]
    locate: bool,
    reply: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct Question<'a> {
    pub subject: &'a str,
    pub text: &'a str,
    pub follow_up: Option<&'a str>,
    pub can_locate: bool,
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn parse(text: &str) -> Verdict {
    let start = text.find('{');
    let end = text.rfind('}');
    let verdict = match (start, end) {
        (Some(start), Some(end)) if start < end => {
            serde_json::from_str::<Verdict>(&text[start..=end]).ok()
        }
        _ => None,
    };
    let verdict = verdict.unwrap_or_else(|| {
        tracing::warn!(text, "unreadable answer verdict");
        Verdict::default()
    });
    Verdict {
        value: non_empty(verdict.value),
        skip: verdict.skip,
        locate: verdict.locate,
        reply: non_empty(verdict.reply),
    }
}

pub async fn answer(
    state: &SharedState,
    question: Question<'_>,
    answer: String,
) -> Result<Response, StoreError> {
    let prefix = StablePrefix::new(state.prompts.interpret_answer.clone());
    let subject = question.subject.trim().to_owned();
    let wire = json!({
        "question": question.text.trim(),
        "subject": subject,
        "followUp": question.follow_up,
        "canLocate": question.can_locate,
        "answer": answer,
    })
    .to_string();
    let (events, _) = mpsc::channel(1);
    let outcome = state
        .active()
        .agent
        .without_thinking()
        .run_turn(
            &prefix,
            &Transcript::default(),
            &wire,
            &NoTools,
            events,
            CancellationToken::new(),
        )
        .await;
    let interpretation = match outcome {
        Err(error) => Interpretation::Failed {
            failure: error.to_failure(),
        },
        Ok(outcome) => match parse(&outcome.text) {
            Verdict {
                value: Some(value), ..
            } => {
                let memory = state
                    .store
                    .remember(xiaoban_store::NewMemory::simple(
                        subject,
                        value,
                        xiaoban_protocol::MemoryCategory::Other,
                    ))
                    .await?;
                state.publish(Event::MemorySaved {
                    memory: memory.clone(),
                });
                Interpretation::Remembered { memory }
            }
            Verdict { skip: true, .. } => Interpretation::Declined,
            Verdict { locate: true, .. } if question.can_locate => Interpretation::Locate,
            Verdict { reply, .. } => Interpretation::Unclear { reply },
        },
    };
    Ok(Response::Interpreted { interpretation })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verdicts_tolerate_fences_and_blank_values() {
        assert_eq!(
            parse("```json\n{\"value\": \" 阿哲 \", \"reply\": null}\n```"),
            Verdict {
                value: Some("阿哲".into()),
                skip: false,
                locate: false,
                reply: None
            }
        );
        assert_eq!(
            parse(r#"{"value": "", "reply": "换个说法？"}"#),
            Verdict {
                value: None,
                skip: false,
                locate: false,
                reply: Some("换个说法？".into())
            }
        );
        assert!(parse(r#"{"value": null, "skip": true, "reply": null}"#).skip);
        assert_eq!(parse("不是 JSON"), Verdict::default());
    }
}
