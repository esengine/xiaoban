use std::sync::Arc;

use xiaoban_agent::{ConfiguredProvider, Connector};
use xiaoban_i18n::Locale;

use crate::amap::Maps;
use crate::location::Locator;
use crate::prompts::Prompts;
use crate::secrets::SecretStore;
use crate::services::Search;
use crate::weather::Weather;

#[derive(Debug, Clone)]
pub struct HubRuntime {
    pub locale: Locale,
    pub prompts: Prompts,
    pub connector: Arc<dyn Connector>,
    pub secrets: Arc<dyn SecretStore>,
    pub locator: Arc<dyn Locator>,
    pub weather: Arc<dyn Weather>,
    pub maps: Arc<dyn Maps>,
    pub search: Arc<dyn Search>,
    pub fallback: Option<ConfiguredProvider>,
}
