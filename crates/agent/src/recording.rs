use std::sync::{Arc, Mutex};

use crate::{ChatRequest, ModelProvider, ModelStream, ScriptedProvider};

#[derive(Debug, Clone)]
pub struct RecordingProvider {
    inner: ScriptedProvider,
    requests: Arc<Mutex<Vec<ChatRequest>>>,
}

impl RecordingProvider {
    pub fn new(inner: ScriptedProvider) -> Self {
        Self {
            inner,
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
