use std::fmt::Debug;

use futures_util::future::BoxFuture;
use xiaoban_protocol::{Coord, TripLeg};

pub trait Router: Debug + Send + Sync + 'static {
    fn locate(&self, city: String, name: String) -> BoxFuture<'static, Option<Coord>>;
    fn leg(&self, from: Coord, to: Coord) -> BoxFuture<'static, Option<TripLeg>>;
}

#[derive(Debug, Clone, Copy, Default)]
pub struct NoRouter;

impl Router for NoRouter {
    fn locate(&self, _: String, _: String) -> BoxFuture<'static, Option<Coord>> {
        Box::pin(async { None })
    }

    fn leg(&self, _: Coord, _: Coord) -> BoxFuture<'static, Option<TripLeg>> {
        Box::pin(async { None })
    }
}
