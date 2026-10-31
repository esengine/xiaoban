use std::time::Duration;

use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::ToolSpec;
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::{Attachment, ConfirmChoice, ConfirmKind, ContextNote, Event};

use crate::state::SharedState;
use crate::tools::HubTools;

pub const OPEN_SUBTHREADS: &str = "open_subthreads";
pub const MESSAGE_SUBTHREAD: &str = "message_subthread";
const REPORT_WAIT: Duration = Duration::from_secs(2);
const REPORT_TRIES: u32 = 900;

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn specs(l: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: OPEN_SUBTHREADS.to_owned(),
            description: l.text(keys::TOOL_OPEN_SUBTHREADS_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "reason": text(l, keys::TOOL_OPEN_SUBTHREADS_REASON),
                    "tasks": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "title": text(l, keys::TOOL_SUBTHREAD_TITLE),
                                "task": text(l, keys::TOOL_SUBTHREAD_TASK),
                            },
                            "required": ["title", "task"],
                            "additionalProperties": false,
                        },
                    },
                },
                "required": ["reason", "tasks"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: MESSAGE_SUBTHREAD.to_owned(),
            description: l.text(keys::TOOL_MESSAGE_SUBTHREAD_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "thread": text(l, keys::TOOL_READ_THREAD_ID),
                    "text": text(l, keys::TOOL_MESSAGE_SUBTHREAD_TEXT),
                },
                "required": ["thread", "text"],
                "additionalProperties": false,
            }),
        },
    ]
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

#[derive(Deserialize)]
struct Task {
    title: String,
    task: String,
}

#[derive(Deserialize)]
struct OpenArgs {
    reason: String,
    tasks: Vec<Task>,
}

#[derive(Deserialize)]
struct MessageArgs {
    thread: String,
    text: String,
}

async fn assign(
    state: &SharedState,
    parent_title: &str,
    child: &str,
    text: String,
) -> Result<String, String> {
    let note = ContextNote {
        label: state
            .localizer
            .format(keys::SUBTHREAD_TASK_LABEL, &[("title", parent_title)]),
        body: state.localizer.text(keys::SUBTHREAD_TASK_RULES),
    };
    let (turn_id, _) = crate::turns::start(
        state,
        child.to_owned(),
        text,
        vec![note],
        None,
        Vec::new(),
        None,
    )
    .await
    .map_err(|failure| failure.detail)?;
    state.pauses.expect_report(&turn_id);
    Ok(turn_id)
}

impl HubTools<'_> {
    async fn parent_title(&self) -> String {
        self.state
            .store
            .thread(self.thread_id.to_owned())
            .await
            .ok()
            .and_then(|thread| thread.title)
            .unwrap_or_else(|| self.state.localizer.text(keys::APP_NAME))
    }

    pub(crate) async fn open_subthreads(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<OpenArgs>(arguments) else {
            return error("arguments must be {reason, tasks: [{title, task}]}");
        };
        if args.tasks.is_empty() {
            return error("give at least one task");
        }
        let current = self.state.store.thread(self.thread_id.to_owned()).await;
        if current
            .as_ref()
            .is_ok_and(|thread| thread.parent_id.is_some())
        {
            return error("a subthread cannot open subthreads; do the work here or use sub-agents");
        }
        let titles: Vec<String> = args
            .tasks
            .iter()
            .map(|task| task.title.trim().to_owned())
            .collect();
        match self
            .ask(ConfirmKind::OpenSubthreads {
                titles: titles.clone(),
                reason: args.reason,
            })
            .await
        {
            ConfirmChoice::Yes | ConfirmChoice::Once | ConfirmChoice::Always => {}
            ConfirmChoice::Edit => {
                return error(
                    "the user wants changes; ask what to change before opening subthreads",
                );
            }
            ConfirmChoice::No => {
                return error("the user will handle this here; do not open subthreads");
            }
        }
        let parent_title = self.parent_title().await;
        let mut opened = Vec::new();
        for task in args.tasks {
            let Ok(thread) = self
                .state
                .store
                .create_child_thread(
                    Some(task.title.trim().to_owned()),
                    Some(self.thread_id.to_owned()),
                )
                .await
            else {
                continue;
            };
            self.state.publish(Event::ThreadUpdated {
                thread: thread.clone(),
            });
            if let Err(failure) = assign(self.state, &parent_title, &thread.id, task.task).await {
                tracing::warn!(%failure, "could not start a subthread");
            }
            opened.push(json!({ "id": thread.id, "title": thread.title }));
        }
        self.attach(Attachment::Subthreads {
            thread_ids: opened
                .iter()
                .filter_map(|item| item["id"].as_str().map(str::to_owned))
                .collect(),
        });
        json!({
            "opened": opened,
            "hint": "the subthreads are working in parallel and will report back here; tell the user briefly and do not wait",
        })
        .to_string()
    }

    pub(crate) async fn message_subthread(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<MessageArgs>(arguments) else {
            return error("arguments must be {thread, text}");
        };
        let Ok(child) = self.state.store.thread(args.thread.clone()).await else {
            return error("no such subthread");
        };
        if child.parent_id.as_deref() != Some(self.thread_id) {
            return error("that conversation is not a subthread of this one");
        }
        if let Some(turn_id) = self.state.turns.running_in(&child.id)
            && self.state.pauses.add_note(&turn_id, args.text.trim())
        {
            return json!({ "queued": true }).to_string();
        }
        let parent_title = self.parent_title().await;
        match assign(self.state, &parent_title, &child.id, args.text).await {
            Ok(_) => json!({ "started": true }).to_string(),
            Err(failure) => error(&failure),
        }
    }
}

pub fn report(state: &SharedState, child_id: &str, answer: &str) {
    let state = std::sync::Arc::clone(state);
    let child_id = child_id.to_owned();
    let answer = answer.to_owned();
    tokio::spawn(async move {
        let Ok(child) = state.store.thread(child_id.clone()).await else {
            return;
        };
        let Some(parent) = child.parent_id.clone() else {
            return;
        };
        let title = child.title.clone().unwrap_or_default();
        let note = ContextNote {
            label: state
                .localizer
                .format(keys::SUBTHREAD_REPORT_LABEL, &[("title", &title)]),
            body: state.localizer.text(keys::SUBTHREAD_REPORT_RULES),
        };
        for _ in 0..REPORT_TRIES {
            let attempt = crate::turns::start(
                &state,
                parent.clone(),
                answer.clone(),
                vec![note.clone()],
                None,
                Vec::new(),
                Some(Attachment::Report {
                    thread_id: child_id.clone(),
                    title: title.clone(),
                }),
            )
            .await;
            match attempt {
                Ok(_) => return,
                Err(failure) if failure.code == xiaoban_protocol::ErrorCode::Busy => {
                    tokio::time::sleep(REPORT_WAIT).await;
                }
                Err(failure) => {
                    tracing::warn!(?failure, "could not report a subthread");
                    return;
                }
            }
        }
    });
}
