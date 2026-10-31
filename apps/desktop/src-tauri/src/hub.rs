use std::net::SocketAddr;
use std::path::PathBuf;

use std::sync::Arc;
use tauri::State;
use tauri::async_runtime::Mutex;

use xiaoban_agent::{HttpConnector, first_configured_from_env};
use xiaoban_hub::{
    Hub, HubConfig, HubHandle, HubRuntime, KEYCHAIN_SERVICE, KeyringSecrets, default_hub_name,
    system_locale, system_prompt,
};

const LAN_BIND: SocketAddr =
    SocketAddr::new(std::net::IpAddr::V4(std::net::Ipv4Addr::UNSPECIFIED), 47100);

#[derive(Debug)]
pub struct RunningHub {
    endpoint: String,
    handle: Mutex<Option<HubHandle>>,
}

impl RunningHub {
    pub async fn stop(&self) {
        if let Some(handle) = self.handle.lock().await.take() {
            handle.shutdown().await;
        }
    }
}

pub async fn start(data_dir: PathBuf) -> anyhow::Result<RunningHub> {
    let locale = system_locale();
    let runtime = HubRuntime {
        locale,
        system_prompt: system_prompt(locale),
        connector: Arc::new(HttpConnector),
        secrets: Arc::new(KeyringSecrets::new(KEYCHAIN_SERVICE)),
        fallback: first_configured_from_env(),
    };
    let config = HubConfig {
        data_dir: Some(data_dir),
        bind: LAN_BIND,
        name: default_hub_name(locale),
        advertise: true,
    };
    let handle = Hub::start(config, runtime).await?;
    Ok(RunningHub {
        endpoint: handle.ws_url(),
        handle: Mutex::new(Some(handle)),
    })
}

#[tauri::command]
#[allow(clippy::needless_pass_by_value)]
pub fn hub_endpoint(hub: State<'_, RunningHub>) -> String {
    hub.endpoint.clone()
}
