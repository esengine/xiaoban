use std::sync::Arc;

use xiaoban_agent::{ConfiguredProvider, Connector};
use xiaoban_i18n::Locale;

use crate::secrets::SecretStore;

#[derive(Debug, Clone)]
pub struct HubRuntime {
    pub locale: Locale,
    pub system_prompt: String,
    pub connector: Arc<dyn Connector>,
    pub secrets: Arc<dyn SecretStore>,
    pub fallback: Option<ConfiguredProvider>,
}
