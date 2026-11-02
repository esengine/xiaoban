use std::sync::Arc;

use xiaoban_agent::{ConfiguredProvider, Connector};
use xiaoban_i18n::Locale;

use crate::apps::Apps;
use crate::location::Locator;
use crate::operate::Operator;
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
    pub agenda: Arc<dyn crate::agenda::Agenda>,
    pub presence: Arc<dyn crate::presence::Presence>,
    pub weather: Arc<dyn Weather>,
    pub router: Arc<dyn Router>,
    pub apps: Arc<dyn Apps>,
    pub operator: Arc<dyn Operator>,
    pub web: Arc<dyn Web>,
    pub mail: Arc<dyn crate::mail_imap::MailSource>,
    pub fallback: Option<ConfiguredProvider>,
    pub auto_titles: bool,
    pub auto_thinking: bool,
}
