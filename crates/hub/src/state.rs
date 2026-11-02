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

pub type Reverted = Option<Vec<u8>>;

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
    pub agenda: Arc<dyn crate::agenda::Agenda>,
    pub presence: Arc<dyn crate::presence::Presence>,
    pub weather: Arc<dyn crate::weather::Weather>,
    pub router: Arc<dyn crate::router::Router>,
    pub apps: Arc<dyn crate::apps::Apps>,
    pub operator: Arc<dyn crate::operate::Operator>,
    pub confirms: crate::confirms::Confirms,
    pub pauses: crate::pauses::Pauses,
    pub schedules: crate::schedules::Runs,
    pub files: crate::files::Files,
    pub auto_titles: bool,
    pub auto_thinking: bool,
    pub web: Arc<dyn crate::services::Web>,
    pub mail: crate::mail::Mail,
    pub events: broadcast::Sender<Event>,
    pub pairing: Pairing,
    pub turns: Turns,
    pub active: RwLock<Active>,
    pub code_tools: Vec<ToolSpec>,
    pub git_tools: Vec<ToolSpec>,
    pub gh_tools: Vec<ToolSpec>,
    pub kitchen_tools: Vec<ToolSpec>,
    pub ledger_tools: Vec<ToolSpec>,
    pub life_tools: Vec<ToolSpec>,
    pub doc_tools: Vec<ToolSpec>,
    pub sheet_tools: Vec<ToolSpec>,
    pub deck_tools: Vec<ToolSpec>,
    pub capabilities: crate::capability::Capabilities,
    pub running_commands: std::sync::Mutex<std::collections::HashMap<String, tokio_util::sync::CancellationToken>>,
    pub github_cache: crate::github::Cache,
    pub reverted: std::sync::Mutex<std::collections::HashMap<(String, String), Reverted>>,
    pub code_reads: std::sync::Mutex<std::collections::HashMap<(String, std::path::PathBuf), String>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Scene {
    Chat,
    Kitchen,
    Ledger,
    Doc,
    Sheet,
    Deck,
}

pub async fn scene_of(state: &SharedState, thread_id: &str) -> Scene {
    if crate::kitchen::is_kitchen(state, thread_id).await {
        Scene::Kitchen
    } else if crate::ledger::is_ledger(state, thread_id).await {
        Scene::Ledger
    } else if crate::doc::is_doc_thread(state, thread_id).await {
        Scene::Doc
    } else if crate::sheet::is_sheet_thread(state, thread_id).await {
        Scene::Sheet
    } else if crate::slides::is_deck_thread(state, thread_id).await {
        Scene::Deck
    } else {
        Scene::Chat
    }
}

impl HubState {
    pub fn prefix_for(
        &self,
        memory: Option<&str>,
        workspace: Option<&xiaoban_protocol::Workspace>,
        scene: Scene,
    ) -> StablePrefix {
        let special = match scene {
            Scene::Kitchen => Some((xiaoban_i18n::keys::PROMPT_KITCHEN, &self.kitchen_tools)),
            Scene::Ledger => Some((xiaoban_i18n::keys::PROMPT_LEDGER, &self.ledger_tools)),
            Scene::Doc => Some((xiaoban_i18n::keys::PROMPT_DOC, &self.doc_tools)),
            Scene::Sheet => Some((xiaoban_i18n::keys::PROMPT_SHEET, &self.sheet_tools)),
            Scene::Deck => Some((xiaoban_i18n::keys::PROMPT_SLIDES, &self.deck_tools)),
            Scene::Chat => None,
        };
        if let Some((prompt, extra)) = special {
            let system = format!("{}\n\n{}", self.prompts.chat, self.localizer.text(prompt));
            let mut tools = self.tools.clone();
            tools.extend(extra.iter().cloned());
            self.capabilities.extend(&mut tools);
            return StablePrefix::compose(&system, memory, tools);
        }
        let Some(workspace) = workspace else {
            let mut tools = self.tools.clone();
            tools.extend(self.life_tools.iter().cloned());
            self.capabilities.extend(&mut tools);
            return StablePrefix::compose(&self.prompts.chat, memory, tools);
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
        if crate::vcs_tools::gh_binary().is_some() {
            tools.extend(self.gh_tools.iter().cloned());
        }
        self.capabilities.extend(&mut tools);
        StablePrefix::compose(&system, memory, tools)
    }

    pub fn base_fingerprint_for(
        &self,
        workspace: Option<&xiaoban_protocol::Workspace>,
        scene: Scene,
    ) -> String {
        self.prefix_for(None, workspace, scene).fingerprint().to_owned()
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
