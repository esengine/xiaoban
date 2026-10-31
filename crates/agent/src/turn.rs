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
    prefix: StablePrefix,
}

impl std::fmt::Debug for Agent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Agent")
            .field("prefix", &self.prefix.fingerprint())
            .finish_non_exhaustive()
    }
}

impl Agent {
    pub fn new(provider: impl ModelProvider) -> Self {
        Self::with_prefix(provider, StablePrefix::default())
    }

    pub fn with_prefix(provider: impl ModelProvider, prefix: StablePrefix) -> Self {
        Self {
            provider: Arc::new(provider),
            prefix,
        }
    }

    pub fn prefix(&self) -> &StablePrefix {
        &self.prefix
    }

    pub async fn run_turn(
        &self,
        transcript: &Transcript,
        user_wire: &str,
        events: mpsc::Sender<TurnEvent>,
        cancel: CancellationToken,
    ) -> Result<TurnOutcome, AgentError> {
        let _ = events.send(TurnEvent::Thinking).await;
        let mut stream = self
            .provider
            .stream(assemble(&self.prefix, transcript, user_wire));
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
