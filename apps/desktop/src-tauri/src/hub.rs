use std::net::SocketAddr;
use std::path::PathBuf;

use std::sync::Arc;
use tauri::State;
use tauri::async_runtime::Mutex;

use xiaoban_agent::{HttpConnector, first_configured_from_env};
use xiaoban_hub::{
    Hub, HubConfig, HubHandle, HubRuntime, KEYCHAIN_SERVICE, KeyringSecrets, OpenMeteo, Prompts,
    default_hub_name, system_locale,
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

pub async fn start(
    data_dir: PathBuf,
    locator: Arc<dyn xiaoban_hub::Locator>,
) -> anyhow::Result<RunningHub> {
    let locale = system_locale();
    let runtime = HubRuntime {
        locale,
        prompts: Prompts::for_locale(locale),
        connector: Arc::new(HttpConnector),
        secrets: Arc::new(KeyringSecrets::new(KEYCHAIN_SERVICE)),
        locator,
        weather: Arc::new(OpenMeteo::for_locale(locale)),
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
