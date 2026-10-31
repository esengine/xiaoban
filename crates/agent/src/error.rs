use xiaoban_protocol::{Failure, FailureKind};

#[derive(Debug, thiserror::Error)]
pub enum AgentError {
    #[error("model request failed: {0}")]
    Network(#[from] reqwest::Error),
    #[error("model returned status {status}: {body}")]
    Status { status: u16, body: String },
    #[error("malformed model stream: {0}")]
    Stream(String),
    #[error("turn cancelled")]
    Cancelled,
    #[error("no model is connected yet")]
    NotConfigured,
    #[error("the provider rejected the API key")]
    InvalidKey,
    #[error("the provider does not serve model {0}")]
    UnknownModel(String),
    #[error("not a usable http(s) endpoint: {0}")]
    InvalidEndpoint(String),
}

impl AgentError {
    pub fn to_failure(&self) -> Failure {
        let (kind, retryable) = match self {
            Self::Network(_) => (FailureKind::Network, true),
            Self::Status { status, .. } => (FailureKind::Model, *status == 429 || *status >= 500),
            Self::Stream(_) => (FailureKind::Model, true),
            Self::Cancelled => (FailureKind::Cancelled, false),
            Self::NotConfigured => (FailureKind::NotConfigured, false),
            Self::InvalidKey => (FailureKind::InvalidKey, false),
            Self::UnknownModel(_) => (FailureKind::UnknownModel, false),
            Self::InvalidEndpoint(_) => (FailureKind::InvalidEndpoint, false),
        };
        Failure {
            kind,
            retryable,
            detail: self.to_string(),
        }
    }
}
