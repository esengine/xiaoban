use eventsource_stream::Eventsource;
use futures_util::{StreamExt, TryStreamExt, stream};
use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_protocol::Usage;

use crate::{
    AgentError, ChatMessage, ChatRequest, ChatRole, ModelChunk, ModelProvider, ModelStream,
    OpenAiConfig, ToolSpec,
};

const PROBE_TOKENS: u32 = 16;

#[derive(Debug, Clone)]
pub struct Responses {
    client: reqwest::Client,
    config: OpenAiConfig,
}

impl Responses {
    pub fn new(config: OpenAiConfig) -> Self {
        Self {
            client: crate::http_client(),
            config,
        }
    }

    fn endpoint(&self) -> String {
        format!("{}/responses", self.config.base_url.trim_end_matches('/'))
    }

    fn post(&self, body: &Value) -> reqwest::RequestBuilder {
        self.client
            .post(self.endpoint())
            .bearer_auth(&self.config.api_key)
            .json(body)
    }

    pub async fn check(&self) -> Result<(), AgentError> {
        let response = self
            .post(&json!({
                "model": self.config.model,
                "input": "ping",
                "max_output_tokens": PROBE_TOKENS,
                "store": false,
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

fn user_item(message: &ChatMessage) -> Value {
    let mut content = vec![json!({ "type": "input_text", "text": message.content })];
    content.extend(
        message
            .images
            .iter()
            .map(|url| json!({ "type": "input_image", "image_url": url })),
    );
    json!({ "role": "user", "content": content })
}

pub(crate) fn wire(request: &ChatRequest) -> (String, Vec<Value>) {
    let mut instructions = Vec::new();
    let mut input = Vec::new();
    for message in &request.messages {
        match message.role {
            ChatRole::System => instructions.push(message.content.clone()),
            ChatRole::User => input.push(user_item(message)),
            ChatRole::Assistant => {
                if !message.content.is_empty() {
                    input.push(json!({
                        "role": "assistant",
                        "content": [{ "type": "output_text", "text": message.content }],
                    }));
                }
                input.extend(message.tool_calls.iter().map(|call| {
                    json!({
                        "type": "function_call",
                        "call_id": call.id,
                        "name": call.function.name,
                        "arguments": call.function.arguments,
                    })
                }));
            }
            ChatRole::Tool => input.push(json!({
                "type": "function_call_output",
                "call_id": message.tool_call_id.clone().unwrap_or_default(),
                "output": message.content,
            })),
        }
    }
    (instructions.join("\n\n"), input)
}

fn tool(spec: &ToolSpec) -> Value {
    json!({
        "type": "function",
        "name": spec.name,
        "description": spec.description,
        "parameters": spec.parameters,
    })
}

#[derive(Deserialize)]
#[serde(tag = "type")]
enum Event {
    #[serde(rename = "response.output_text.delta")]
    Text { delta: String },
    #[serde(
        rename = "response.reasoning_summary_text.delta",
        alias = "response.reasoning_text.delta"
    )]
    Reasoning { delta: String },
    #[serde(rename = "response.output_item.added")]
    ItemAdded { output_index: usize, item: Item },
    #[serde(rename = "response.function_call_arguments.delta")]
    Arguments { output_index: usize, delta: String },
    #[serde(rename = "response.completed", alias = "response.incomplete")]
    Completed { response: Finished },
    #[serde(rename = "response.failed")]
    Failed { response: Finished },
    #[serde(rename = "error")]
    Error {
        #[serde(default)]
        message: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum Item {
    FunctionCall {
        call_id: String,
        name: String,
        #[serde(default)]
        arguments: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Deserialize)]
struct Finished {
    #[serde(default)]
    usage: Option<WireUsage>,
    #[serde(default)]
    error: Option<WireError>,
}

#[derive(Deserialize)]
struct WireUsage {
    #[serde(default)]
    input_tokens: u32,
    #[serde(default)]
    output_tokens: u32,
    #[serde(default)]
    input_tokens_details: Option<Details>,
}

#[derive(Deserialize)]
struct Details {
    #[serde(default)]
    cached_tokens: u32,
}

#[derive(Deserialize)]
struct WireError {
    #[serde(default)]
    message: String,
}

pub(crate) fn decode(data: &str) -> Result<Vec<ModelChunk>, AgentError> {
    if data == "[DONE]" {
        return Ok(Vec::new());
    }
    let event: Event =
        serde_json::from_str(data).map_err(|err| AgentError::Stream(err.to_string()))?;
    Ok(match event {
        Event::Text { delta } if !delta.is_empty() => vec![ModelChunk::Text(delta)],
        Event::Reasoning { delta } if !delta.is_empty() => vec![ModelChunk::Reasoning(delta)],
        Event::ItemAdded {
            output_index,
            item:
                Item::FunctionCall {
                    call_id,
                    name,
                    arguments,
                },
        } => vec![ModelChunk::ToolCallDelta {
            index: output_index,
            id: Some(call_id),
            name: Some(name),
            arguments,
        }],
        Event::Arguments {
            output_index,
            delta,
        } => vec![ModelChunk::ToolCallDelta {
            index: output_index,
            id: None,
            name: None,
            arguments: delta,
        }],
        Event::Completed { response } => response
            .usage
            .map(|usage| {
                ModelChunk::Usage(Usage {
                    input_tokens: usage.input_tokens,
                    output_tokens: usage.output_tokens,
                    cached_tokens: usage
                        .input_tokens_details
                        .map_or(0, |details| details.cached_tokens),
                })
            })
            .into_iter()
            .collect(),
        Event::Failed { response } => {
            return Err(AgentError::Stream(
                response
                    .error
                    .map(|error| error.message)
                    .unwrap_or_default(),
            ));
        }
        Event::Error { message } => return Err(AgentError::Stream(message)),
        _ => Vec::new(),
    })
}

impl ModelProvider for Responses {
    fn stream(&self, request: ChatRequest) -> ModelStream {
        let (instructions, input) = wire(&request);
        let mut body = json!({
            "model": request.model.as_deref().unwrap_or(&self.config.model),
            "input": input,
            "stream": true,
            "store": false,
        });
        if !instructions.is_empty() {
            body["instructions"] = json!(instructions);
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
    fn converts_history_into_input_items() {
        let request = ChatRequest {
            messages: vec![
                ChatMessage::new(ChatRole::System, "你是小伴"),
                ChatMessage::new(ChatRole::User, "记一下")
                    .with_images(vec!["data:image/png;base64,AAA".into()]),
                ChatMessage::assistant_calls(
                    "好",
                    vec![ToolCall::function(
                        "c1",
                        "remember",
                        r#"{"subject":"称呼"}"#,
                    )],
                ),
                ChatMessage::tool_result("c1", "ok"),
            ],
            tools: Vec::new(),
            model: None,
            thinking: None,
            effort: None,
        };
        let (instructions, input) = wire(&request);
        assert_eq!(instructions, "你是小伴");
        assert_eq!(input.len(), 4);
        assert_eq!(input[0]["content"][1]["type"], "input_image");
        assert_eq!(input[1]["content"][0]["type"], "output_text");
        assert_eq!(input[2]["type"], "function_call");
        assert_eq!(input[2]["call_id"], "c1");
        assert_eq!(input[3]["type"], "function_call_output");
    }

    #[test]
    fn decodes_stream_events() {
        assert_eq!(
            decode(r#"{"type":"response.output_text.delta","item_id":"m","output_index":0,"delta":"你好"}"#).unwrap(),
            vec![ModelChunk::Text("你好".into())]
        );
        assert_eq!(
            decode(r#"{"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc","call_id":"c1","name":"remember","arguments":""}}"#).unwrap(),
            vec![ModelChunk::ToolCallDelta {
                index: 1,
                id: Some("c1".into()),
                name: Some("remember".into()),
                arguments: String::new()
            }]
        );
        assert_eq!(
            decode(r#"{"type":"response.function_call_arguments.delta","output_index":1,"item_id":"fc","delta":"{\"a\""}"#).unwrap(),
            vec![ModelChunk::ToolCallDelta {
                index: 1,
                id: None,
                name: None,
                arguments: r#"{"a""#.into()
            }]
        );
        assert_eq!(
            decode(r#"{"type":"response.completed","response":{"usage":{"input_tokens":100,"output_tokens":5,"input_tokens_details":{"cached_tokens":80}}}}"#).unwrap(),
            vec![ModelChunk::Usage(Usage {
                input_tokens: 100,
                output_tokens: 5,
                cached_tokens: 80
            })]
        );
        assert_eq!(
            decode(r#"{"type":"response.created","response":{}}"#).unwrap(),
            Vec::new()
        );
        assert!(
            decode(r#"{"type":"response.failed","response":{"error":{"message":"nope"}}}"#)
                .is_err()
        );
    }
}
