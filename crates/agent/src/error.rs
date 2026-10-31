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
}

impl AgentError {
    pub fn to_failure(&self) -> Failure {
        let (kind, retryable) = match self {
            Self::Network(_) => (FailureKind::Network, true),
            Self::Status { status, .. } => (FailureKind::Model, *status == 429 || *status >= 500),
            Self::Stream(_) => (FailureKind::Model, true),
            Self::Cancelled => (FailureKind::Cancelled, false),
            Self::NotConfigured => (FailureKind::Model, false),
        };
        Failure {
            kind,
            message: self.to_string(),
            retryable,
        }
    }
}
