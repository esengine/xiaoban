use std::sync::Arc;

use xiaoban_agent::{ConfiguredProvider, Connector};
use xiaoban_i18n::Locale;

use crate::prompts::Prompts;
use crate::secrets::SecretStore;

#[derive(Debug, Clone)]
pub struct HubRuntime {
    pub locale: Locale,
    pub prompts: Prompts,
    pub connector: Arc<dyn Connector>,
    pub secrets: Arc<dyn SecretStore>,
    pub fallback: Option<ConfiguredProvider>,
}
