use std::net::SocketAddr;
use std::sync::Arc;

use axum::Router;
use axum::extract::{ConnectInfo, State, WebSocketUpgrade};
use axum::response::Response;
use axum::routing::get;
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_util::sync::CancellationToken;
use xiaoban_protocol::{Event, HubInfo, ProtocolError, Request};
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
    state: SharedState,
    shutdown: CancellationToken,
    task: tokio::task::JoinHandle<()>,
}

#[derive(Debug, Clone)]
pub struct LocalLink {
    state: SharedState,
    shutdown: CancellationToken,
}

impl LocalLink {
    pub fn events(&self) -> broadcast::Receiver<Event> {
        self.state.events.subscribe()
    }

    pub async fn request(&self, request: Request) -> Result<xiaoban_protocol::Response, ProtocolError> {
        crate::handlers::handle(&self.state, true, request).await
    }

    pub async fn closed(&self) {
        self.shutdown.cancelled().await;
    }
}

/// The setting the shipped apps start with: tools load on demand, unless `XIAOBAN_LAZY_PACKS=0`.
/// A hub started in code (the tests, for one) keeps every tool until `set_lazy_packs` says otherwise.
pub fn lazy_packs_by_default() -> bool {
    std::env::var("XIAOBAN_LAZY_PACKS").map_or(true, |value| value != "0")
}

impl HubHandle {
    /// Leave tool packs a conversation has not loaded out of its requests. Off by default.
    pub fn set_lazy_packs(&self, on: bool) {
        self.state
            .lazy_packs
            .store(on, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn ws_url(&self) -> String {
        let host = if self.addr.ip().is_unspecified() {
            "127.0.0.1".to_owned()
        } else {
            self.addr.ip().to_string()
        };
        format!("ws://{host}:{}/ws", self.addr.port())
    }

    pub fn link(&self) -> LocalLink {
        LocalLink {
            state: Arc::clone(&self.state),
            shutdown: self.shutdown.clone(),
        }
    }

    pub async fn shutdown(self) {
        self.shutdown.cancel();
        let _ = self.task.await;
    }
}

impl Hub {
    #[allow(clippy::too_many_lines)]
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
            tools: crate::slides::with_write_specs(
                crate::sheet::with_create_spec(crate::doc::with_write_specs(crate::tools::specs(&localizer), &localizer), &localizer),
                &localizer,
            ),
            pack_tools: vec![crate::packs::spec(&localizer)],
            code_tools: crate::code_tools::specs(&localizer),
            git_tools: vec![crate::vcs_tools::git_spec(&localizer)],
            gh_tools: vec![crate::vcs_tools::gh_spec(&localizer)],
            kitchen_tools: crate::kitchen::specs(&localizer),
            ledger_tools: crate::ledger::specs(&localizer),
            life_tools: vec![crate::life::spec(&localizer)],
            doc_tools: crate::doc::edit_specs(&localizer),
            sheet_tools: crate::sheet::edit_specs(&localizer),
            deck_tools: crate::slides::edit_specs(&localizer),
            capabilities: crate::capability::Capabilities::new(config.data_dir.as_deref()),
            code_reads: std::sync::Mutex::default(),
            running_commands: std::sync::Mutex::default(),
            github_cache: crate::github::Cache::default(),
            reverted: std::sync::Mutex::default(),
            prompts: runtime.prompts,
            localizer,
            connector: runtime.connector,
            secrets: runtime.secrets,
            locator: runtime.locator,
            agenda: runtime.agenda,
            presence: runtime.presence,
            weather: runtime.weather,
            router: runtime.router,
            apps: runtime.apps,
            operator: runtime.operator,
            pages: runtime.pages,
            browser: crate::browser::Browser::default(),
            confirms: crate::confirms::Confirms::default(),
            asks: crate::asks::Asks::default(),
            lazy_packs: std::sync::atomic::AtomicBool::new(
                std::env::var("XIAOBAN_LAZY_PACKS").is_ok_and(|value| value == "1"),
            ),
            pauses: crate::pauses::Pauses::default(),
            schedules: crate::schedules::Runs::default(),
            todos: crate::todos::Book::default(),
            files: crate::files::Files::new(config.data_dir.as_ref().map_or_else(
                || std::env::temp_dir().join(format!("xiaoban-files-{}", uuid::Uuid::now_v7())),
                |dir| dir.join("files"),
            )),
            web: runtime.web,
            mail: crate::mail::Mail::new(runtime.mail),
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

        crate::capability::restore(&state).await;
        let shutdown = CancellationToken::new();
        watch(&state, &shutdown);
        let app = Router::new()
            .route("/ws", get(upgrade))
            .with_state(Arc::clone(&state));
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
            state,
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

fn watch(state: &SharedState, shutdown: &CancellationToken) {
    crate::tidy::watch(Arc::clone(state), shutdown.clone());
    crate::week::watch(Arc::clone(state), shutdown.clone());
    crate::weather_page::watch(Arc::clone(state), shutdown.clone());
    crate::notify::watch(Arc::clone(state), shutdown.clone());
    crate::insights::watch(Arc::clone(state), shutdown.clone());
    crate::mail::watch(Arc::clone(state), shutdown.clone());
    crate::schedules::watch(Arc::clone(state), shutdown.clone());
    crate::todos::watch(Arc::clone(state), shutdown.clone());
    let owned = Arc::clone(state);
    let stop = shutdown.clone();
    tokio::spawn(async move {
        stop.cancelled().await;
        owned.capabilities.shutdown().await;
    });
    let state = Arc::clone(state);
    tokio::spawn(async move { crate::cooking::rearm(&state).await });
}
