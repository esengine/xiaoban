use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{NoTools, StablePrefix, Transcript};
use xiaoban_protocol::{Event, Response};
use xiaoban_store::StoreError;

use crate::state::SharedState;

#[derive(Debug, Default, Deserialize, PartialEq, Eq)]
struct Verdict {
    value: Option<String>,
    reply: Option<String>,
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
        reply: non_empty(verdict.reply),
    }
}

pub async fn answer(
    state: &SharedState,
    subject: String,
    question: &str,
    answer: String,
) -> Result<Response, StoreError> {
    let prefix = StablePrefix::new(state.prompts.interpret_answer.clone());
    let wire = json!({ "question": question, "subject": subject, "answer": answer }).to_string();
    let (events, _) = mpsc::channel(1);
    let outcome = state
        .active()
        .agent
        .run_turn(
            &prefix,
            &Transcript::default(),
            &wire,
            &NoTools,
            events,
            CancellationToken::new(),
        )
        .await;
    let outcome = match outcome {
        Ok(outcome) => outcome,
        Err(error) => {
            return Ok(Response::Interpreted {
                memory: None,
                reply: None,
                failure: Some(error.to_failure()),
            });
        }
    };
    let verdict = parse(&outcome.text);
    let memory = match verdict.value {
        Some(value) => {
            let memory = state.store.remember(subject, value).await?;
            state.publish(Event::MemorySaved {
                memory: memory.clone(),
            });
            Some(memory)
        }
        None => None,
    };
    let reply = if memory.is_some() {
        None
    } else {
        verdict.reply
    };
    Ok(Response::Interpreted {
        memory,
        reply,
        failure: None,
    })
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
                reply: None
            }
        );
        assert_eq!(
            parse(r#"{"value": "", "reply": "换个说法？"}"#),
            Verdict {
                value: None,
                reply: Some("换个说法？".into())
            }
        );
        assert_eq!(parse("不是 JSON"), Verdict::default());
    }
}
