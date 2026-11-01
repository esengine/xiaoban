mod anthropic;
mod connector;
mod error;
mod openai;
mod prompt;
mod provider;
mod providers;
mod recording;
mod responses;
mod scripted;
mod turn;

pub use anthropic::Anthropic;
pub use connector::{Connector, HttpConnector};
pub use error::AgentError;
pub use openai::{OpenAiCompatible, OpenAiConfig};
pub use prompt::{
    PrefixReuse, StablePrefix, Transcript, assemble, assemble_with, prefix_reuse, user_wire,
};
pub use provider::{
    ChatMessage, ChatRequest, ChatRole, FunctionCall, ModelChunk, ModelProvider, ModelStream,
    ToolCall, ToolSpec,
};
pub use providers::{
    ConfiguredProvider, PRESETS, ProviderPreset, first_configured_from_env, normalize_base_url,
};
pub use recording::RecordingProvider;
pub use responses::Responses;
pub use scripted::{ScriptedProvider, UnconfiguredProvider};
pub use turn::{Agent, NoTools, ToolRunner, TurnEvent, TurnOutcome};
