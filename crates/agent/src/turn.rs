use std::sync::Arc;

use futures_util::StreamExt;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::{Message, Role, Usage};

use crate::{AgentError, ChatMessage, ChatRequest, ChatRole, ModelChunk, ModelProvider};

const SYSTEM_PROMPT: &str =
    "你是小伴，一个像朋友一样陪用户处理日常生活的助手。回答简洁、具体，用中文。";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnEvent {
    Thinking,
    TextDelta(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnOutcome {
    pub text: String,
    pub usage: Usage,
}

#[derive(Clone)]
pub struct Agent {
    provider: Arc<dyn ModelProvider>,
}

impl std::fmt::Debug for Agent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Agent").finish_non_exhaustive()
    }
}

impl Agent {
    pub fn new(provider: impl ModelProvider) -> Self {
        Self {
            provider: Arc::new(provider),
        }
    }

    fn request(history: &[Message]) -> ChatRequest {
        let messages = std::iter::once(ChatMessage::new(ChatRole::System, SYSTEM_PROMPT))
            .chain(history.iter().map(|message| {
                let role = match message.role {
                    Role::User => ChatRole::User,
                    Role::Assistant => ChatRole::Assistant,
                };
                ChatMessage::new(role, message.text.clone())
            }))
            .collect();
        ChatRequest { messages }
    }

    pub async fn run_turn(
        &self,
        history: &[Message],
        events: mpsc::Sender<TurnEvent>,
        cancel: CancellationToken,
    ) -> Result<TurnOutcome, AgentError> {
        let _ = events.send(TurnEvent::Thinking).await;
        let mut stream = self.provider.stream(Self::request(history));
        let mut outcome = TurnOutcome {
            text: String::new(),
            usage: Usage::default(),
        };
        loop {
            let chunk = tokio::select! {
                () = cancel.cancelled() => return Err(AgentError::Cancelled),
                chunk = stream.next() => chunk,
            };
            match chunk.transpose()? {
                None => return Ok(outcome),
                Some(ModelChunk::Text(delta)) => {
                    outcome.text.push_str(&delta);
                    let _ = events.send(TurnEvent::TextDelta(delta)).await;
                }
                Some(ModelChunk::Usage(usage)) => outcome.usage = usage,
            }
        }
    }
}
