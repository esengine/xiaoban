use std::net::SocketAddr;
use std::path::PathBuf;

use tauri::State;
use tauri::async_runtime::Mutex;
use xiaoban_agent::{Agent, OpenAiCompatible, UnconfiguredProvider, first_configured_from_env};
use xiaoban_hub::{Hub, HubConfig, HubHandle, default_hub_name, system_locale, system_prefix};

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

fn agent(prefix: xiaoban_agent::StablePrefix) -> Agent {
    match first_configured_from_env() {
        Some((_, config)) => Agent::new(OpenAiCompatible::new(config), prefix),
        None => Agent::new(UnconfiguredProvider, prefix),
    }
}

pub async fn start(data_dir: PathBuf) -> anyhow::Result<RunningHub> {
    let locale = system_locale();
    let config = HubConfig {
        data_dir: Some(data_dir),
        bind: LAN_BIND,
        name: default_hub_name(locale),
        advertise: true,
    };
    let handle = Hub::start(config, agent(system_prefix(locale))).await?;
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
