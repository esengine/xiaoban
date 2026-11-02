use std::net::SocketAddr;
use std::path::PathBuf;

use std::sync::Arc;
use tauri::State;
use tauri::async_runtime::Mutex;

use xiaoban_agent::{HttpConnector, first_configured_from_env};
use xiaoban_hub::{
    DeepseekWeb, Hub, HubConfig, HubHandle, HubRuntime, KEYCHAIN_SERVICE, KeyringSecrets, NoRouter,
    OpenMeteo, Prompts, default_hub_name, system_locale,
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
    operator: Arc<dyn xiaoban_hub::Operator>,
    pages: Arc<dyn xiaoban_hub::Pages>,
) -> anyhow::Result<RunningHub> {
    let locale = system_locale();
    let runtime = HubRuntime {
        locale,
        prompts: Prompts::for_locale(locale),
        connector: Arc::new(HttpConnector),
        secrets: Arc::new(KeyringSecrets::new(KEYCHAIN_SERVICE)),
        locator,
        agenda: Arc::new(xiaoban_hub::NoAgenda),
        presence: Arc::new(crate::presence::SystemPresence),
        weather: Arc::new(OpenMeteo::for_locale(locale)),
        router: Arc::new(NoRouter),
        apps: Arc::new(crate::apps::system()),
        operator,
        pages,
        web: Arc::new(DeepseekWeb::new()),
        mail: Arc::new(xiaoban_hub::ImapMail),
        fallback: first_configured_from_env(),
        auto_titles: true,
        auto_thinking: true,
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
