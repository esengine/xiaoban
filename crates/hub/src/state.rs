use std::sync::Arc;

use tokio::sync::broadcast;
use xiaoban_agent::Agent;
use xiaoban_protocol::{Event, HubInfo, ModelInfo};
use xiaoban_store::Store;

use crate::auth::Pairing;
use crate::turns::Turns;

pub type SharedState = Arc<HubState>;

#[derive(Debug)]
pub struct HubState {
    pub info: HubInfo,
    pub store: Store,
    pub agent: Agent,
    pub model: Option<ModelInfo>,
    pub events: broadcast::Sender<Event>,
    pub pairing: Pairing,
    pub turns: Turns,
}

impl HubState {
    pub fn publish(&self, event: Event) {
        let _ = self.events.send(event);
    }
}
