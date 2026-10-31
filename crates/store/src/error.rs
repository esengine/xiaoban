#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("background task failed: {0}")]
    Join(#[from] tokio::task::JoinError),
    #[error("database lock poisoned")]
    Poisoned,
    #[error("{0} not found")]
    NotFound(&'static str),
    #[error("corrupt value in column {0}")]
    Corrupt(&'static str),
}

impl From<StoreError> for xiaoban_protocol::ProtocolError {
    fn from(error: StoreError) -> Self {
        use xiaoban_protocol::ErrorCode;
        match error {
            StoreError::NotFound(what) => {
                Self::new(ErrorCode::NotFound, format!("{what} not found"))
            }
            _ => Self::new(ErrorCode::Internal, "storage error"),
        }
    }
}

impl From<StoreError> for xiaoban_protocol::Failure {
    fn from(error: StoreError) -> Self {
        Self {
            kind: xiaoban_protocol::FailureKind::Internal,
            retryable: false,
            detail: error.to_string(),
            alternatives: Vec::new(),
        }
    }
}
