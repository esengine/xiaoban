use std::net::SocketAddr;
use std::path::PathBuf;

use xiaoban_protocol::ModelInfo;

#[derive(Debug, Clone)]
pub struct HubConfig {
    pub data_dir: Option<PathBuf>,
    pub bind: SocketAddr,
    pub name: String,
    pub advertise: bool,
    pub model: Option<ModelInfo>,
}

impl HubConfig {
    pub fn ephemeral() -> Self {
        Self {
            data_dir: None,
            bind: SocketAddr::from(([127, 0, 0, 1], 0)),
            name: "test".into(),
            advertise: false,
            model: None,
        }
    }
}
