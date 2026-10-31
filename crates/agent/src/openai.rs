use eventsource_stream::Eventsource;
use futures_util::{StreamExt, TryStreamExt, stream};
use serde::Deserialize;
use serde_json::json;
use xiaoban_protocol::Usage;

use crate::{AgentError, ChatRequest, ModelChunk, ModelProvider, ModelStream};

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

    pub async fn check(&self) -> Result<(), AgentError> {
        let response = self
            .client
            .get(self.url("models"))
            .bearer_auth(&self.config.api_key)
            .send()
            .await?;
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
    let text = chunk
        .choices
        .into_iter()
        .filter_map(|choice| choice.delta.content)
        .filter(|content| !content.is_empty())
        .map(ModelChunk::Text);
    let usage = chunk.usage.map(|usage| {
        ModelChunk::Usage(Usage {
            input_tokens: usage.prompt_tokens,
            output_tokens: usage.completion_tokens,
            cached_tokens: usage.cached(),
        })
    });
    Ok(text.chain(usage).collect())
}

impl ModelProvider for OpenAiCompatible {
    fn stream(&self, request: ChatRequest) -> ModelStream {
        let body = json!({
            "model": self.config.model,
            "messages": request.messages,
            "stream": true,
            "stream_options": { "include_usage": true },
        });
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
