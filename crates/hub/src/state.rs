use std::sync::{Arc, RwLock};

use tokio::sync::broadcast;
use xiaoban_agent::{Agent, Connector, StablePrefix, ToolSpec};
use xiaoban_i18n::Localizer;
use xiaoban_protocol::{Event, HubInfo, ModelInfo, ThreadKind};
use xiaoban_store::Store;

use crate::auth::Pairing;
use crate::secrets::SecretStore;
use crate::turns::Turns;

pub type SharedState = Arc<HubState>;

#[derive(Debug, Clone)]
pub struct Active {
    pub agent: Agent,
    pub model: Option<ModelInfo>,
}

#[derive(Debug)]
pub struct HubState {
    pub info: HubInfo,
    pub port: u16,
    pub store: Store,
    pub prompts: crate::prompts::Prompts,
    pub tools: Vec<ToolSpec>,
    pub localizer: Localizer,
    pub connector: Arc<dyn Connector>,
    pub secrets: Arc<dyn SecretStore>,
    pub events: broadcast::Sender<Event>,
    pub pairing: Pairing,
    pub turns: Turns,
    pub active: RwLock<Active>,
}

impl HubState {
    pub fn prefix(&self, kind: ThreadKind, memory: Option<&str>) -> StablePrefix {
        StablePrefix::compose(self.prompts.for_kind(kind), memory, self.tools.clone())
    }

    pub fn base_fingerprint(&self, kind: ThreadKind) -> String {
        self.prefix(kind, None).fingerprint().to_owned()
    }

    pub fn publish(&self, event: Event) {
        let _ = self.events.send(event);
    }

    pub fn active(&self) -> Active {
        self.active.read().unwrap().clone()
    }

    pub fn activate(&self, active: Active) {
        let model = active.model.clone();
        *self.active.write().unwrap() = active;
        self.publish(Event::ModelChanged { model });
    }
}
