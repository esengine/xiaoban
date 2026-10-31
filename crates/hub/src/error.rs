use xiaoban_store::StoreError;

#[derive(Debug, thiserror::Error)]
pub enum HubError {
    #[error(transparent)]
    Store(#[from] StoreError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
