use std::fmt::Debug;

use futures_util::future::BoxFuture;
use xiaoban_protocol::Location;

pub trait Locator: Debug + Send + Sync + 'static {
    fn locate(&self) -> BoxFuture<'static, Location>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoLocator;

impl Locator for NoLocator {
    fn locate(&self) -> BoxFuture<'static, Location> {
        Box::pin(async { Location::Unavailable })
    }
}

#[derive(Debug, Clone)]
pub struct FixedLocator(pub Location);

impl Locator for FixedLocator {
    fn locate(&self) -> BoxFuture<'static, Location> {
        let location = self.0.clone();
        Box::pin(async move { location })
    }
}
