use serde::Deserialize;
use serde_json::{Value, json};
use tokio::sync::mpsc;
use xiaoban_agent::{ChatMessage, ChatRole, ToolSpec, Transcript, TurnEvent};
use xiaoban_i18n::{Key, Localizer, keys};
use xiaoban_protocol::Event;

use crate::tools::HubTools;

pub const SPAWN_AGENTS: &str = "spawn_agents";
const RESULT_CHARS: usize = 4_000;

fn text(l: &Localizer, key: Key) -> Value {
    json!({ "type": "string", "description": l.text(key) })
}

pub fn spec(l: &Localizer) -> ToolSpec {
    ToolSpec {
        name: SPAWN_AGENTS.to_owned(),
        description: l.text(keys::TOOL_SPAWN_AGENTS_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "tasks": {
                    "type": "array",
                    "minItems": 2,
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": text(l, keys::TOOL_AGENT_TITLE),
                            "task": text(l, keys::TOOL_AGENT_TASK),
                        },
                        "required": ["title", "task"],
                        "additionalProperties": false,
                    },
                },
            },
            "required": ["tasks"],
            "additionalProperties": false,
        }),
    }
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
struct Args {
    tasks: Vec<Task>,
}

impl HubTools<'_> {
    pub(crate) async fn spawn_agents(&self, arguments: &str, call_id: &str) -> String {
        if self.sub_agent {
            return error("a sub-agent cannot spawn sub-agents; do the work yourself");
        }
        let Ok(args) = serde_json::from_str::<Args>(arguments) else {
            return error("arguments must be {tasks: [{title, task}]}");
        };
        if args.tasks.len() < 2 {
            return error("one task does not need a sub-agent; do it yourself");
        }
        let Ok(snapshot) = crate::turns::fresh_snapshot(self.state).await else {
            return error("could not prepare the sub-agents");
        };
        let prefix = self.state.prefix(snapshot.as_deref());
        let runs = args.tasks.into_iter().enumerate().map(|(index, task)| {
            let prefix = prefix.clone();
            async move {
                let agent_index = u32::try_from(index).unwrap_or(u32::MAX);
                let publish = |step: Option<String>, done: bool| {
                    self.state.publish(Event::AgentProgress {
                        turn_id: self.turn_id.to_owned(),
                        call_id: call_id.to_owned(),
                        agent: agent_index,
                        title: task.title.clone(),
                        step,
                        done,
                    });
                };
                publish(None, false);
                let tools = HubTools::sub_agent(
                    self.state,
                    self.thread_id,
                    self.turn_id,
                    self.cancel.clone(),
                );
                let (events, mut rx) = mpsc::channel(64);
                let watch = async {
                    while let Some(event) = rx.recv().await {
                        if let TurnEvent::ToolUsed(call) = event {
                            let label = crate::steps::detail(&call).map_or_else(
                                || call.function.name.clone(),
                                |detail| format!("{} {detail}", call.function.name),
                            );
                            publish(Some(label), false);
                        }
                    }
                };
                let wire = format!(
                    "{}\n{}",
                    self.state
                        .localizer
                        .format(keys::AGENT_TASK_LABEL, &[("title", &task.title)]),
                    task.task
                );
                let active = self.state.active();
                let empty = Transcript::default();
                let run = active.agent.run_turn_with(
                    &prefix,
                    &empty,
                    ChatMessage::new(ChatRole::User, wire),
                    None,
                    &tools,
                    events,
                    self.cancel.clone(),
                );
                let (outcome, ()) = tokio::join!(run, watch);
                publish(None, true);
                match outcome {
                    Ok(outcome) => {
                        if let Err(failure) =
                            self.state.store.record_memory_usage(outcome.usage).await
                        {
                            tracing::warn!(%failure, "could not record sub-agent usage");
                        }
                        json!({
                            "title": task.title,
                            "result": outcome.text.chars().take(RESULT_CHARS).collect::<String>(),
                        })
                    }
                    Err(failure) => json!({ "title": task.title, "error": failure.to_string() }),
                }
            }
        });
        let results = futures_util::future::join_all(runs).await;
        json!({ "agents": results }).to_string()
    }
}
