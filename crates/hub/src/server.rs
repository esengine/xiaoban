use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::extract::{ConnectInfo, State, WebSocketUpgrade};
use axum::response::Response;
use axum::routing::get;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::HubInfo;
use xiaoban_store::Store;

use crate::state::{HubState, SharedState};
use crate::{HubConfig, HubError, HubRuntime, discovery, model, session};

const HUB_ID_KEY: &str = "hub_id";

#[derive(Debug)]
pub struct Hub;

#[derive(Debug)]
pub struct HubHandle {
    pub addr: SocketAddr,
    pub info: HubInfo,
    shutdown: CancellationToken,
    task: tokio::task::JoinHandle<()>,
}

impl HubHandle {
    pub fn ws_url(&self) -> String {
        let host = if self.addr.ip().is_unspecified() {
            "127.0.0.1".to_owned()
        } else {
            self.addr.ip().to_string()
        };
        format!("ws://{host}:{}/ws", self.addr.port())
    }

    pub async fn shutdown(self) {
        self.shutdown.cancel();
        let _ = self.task.await;
    }
}

impl Hub {
    pub async fn start(config: HubConfig, runtime: HubRuntime) -> Result<HubHandle, HubError> {
        let store = if let Some(dir) = &config.data_dir {
            std::fs::create_dir_all(dir)?;
            Store::open(&dir.join("xiaoban.db"))?
        } else {
            Store::open_in_memory()?
        };
        let id = if let Some(id) = store.setting(HUB_ID_KEY).await? {
            id
        } else {
            let id = uuid::Uuid::now_v7().to_string();
            store.set_setting(HUB_ID_KEY, id.clone()).await?;
            id
        };
        let info = HubInfo {
            id,
            name: config.name.clone(),
            version: env!("CARGO_PKG_VERSION").to_owned(),
        };
        let listener = TcpListener::bind(config.bind).await?;
        let addr = listener.local_addr()?;
        let restored = model::restore(&store, &runtime.secrets, runtime.fallback.clone())
            .await
            .map_err(|error| HubError::Startup(error.detail))?;
        let active = model::activate(&*runtime.connector, restored);
        let localizer = xiaoban_i18n::Localizer::new(runtime.locale);
        let state: SharedState = Arc::new(HubState {
            info: info.clone(),
            port: addr.port(),
            store,
            tools: crate::tools::specs(&localizer),
            code_tools: crate::code_tools::specs(&localizer),
            git_tools: vec![crate::vcs_tools::git_spec(&localizer)],
            gh_tools: vec![crate::vcs_tools::gh_spec(&localizer)],
            kitchen_tools: crate::kitchen::specs(&localizer),
            ledger_tools: crate::ledger::specs(&localizer),
            code_reads: std::sync::Mutex::default(),
            running_commands: std::sync::Mutex::default(),
            github_cache: crate::github::Cache::default(),
            reverted: std::sync::Mutex::default(),
            prompts: runtime.prompts,
            localizer,
            connector: runtime.connector,
            secrets: runtime.secrets,
            locator: runtime.locator,
            presence: runtime.presence,
            weather: runtime.weather,
            router: runtime.router,
            apps: runtime.apps,
            operator: runtime.operator,
            confirms: crate::confirms::Confirms::default(),
            pauses: crate::pauses::Pauses::default(),
            files: crate::files::Files::new(config.data_dir.as_ref().map_or_else(
                || std::env::temp_dir().join(format!("xiaoban-files-{}", uuid::Uuid::now_v7())),
                |dir| dir.join("files"),
            )),
            web: runtime.web,
            auto_titles: runtime.auto_titles,
            auto_thinking: runtime.auto_thinking,
            active: std::sync::RwLock::new(active),
            events: broadcast::channel(1024).0,
            pairing: crate::auth::Pairing::default(),
            turns: crate::turns::Turns::default(),
        });

        let mdns = config
            .advertise
            .then(|| discovery::advertise(&info, addr.port()))
            .flatten();

        let shutdown = CancellationToken::new();
        crate::tidy::watch(Arc::clone(&state), shutdown.clone());
        crate::week::watch(Arc::clone(&state), shutdown.clone());
        crate::weather_page::watch(Arc::clone(&state), shutdown.clone());
        {
            let state = Arc::clone(&state);
            tokio::spawn(async move { crate::cooking::rearm(&state).await });
        }
        let app = Router::new().route("/ws", get(upgrade)).with_state(state);
        let signal = shutdown.clone();
        let task = tokio::spawn(async move {
            let serve = axum::serve(
                listener,
                app.into_make_service_with_connect_info::<SocketAddr>(),
            )
            .with_graceful_shutdown(async move { signal.cancelled().await });
            if let Err(err) = serve.await {
                tracing::error!(error = %err, "hub server stopped");
            }
            if let Some(mdns) = mdns {
                let _ = mdns.shutdown();
            }
        });

        tracing::info!(%addr, hub = %info.id, "hub listening");
        Ok(HubHandle {
            addr,
            info,
            shutdown,
            task,
        })
    }
}

async fn upgrade(
    ws: WebSocketUpgrade,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    State(state): State<SharedState>,
) -> Response {
    ws.on_upgrade(move |socket| session::run(socket, peer, state))
}
