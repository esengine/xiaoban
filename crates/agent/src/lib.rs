mod error;
mod openai;
mod prompt;
mod provider;
mod providers;
mod recording;
mod scripted;
mod turn;

pub use error::AgentError;
pub use openai::{OpenAiCompatible, OpenAiConfig};
pub use prompt::{PrefixReuse, StablePrefix, Transcript, assemble, prefix_reuse, user_wire};
pub use provider::{ChatMessage, ChatRequest, ChatRole, ModelChunk, ModelProvider, ModelStream};
pub use providers::{ProviderPreset, first_configured_from_env};
pub use recording::RecordingProvider;
pub use scripted::{ScriptedProvider, UnconfiguredProvider};
pub use turn::{Agent, TurnEvent, TurnOutcome};
