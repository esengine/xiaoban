use std::time::Duration;

use futures_util::StreamExt;
use futures_util::stream;
use xiaoban_protocol::Usage;

use crate::{ChatRequest, ModelChunk, ModelProvider, ModelStream};

#[derive(Debug, Clone)]
pub struct ScriptedProvider {
    chunks: Vec<String>,
    delay: Duration,
}

impl ScriptedProvider {
    pub fn new<I, S>(chunks: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self {
            chunks: chunks.into_iter().map(Into::into).collect(),
            delay: Duration::ZERO,
        }
    }

    #[must_use]
    pub fn with_delay(mut self, delay: Duration) -> Self {
        self.delay = delay;
        self
    }
}

impl ModelProvider for ScriptedProvider {
    fn stream(&self, request: ChatRequest) -> ModelStream {
        let delay = self.delay;
        let input = u32::try_from(request.messages.len()).unwrap_or(u32::MAX);
        let output = u32::try_from(self.chunks.len()).unwrap_or(u32::MAX);
        let text = self.chunks.clone().into_iter().map(ModelChunk::Text);
        let usage = ModelChunk::Usage(Usage {
            input_tokens: input,
            output_tokens: output,
            cached_tokens: 0,
        });
        stream::iter(text.chain(std::iter::once(usage)))
            .then(move |chunk| async move {
                if !delay.is_zero() {
                    tokio::time::sleep(delay).await;
                }
                Ok(chunk)
            })
            .boxed()
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct UnconfiguredProvider;

impl ModelProvider for UnconfiguredProvider {
    fn stream(&self, _request: ChatRequest) -> ModelStream {
        stream::once(async { Err(crate::AgentError::NotConfigured) }).boxed()
    }
}
