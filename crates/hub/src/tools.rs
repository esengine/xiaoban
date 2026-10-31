use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde_json::json;
use xiaoban_agent::{ToolCall, ToolRunner, ToolSpec};
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::Event;

use crate::state::SharedState;

pub const REMEMBER: &str = "remember";

pub fn specs(localizer: &Localizer) -> Vec<ToolSpec> {
    vec![ToolSpec {
        name: REMEMBER.to_owned(),
        description: localizer.text(keys::TOOL_REMEMBER_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "subject": {
                    "type": "string",
                    "description": localizer.text(keys::TOOL_REMEMBER_SUBJECT),
                },
                "value": {
                    "type": "string",
                    "description": localizer.text(keys::TOOL_REMEMBER_VALUE),
                },
            },
            "required": ["subject", "value"],
            "additionalProperties": false,
        }),
    }]
}

#[derive(Deserialize)]
struct RememberArgs {
    subject: String,
    value: String,
}

pub struct HubTools<'a> {
    pub state: &'a SharedState,
}

impl HubTools<'_> {
    async fn remember(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<RememberArgs>(arguments) else {
            return json!({ "error": "arguments must be {subject, value}" }).to_string();
        };
        let (subject, value) = (args.subject.trim().to_owned(), args.value.trim().to_owned());
        if subject.is_empty() || value.is_empty() {
            return json!({ "error": "subject and value must not be empty" }).to_string();
        }
        match self.state.store.remember(subject, value).await {
            Ok(memory) => {
                self.state.publish(Event::MemorySaved { memory });
                json!({ "saved": true }).to_string()
            }
            Err(error) => {
                tracing::error!(%error, "failed to save memory");
                json!({ "error": "could not save" }).to_string()
            }
        }
    }
}

impl ToolRunner for HubTools<'_> {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            match call.function.name.as_str() {
                REMEMBER => self.remember(&call.function.arguments).await,
                other => json!({ "error": format!("unknown tool {other}") }).to_string(),
            }
        })
    }
}
