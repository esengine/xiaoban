use std::sync::Arc;

use xiaoban_agent::{ConfiguredProvider, Connector, StablePrefix};

use crate::secrets::SecretStore;

#[derive(Debug, Clone)]
pub struct HubRuntime {
    pub prefix: StablePrefix,
    pub connector: Arc<dyn Connector>,
    pub secrets: Arc<dyn SecretStore>,
    pub fallback: Option<ConfiguredProvider>,
}
