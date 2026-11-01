use std::sync::Arc;
use std::time::Duration;

use futures_util::future::BoxFuture;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};
use xiaoban_agent::{
    AgentError, ConfiguredProvider, Connector, ModelChunk, ModelProvider, OpenAiConfig,
    ProviderPreset, RecordingProvider, ScriptedProvider, prefix_reuse,
};
use xiaoban_hub::{
    ActFailure, AppEntry, Apps, Day, FixedAgenda, FixedLocator, FixedWeather, Forecast, Hit, Hub, HubConfig,
    HubHandle, HubRuntime, MemorySecrets, NoRouter, Operator, Page, Prompts, Router, SecretStore,
    ServiceError, Snapshot, UiAction, UiElement, Web,
};
use xiaoban_i18n::Locale;
use xiaoban_protocol::{
    AgendaItem, Attachment, AutonomyLevel, ClientFrame, ConfirmChoice, ConfirmKind, ContextNote, Coord,
    Credential, DeviceHello, DocFormat, ErrorCode, Event, FailureKind, Interpretation, Location,
    OperatePermissions, PROTOCOL_VERSION, Platform, ProtocolError, ProviderId, Request, Response,
    Role, ServerFrame, ServiceId, SheetFormat, Sky, TravelMode, TripLeg,
};

struct TestClient {
    ws: WebSocketStream<MaybeTlsStream<TcpStream>>,
    next_id: u64,
}

impl TestClient {
    async fn connect(
        hub: &HubHandle,
        device_id: &str,
        credential: Credential,
    ) -> (Self, ServerFrame) {
        let (ws, _) = connect_async(hub.ws_url()).await.unwrap();
        let mut client = Self { ws, next_id: 0 };
        client
            .send(&ClientFrame::Hello {
                protocol: PROTOCOL_VERSION,
                device: DeviceHello {
                    device_id: device_id.into(),
                    name: "测试设备".into(),
                    platform: Platform::Cli,
                    credential,
                },
            })
            .await;
        let welcome = client.recv().await;
        (client, welcome)
    }

    async fn send(&mut self, frame: &ClientFrame) {
        let text = serde_json::to_string(frame).unwrap();
        self.ws.send(WsMessage::Text(text.into())).await.unwrap();
    }

    async fn recv(&mut self) -> ServerFrame {
        let message = tokio::time::timeout(Duration::from_secs(5), self.ws.next())
            .await
            .expect("timed out waiting for frame")
            .unwrap()
            .unwrap();
        serde_json::from_str(message.to_text().unwrap()).unwrap()
    }

    async fn request(&mut self, body: Request) -> Response {
        self.try_request(body)
            .await
            .unwrap_or_else(|error| panic!("request failed: {error:?}"))
    }

    async fn try_request(&mut self, body: Request) -> Result<Response, ProtocolError> {
        self.next_id += 1;
        let id = self.next_id;
        self.send(&ClientFrame::Request { id, body }).await;
        loop {
            match self.recv().await {
                ServerFrame::Response { id: got, body } if got == id => return Ok(body),
                ServerFrame::Error {
                    id: Some(got),
                    error,
                } if got == id => return Err(error),
                _ => {}
            }
        }
    }

    async fn next_event(&mut self) -> Event {
        loop {
            if let ServerFrame::Event { event } = self.recv().await {
                return event;
            }
        }
    }
}

const VALID_KEY: &str = "good";

struct FixedConnector(Arc<dyn ModelProvider>);

impl std::fmt::Debug for FixedConnector {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("FixedConnector")
    }
}

impl Connector for FixedConnector {
    fn provider(&self, _config: OpenAiConfig) -> Arc<dyn ModelProvider> {
        Arc::clone(&self.0)
    }

    fn check(
        &self,
        config: OpenAiConfig,
        verify_model: bool,
    ) -> BoxFuture<'static, Result<(), AgentError>> {
        let result = if config.api_key != VALID_KEY {
            Err(AgentError::InvalidKey)
        } else if verify_model && config.model != "relay-model" {
            Err(AgentError::UnknownModel {
                model: config.model,
                available: vec!["relay-model".into()],
            })
        } else {
            Ok(())
        };
        Box::pin(async move { result })
    }
}

fn deepseek(key: &str) -> ConfiguredProvider {
    let preset = ProviderPreset::find(ProviderId::Deepseek).unwrap();
    ConfiguredProvider::new(preset, preset.config(key.into(), None))
}

fn runtime_with(
    provider: impl ModelProvider,
    chat_prompt: &str,
    fallback: Option<ConfiguredProvider>,
    secrets: Arc<dyn SecretStore>,
) -> HubRuntime {
    HubRuntime {
        locale: Locale::ZhCn,
        prompts: Prompts {
            chat: chat_prompt.into(),
            interpret_answer: "interpret".into(),
        },
        connector: Arc::new(FixedConnector(Arc::new(provider))),
        secrets,
        locator: Arc::new(FixedLocator(Location::Found {
            city: "北京市".into(),
            district: Some("朝阳区".into()),
            latitude: None,
            longitude: None,
        })),
        agenda: Arc::new(xiaoban_hub::NoAgenda),
        presence: Arc::new(xiaoban_hub::NoPresence),
        weather: Arc::new(FixedWeather(Forecast {
            place: "杭州".into(),
            region: "中国 浙江".into(),
            timezone: "Asia/Shanghai".into(),
            now: None,
            days: vec![Day {
                date: "2026-11-01".into(),
                sky: Sky::LightRain,
                condition: "light rain",
                high: 29.3,
                low: 16.2,
                rain_chance: Some(98),
            }],
        })),
        router: Arc::new(NoRouter),
        apps: Arc::new(FakeApps::default()),
        operator: Arc::new(FakeOperator::default()),
        web: Arc::new(FakeWeb),
        fallback,
        auto_titles: false,
        auto_thinking: false,
    }
}

fn runtime(provider: impl ModelProvider) -> HubRuntime {
    runtime_with(
        provider,
        "system",
        Some(deepseek(VALID_KEY)),
        Arc::new(MemorySecrets::default()),
    )
}

async fn start_hub(chunks: &[&str]) -> HubHandle {
    let runtime = runtime(ScriptedProvider::new(chunks.iter().copied()));
    Hub::start(HubConfig::ephemeral(), runtime).await.unwrap()
}

#[tokio::test]
async fn local_client_sends_a_message_and_receives_streamed_reply() {
    let hub = start_hub(&["明早", "7:40", " 出门"]).await;
    let (mut client, welcome) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    assert!(matches!(
        welcome,
        ServerFrame::Welcome {
            device_token: None,
            ..
        }
    ));

    let Response::Thread { thread } = client
        .request(Request::CreateThread {
            title: Some("出门".into()),
            workspace_id: None,
        })
        .await
    else {
        panic!("expected thread");
    };
    let Response::TurnAccepted { turn_id, message } = client
        .request(Request::SendMessage {
            thread_id: thread.id.clone(),
            text: "明天几点出门".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    assert_eq!(message.role, Role::User);

    let mut streamed = String::new();
    let reply = loop {
        match client.next_event().await {
            Event::TextDelta { turn_id: id, delta } if id == turn_id => streamed.push_str(&delta),
            Event::TurnCompleted {
                turn_id: id,
                message,
                ..
            } if id == turn_id => break message,
            Event::TurnFailed { failure, .. } => panic!("turn failed: {failure:?}"),
            _ => {}
        }
    };
    assert_eq!(streamed, "明早7:40 出门");
    assert_eq!(reply.text, streamed);

    let Response::Messages { messages, .. } = client
        .request(Request::ListMessages {
            thread_id: thread.id,
            before: None,
            limit: None,
        })
        .await
    else {
        panic!("expected messages");
    };
    assert_eq!(messages.len(), 2);
    hub.shutdown().await;
}

#[tokio::test]
async fn phone_pairs_with_code_then_reconnects_with_token() {
    let hub = start_hub(&["好"]).await;
    let (mut desktop, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let Response::PairingCode { code, .. } = desktop.request(Request::CreatePairingCode).await
    else {
        panic!("expected code");
    };

    let (_, welcome) = TestClient::connect(
        &hub,
        "phone",
        Credential::PairingCode { code: code.clone() },
    )
    .await;
    let ServerFrame::Welcome {
        device_token: Some(token),
        ..
    } = welcome
    else {
        panic!("expected token, got {welcome:?}");
    };

    let (_, reused) = TestClient::connect(&hub, "phone-2", Credential::PairingCode { code }).await;
    assert!(matches!(
        reused,
        ServerFrame::Error { error, .. } if error.code == ErrorCode::Unauthorized
    ));

    let (mut phone, welcome) =
        TestClient::connect(&hub, "phone", Credential::Paired { token }).await;
    assert!(matches!(welcome, ServerFrame::Welcome { .. }));
    let Response::Devices { devices } = phone.request(Request::ListDevices).await else {
        panic!("expected devices");
    };
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].id, "phone");
    hub.shutdown().await;
}

#[tokio::test]
async fn paired_devices_get_export_data_but_not_file_writes() {
    let hub = start_hub(&[]).await;
    let (mut desktop, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let Response::PairingCode { code, .. } = desktop.request(Request::CreatePairingCode).await
    else {
        panic!("expected code");
    };
    let (mut phone, _) = TestClient::connect(&hub, "phone", Credential::PairingCode { code }).await;
    let code_of = |result: Result<Response, ProtocolError>| result.err().map(|error| error.code);
    let doc = phone
        .try_request(Request::ExportDocData {
            id: "missing".into(),
            format: DocFormat::Docx,
        })
        .await;
    assert_eq!(code_of(doc), Some(ErrorCode::NotFound));
    let sheet = phone
        .try_request(Request::ExportSheetData {
            id: "missing".into(),
            format: SheetFormat::Csv,
            tab_id: String::new(),
        })
        .await;
    assert_eq!(code_of(sheet), Some(ErrorCode::NotFound));
    let write = phone
        .try_request(Request::ExportDoc {
            id: "missing".into(),
            format: DocFormat::Docx,
            path: "out.docx".into(),
        })
        .await;
    assert_eq!(code_of(write), Some(ErrorCode::Unauthorized));
    hub.shutdown().await;
}

#[tokio::test]
async fn wrong_token_is_rejected() {
    let hub = start_hub(&[]).await;
    let (_, welcome) = TestClient::connect(
        &hub,
        "intruder",
        Credential::Paired {
            token: "nope".into(),
        },
    )
    .await;
    assert!(matches!(
        welcome,
        ServerFrame::Error { error, .. } if error.code == ErrorCode::Unauthorized
    ));
    hub.shutdown().await;
}

async fn converse(client: &mut TestClient, thread_id: &str, text: &str, context: Vec<ContextNote>) {
    let Response::TurnAccepted { turn_id, .. } = client
        .request(Request::SendMessage {
            thread_id: thread_id.into(),
            text: text.into(),
            context,
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    loop {
        match client.next_event().await {
            Event::TurnCompleted { turn_id: id, .. } if id == turn_id => return,
            Event::TurnFailed { failure, .. } => panic!("turn failed: {failure:?}"),
            _ => {}
        }
    }
}

async fn new_thread(client: &mut TestClient) -> String {
    let Response::Thread { thread } = client.request(Request::CreateThread { title: None, workspace_id: None }).await
    else {
        panic!("expected thread");
    };
    thread.id
}

#[tokio::test]
async fn consecutive_turns_reuse_the_exact_request_prefix() {
    let provider = RecordingProvider::new(ScriptedProvider::new(["好"]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider.clone()))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;

    let context = vec![ContextNote {
        label: "页面".into(),
        body: "杭州行程 · 第 1 天".into(),
    }];
    converse(&mut client, &thread, "下午加个亲子乐园", context).await;
    converse(&mut client, &thread, "别太赶", Vec::new()).await;
    converse(&mut client, &thread, "晚饭呢", Vec::new()).await;

    let requests = provider.requests();
    assert_eq!(requests.len(), 3);
    for pair in requests.windows(2) {
        assert!(prefix_reuse(&pair[0], &pair[1]).is_intact());
    }

    let Response::Usage { turns, .. } = client.request(Request::UsageSummary).await else {
        panic!("expected usage");
    };
    assert_eq!(turns, 3);

    let Response::Messages { messages, .. } = client
        .request(Request::ListMessages {
            thread_id: thread,
            before: None,
            limit: None,
        })
        .await
    else {
        panic!("expected messages");
    };
    assert_eq!(messages[0].text, "下午加个亲子乐园");
    hub.shutdown().await;
}

#[tokio::test]
async fn second_message_is_rejected_while_a_reply_is_running() {
    let provider = ScriptedProvider::new(["慢", "慢"]).with_delay(Duration::from_millis(150));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;

    client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "一".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await;
    client.next_id += 1;
    let id = client.next_id;
    client
        .send(&ClientFrame::Request {
            id,
            body: Request::SendMessage {
                thread_id: thread,
                text: "二".into(),
                context: Vec::new(),
                quote: None,
                files: Vec::new(),
                threads: Vec::new(),
            },
        })
        .await;
    loop {
        match client.recv().await {
            ServerFrame::Error {
                id: Some(got),
                error,
            } if got == id => {
                assert_eq!(error.code, ErrorCode::Busy);
                break;
            }
            ServerFrame::Response { id: got, .. } if got == id => panic!("should be rejected"),
            _ => {}
        }
    }
    hub.shutdown().await;
}

#[tokio::test]
async fn changing_the_stable_prefix_starts_a_new_epoch_that_keeps_history() {
    let dir = std::env::temp_dir().join(format!("xiaoban-epoch-{}", uuid_like()));
    let config = HubConfig {
        data_dir: Some(dir.clone()),
        ..HubConfig::ephemeral()
    };

    let hub = Hub::start(config.clone(), runtime(ScriptedProvider::new(["7:40"])))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "明天几点出门", Vec::new()).await;
    drop(client);
    hub.shutdown().await;

    let provider = RecordingProvider::new(ScriptedProvider::new(["带"]));
    let upgraded = runtime_with(
        provider.clone(),
        "新版提示词",
        Some(deepseek(VALID_KEY)),
        Arc::new(MemorySecrets::default()),
    );
    let hub = Hub::start(config, upgraded).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    converse(&mut client, &thread, "要带伞吗", Vec::new()).await;

    let request = &provider.requests()[0];
    let contents: Vec<_> = request
        .messages
        .iter()
        .map(|m| m.content.as_str())
        .collect();
    assert_eq!(contents[0], "新版提示词");
    assert!(contents[1].starts_with("明天几点出门\n\n<context>"));
    assert_eq!(contents[2], "7:40");
    assert!(contents[3].starts_with("要带伞吗\n\n<context>"));
    hub.shutdown().await;
    let _ = std::fs::remove_dir_all(dir);
}

fn uuid_like() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    )
}

async fn configure(client: &mut TestClient, key: &str) -> Response {
    client
        .request(Request::ConfigureProvider {
            provider: ProviderId::Deepseek,
            api_key: key.into(),
            model: Some("deepseek-v4-pro".into()),
            base_url: None,
            label: None,
            api: None,
        })
        .await
}

#[tokio::test]
async fn onboarding_configures_a_provider_and_hot_swaps_the_model() {
    let secrets: Arc<dyn SecretStore> = Arc::new(MemorySecrets::default());
    let dir = std::env::temp_dir().join(format!("xiaoban-onboard-{}", uuid_like()));
    let config = HubConfig {
        data_dir: Some(dir.clone()),
        ..HubConfig::ephemeral()
    };
    let fresh = runtime_with(
        ScriptedProvider::new(["你好"]),
        "system",
        None,
        Arc::clone(&secrets),
    );
    let hub = Hub::start(config.clone(), fresh.clone()).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;

    let Response::ModelStatus { model: None } = client.request(Request::ModelStatus).await else {
        panic!("a fresh hub should have no model");
    };
    let Response::Providers { providers } = client.request(Request::ListProviders).await else {
        panic!("expected providers");
    };
    assert_eq!(providers.len(), ProviderId::ALL.len());
    assert!(providers.iter().all(|provider| !provider.configured));

    let thread = new_thread(&mut client).await;
    client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "在吗".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await;
    let failure = loop {
        if let Event::TurnFailed { failure, .. } = client.next_event().await {
            break failure;
        }
    };
    assert_eq!(failure.kind, FailureKind::NotConfigured);

    let Response::ProviderConfigured {
        model: None,
        failure: Some(failure),
    } = configure(&mut client, "wrong").await
    else {
        panic!("a wrong key must not be saved");
    };
    assert_eq!(failure.kind, FailureKind::InvalidKey);
    assert_eq!(secrets.load(ProviderId::Deepseek).unwrap(), None);

    let Response::ProviderConfigured {
        model: Some(model),
        failure: None,
    } = configure(&mut client, VALID_KEY).await
    else {
        panic!("a valid key should be accepted");
    };
    assert_eq!(model.provider, ProviderId::Deepseek);
    assert_eq!(model.model, "deepseek-v4-pro");
    assert_eq!(
        secrets.load(ProviderId::Deepseek).unwrap().as_deref(),
        Some(VALID_KEY)
    );
    loop {
        if let Event::ModelChanged { model: Some(_) } = client.next_event().await {
            break;
        }
    }

    converse(&mut client, &thread, "现在呢", Vec::new()).await;
    drop(client);
    hub.shutdown().await;

    let hub = Hub::start(config, fresh).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let Response::ModelStatus { model: Some(model) } = client.request(Request::ModelStatus).await
    else {
        panic!("the configured model should survive a restart");
    };
    assert_eq!(model.model, "deepseek-v4-pro");
    hub.shutdown().await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn paired_devices_cannot_configure_providers() {
    let hub = start_hub(&["好"]).await;
    let (mut desktop, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let Response::PairingCode { code, .. } = desktop.request(Request::CreatePairingCode).await
    else {
        panic!("expected code");
    };
    let (mut phone, _) = TestClient::connect(&hub, "phone", Credential::PairingCode { code }).await;

    phone.next_id += 1;
    let id = phone.next_id;
    phone
        .send(&ClientFrame::Request {
            id,
            body: Request::ConfigureProvider {
                provider: ProviderId::Deepseek,
                api_key: VALID_KEY.into(),
                model: None,
                base_url: None,
                label: None,
                api: None,
            },
        })
        .await;
    loop {
        match phone.recv().await {
            ServerFrame::Error {
                id: Some(got),
                error,
            } if got == id => {
                assert_eq!(error.code, ErrorCode::Unauthorized);
                break;
            }
            ServerFrame::Response { id: got, .. } if got == id => panic!("phone must be rejected"),
            _ => {}
        }
    }
    hub.shutdown().await;
}

async fn configure_custom(client: &mut TestClient, base_url: &str, model: &str) -> Response {
    client
        .request(Request::ConfigureProvider {
            provider: ProviderId::Custom,
            api_key: VALID_KEY.into(),
            model: Some(model.into()),
            base_url: Some(base_url.into()),
            label: Some("我的中转站".into()),
            api: None,
        })
        .await
}

#[tokio::test]
async fn custom_relays_are_validated_saved_and_restored() {
    let secrets: Arc<dyn SecretStore> = Arc::new(MemorySecrets::default());
    let dir = std::env::temp_dir().join(format!("xiaoban-custom-{}", uuid_like()));
    let config = HubConfig {
        data_dir: Some(dir.clone()),
        ..HubConfig::ephemeral()
    };
    let fresh = runtime_with(
        ScriptedProvider::new(["好"]),
        "system",
        None,
        Arc::clone(&secrets),
    );
    let hub = Hub::start(config.clone(), fresh.clone()).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;

    let Response::Providers { providers } = client.request(Request::ListProviders).await else {
        panic!("expected providers");
    };
    let custom = providers
        .iter()
        .find(|p| p.id == ProviderId::Custom)
        .unwrap();
    assert_eq!(custom.default_model, None);
    assert_eq!(custom.console_url, None);

    for (base_url, model, kind) in [
        (
            "relay.example.com/v1",
            "relay-model",
            FailureKind::InvalidEndpoint,
        ),
        (
            "https://relay.example.com/v1",
            "typo",
            FailureKind::UnknownModel,
        ),
    ] {
        let Response::ProviderConfigured {
            model: None,
            failure: Some(failure),
        } = configure_custom(&mut client, base_url, model).await
        else {
            panic!("{base_url} {model} should be rejected");
        };
        assert_eq!(failure.kind, kind);
    }
    assert_eq!(secrets.load(ProviderId::Custom).unwrap(), None);

    let Response::ProviderConfigured {
        model: Some(model),
        failure: None,
    } = configure_custom(
        &mut client,
        "https://relay.example.com/v1/chat/completions",
        "relay-model",
    )
    .await
    else {
        panic!("a valid relay should be accepted");
    };
    assert_eq!(model.provider, ProviderId::Custom);
    assert_eq!(
        model.base_url.as_deref(),
        Some("https://relay.example.com/v1")
    );
    assert_eq!(model.label.as_deref(), Some("我的中转站"));
    drop(client);
    hub.shutdown().await;

    let hub = Hub::start(config, fresh).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let Response::ModelStatus {
        model: Some(restored),
    } = client.request(Request::ModelStatus).await
    else {
        panic!("the relay should survive a restart");
    };
    assert_eq!(restored, model);
    hub.shutdown().await;
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn onboarding_steps_persist_preferences_and_memories() {
    let hub = start_hub(&["好"]).await;
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;

    let Response::Preferences { preferences } = client.request(Request::Preferences).await else {
        panic!("expected preferences");
    };
    assert_eq!(preferences.autonomy, AutonomyLevel::Balanced);
    assert!(!preferences.onboarded);

    for (subject, value) in [
        ("称呼", "阿哲"),
        ("住处", "北京，公司在望京"),
        ("称呼", "哲哥"),
    ] {
        let Response::Memory { memory } = client
            .request(Request::Remember {
                subject: subject.into(),
                value: value.into(),
            })
            .await
        else {
            panic!("expected memory");
        };
        assert_eq!(memory.value, value);
    }
    let Response::Memories { memories } = client.request(Request::ListMemories).await else {
        panic!("expected memories");
    };
    assert_eq!(memories.len(), 2);

    client
        .request(Request::SetAutonomy {
            level: AutonomyLevel::Cautious,
        })
        .await;
    client.request(Request::CompleteOnboarding).await;
    let Response::Preferences { preferences } = client.request(Request::Preferences).await else {
        panic!("expected preferences");
    };
    assert_eq!(preferences.autonomy, AutonomyLevel::Cautious);
    assert!(preferences.onboarded);
    let primary = preferences
        .primary_thread_id
        .expect("onboarding creates the main thread");
    let Response::Messages { messages, .. } = client
        .request(Request::ListMessages {
            thread_id: primary.clone(),
            before: None,
            limit: None,
        })
        .await
    else {
        panic!("expected messages");
    };
    assert_eq!(messages.len(), 2);
    assert!(messages[0].text.starts_with("哲哥"));
    client.request(Request::CompleteOnboarding).await;
    let Response::Threads { threads } = client.request(Request::ListThreads).await else {
        panic!("expected threads");
    };
    assert_eq!(threads.len(), 1);
    assert_eq!(threads[0].id, primary);
    assert_eq!(
        threads[0].last_message.as_deref(),
        Some(messages[1].text.as_str())
    );
    hub.shutdown().await;
}

#[tokio::test]
async fn the_desktop_hears_when_a_phone_pairs() {
    let hub = start_hub(&["好"]).await;
    let (mut desktop, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let Response::PairingCode { code, port, .. } =
        desktop.request(Request::CreatePairingCode).await
    else {
        panic!("expected code");
    };
    assert_eq!(port, hub.addr.port());

    let _phone = TestClient::connect(&hub, "phone-1", Credential::PairingCode { code }).await;
    loop {
        if let Event::DevicePaired { device } = desktop.next_event().await {
            assert_eq!(device.id, "phone-1");
            break;
        }
    }
    hub.shutdown().await;
}

async fn remember(client: &mut TestClient, subject: &str, value: &str) {
    client
        .request(Request::Remember {
            subject: subject.into(),
            value: value.into(),
        })
        .await;
}

#[tokio::test]
async fn memories_enter_new_threads_without_breaking_running_ones() {
    let provider = RecordingProvider::new(ScriptedProvider::new(["好"]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider.clone()))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    remember(&mut client, "称呼", "阿哲").await;

    let first = new_thread(&mut client).await;
    converse(&mut client, &first, "早", Vec::new()).await;

    remember(&mut client, "家里", "老婆和儿子").await;
    converse(&mut client, &first, "今天干嘛", Vec::new()).await;

    let second = new_thread(&mut client).await;
    converse(&mut client, &second, "在吗", Vec::new()).await;

    let requests = provider.requests();
    let system = |index: usize| requests[index].messages[0].content.clone();
    assert!(system(0).starts_with("system\n\n"));
    assert!(system(0).contains("阿哲"));
    assert!(!system(0).contains("老婆和儿子"));

    assert!(prefix_reuse(&requests[0], &requests[1]).is_intact());
    assert_eq!(system(1), system(0));

    assert!(system(2).contains("阿哲"));
    assert!(system(2).contains("老婆和儿子"));
    hub.shutdown().await;
}

#[tokio::test]
async fn onboarding_answers_are_read_by_the_model_before_being_remembered() {
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![ModelChunk::Text(r#"{"value":"阿哲","reply":null}"#.into())],
        vec![ModelChunk::Text(
            r#"{"value":null,"skip":false,"reply":"没太懂，换个说法？"}"#.into(),
        )],
        vec![ModelChunk::Text(
            r#"{"value":null,"skip":true,"reply":null}"#.into(),
        )],
        vec![ModelChunk::Text(
            r#"{"value":null,"skip":false,"locate":true,"reply":null}"#.into(),
        )],
    ]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider.clone()))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let mut interpret = async |answer: &str| {
        client
            .request(Request::InterpretAnswer {
                subject: "称呼".into(),
                question: "怎么称呼你？".into(),
                answer: answer.into(),
                follow_up: None,
                can_locate: true,
            })
            .await
    };

    let Response::Interpreted {
        interpretation: Interpretation::Remembered { memory },
    } = interpret("叫我阿哲就行").await
    else {
        panic!("a clear answer should be remembered");
    };
    assert_eq!(
        (memory.subject.as_str(), memory.value.as_str()),
        ("称呼", "阿哲")
    );

    let Response::Interpreted {
        interpretation: Interpretation::Unclear { reply },
    } = interpret("asdfgh").await
    else {
        panic!("gibberish should be questioned, not remembered");
    };
    assert_eq!(reply.as_deref(), Some("没太懂，换个说法？"));

    let declined = interpret("这个能先不说吗").await;
    let Response::Interpreted {
        interpretation: Interpretation::Declined,
    } = declined
    else {
        panic!("declining should move on without remembering: {declined:?}");
    };

    let Response::Interpreted {
        interpretation: Interpretation::Locate,
    } = interpret("你猜一下").await
    else {
        panic!("asking to guess should request locating");
    };
    let Response::Located { location } = client.request(Request::Locate).await else {
        panic!("expected a location");
    };
    assert_eq!(
        location,
        Location::Found {
            city: "北京市".into(),
            district: Some("朝阳区".into()),
            latitude: None,
            longitude: None,
        }
    );

    let Response::Memories { memories } = client.request(Request::ListMemories).await else {
        panic!("expected memories");
    };
    assert_eq!(memories.len(), 1);

    let requests = provider.requests();
    assert_eq!(requests[0].messages[0].content, "interpret");
    assert_eq!(requests[0].tools, Vec::new());
    assert!(requests[0].messages[1].content.contains("叫我阿哲就行"));
    assert_eq!(requests[0].messages[0], requests[1].messages[0]);
    hub.shutdown().await;
}

struct FlakyProvider {
    calls: std::sync::Mutex<usize>,
    then: RecordingProvider,
}

impl ModelProvider for FlakyProvider {
    fn stream(&self, request: xiaoban_agent::ChatRequest) -> xiaoban_agent::ModelStream {
        let mut calls = self.calls.lock().unwrap();
        *calls += 1;
        if *calls == 1 {
            return futures_util::stream::once(async { Err(AgentError::Stream("offline".into())) })
                .boxed();
        }
        self.then.stream(request)
    }
}

async fn finish_turn(client: &mut TestClient, turn_id: &str) -> Result<String, String> {
    loop {
        match client.next_event().await {
            Event::TurnCompleted {
                turn_id: id,
                message,
                ..
            } if id == turn_id => return Ok(message.text),
            Event::TurnFailed {
                turn_id: id,
                failure,
            } if id == turn_id => return Err(format!("{failure:?}")),
            _ => {}
        }
    }
}

#[tokio::test]
async fn failed_turns_can_be_retried_and_answers_regenerated() {
    let recorded = RecordingProvider::new(ScriptedProvider::new(["好"]));
    let provider = FlakyProvider {
        calls: std::sync::Mutex::new(0),
        then: recorded.clone(),
    };
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;

    let Response::TurnAccepted { turn_id, .. } = client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "明天几点出门".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    assert!(finish_turn(&mut client, &turn_id).await.is_err());

    let Response::TurnAccepted { turn_id, message } = client
        .request(Request::RetryTurn {
            thread_id: thread.clone(),
        })
        .await
    else {
        panic!("expected retry");
    };
    assert_eq!(message.text, "明天几点出门");
    assert_eq!(finish_turn(&mut client, &turn_id).await.unwrap(), "好");
    let contents: Vec<_> = recorded.requests()[0]
        .messages
        .iter()
        .map(|m| m.content.clone())
        .collect();
    assert_eq!(contents[0], "system");
    assert!(contents[1].starts_with("明天几点出门\n\n<context>"));
    assert_eq!(contents.len(), 2);

    let Response::TurnAccepted { turn_id, .. } = client
        .request(Request::RetryTurn {
            thread_id: thread.clone(),
        })
        .await
    else {
        panic!("expected regenerate");
    };
    finish_turn(&mut client, &turn_id).await.unwrap();
    let requests = recorded.requests();
    assert!(prefix_reuse(&requests[0], &requests[1]).is_intact());
    assert_eq!(requests[1].messages.len(), 4);

    let Response::Messages { messages, .. } = client
        .request(Request::ListMessages {
            thread_id: thread.clone(),
            before: None,
            limit: None,
        })
        .await
    else {
        panic!("expected messages");
    };
    assert_eq!(messages.len(), 3);
    assert_eq!(
        messages[2].replaces.as_deref(),
        Some(messages[1].id.as_str())
    );

    let Response::TurnAccepted { turn_id, message } = client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "那 8 点半呢".into(),
            context: Vec::new(),
            quote: Some(xiaoban_protocol::Quote::plain("7:40")),
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    assert_eq!(
        message.quote.as_ref().map(|quote| quote.text.as_str()),
        Some("7:40")
    );
    finish_turn(&mut client, &turn_id).await.unwrap();
    let last = recorded
        .requests()
        .last()
        .unwrap()
        .messages
        .last()
        .unwrap()
        .content
        .clone();
    assert!(last.starts_with("那 8 点半呢") && last.contains("7:40"));
    hub.shutdown().await;
}

#[tokio::test]
async fn threads_can_be_renamed_and_deleted_but_not_the_main_one() {
    let hub = start_hub(&["好"]).await;
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    let Response::Thread { thread: renamed } = client
        .request(Request::RenameThread {
            thread_id: thread.clone(),
            title: " 周末去哪 ".into(),
        })
        .await
    else {
        panic!("expected thread");
    };
    assert_eq!(renamed.title.as_deref(), Some("周末去哪"));

    client.request(Request::CompleteOnboarding).await;
    let Response::Preferences { preferences } = client.request(Request::Preferences).await else {
        panic!("expected preferences");
    };
    let primary = preferences.primary_thread_id.unwrap();
    assert!(
        client
            .try_request(Request::DeleteThread { thread_id: primary })
            .await
            .is_err()
    );
    let Response::Ack = client
        .request(Request::DeleteThread {
            thread_id: thread.clone(),
        })
        .await
    else {
        panic!("expected ack");
    };
    let Response::Threads { threads } = client.request(Request::ListThreads).await else {
        panic!("expected threads");
    };
    assert!(threads.iter().all(|t| t.id != thread));
    hub.shutdown().await;
}

const GOOD_SERVICE_KEY: &str = "good-key";

fn check(key: &str) -> Result<(), ServiceError> {
    if key == GOOD_SERVICE_KEY || key == VALID_KEY {
        Ok(())
    } else {
        Err(ServiceError::InvalidKey)
    }
}

#[derive(Debug)]
struct FakeWeb;

impl Web for FakeWeb {
    fn verify(&self, key: String) -> BoxFuture<'static, Result<(), ServiceError>> {
        Box::pin(async move { check(&key) })
    }

    fn search(
        &self,
        key: String,
        query: String,
        _: Option<String>,
    ) -> BoxFuture<'static, Result<Vec<Hit>, ServiceError>> {
        Box::pin(async move {
            check(&key)?;
            Ok(vec![Hit {
                title: query,
                url: "https://example.com".into(),
                site: "例子".into(),
                date: None,
                summary: "全年开放".into(),
            }])
        })
    }

    fn fetch(&self, key: String, _: String) -> BoxFuture<'static, Result<Page, ServiceError>> {
        Box::pin(async move {
            check(&key)?;
            Ok(Page {
                title: "官网".into(),
                content: "开放时间 7:00-18:00".into(),
            })
        })
    }
}

#[derive(Debug)]
struct FakeRouter;

impl Router for FakeRouter {
    fn locate(&self, _: String, name: String) -> BoxFuture<'static, Option<Coord>> {
        let offset = f64::from(u32::try_from(name.chars().count()).unwrap()) / 100.0;
        Box::pin(async move {
            Some(Coord {
                lng: 120.1 + offset,
                lat: 30.2 + offset,
            })
        })
    }

    fn leg(&self, _: Coord, _: Coord) -> BoxFuture<'static, Option<TripLeg>> {
        Box::pin(async {
            Some(TripLeg {
                mode: TravelMode::Walk,
                minutes: 15,
                estimated: false,
            })
        })
    }
}

fn tool_call(name: &str, arguments: &serde_json::Value) -> ModelChunk {
    ModelChunk::ToolCallDelta {
        index: 0,
        id: Some(name.into()),
        name: Some(name.into()),
        arguments: arguments.to_string(),
    }
}

fn save_trip_call() -> ModelChunk {
    tool_call(
        "save_trip",
        &serde_json::json!({
            "title": "杭州 · 1 天",
            "city": "杭州",
            "party": "2 大 1 小",
            "days": [{
                "date": "2026-11-01",
                "change": "下雨，下午改成室内",
                "stops": [
                    {
                        "name": "断桥", "time": "09:00", "note": "人少",
                        "next": { "mode": "taxi", "minutes": 20 },
                        "detail": {
                            "why": "看西湖全景",
                            "suits": ["推车好走", " "],
                            "tickets": "免费",
                            "tickets_source": { "title": "官网", "url": "https://example.com" },
                            "reviews": [
                                { "text": "早上很美", "source": { "title": "马蜂窝", "url": "https://example.com/a" } },
                                { "text": "坏链接", "source": { "title": "x", "url": "javascript:alert(1)" } }
                            ]
                        }
                    },
                    { "name": "中国茶叶博物馆", "time": "15:00", "note": "室内", "next": { "mode": "walk", "minutes": 5 } }
                ]
            }]
        }),
    )
}

#[tokio::test]
async fn proposed_events_become_cards_and_the_calendar_can_be_read() {
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![tool_call(
            "propose_event",
            &serde_json::json!({
                "title": "带孩子打疫苗",
                "date": "2026-11-12",
                "start": "15:00",
                "location": "社区卫生服务中心",
                "reminder": 60,
            }),
        )],
        vec![tool_call(
            "read_calendar",
            &serde_json::json!({ "date": "2026-11-12" }),
        )],
        vec![ModelChunk::Text("记下了".into())],
    ]));
    let mut runtime = runtime(provider.clone());
    runtime.agenda = Arc::new(FixedAgenda(vec![AgendaItem {
        title: "孩子家长会".into(),
        start: 1_794_483_000_000,
        end: 1_794_486_600_000,
        all_day: false,
        location: String::new(),
        calendar: "我的日历".into(),
    }]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "下周三下午三点带孩子去打疫苗", Vec::new()).await;

    let message = latest_message_with(&mut client, &thread, |attachment| {
        matches!(attachment, Attachment::Event { .. })
    })
    .await;
    let Some(Attachment::Event { event }) = message.attachment else {
        panic!("expected an event card");
    };
    assert_eq!(event.title, "带孩子打疫苗");
    assert_eq!(event.reminder, Some(60));
    assert_eq!(event.end - event.start, 60 * 60 * 1000);

    let read = provider.requests()[2]
        .messages
        .iter()
        .any(|message| message.content.contains("孩子家长会"));
    assert!(read, "the calendar should be handed to the model");

    let Response::TripCalendar { calendar } = client
        .request(Request::EventCalendar { event: event.clone() })
        .await
    else {
        panic!("expected a calendar");
    };
    assert_eq!(calendar.events.len(), 1);
    assert!(calendar.ics.contains("TRIGGER:-PT60M"));
    hub.shutdown().await;
}

fn search_call() -> ModelChunk {
    tool_call(
        "web_search",
        &serde_json::json!({ "query": "灵隐寺 开放时间" }),
    )
}

async fn latest_message_with(
    client: &mut TestClient,
    thread: &str,
    wanted: fn(&Attachment) -> bool,
) -> xiaoban_protocol::Message {
    for _ in 0..100 {
        let Response::Messages { messages, .. } = client
            .request(Request::ListMessages {
                thread_id: thread.into(),
                before: None,
                limit: None,
            })
            .await
        else {
            panic!("expected messages");
        };
        if let Some(message) = messages
            .into_iter()
            .rev()
            .find(|message| message.attachment.as_ref().is_some_and(wanted))
        {
            return message;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("no matching message");
}

fn is_trip(attachment: &Attachment) -> bool {
    matches!(attachment, Attachment::Trip { .. })
}

async fn trip_of(
    client: &mut TestClient,
    message: &xiaoban_protocol::Message,
) -> xiaoban_protocol::Trip {
    let Some(Attachment::Trip { trip_id, .. }) = &message.attachment else {
        panic!("expected a trip card");
    };
    let Response::Trip { trip, .. } = client
        .request(Request::GetTrip {
            trip_id: trip_id.clone(),
            version: None,
        })
        .await
    else {
        panic!("expected trip");
    };
    trip
}

fn mimo_runtime(provider: impl ModelProvider) -> HubRuntime {
    let preset = ProviderPreset::find(ProviderId::Mimo).unwrap();
    runtime_with(
        provider,
        "system",
        Some(ConfiguredProvider::new(
            preset,
            preset.config(VALID_KEY.into(), None),
        )),
        Arc::new(MemorySecrets::default()),
    )
}

#[tokio::test]
async fn deepseek_users_search_with_their_model_key_and_routes_replace_estimates() {
    let provider = ScriptedProvider::sequence([
        vec![search_call()],
        vec![save_trip_call()],
        vec![ModelChunk::Text("排好了".into())],
    ]);
    let mut runtime = runtime(provider);
    runtime.router = Arc::new(FakeRouter);
    let hub = Hub::start(HubConfig::ephemeral(), runtime).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "去杭州玩一天", Vec::new()).await;

    let saved = latest_message_with(&mut client, &thread, is_trip).await;
    let trip = trip_of(&mut client, &saved).await;
    assert!(trip.verified);
    let day = &trip.days[0];
    assert_eq!(
        day.weather.as_ref().map(|weather| weather.sky),
        Some(Sky::LightRain)
    );
    assert!(day.stops.iter().all(|stop| stop.location.is_some()));
    assert_eq!(
        day.stops[0].next,
        Some(TripLeg {
            mode: TravelMode::Walk,
            minutes: 15,
            estimated: false
        })
    );
    assert_eq!(day.stops[1].next, None);
    let detail = day.stops[0].detail.as_ref().unwrap();
    assert_eq!(detail.suits, ["推车好走"]);
    assert_eq!(detail.reviews.len(), 1);
    assert!(detail.checked_at.is_some());
    assert_eq!(day.stops[1].detail, None);

    assert_eq!(trip.timezone.as_deref(), Some("Asia/Shanghai"));
    let Response::TripCalendar { calendar } = client
        .request(Request::TripCalendar {
            trip_id: trip.id.clone(),
            version: None,
        })
        .await
    else {
        panic!("expected calendar");
    };
    assert_eq!(calendar.events.len(), 2);
    assert!(calendar.ics.contains("SUMMARY:断桥"));

    let Response::Services { services } = client.request(Request::Services).await else {
        panic!("expected services");
    };
    assert!(services.iter().all(|status| status.connected));
    hub.shutdown().await;
}

#[tokio::test]
async fn other_models_ask_for_a_deepseek_key_then_resume() {
    let provider = ScriptedProvider::sequence([
        vec![search_call()],
        vec![ModelChunk::Text("要先接上联网搜索".into())],
        vec![search_call()],
        vec![save_trip_call()],
        vec![ModelChunk::Text("查到了".into())],
    ]);
    let hub = Hub::start(HubConfig::ephemeral(), mimo_runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "灵隐寺几点开门", Vec::new()).await;
    let asked = latest_message_with(&mut client, &thread, |attachment| {
        matches!(attachment, Attachment::ServiceNeeded { .. })
    })
    .await;
    assert_eq!(
        asked.attachment,
        Some(Attachment::ServiceNeeded {
            service: ServiceId::WebSearch
        })
    );

    for (key, expected) in [("wrong", false), (GOOD_SERVICE_KEY, true)] {
        let Response::ServiceConfigured { connected, .. } = client
            .request(Request::ConfigureService {
                service: ServiceId::WebSearch,
                api_key: key.into(),
                resume_thread_id: Some(thread.clone()),
            })
            .await
        else {
            panic!("expected configure result");
        };
        assert_eq!(connected, expected);
    }

    let saved = latest_message_with(&mut client, &thread, is_trip).await;
    let trip = trip_of(&mut client, &saved).await;
    assert!(trip.verified);
    assert_eq!(
        trip.days[0].stops[0].next,
        Some(TripLeg {
            mode: TravelMode::Taxi,
            minutes: 20,
            estimated: true
        })
    );
    assert_eq!(trip.days[0].stops[1].next, None);
    hub.shutdown().await;
}

#[tokio::test]
async fn declining_search_saves_the_trip_unverified() {
    let provider = ScriptedProvider::sequence([
        vec![search_call()],
        vec![ModelChunk::Text("要先接上联网搜索".into())],
        vec![search_call()],
        vec![save_trip_call()],
        vec![ModelChunk::Text("按我知道的排了".into())],
    ]);
    let hub = Hub::start(HubConfig::ephemeral(), mimo_runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "去杭州玩一天", Vec::new()).await;

    let Response::Ack = client
        .request(Request::DeclineService {
            service: ServiceId::WebSearch,
            thread_id: thread.clone(),
        })
        .await
    else {
        panic!("expected ack");
    };
    let saved = latest_message_with(&mut client, &thread, is_trip).await;
    let trip = trip_of(&mut client, &saved).await;
    assert!(!trip.verified);
    assert!(
        trip.days[0]
            .stops
            .iter()
            .all(|stop| stop.location.is_none())
    );
    let detail = trip.days[0].stops[0].detail.as_ref().unwrap();
    assert_eq!(detail.reviews.len(), 0);
    assert_eq!(
        (detail.tickets_source.as_ref(), detail.checked_at),
        (None, None)
    );
    hub.shutdown().await;
}

#[tokio::test]
async fn locate_tool_reports_the_current_city() {
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![tool_call("locate", &serde_json::json!({}))],
        vec![ModelChunk::Text("你在北京".into())],
    ]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider.clone()))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "附近有什么好吃的", Vec::new()).await;
    let answered = &provider.requests()[1];
    let tool = answered.messages.last().unwrap();
    assert!(tool.content.contains("北京市") && tool.content.contains("朝阳区"));
    hub.shutdown().await;
}

#[tokio::test]
async fn place_details_update_one_stop_in_a_new_version() {
    let detail = serde_json::json!({
        "day": 1,
        "stop": "中国茶叶博物馆",
        "detail": { "why": "室内，下雨也能去", "suits": ["推车好走"], "tickets": "免费" }
    });
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![save_trip_call()],
        vec![ModelChunk::Text("排好了".into())],
        vec![tool_call(
            "save_place_detail",
            &serde_json::json!({ "day": 1, "stop": "不存在", "detail": { "why": "x" } }),
        )],
        vec![tool_call("save_place_detail", &detail)],
        vec![ModelChunk::Text("详情已更新".into())],
    ]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider.clone()))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "去杭州玩一天", Vec::new()).await;
    converse(&mut client, &thread, "查一下茶叶博物馆的详情", Vec::new()).await;

    let saved = latest_message_with(&mut client, &thread, |attachment| {
        matches!(attachment, Attachment::Trip { version: 2, .. })
    })
    .await;
    let trip = trip_of(&mut client, &saved).await;
    let stops = &trip.days[0].stops;
    assert_eq!(
        stops[1].detail.as_ref().map(|detail| detail.why.as_str()),
        Some("室内，下雨也能去")
    );
    assert_eq!(
        stops[0].detail.as_ref().map(|detail| detail.why.as_str()),
        Some("看西湖全景")
    );
    assert_eq!(stops[0].next.map(|leg| leg.minutes), Some(20));

    let missing = &provider.requests()[3];
    let answer = missing.messages.last().unwrap();
    assert!(answer.content.contains("no stop named 不存在"));
    hub.shutdown().await;
}

#[derive(Debug, Default)]
struct FakeApps {
    opened: std::sync::Mutex<Vec<String>>,
}

impl Apps for FakeApps {
    fn list(&self) -> BoxFuture<'static, Vec<AppEntry>> {
        Box::pin(async {
            vec![
                AppEntry {
                    id: "com.tencent.xinWeChat".into(),
                    name: "微信".into(),
                    aliases: vec!["WeChat".into()],
                },
                AppEntry {
                    id: "com.apple.Keynote".into(),
                    name: "Keynote 讲演".into(),
                    aliases: vec!["Keynote".into()],
                },
            ]
        })
    }

    fn open(&self, id: String) -> BoxFuture<'static, Result<(), String>> {
        self.opened.lock().unwrap().push(id);
        Box::pin(async { Ok(()) })
    }
}

#[tokio::test]
async fn apps_are_found_by_name_and_only_listed_ids_open() {
    let apps = Arc::new(FakeApps::default());
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![tool_call(
            "find_apps",
            &serde_json::json!({ "query": "wechat 微信" }),
        )],
        vec![tool_call(
            "open_app",
            &serde_json::json!({ "id": "rm -rf /", "name": "x" }),
        )],
        vec![tool_call(
            "open_app",
            &serde_json::json!({ "id": "com.tencent.xinWeChat", "name": "微信" }),
        )],
        vec![ModelChunk::Text("打开了".into())],
    ]));
    let mut runtime = runtime(provider.clone());
    runtime.apps = apps.clone();
    let hub = Hub::start(HubConfig::ephemeral(), runtime).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "打开微信", Vec::new()).await;

    let requests = provider.requests();
    let result = |index: usize| requests[index].messages.last().unwrap().content.clone();
    assert!(result(1).contains("com.tencent.xinWeChat"));
    assert!(!result(1).contains("Keynote"));
    assert!(result(2).contains("unknown app id"));
    assert!(result(3).contains("opened"));
    assert_eq!(*apps.opened.lock().unwrap(), ["com.tencent.xinWeChat"]);
    hub.shutdown().await;
}

#[derive(Debug)]
struct FakeOperator {
    control: std::sync::atomic::AtomicBool,
    stubborn: std::sync::atomic::AtomicBool,
    actions: std::sync::Mutex<Vec<String>>,
}

impl Default for FakeOperator {
    fn default() -> Self {
        Self {
            control: std::sync::atomic::AtomicBool::new(true),
            stubborn: std::sync::atomic::AtomicBool::new(false),
            actions: std::sync::Mutex::default(),
        }
    }
}

impl Operator for FakeOperator {
    fn permissions(&self) -> OperatePermissions {
        OperatePermissions {
            control: self.control.load(std::sync::atomic::Ordering::SeqCst),
        }
    }

    fn snapshot(&self, app_id: String) -> BoxFuture<'static, Result<Snapshot, String>> {
        self.actions.lock().unwrap().push(format!("look {app_id}"));
        Box::pin(async {
            Ok(Snapshot {
                app: "Keynote 讲演".into(),
                window: Some("周报".into()),
                elements: vec![UiElement {
                    index: 0,
                    role: "button".into(),
                    label: "导出 PDF".into(),
                    value: None,
                    disabled: false,
                }],
                truncated: false,
            })
        })
    }

    fn act(
        &self,
        app_id: String,
        index: u32,
        action: UiAction,
        allow_mouse: bool,
    ) -> BoxFuture<'static, Result<(), ActFailure>> {
        let stubborn = self.stubborn.load(std::sync::atomic::Ordering::SeqCst);
        self.actions
            .lock()
            .unwrap()
            .push(format!("{action:?} {index} {app_id} mouse={allow_mouse}"));
        Box::pin(async move {
            if stubborn && !allow_mouse {
                Err(ActFailure::NeedsMouse)
            } else {
                Ok(())
            }
        })
    }

    fn type_into(&self, app_id: String, text: String) -> BoxFuture<'static, Result<(), String>> {
        self.actions
            .lock()
            .unwrap()
            .push(format!("text {text} {app_id}"));
        Box::pin(async { Ok(()) })
    }

    fn keys(&self, app_id: String, combo: String) -> BoxFuture<'static, Result<(), String>> {
        self.actions
            .lock()
            .unwrap()
            .push(format!("keys {combo} {app_id}"));
        Box::pin(async { Ok(()) })
    }
}

type Answer = (fn(&ConfirmKind) -> bool, ConfirmChoice);

async fn answer_confirms(
    client: &mut TestClient,
    thread: &str,
    answers: &mut Vec<Answer>,
    replies: usize,
) {
    for _ in 0..400 {
        let Response::PendingConfirms { confirms } = client.request(Request::PendingConfirms).await
        else {
            panic!("expected confirms");
        };
        for confirm in confirms {
            let position = answers
                .iter()
                .position(|(matches, _)| matches(&confirm.kind))
                .unwrap_or_else(|| panic!("unexpected confirm {:?}", confirm.kind));
            let (_, choice) = answers.remove(position);
            let Response::Ack = client
                .request(Request::AnswerConfirm {
                    confirm_id: confirm.id,
                    choice,
                })
                .await
            else {
                panic!("expected ack");
            };
        }
        let Response::Messages { messages, .. } = client
            .request(Request::ListMessages {
                thread_id: thread.into(),
                before: None,
                limit: None,
            })
            .await
        else {
            panic!("expected messages");
        };
        if messages
            .iter()
            .filter(|message| message.role == Role::Assistant)
            .count()
            >= replies
        {
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("the turn never finished");
}

#[tokio::test]
#[allow(clippy::too_many_lines)]
async fn operating_apps_asks_for_permission_apps_and_actions() {
    let operator = Arc::new(FakeOperator::default());
    operator
        .control
        .store(false, std::sync::atomic::Ordering::SeqCst);
    let look = || {
        tool_call(
            "look_at_app",
            &serde_json::json!({ "app": "com.apple.Keynote", "name": "Keynote" }),
        )
    };
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![look()],
        vec![ModelChunk::Text("没权限".into())],
        vec![look()],
        vec![tool_call(
            "click",
            &serde_json::json!({ "app": "com.apple.Keynote", "element": 0, "label": "导出 PDF" }),
        )],
        vec![tool_call(
            "confirm",
            &serde_json::json!({ "title": "要发给「老婆」吗？", "detail": "周报.pdf" }),
        )],
        vec![ModelChunk::Text("没发".into())],
    ]));
    let mut runtime = runtime(provider.clone());
    runtime.operator = operator.clone();
    let hub = Hub::start(HubConfig::ephemeral(), runtime).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;

    let Response::TurnAccepted { .. } = client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "导出周报".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    let mut answers: Vec<Answer> = vec![(
        |kind| matches!(kind, ConfirmKind::Permissions),
        ConfirmChoice::No,
    )];
    answer_confirms(&mut client, &thread, &mut answers, 1).await;
    assert!(operator.actions.lock().unwrap().is_empty());
    assert!(
        provider.requests()[1]
            .messages
            .last()
            .unwrap()
            .content
            .contains("not allowed")
    );

    operator
        .control
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let Response::TurnAccepted { .. } = client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "开好了".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    let mut answers: Vec<Answer> = vec![
        (
            |kind| matches!(kind, ConfirmKind::AllowApp { app } if app == "Keynote 讲演"),
            ConfirmChoice::Always,
        ),
        (
            |kind| matches!(kind, ConfirmKind::Action { .. }),
            ConfirmChoice::No,
        ),
    ];
    answer_confirms(&mut client, &thread, &mut answers, 2).await;
    assert_eq!(answers.len(), 0);
    assert_eq!(
        *operator.actions.lock().unwrap(),
        [
            "look com.apple.Keynote",
            "Press 0 com.apple.Keynote mouse=false",
            "look com.apple.Keynote"
        ]
    );
    let last = provider
        .requests()
        .last()
        .unwrap()
        .messages
        .last()
        .unwrap()
        .content
        .clone();
    assert!(last.contains("no: do not do it"));
    hub.shutdown().await;
}

#[tokio::test]
async fn stubborn_apps_borrow_the_mouse_only_after_asking() {
    let operator = Arc::new(FakeOperator::default());
    operator
        .stubborn
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![tool_call(
            "do_steps",
            &serde_json::json!({
                "app": "com.apple.Keynote",
                "summary": "输入 12+34=",
                "steps": [
                    { "do": "click", "element": 0, "label": "AC" },
                    { "do": "text", "text": "12+34=" },
                ],
            }),
        )],
        vec![ModelChunk::Text("46".into())],
    ]));
    let mut runtime = runtime(provider.clone());
    runtime.operator = operator.clone();
    let hub = Hub::start(HubConfig::ephemeral(), runtime).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    let Response::TurnAccepted { .. } = client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "算 12+34".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    let mut answers: Vec<Answer> = vec![
        (
            |kind| matches!(kind, ConfirmKind::AllowApp { .. }),
            ConfirmChoice::Once,
        ),
        (
            |kind| matches!(kind, ConfirmKind::BorrowMouse { app } if app == "Keynote 讲演"),
            ConfirmChoice::Once,
        ),
    ];
    answer_confirms(&mut client, &thread, &mut answers, 1).await;
    assert_eq!(answers.len(), 0);
    assert_eq!(
        *operator.actions.lock().unwrap(),
        [
            "Press 0 com.apple.Keynote mouse=false",
            "Press 0 com.apple.Keynote mouse=true",
            "text 12+34= com.apple.Keynote",
            "look com.apple.Keynote"
        ]
    );
    let result = provider.requests()[1]
        .messages
        .last()
        .unwrap()
        .content
        .clone();
    assert!(result.contains("\"finished_steps\":2"));
    assert!(result.contains("导出 PDF"));
    hub.shutdown().await;
}

#[tokio::test]
async fn attached_files_reach_the_model() {
    let provider = RecordingProvider::new(ScriptedProvider::sequence([vec![ModelChunk::Text(
        "周五三点".into(),
    )]]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider.clone()))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    let dir = std::env::temp_dir().join(format!("xiaoban-flow-{}", uuid::Uuid::now_v7()));
    std::fs::create_dir_all(&dir).unwrap();
    let note = dir.join("通知.txt");
    std::fs::write(&note, "家长会改到周五下午三点").unwrap();
    let Response::TurnAccepted { message, .. } = client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "家长会几点".into(),
            context: Vec::new(),
            quote: None,
            files: vec![note.to_string_lossy().into_owned()],
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    assert_eq!(message.files.len(), 1);
    assert_eq!(message.files[0].name, "通知.txt");
    assert_eq!(message.files[0].mode, xiaoban_protocol::FileMode::Full);
    for _ in 0..200 {
        if !provider.requests().is_empty() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let sent = provider.requests()[0]
        .messages
        .last()
        .unwrap()
        .content
        .clone();
    assert!(sent.contains("家长会改到周五下午三点"));
    hub.shutdown().await;
}

#[tokio::test]
async fn a_backgrounded_reply_frees_the_thread() {
    let provider = ScriptedProvider::new(["慢", "慢"]).with_delay(Duration::from_millis(150));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    let send = |text: &str| Request::SendMessage {
        thread_id: thread.clone(),
        text: text.into(),
        context: Vec::new(),
        quote: None,
        files: Vec::new(),
        threads: Vec::new(),
    };
    let Response::TurnAccepted { turn_id, .. } = client.request(send("做个周报")).await else {
        panic!("expected turn");
    };
    let Response::Ack = client
        .request(Request::BackgroundTurn {
            turn_id: turn_id.clone(),
        })
        .await
    else {
        panic!("expected ack");
    };
    let Response::TurnAccepted {
        turn_id: second, ..
    } = client.request(send("顺便问下天气")).await
    else {
        panic!("the thread should accept a new message");
    };
    assert_ne!(second, turn_id);
    hub.shutdown().await;
}

#[tokio::test]
async fn messages_come_in_pages_from_the_newest() {
    let provider = ScriptedProvider::new(["一", "二", "三"]);
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    for text in ["a", "b", "c"] {
        converse(&mut client, &thread, text, Vec::new()).await;
    }
    let Response::Messages { messages, more, .. } = client
        .request(Request::ListMessages {
            thread_id: thread.clone(),
            before: None,
            limit: Some(4),
        })
        .await
    else {
        panic!("expected messages");
    };
    assert!(more);
    assert_eq!(messages.len(), 4);
    assert_eq!(messages[2].text, "c");
    let Response::Messages {
        messages: older,
        more,
        ..
    } = client
        .request(Request::ListMessages {
            thread_id: thread,
            before: Some(messages[0].created_at),
            limit: Some(4),
        })
        .await
    else {
        panic!("expected messages");
    };
    assert!(!more);
    assert_eq!(
        older.first().map(|message| message.text.as_str()),
        Some("a")
    );
    hub.shutdown().await;
}

#[tokio::test]
async fn new_threads_are_titled_by_the_model_after_the_first_answer() {
    let provider = ScriptedProvider::sequence([
        vec![ModelChunk::Text("可以去西湖".into())],
        vec![ModelChunk::Text("「杭州周末去哪」".into())],
    ]);
    let mut runtime = runtime(provider);
    runtime.auto_titles = true;
    let hub = Hub::start(HubConfig::ephemeral(), runtime).await.unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "这周末杭州去哪玩", Vec::new()).await;
    for _ in 0..200 {
        let Response::Threads { threads } = client.request(Request::ListThreads).await else {
            panic!("expected threads");
        };
        if let Some(title) = threads
            .iter()
            .find(|candidate| candidate.id == thread)
            .and_then(|candidate| candidate.title.clone())
        {
            assert_eq!(title, "杭州周末去哪");
            hub.shutdown().await;
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("the thread was never titled");
}

#[tokio::test]
async fn subthreads_open_after_confirmation_and_report_back() {
    let provider = ScriptedProvider::sequence([
        vec![tool_call(
            "open_subthreads",
            &serde_json::json!({
                "reason": "分别去查",
                "tasks": [{ "title": "苏州周末", "task": "查苏州周末去哪" }],
            }),
        )],
        vec![ModelChunk::Text("好的".into())],
        vec![ModelChunk::Text("好的".into())],
        vec![ModelChunk::Text("好的".into())],
        vec![ModelChunk::Text("好的".into())],
    ]);
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    let Response::TurnAccepted { .. } = client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "比较一下周末去哪".into(),
            context: Vec::new(),
            quote: None,
            files: Vec::new(),
            threads: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    let mut answers: Vec<Answer> = vec![(
        |kind| matches!(kind, ConfirmKind::OpenSubthreads { titles, .. } if titles == &["苏州周末".to_owned()]),
        ConfirmChoice::Yes,
    )];
    answer_confirms(&mut client, &thread, &mut answers, 1).await;
    assert_eq!(answers.len(), 0);
    for _ in 0..300 {
        let Response::Messages { messages, .. } = client
            .request(Request::ListMessages {
                thread_id: thread.clone(),
                before: None,
                limit: None,
            })
            .await
        else {
            panic!("expected messages");
        };
        if messages.iter().any(|message| {
            matches!(&message.attachment, Some(Attachment::Report { title, .. }) if title == "苏州周末")
        }) {
            let Response::Threads { threads } = client.request(Request::ListThreads).await else {
                panic!("expected threads");
            };
            assert!(threads.iter().any(|candidate| candidate.parent_id.as_deref() == Some(thread.as_str())));
            hub.shutdown().await;
            return;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    panic!("the subthread never reported back");
}

#[tokio::test]
async fn sub_agents_run_in_parallel_and_return_together() {
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![tool_call(
            "spawn_agents",
            &serde_json::json!({
                "tasks": [
                    { "title": "查苏州", "task": "苏州周末去哪" },
                    { "title": "查杭州", "task": "杭州周末去哪" },
                ],
            }),
        )],
        vec![ModelChunk::Text("园林".into())],
        vec![ModelChunk::Text("西湖".into())],
        vec![ModelChunk::Text("汇总好了".into())],
    ]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider.clone()))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "比较苏州和杭州", Vec::new()).await;
    let requests = provider.requests();
    let result = requests
        .last()
        .unwrap()
        .messages
        .iter()
        .rev()
        .find(|message| message.role == xiaoban_agent::ChatRole::Tool)
        .unwrap()
        .content
        .clone();
    assert!(result.contains("查苏州"));
    assert!(result.contains("查杭州"));
    assert!(result.contains("园林") && result.contains("西湖"));
    hub.shutdown().await;
}

fn is_recipe(attachment: &Attachment) -> bool {
    matches!(attachment, Attachment::Recipe { .. })
}

#[tokio::test]
async fn recipes_attach_a_card_and_cook_only_when_asked() {
    let provider = ScriptedProvider::sequence([
        vec![tool_call(
            "kitchen_fridge",
            &serde_json::json!({ "items": [{ "name": "豆腐", "amount": "1 块" }] }),
        )],
        vec![tool_call(
            "recipe",
            &serde_json::json!({
                "dish": "红烧豆腐",
                "minutes": 25,
                "servings": 2,
                "style": "家常",
                "photo_query": "Braised tofu",
                "ingredients": [
                    { "name": "老豆腐", "amount": "1 块", "staple": false },
                    { "name": "五花肉", "amount": "100g", "staple": false },
                    { "name": "生抽", "amount": "1 勺", "staple": true },
                ],
                "steps": [
                    { "title": "煎豆腐", "text": "豆腐切块煎到两面金黄", "heat": "medium", "seconds": 240 },
                    { "title": "焖 8 分钟", "text": "加水焖", "heat": "low", "seconds": 480 },
                ],
            }),
        )],
        vec![ModelChunk::Text("缺五花肉".into())],
    ]);
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "红烧豆腐怎么做", Vec::new()).await;

    let message = latest_message_with(&mut client, &thread, is_recipe).await;
    let Some(Attachment::Recipe { recipe_id }) = message.attachment else {
        panic!("expected a recipe card");
    };
    let Response::Recipe { view } = client
        .request(Request::Recipe {
            id: recipe_id.clone(),
        })
        .await
    else {
        panic!("expected recipe");
    };
    assert_eq!(view.recipe.dish, "红烧豆腐");
    assert_eq!(view.recipe.thread_id, thread);
    assert_eq!(view.have, ["老豆腐", "生抽"]);
    assert_eq!(view.listed.len(), 0);

    let Response::Kitchen { kitchen } = client.request(Request::Kitchen).await else {
        panic!("expected kitchen");
    };
    assert!(kitchen.cook.is_none());
    assert_eq!(kitchen.recipes, std::slice::from_ref(&recipe_id));

    let Response::Recipe { view } = client
        .request(Request::RecipeToShopping {
            id: recipe_id.clone(),
        })
        .await
    else {
        panic!("expected recipe");
    };
    assert_eq!(view.listed, ["五花肉"]);

    let Response::Kitchen { kitchen } = client
        .request(Request::CookRecipe { id: recipe_id })
        .await
    else {
        panic!("expected kitchen");
    };
    let cook = kitchen.cook.unwrap();
    assert_eq!(cook.dishes, ["红烧豆腐"]);
    assert_eq!((cook.steps.len(), cook.servings, cook.minutes), (2, 2, 25));
    assert_eq!(kitchen.shopping[0].amount, "100g");

    let missing = client
        .try_request(Request::Recipe { id: "nope".into() })
        .await
        .unwrap_err();
    assert_eq!(missing.code, ErrorCode::NotFound);
    hub.shutdown().await;
}
