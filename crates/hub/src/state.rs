use std::sync::{Arc, RwLock};

use tokio::sync::broadcast;
use xiaoban_agent::{Agent, Connector, StablePrefix, ToolSpec};
use xiaoban_i18n::Localizer;
use xiaoban_protocol::{Event, HubInfo, ModelInfo};
use xiaoban_store::Store;

use crate::auth::Pairing;
use crate::secrets::SecretStore;
use crate::turns::Turns;

pub type SharedState = Arc<HubState>;

#[derive(Debug, Clone)]
pub struct Active {
    pub agent: Agent,
    pub model: Option<ModelInfo>,
    pub search_key: Option<String>,
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
    pub locator: Arc<dyn crate::location::Locator>,
    pub weather: Arc<dyn crate::weather::Weather>,
    pub router: Arc<dyn crate::router::Router>,
    pub apps: Arc<dyn crate::apps::Apps>,
    pub operator: Arc<dyn crate::operate::Operator>,
    pub confirms: crate::confirms::Confirms,
    pub pauses: crate::pauses::Pauses,
    pub files: crate::files::Files,
    pub web: Arc<dyn crate::services::Web>,
    pub events: broadcast::Sender<Event>,
    pub pairing: Pairing,
    pub turns: Turns,
    pub active: RwLock<Active>,
}

impl HubState {
    pub fn prefix(&self, memory: Option<&str>) -> StablePrefix {
        StablePrefix::compose(&self.prompts.chat, memory, self.tools.clone())
    }

    pub fn base_fingerprint(&self) -> String {
        self.prefix(None).fingerprint().to_owned()
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
