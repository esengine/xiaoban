use std::sync::Arc;

use futures_util::StreamExt;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::Usage;

use crate::prompt::{StablePrefix, Transcript, assemble};
use crate::{AgentError, ModelChunk, ModelProvider};

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
        Self::from_shared(Arc::new(provider))
    }

    pub fn from_shared(provider: Arc<dyn ModelProvider>) -> Self {
        Self { provider }
    }

    pub async fn run_turn(
        &self,
        prefix: &StablePrefix,
        transcript: &Transcript,
        user_wire: &str,
        events: mpsc::Sender<TurnEvent>,
        cancel: CancellationToken,
    ) -> Result<TurnOutcome, AgentError> {
        let _ = events.send(TurnEvent::Thinking).await;
        let mut stream = self
            .provider
            .stream(assemble(prefix, transcript, user_wire));
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
