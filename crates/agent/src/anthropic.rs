use eventsource_stream::Eventsource;
use futures_util::{StreamExt, TryStreamExt, stream};
use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_protocol::Usage;

use crate::{
    AgentError, ChatMessage, ChatRequest, ChatRole, ModelChunk, ModelProvider, ModelStream,
    OpenAiConfig, ToolSpec,
};

const VERSION: &str = "2023-06-01";
const MAX_TOKENS: u32 = 16_000;

#[derive(Debug, Clone)]
pub struct Anthropic {
    client: reqwest::Client,
    config: OpenAiConfig,
}

impl Anthropic {
    pub fn new(config: OpenAiConfig) -> Self {
        Self {
            client: reqwest::Client::new(),
            config,
        }
    }

    fn endpoint(&self) -> String {
        let base = self.config.base_url.trim_end_matches('/');
        let base = base.strip_suffix("/messages").unwrap_or(base);
        if base.ends_with("/v1") {
            format!("{base}/messages")
        } else {
            format!("{base}/v1/messages")
        }
    }

    fn post(&self, body: &Value) -> reqwest::RequestBuilder {
        self.client
            .post(self.endpoint())
            .header("x-api-key", &self.config.api_key)
            .bearer_auth(&self.config.api_key)
            .header("anthropic-version", VERSION)
            .json(body)
    }

    pub async fn check(&self) -> Result<(), AgentError> {
        let response = self
            .post(&json!({
                "model": self.config.model,
                "max_tokens": 1,
                "messages": [{ "role": "user", "content": "ping" }],
            }))
            .send()
            .await?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(AgentError::UnknownModel {
                model: self.config.model.clone(),
                available: Vec::new(),
            });
        }
        ensure_success(response).await.map(drop)
    }
}

async fn ensure_success(response: reqwest::Response) -> Result<reqwest::Response, AgentError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(AgentError::InvalidKey);
    }
    let body = response.text().await.unwrap_or_default();
    Err(AgentError::Status {
        status: status.as_u16(),
        body,
    })
}

fn image(url: &str) -> Option<Value> {
    let rest = url.strip_prefix("data:")?;
    let (media_type, data) = rest.split_once(";base64,")?;
    Some(json!({
        "type": "image",
        "source": { "type": "base64", "media_type": media_type, "data": data },
    }))
}

fn user_blocks(message: &ChatMessage) -> Vec<Value> {
    let mut blocks: Vec<Value> = message.images.iter().filter_map(|url| image(url)).collect();
    if !message.content.is_empty() || blocks.is_empty() {
        blocks.push(json!({ "type": "text", "text": message.content }));
    }
    blocks
}

fn assistant_blocks(message: &ChatMessage) -> Vec<Value> {
    let mut blocks = Vec::new();
    if !message.content.is_empty() {
        blocks.push(json!({ "type": "text", "text": message.content }));
    }
    for call in &message.tool_calls {
        let input = serde_json::from_str::<Value>(&call.function.arguments)
            .ok()
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        blocks.push(json!({
            "type": "tool_use",
            "id": call.id,
            "name": call.function.name,
            "input": input,
        }));
    }
    blocks
}

fn push(messages: &mut Vec<Value>, role: &str, blocks: Vec<Value>) {
    if blocks.is_empty() {
        return;
    }
    if let Some(last) = messages.last_mut()
        && last["role"] == role
        && let Some(content) = last["content"].as_array_mut()
    {
        content.extend(blocks);
        return;
    }
    messages.push(json!({ "role": role, "content": blocks }));
}

pub(crate) fn wire(request: &ChatRequest) -> (String, Vec<Value>) {
    let mut system = Vec::new();
    let mut messages = Vec::new();
    for message in &request.messages {
        match message.role {
            ChatRole::System => system.push(message.content.clone()),
            ChatRole::User => push(&mut messages, "user", user_blocks(message)),
            ChatRole::Assistant => push(&mut messages, "assistant", assistant_blocks(message)),
            ChatRole::Tool => push(
                &mut messages,
                "user",
                vec![json!({
                    "type": "tool_result",
                    "tool_use_id": message.tool_call_id.clone().unwrap_or_default(),
                    "content": message.content,
                })],
            ),
        }
    }
    (system.join("\n\n"), messages)
}

fn tool(spec: &ToolSpec) -> Value {
    json!({
        "name": spec.name,
        "description": spec.description,
        "input_schema": spec.parameters,
    })
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Event {
    MessageStart {
        message: StartMessage,
    },
    ContentBlockStart {
        index: usize,
        content_block: Block,
    },
    ContentBlockDelta {
        index: usize,
        delta: BlockDelta,
    },
    MessageDelta {
        #[serde(default)]
        usage: Option<WireUsage>,
    },
    Error {
        error: WireError,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct StartMessage {
    #[serde(default)]
    usage: Option<WireUsage>,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Block {
    ToolUse {
        id: String,
        name: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum BlockDelta {
    TextDelta {
        text: String,
    },
    ThinkingDelta {
        thinking: String,
    },
    InputJsonDelta {
        partial_json: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize, Default)]
#[allow(clippy::struct_field_names)]
struct WireUsage {
    #[serde(default)]
    input_tokens: u32,
    #[serde(default)]
    output_tokens: u32,
    #[serde(default)]
    cache_read_input_tokens: u32,
    #[serde(default)]
    cache_creation_input_tokens: u32,
}

#[derive(Deserialize)]
struct WireError {
    #[serde(default)]
    message: String,
}

pub(crate) fn decode(data: &str) -> Result<Vec<ModelChunk>, AgentError> {
    let event: Event =
        serde_json::from_str(data).map_err(|err| AgentError::Stream(err.to_string()))?;
    Ok(match event {
        Event::MessageStart { message } => message
            .usage
            .map(|usage| {
                ModelChunk::Usage(Usage {
                    input_tokens: usage.input_tokens
                        + usage.cache_read_input_tokens
                        + usage.cache_creation_input_tokens,
                    output_tokens: 0,
                    cached_tokens: usage.cache_read_input_tokens,
                })
            })
            .into_iter()
            .collect(),
        Event::ContentBlockStart {
            index,
            content_block: Block::ToolUse { id, name },
        } => vec![ModelChunk::ToolCallDelta {
            index,
            id: Some(id),
            name: Some(name),
            arguments: String::new(),
        }],
        Event::ContentBlockDelta { index, delta } => match delta {
            BlockDelta::TextDelta { text } if !text.is_empty() => vec![ModelChunk::Text(text)],
            BlockDelta::ThinkingDelta { thinking } if !thinking.is_empty() => {
                vec![ModelChunk::Reasoning(thinking)]
            }
            BlockDelta::InputJsonDelta { partial_json } => vec![ModelChunk::ToolCallDelta {
                index,
                id: None,
                name: None,
                arguments: partial_json,
            }],
            _ => Vec::new(),
        },
        Event::MessageDelta { usage: Some(usage) } => vec![ModelChunk::Usage(Usage {
            input_tokens: 0,
            output_tokens: usage.output_tokens,
            cached_tokens: 0,
        })],
        Event::Error { error } => return Err(AgentError::Stream(error.message)),
        _ => Vec::new(),
    })
}

impl ModelProvider for Anthropic {
    fn stream(&self, request: ChatRequest) -> ModelStream {
        let (system, messages) = wire(&request);
        let mut body = json!({
            "model": request.model.as_deref().unwrap_or(&self.config.model),
            "max_tokens": MAX_TOKENS,
            "messages": messages,
            "stream": true,
        });
        if !system.is_empty() {
            body["system"] = json!(system);
        }
        if !request.tools.is_empty() {
            body["tools"] = request.tools.iter().map(tool).collect();
        }
        let send = self.post(&body).send();
        stream::once(async move {
            let response = ensure_success(send.await?).await?;
            Ok::<_, AgentError>(
                response
                    .bytes_stream()
                    .eventsource()
                    .map_err(|err| AgentError::Stream(err.to_string()))
                    .and_then(|event| async move { decode(&event.data) })
                    .map_ok(|chunks| stream::iter(chunks.into_iter().map(Ok)))
                    .try_flatten(),
            )
        })
        .try_flatten()
        .boxed()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ToolCall;

    #[test]
    fn converts_history_into_messages() {
        let request = ChatRequest {
            messages: vec![
                ChatMessage::new(ChatRole::System, "你是小伴"),
                ChatMessage::new(ChatRole::User, "记一下")
                    .with_images(vec!["data:image/png;base64,AAA".into()]),
                ChatMessage::assistant_calls(
                    "",
                    vec![ToolCall::function(
                        "c1",
                        "remember",
                        r#"{"subject":"称呼"}"#,
                    )],
                ),
                ChatMessage::tool_result("c1", "ok"),
                ChatMessage::new(ChatRole::User, "好"),
            ],
            tools: Vec::new(),
            model: None,
            thinking: None,
            effort: None,
        };
        let (system, messages) = wire(&request);
        assert_eq!(system, "你是小伴");
        assert_eq!(messages.len(), 3);
        assert_eq!(
            messages[0]["content"][0]["source"]["media_type"],
            "image/png"
        );
        assert_eq!(messages[0]["content"][1]["text"], "记一下");
        assert_eq!(messages[1]["content"][0]["type"], "tool_use");
        assert_eq!(messages[1]["content"][0]["input"]["subject"], "称呼");
        assert_eq!(messages[2]["content"][0]["type"], "tool_result");
        assert_eq!(messages[2]["content"][1]["text"], "好");
    }

    #[test]
    fn decodes_stream_events() {
        assert_eq!(
            decode(r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}"#)
                .unwrap(),
            vec![ModelChunk::Text("你好".into())]
        );
        assert_eq!(
            decode(r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"t1","name":"remember","input":{}}}"#)
                .unwrap(),
            vec![ModelChunk::ToolCallDelta {
                index: 1,
                id: Some("t1".into()),
                name: Some("remember".into()),
                arguments: String::new()
            }]
        );
        assert_eq!(
            decode(r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"a\""}}"#)
                .unwrap(),
            vec![ModelChunk::ToolCallDelta {
                index: 1,
                id: None,
                name: None,
                arguments: r#"{"a""#.into()
            }]
        );
        assert_eq!(
            decode(r#"{"type":"message_start","message":{"usage":{"input_tokens":10,"cache_read_input_tokens":90,"output_tokens":1}}}"#)
                .unwrap(),
            vec![ModelChunk::Usage(Usage {
                input_tokens: 100,
                output_tokens: 0,
                cached_tokens: 90
            })]
        );
        assert_eq!(decode(r#"{"type":"ping"}"#).unwrap(), Vec::new());
        assert!(
            decode(r#"{"type":"error","error":{"type":"overloaded_error","message":"busy"}}"#)
                .is_err()
        );
    }
}
