use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::StreamExt;
use futures_util::stream;
use xiaoban_protocol::Usage;

use crate::{ChatRequest, ModelChunk, ModelProvider, ModelStream};

#[derive(Debug, Clone)]
pub struct ScriptedProvider {
    scripts: Arc<[Vec<ModelChunk>]>,
    next: Arc<Mutex<usize>>,
    delay: Duration,
}

impl ScriptedProvider {
    pub fn new<I, S>(chunks: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self::sequence([chunks
            .into_iter()
            .map(|chunk| ModelChunk::Text(chunk.into()))
            .collect()])
    }

    pub fn sequence<I>(scripts: I) -> Self
    where
        I: IntoIterator<Item = Vec<ModelChunk>>,
    {
        Self {
            scripts: scripts.into_iter().collect(),
            next: Arc::default(),
            delay: Duration::ZERO,
        }
    }

    #[must_use]
    pub fn with_delay(mut self, delay: Duration) -> Self {
        self.delay = delay;
        self
    }

    fn script(&self) -> Vec<ModelChunk> {
        let mut next = self.next.lock().unwrap();
        let index = (*next).min(self.scripts.len().saturating_sub(1));
        *next += 1;
        self.scripts.get(index).cloned().unwrap_or_default()
    }
}

impl ModelProvider for ScriptedProvider {
    fn stream(&self, request: ChatRequest) -> ModelStream {
        let delay = self.delay;
        let script = self.script();
        let input = u32::try_from(request.messages.len()).unwrap_or(u32::MAX);
        let output = u32::try_from(script.len()).unwrap_or(u32::MAX);
        let usage = ModelChunk::Usage(Usage {
            input_tokens: input,
            output_tokens: output,
            cached_tokens: 0,
        });
        stream::iter(script.into_iter().chain(std::iter::once(usage)))
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
