use std::collections::HashMap;
use std::sync::Arc;

use futures_util::StreamExt;
use futures_util::future::BoxFuture;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::Usage;

use crate::prompt::{StablePrefix, Transcript, assemble_with};
use crate::{AgentError, ChatMessage, ChatRole, ModelChunk, ModelProvider, ToolCall};

const REPEAT_LIMIT: u32 = 2;
const REPEATED: &str = r#"{"error":"you already ran this exact call twice in this turn; stop repeating it and answer with what you have"}"#;

fn canonical(arguments: &str) -> String {
    serde_json::from_str::<serde_json::Value>(arguments)
        .map_or_else(|_| arguments.trim().to_owned(), |value| value.to_string())
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TurnEvent {
    Thinking,
    TextDelta(String),
    ToolUsed(ToolCall),
    ToolFinished { call: ToolCall, result: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnOutcome {
    pub text: String,
    pub usage: Usage,
    pub messages: Vec<ChatMessage>,
}

pub trait ToolRunner: Send + Sync {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String>;

    fn reusable(&self, _name: &str) -> bool {
        true
    }

    fn notes(&self) -> Vec<String> {
        Vec::new()
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoTools;

impl ToolRunner for NoTools {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        let message = format!("unknown tool {}", call.function.name);
        Box::pin(async move { message })
    }
}

#[derive(Clone)]
pub struct Agent {
    provider: Arc<dyn ModelProvider>,
}

impl std::fmt::Debug for Agent {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Agent").finish_non_exhaustive()
    }
}

#[derive(Default)]
struct Step {
    text: String,
    calls: Vec<(String, String, String)>,
}

impl Step {
    fn absorb(&mut self, index: usize, id: Option<String>, name: Option<String>, arguments: &str) {
        if self.calls.len() <= index {
            self.calls.resize_with(index + 1, Default::default);
        }
        let call = &mut self.calls[index];
        if let Some(id) = id {
            call.0 = id;
        }
        if let Some(name) = name {
            call.1.push_str(&name);
        }
        call.2.push_str(arguments);
    }

    fn into_message(self) -> (ChatMessage, Vec<ToolCall>) {
        let calls: Vec<ToolCall> = self
            .calls
            .into_iter()
            .filter(|(_, name, _)| !name.is_empty())
            .map(|(id, name, arguments)| ToolCall::function(id, name, arguments))
            .collect();
        let message = if calls.is_empty() {
            ChatMessage::new(ChatRole::Assistant, self.text)
        } else {
            ChatMessage::assistant_calls(self.text, calls.clone())
        };
        (message, calls)
    }
}

fn add_usage(total: &mut Usage, step: Usage) {
    total.input_tokens += step.input_tokens;
    total.output_tokens += step.output_tokens;
    total.cached_tokens += step.cached_tokens;
}

impl Agent {
    pub fn new(provider: impl ModelProvider) -> Self {
        Self::from_shared(Arc::new(provider))
    }

    pub fn from_shared(provider: Arc<dyn ModelProvider>) -> Self {
        Self { provider }
    }

    pub async fn run_turn(
        &self,
        prefix: &StablePrefix,
        transcript: &Transcript,
        user_wire: &str,
        tools: &dyn ToolRunner,
        events: mpsc::Sender<TurnEvent>,
        cancel: CancellationToken,
    ) -> Result<TurnOutcome, AgentError> {
        self.run_turn_with(
            prefix,
            transcript,
            ChatMessage::new(ChatRole::User, user_wire),
            None,
            tools,
            events,
            cancel,
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn run_turn_with(
        &self,
        prefix: &StablePrefix,
        transcript: &Transcript,
        first: ChatMessage,
        model: Option<String>,
        tools: &dyn ToolRunner,
        events: mpsc::Sender<TurnEvent>,
        cancel: CancellationToken,
    ) -> Result<TurnOutcome, AgentError> {
        let _ = events.send(TurnEvent::Thinking).await;
        let mut tail = vec![first];
        let mut usage = Usage::default();

        let mut seen: HashMap<(String, String), (String, u32)> = HashMap::new();
        loop {
            let step = self
                .stream_step(
                    prefix,
                    transcript,
                    &tail,
                    model.as_deref(),
                    &events,
                    &cancel,
                    &mut usage,
                )
                .await?;
            let (message, calls) = step.into_message();
            let text = message.content.clone();
            tail.push(message);
            let notes = tools.notes();
            if calls.is_empty() && notes.is_empty() {
                return Ok(TurnOutcome {
                    text,
                    usage,
                    messages: tail.split_off(1),
                });
            }
            for call in &calls {
                if cancel.is_cancelled() {
                    return Err(AgentError::Cancelled);
                }
                let _ = events.send(TurnEvent::ToolUsed(call.clone())).await;
                let key = (
                    call.function.name.clone(),
                    canonical(&call.function.arguments),
                );
                let result = match seen
                    .get_mut(&key)
                    .filter(|_| tools.reusable(&call.function.name))
                {
                    Some((_, count)) if *count >= REPEAT_LIMIT => REPEATED.to_owned(),
                    Some((cached, count)) => {
                        *count += 1;
                        cached.clone()
                    }
                    None => {
                        let result = tools.run(call).await;
                        seen.insert(key, (result.clone(), 1));
                        result
                    }
                };
                let _ = events
                    .send(TurnEvent::ToolFinished {
                        call: call.clone(),
                        result: result.clone(),
                    })
                    .await;
                tail.push(ChatMessage::tool_result(call.id.clone(), result));
            }
            let notes = [notes, tools.notes()].concat();
            if !notes.is_empty() {
                tail.push(ChatMessage::new(ChatRole::User, notes.join("\n")));
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn stream_step(
        &self,
        prefix: &StablePrefix,
        transcript: &Transcript,
        tail: &[ChatMessage],
        model: Option<&str>,
        events: &mpsc::Sender<TurnEvent>,
        cancel: &CancellationToken,
        usage: &mut Usage,
    ) -> Result<Step, AgentError> {
        let mut request = assemble_with(prefix, transcript, tail);
        request.model = model.map(str::to_owned);
        let mut stream = self.provider.stream(request);
        let mut step = Step::default();
        loop {
            let chunk = tokio::select! {
                () = cancel.cancelled() => return Err(AgentError::Cancelled),
                chunk = stream.next() => chunk,
            };
            match chunk.transpose()? {
                None => return Ok(step),
                Some(ModelChunk::Text(delta)) => {
                    step.text.push_str(&delta);
                    let _ = events.send(TurnEvent::TextDelta(delta)).await;
                }
                Some(ModelChunk::ToolCallDelta {
                    index,
                    id,
                    name,
                    arguments,
                }) => step.absorb(index, id, name, &arguments),
                Some(ModelChunk::Usage(step_usage)) => add_usage(usage, step_usage),
            }
        }
    }
}
