use eventsource_stream::Eventsource;
use futures_util::{StreamExt, TryStreamExt, stream};
use serde::Deserialize;
use serde_json::json;
use xiaoban_protocol::Usage;

use crate::{AgentError, ChatRequest, ModelChunk, ModelProvider, ModelStream, ToolSpec};

#[derive(Debug, Clone)]
pub struct OpenAiConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
}

#[derive(Debug, Clone)]
pub struct OpenAiCompatible {
    client: reqwest::Client,
    config: OpenAiConfig,
}

impl OpenAiCompatible {
    pub fn new(config: OpenAiConfig) -> Self {
        Self {
            client: reqwest::Client::new(),
            config,
        }
    }

    fn url(&self, path: &str) -> String {
        format!("{}/{path}", self.config.base_url.trim_end_matches('/'))
    }

    fn endpoint(&self) -> String {
        self.url("chat/completions")
    }

    pub async fn check(&self, verify_model: bool) -> Result<(), AgentError> {
        let response = self
            .client
            .get(self.url("models"))
            .bearer_auth(&self.config.api_key)
            .send()
            .await?;
        let status = response.status();
        if status == reqwest::StatusCode::NOT_FOUND
            || status == reqwest::StatusCode::METHOD_NOT_ALLOWED
        {
            return self.probe().await;
        }
        let response = ensure_success(response).await?;
        if !verify_model {
            return Ok(());
        }
        let listed = response
            .json::<ModelList>()
            .await
            .map(|list| {
                list.data
                    .into_iter()
                    .map(|model| model.id)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if listed.is_empty() || listed.contains(&self.config.model) {
            Ok(())
        } else {
            Err(AgentError::UnknownModel {
                model: self.config.model.clone(),
                available: listed,
            })
        }
    }

    async fn probe(&self) -> Result<(), AgentError> {
        let response = self
            .client
            .post(self.endpoint())
            .bearer_auth(&self.config.api_key)
            .json(&json!({
                "model": self.config.model,
                "messages": [{ "role": "user", "content": "ping" }],
                "max_tokens": 1,
                "stream": false,
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

#[derive(Deserialize)]
struct ModelList {
    #[serde(default)]
    data: Vec<ListedModel>,
}

#[derive(Deserialize)]
struct ListedModel {
    id: String,
}

#[derive(Deserialize)]
struct StreamChunk {
    #[serde(default)]
    choices: Vec<Choice>,
    usage: Option<WireUsage>,
}

#[derive(Deserialize)]
struct Choice {
    delta: Delta,
}

#[derive(Deserialize)]
struct Delta {
    content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<DeltaToolCall>,
}

#[derive(Deserialize)]
struct DeltaToolCall {
    index: usize,
    id: Option<String>,
    function: Option<DeltaFunction>,
}

#[derive(Deserialize)]
struct DeltaFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Deserialize)]
#[allow(clippy::struct_field_names)]
struct WireUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    #[serde(default)]
    prompt_cache_hit_tokens: u32,
    #[serde(default)]
    prompt_tokens_details: Option<PromptDetails>,
}

#[derive(Deserialize)]
struct PromptDetails {
    #[serde(default)]
    cached_tokens: u32,
}

impl WireUsage {
    fn cached(&self) -> u32 {
        let detailed = self
            .prompt_tokens_details
            .as_ref()
            .map_or(0, |details| details.cached_tokens);
        self.prompt_cache_hit_tokens.max(detailed)
    }
}

fn decode(data: &str) -> Result<Vec<ModelChunk>, AgentError> {
    if data == "[DONE]" {
        return Ok(Vec::new());
    }
    let chunk: StreamChunk =
        serde_json::from_str(data).map_err(|err| AgentError::Stream(err.to_string()))?;
    let mut chunks = Vec::new();
    for choice in chunk.choices {
        if let Some(content) = choice.delta.content.filter(|content| !content.is_empty()) {
            chunks.push(ModelChunk::Text(content));
        }
        for call in choice.delta.tool_calls {
            let (name, arguments) = call
                .function
                .map_or((None, None), |function| (function.name, function.arguments));
            chunks.push(ModelChunk::ToolCallDelta {
                index: call.index,
                id: call.id,
                name,
                arguments: arguments.unwrap_or_default(),
            });
        }
    }
    let usage = chunk.usage.map(|usage| {
        ModelChunk::Usage(Usage {
            input_tokens: usage.prompt_tokens,
            output_tokens: usage.completion_tokens,
            cached_tokens: usage.cached(),
        })
    });
    chunks.extend(usage);
    Ok(chunks)
}

impl ModelProvider for OpenAiCompatible {
    fn stream(&self, request: ChatRequest) -> ModelStream {
        let mut body = json!({
            "model": self.config.model,
            "messages": request.messages,
            "stream": true,
            "stream_options": { "include_usage": true },
        });
        if !request.tools.is_empty() {
            body["tools"] = request.tools.iter().map(ToolSpec::wire).collect();
        }
        let send = self
            .client
            .post(self.endpoint())
            .bearer_auth(&self.config.api_key)
            .json(&body)
            .send();

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

    #[test]
    fn decodes_streamed_tool_calls() {
        let chunks = decode(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","type":"function","function":{"name":"remember","arguments":"{\"sub"}}]}}]}"#,
        )
        .unwrap();
        assert_eq!(
            chunks,
            vec![ModelChunk::ToolCallDelta {
                index: 0,
                id: Some("c1".into()),
                name: Some("remember".into()),
                arguments: r#"{"sub"#.into()
            }]
        );
    }

    #[test]
    fn decodes_text_and_usage() {
        let chunks = decode(r#"{"choices":[{"delta":{"content":"你好"}}]}"#).unwrap();
        assert_eq!(chunks, vec![ModelChunk::Text("你好".into())]);

        let chunks = decode(
            r#"{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":3,"prompt_cache_hit_tokens":8}}"#,
        )
        .unwrap();
        assert_eq!(
            chunks,
            vec![ModelChunk::Usage(Usage {
                input_tokens: 10,
                output_tokens: 3,
                cached_tokens: 8
            })]
        );
        assert_eq!(decode("[DONE]").unwrap(), Vec::new());

        let chunks = decode(
            r#"{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":1,"prompt_tokens_details":{"cached_tokens":6}}}"#,
        )
        .unwrap();
        assert_eq!(
            chunks,
            vec![ModelChunk::Usage(Usage {
                input_tokens: 10,
                output_tokens: 1,
                cached_tokens: 6
            })]
        );
    }
}
