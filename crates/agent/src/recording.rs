use std::sync::{Arc, Mutex};

use crate::{ChatRequest, ModelProvider, ModelStream, ScriptedProvider};

#[derive(Clone)]
pub struct RecordingProvider {
    inner: Arc<dyn ModelProvider>,
    requests: Arc<Mutex<Vec<ChatRequest>>>,
}

impl std::fmt::Debug for RecordingProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RecordingProvider").finish_non_exhaustive()
    }
}

impl RecordingProvider {
    pub fn new(inner: ScriptedProvider) -> Self {
        Self::wrap(inner)
    }

    /// Records the requests going to any provider, including a real one.
    pub fn wrap(inner: impl ModelProvider + 'static) -> Self {
        Self {
            inner: Arc::new(inner),
            requests: Arc::default(),
        }
    }

    pub fn requests(&self) -> Vec<ChatRequest> {
        self.requests.lock().unwrap().clone()
    }
}

impl ModelProvider for RecordingProvider {
    fn stream(&self, request: ChatRequest) -> ModelStream {
        self.requests.lock().unwrap().push(request.clone());
        self.inner.stream(request)
    }
}
