use std::net::SocketAddr;
use std::path::PathBuf;

use tauri::State;
use tauri::async_runtime::Mutex;
use xiaoban_agent::{Agent, OpenAiCompatible, OpenAiConfig, UnconfiguredProvider};
use xiaoban_hub::{Hub, HubConfig, HubHandle};

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

fn agent_from_env() -> Agent {
    match std::env::var("XIAOBAN_API_KEY") {
        Ok(api_key) if !api_key.is_empty() => Agent::new(OpenAiCompatible::new(OpenAiConfig {
            base_url: std::env::var("XIAOBAN_MODEL_BASE_URL")
                .unwrap_or_else(|_| "https://api.deepseek.com".into()),
            api_key,
            model: std::env::var("XIAOBAN_MODEL").unwrap_or_else(|_| "deepseek-v4-flash".into()),
        })),
        _ => Agent::new(UnconfiguredProvider),
    }
}

pub async fn start(data_dir: PathBuf) -> anyhow::Result<RunningHub> {
    let config = HubConfig {
        data_dir: Some(data_dir),
        bind: LAN_BIND,
        name: "小伴".into(),
        advertise: true,
    };
    let handle = Hub::start(config, agent_from_env()).await?;
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
