use futures_util::stream::BoxStream;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use xiaoban_protocol::Usage;

use crate::AgentError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChatRole {
    System,
    User,
    Assistant,
    Tool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: FunctionCall,
}

impl ToolCall {
    pub fn function(
        id: impl Into<String>,
        name: impl Into<String>,
        arguments: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            kind: "function".to_owned(),
            function: FunctionCall {
                name: name.into(),
                arguments: arguments.into(),
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub images: Vec<String>,
}

impl ChatMessage {
    pub fn new(role: ChatRole, content: impl Into<String>) -> Self {
        Self {
            role,
            content: content.into(),
            tool_calls: Vec::new(),
            tool_call_id: None,
            images: Vec::new(),
        }
    }

    #[must_use]
    pub fn with_images(mut self, images: Vec<String>) -> Self {
        self.images = images;
        self
    }

    pub fn wire(&self) -> Value {
        let mut value = serde_json::to_value(self).unwrap_or(Value::Null);
        if self.images.is_empty() {
            return value;
        }
        let mut parts = vec![serde_json::json!({ "type": "text", "text": self.content })];
        parts.extend(
            self.images
                .iter()
                .map(|url| serde_json::json!({ "type": "image_url", "image_url": { "url": url } })),
        );
        if let Some(object) = value.as_object_mut() {
            object.remove("images");
            object.insert("content".into(), Value::Array(parts));
        }
        value
    }

    pub fn assistant_calls(content: impl Into<String>, tool_calls: Vec<ToolCall>) -> Self {
        Self {
            tool_calls,
            ..Self::new(ChatRole::Assistant, content)
        }
    }

    pub fn tool_result(call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            tool_call_id: Some(call_id.into()),
            ..Self::new(ChatRole::Tool, content)
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ToolSpec {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

impl ToolSpec {
    pub fn wire(&self) -> Value {
        serde_json::json!({
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            }
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct ChatRequest {
    pub messages: Vec<ChatMessage>,
    pub tools: Vec<ToolSpec>,
    pub model: Option<String>,
    pub thinking: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelChunk {
    Text(String),
    Reasoning(String),
    ToolCallDelta {
        index: usize,
        id: Option<String>,
        name: Option<String>,
        arguments: String,
    },
    Usage(Usage),
}

pub type ModelStream = BoxStream<'static, Result<ModelChunk, AgentError>>;

pub trait ModelProvider: Send + Sync + 'static {
    fn stream(&self, request: ChatRequest) -> ModelStream;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn images_become_content_parts_on_the_wire() {
        let message = ChatMessage::new(ChatRole::User, "哪个好看")
            .with_images(vec!["data:image/png;base64,AAA".into()]);
        let wire = message.wire();
        assert_eq!(wire["content"][0]["text"], "哪个好看");
        assert_eq!(
            wire["content"][1]["image_url"]["url"],
            "data:image/png;base64,AAA"
        );
        assert!(wire.get("images").is_none());
        let plain = ChatMessage::new(ChatRole::User, "你好").wire();
        assert_eq!(plain["content"], "你好");
    }

    #[test]
    fn plain_messages_serialize_without_tool_fields() {
        let json =
            serde_json::to_string(&ChatMessage::new(ChatRole::User, "明天几点出门\"")).unwrap();
        assert_eq!(json, r#"{"role":"user","content":"明天几点出门\""}"#);
    }

    #[test]
    fn tool_messages_round_trip() {
        let call = ToolCall::function("c1", "remember", r#"{"subject":"称呼"}"#);
        for message in [
            ChatMessage::assistant_calls("", vec![call]),
            ChatMessage::tool_result("c1", "ok"),
        ] {
            let json = serde_json::to_string(&message).unwrap();
            assert_eq!(serde_json::from_str::<ChatMessage>(&json).unwrap(), message);
        }
    }
}
