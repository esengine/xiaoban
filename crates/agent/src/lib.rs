mod error;
mod openai;
mod prompt;
mod provider;
mod recording;
mod scripted;
mod turn;

pub use error::AgentError;
pub use openai::{OpenAiCompatible, OpenAiConfig};
pub use prompt::{
    DEFAULT_SYSTEM_PROMPT, PrefixReuse, StablePrefix, Transcript, assemble, prefix_reuse, user_wire,
};
pub use provider::{ChatMessage, ChatRequest, ChatRole, ModelChunk, ModelProvider, ModelStream};
pub use recording::RecordingProvider;
pub use scripted::{ScriptedProvider, UnconfiguredProvider};
pub use turn::{Agent, TurnEvent, TurnOutcome};
