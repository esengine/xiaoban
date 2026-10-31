use std::sync::Arc;

use xiaoban_agent::{ConfiguredProvider, Connector};
use xiaoban_i18n::Locale;

use crate::apps::Apps;
use crate::location::Locator;
use crate::prompts::Prompts;
use crate::router::Router;
use crate::secrets::SecretStore;
use crate::services::Web;
use crate::weather::Weather;

#[derive(Debug, Clone)]
pub struct HubRuntime {
    pub locale: Locale,
    pub prompts: Prompts,
    pub connector: Arc<dyn Connector>,
    pub secrets: Arc<dyn SecretStore>,
    pub locator: Arc<dyn Locator>,
    pub weather: Arc<dyn Weather>,
    pub router: Arc<dyn Router>,
    pub apps: Arc<dyn Apps>,
    pub web: Arc<dyn Web>,
    pub fallback: Option<ConfiguredProvider>,
}
