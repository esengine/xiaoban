//! Looking at a picture is done by a model that sees pictures, which answers in words. The model
//! the user is talking to stays a text model and never carries the picture in its context.

use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{ChatMessage, ChatRole, NoTools, StablePrefix, ToolSpec, Transcript};
use xiaoban_i18n::{Localizer, keys};

use crate::state::SharedState;
use crate::tools::HubTools;

pub const LOOK_AT_IMAGE: &str = "look_at_image";
const MAX_ANSWER: usize = 1200;
const WAIT: std::time::Duration = std::time::Duration::from_secs(90);

/// One question to a model that sees pictures. `None` when none is connected or it failed.
pub(crate) async fn ask(
    state: &SharedState,
    system: String,
    question: String,
    picture: String,
    limit: usize,
) -> Option<String> {
    let model = crate::turns::vision_model(state)?;
    let prefix = StablePrefix::new(system);
    let first = ChatMessage::new(ChatRole::User, question).with_images(vec![picture]);
    let (events, _) = mpsc::channel(1);
    let outcome = tokio::time::timeout(
        WAIT,
        state.active().agent.without_thinking().run_turn_with(
            &prefix,
            &Transcript::default(),
            first,
            Some(model),
            &NoTools,
            events,
            CancellationToken::new(),
        ),
    )
    .await
    .ok()?
    .ok()?;
    let text = outcome.text.trim();
    (!text.is_empty()).then(|| text.chars().take(limit).collect())
}

pub fn spec(l: &Localizer) -> ToolSpec {
    ToolSpec {
        name: LOOK_AT_IMAGE.to_owned(),
        description: l.text(keys::TOOL_LOOK_AT_IMAGE_DESCRIPTION),
        parameters: json!({
            "type": "object",
            "properties": {
                "id": { "type": "string", "description": l.text(keys::TOOL_LOOK_AT_IMAGE_ID) },
                "question": { "type": "string", "description": l.text(keys::TOOL_LOOK_AT_IMAGE_QUESTION) },
            },
            "required": ["id"],
            "additionalProperties": false,
        }),
    }
}

#[derive(Deserialize)]
struct Args {
    id: String,
    #[serde(default)]
    question: Option<String>,
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

impl HubTools<'_> {
    pub(crate) async fn look_at_image(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<Args>(arguments) else {
            return error("arguments must be {id, question?}");
        };
        let Some(picture) = self.state.files.data_url_by_id(args.id.trim()) else {
            return error(
                "no picture has that id; the ids are in the attachment notes of the user's messages (\"id ...\")",
            );
        };
        let question = args
            .question
            .map(|text| text.trim().to_owned())
            .filter(|text| !text.is_empty())
            .unwrap_or_else(|| self.state.localizer.text(keys::IMAGE_LOOK_DEFAULT));
        let system = self.state.localizer.text(keys::PROMPT_IMAGE_LOOK);
        match ask(self.state, system, question, picture, MAX_ANSWER).await {
            Some(answer) => json!({ "answer": answer }).to_string(),
            None => error(
                "the picture could not be looked at now (no model that sees pictures is connected, or it did not answer); tell the user plainly and ask them to describe what they need from it",
            ),
        }
    }
}
