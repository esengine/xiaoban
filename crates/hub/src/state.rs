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
    pub auto_titles: bool,
    pub auto_thinking: bool,
    pub web: Arc<dyn crate::services::Web>,
    pub events: broadcast::Sender<Event>,
    pub pairing: Pairing,
    pub turns: Turns,
    pub active: RwLock<Active>,
    pub code_tools: Vec<ToolSpec>,
    pub git_tools: Vec<ToolSpec>,
    pub running_commands: std::sync::Mutex<std::collections::HashMap<String, tokio_util::sync::CancellationToken>>,
    pub code_reads: std::sync::Mutex<std::collections::HashMap<(String, std::path::PathBuf), String>>,
}

impl HubState {
    pub fn prefix(&self, memory: Option<&str>) -> StablePrefix {
        StablePrefix::compose(&self.prompts.chat, memory, self.tools.clone())
    }

    pub fn prefix_for(
        &self,
        memory: Option<&str>,
        workspace: Option<&xiaoban_protocol::Workspace>,
    ) -> StablePrefix {
        let Some(workspace) = workspace else {
            return self.prefix(memory);
        };
        let system = format!(
            "{}\n\n{}",
            self.prompts.chat,
            self.localizer.format(
                xiaoban_i18n::keys::PROMPT_WORKSPACE,
                &[("name", &workspace.name), ("path", &workspace.path)],
            )
        );
        let mut tools = self.tools.clone();
        tools.extend(self.code_tools.iter().cloned());
        if crate::workspace::git_binary().is_some() {
            tools.extend(self.git_tools.iter().cloned());
        }
        StablePrefix::compose(&system, memory, tools)
    }

    pub fn base_fingerprint_for(&self, workspace: Option<&xiaoban_protocol::Workspace>) -> String {
        self.prefix_for(None, workspace).fingerprint().to_owned()
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
