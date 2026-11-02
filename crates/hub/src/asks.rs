use std::collections::HashMap;
use std::sync::Mutex;

use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::oneshot;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::{AskAnswer, AskOption, AskQuestion, AskRequest, Event};

use crate::state::SharedState;
use crate::tools::HubTools;

type Waiting = (AskRequest, oneshot::Sender<Vec<AskAnswer>>);

#[derive(Debug, Default)]
pub struct Asks {
    pub(crate) pending: Mutex<HashMap<String, Waiting>>,
}

impl Asks {
    pub fn pending(&self) -> Vec<AskRequest> {
        self.pending
            .lock()
            .unwrap()
            .values()
            .map(|(request, _)| request.clone())
            .collect()
    }

    /// `None` when nothing is waiting under this id; `Some(false)` when the answers do not fit the questions.
    pub fn answer(&self, id: &str, answers: Vec<AskAnswer>) -> Option<bool> {
        let mut pending = self.pending.lock().unwrap();
        let (request, _) = pending.get(id)?;
        if !fits(&request.questions, &answers) {
            return Some(false);
        }
        let (_, reply) = pending.remove(id)?;
        Some(reply.send(answers).is_ok())
    }

    pub(crate) fn drop_request(&self, id: &str) {
        self.pending.lock().unwrap().remove(id);
    }
}

fn fits(questions: &[AskQuestion], answers: &[AskAnswer]) -> bool {
    questions.len() == answers.len()
        && questions
            .iter()
            .zip(answers)
            .all(|(question, answer)| match answer {
                AskAnswer::Chosen { labels } => {
                    (question.multiple || labels.len() == 1)
                        && labels.iter().all(|label| {
                            question.options.iter().any(|option| &option.label == label)
                        })
                }
                AskAnswer::Typed { text } => !text.trim().is_empty(),
                AskAnswer::Skipped => true,
            })
}

/// Parks the turn until the user answers; a cancelled turn counts as skipping every question.
pub async fn ask(
    state: &SharedState,
    turn_id: &str,
    thread_id: &str,
    questions: Vec<AskQuestion>,
    cancel: &CancellationToken,
) -> Vec<AskAnswer> {
    let request = AskRequest {
        id: uuid::Uuid::now_v7().to_string(),
        turn_id: turn_id.to_owned(),
        thread_id: thread_id.to_owned(),
        questions,
    };
    let skipped = || vec![AskAnswer::Skipped; request.questions.len()];
    let (reply, answer) = oneshot::channel();
    state
        .asks
        .pending
        .lock()
        .unwrap()
        .insert(request.id.clone(), (request.clone(), reply));
    state.publish(Event::AskRequested {
        ask: request.clone(),
    });
    let answers = tokio::select! {
        answers = answer => answers.unwrap_or_else(|_| skipped()),
        () = cancel.cancelled() => skipped(),
    };
    state.asks.drop_request(&request.id);
    state.publish(Event::AskResolved {
        ask_id: request.id,
        answers: answers.clone(),
    });
    answers
}

pub const ASK_USER: &str = "ask_user";
const MAX_QUESTIONS: usize = 3;
const MAX_OPTIONS: usize = 4;

pub fn spec(l: &Localizer) -> ToolSpec {
    let text = |key| json!({ "type": "string", "description": l.text(key) });
    ToolSpec {
        name: ASK_USER.to_owned(),
        description: l.text(keys::TOOL_ASK_USER_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "questions": {
                    "type": "array",
                    "minItems": 1,
                    "maxItems": MAX_QUESTIONS,
                    "description": l.text(keys::TOOL_ASK_USER_QUESTIONS),
                    "items": {
                        "type": "object",
                        "properties": {
                            "text": text(keys::TOOL_ASK_USER_TEXT),
                            "note": text(keys::TOOL_ASK_USER_NOTE),
                            "options": {
                                "type": "array",
                                "maxItems": MAX_OPTIONS,
                                "description": l.text(keys::TOOL_ASK_USER_OPTIONS),
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": text(keys::TOOL_ASK_USER_OPTION_LABEL),
                                        "note": text(keys::TOOL_ASK_USER_OPTION_NOTE),
                                    },
                                    "required": ["label"],
                                },
                            },
                            "multiple": {
                                "type": "boolean",
                                "description": l.text(keys::TOOL_ASK_USER_MULTIPLE),
                            },
                        },
                        "required": ["text"],
                    },
                },
            },
            "required": ["questions"],
        }),
    }
}

#[derive(Deserialize)]
struct Args {
    questions: Vec<RawQuestion>,
}

#[derive(Deserialize)]
struct RawQuestion {
    text: String,
    note: Option<String>,
    #[serde(default)]
    options: Vec<RawOption>,
    #[serde(default)]
    multiple: bool,
}

#[derive(Deserialize)]
struct RawOption {
    label: String,
    note: Option<String>,
}

fn clean(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn ask_user(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<Args>(arguments) else {
            return error("arguments must be {questions: [{text, note?, options?, multiple?}]}");
        };
        if args.questions.is_empty() || args.questions.len() > MAX_QUESTIONS {
            return error("ask between 1 and 3 questions");
        }
        let mut questions = Vec::new();
        for raw in args.questions {
            let text = raw.text.trim().to_owned();
            if text.is_empty() {
                return error("every question needs text");
            }
            if raw.options.len() > MAX_OPTIONS {
                return error("give at most 4 options; the user can always type their own");
            }
            let options: Vec<AskOption> = raw
                .options
                .into_iter()
                .filter_map(|option| {
                    let label = option.label.trim().to_owned();
                    (!label.is_empty()).then(|| AskOption {
                        label,
                        note: clean(option.note),
                    })
                })
                .collect();
            if options.len() == 1 {
                return error("give two or more options, or none to let the user type an answer");
            }
            questions.push(AskQuestion {
                text,
                note: clean(raw.note),
                multiple: raw.multiple && options.len() > 1,
                options,
            });
        }
        let answers = ask(
            self.state,
            self.turn_id,
            self.thread_id,
            questions.clone(),
            &self.cancel,
        )
        .await;
        let results: Vec<Value> = questions
            .iter()
            .zip(&answers)
            .map(|(question, answer)| match answer {
                AskAnswer::Chosen { labels } if labels.is_empty() => json!({
                    "question": question.text,
                    "chosen": [],
                    "note": "the user picked none of the options",
                }),
                AskAnswer::Chosen { labels } => {
                    json!({ "question": question.text, "chosen": labels })
                }
                AskAnswer::Typed { text } => json!({ "question": question.text, "typed": text }),
                AskAnswer::Skipped => json!({
                    "question": question.text,
                    "skipped": "the user left this to you: decide yourself and say in your reply what you chose",
                }),
            })
            .collect();
        json!({ "answers": results }).to_string()
    }
}
