use std::fmt::Debug;

pub trait Presence: Debug + Send + Sync + 'static {
    fn idle_seconds(&self) -> Option<u64>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoPresence;

impl Presence for NoPresence {
    fn idle_seconds(&self) -> Option<u64> {
        None
    }
}
