use futures_util::stream::BoxStream;
use serde::Serialize;
use xiaoban_protocol::Usage;

use crate::AgentError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
}

impl ChatMessage {
    pub fn new(role: ChatRole, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelChunk {
    Text(String),
    Usage(Usage),
}

pub type ModelStream = BoxStream<'static, Result<ModelChunk, AgentError>>;

pub trait ModelProvider: Send + Sync + 'static {
    fn stream(&self, request: ChatRequest) -> ModelStream;
}
