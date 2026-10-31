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
    Day, FixedLocator, FixedWeather, Forecast, Hit, Hub, HubConfig, HubHandle, HubRuntime, Maps,
    MemorySecrets, Prompts, Search, SecretStore, ServiceError, Travel,
};
use xiaoban_i18n::Locale;
use xiaoban_protocol::{
    Attachment, AutonomyLevel, ClientFrame, ContextNote, Coord, Credential, DeviceHello, ErrorCode,
    Event, FailureKind, Interpretation, Location, PROTOCOL_VERSION, Place, Platform, ProtocolError,
    ProviderId, Request, Response, Role, ServerFrame, ServiceId, Sky,
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
        })),
        weather: Arc::new(FixedWeather(Forecast {
            place: "杭州".into(),
            region: "中国 浙江".into(),
            timezone: "Asia/Shanghai".into(),
            now: None,
            days: vec![Day {
                date: "2026-11-01".into(),
                sky: Sky::Rain,
                condition: "light rain",
                high: 29.3,
                low: 16.2,
                rain_chance: Some(98),
            }],
        })),
        maps: Arc::new(FakeMaps),
        search: Arc::new(FakeSearch),
        fallback,
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

    let Response::Messages { messages } = client
        .request(Request::ListMessages {
            thread_id: thread.id,
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
    let Response::Thread { thread } = client.request(Request::CreateThread { title: None }).await
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

    let Response::Messages { messages } = client
        .request(Request::ListMessages { thread_id: thread })
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
    let Response::Messages { messages } = client
        .request(Request::ListMessages {
            thread_id: primary.clone(),
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

    let Response::Messages { messages } = client
        .request(Request::ListMessages {
            thread_id: thread.clone(),
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
            quote: Some("7:40".into()),
        })
        .await
    else {
        panic!("expected turn");
    };
    assert_eq!(message.quote.as_deref(), Some("7:40"));
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
    if key == GOOD_SERVICE_KEY {
        Ok(())
    } else {
        Err(ServiceError::InvalidKey)
    }
}

#[derive(Debug)]
struct FakeMaps;

impl Maps for FakeMaps {
    fn verify(&self, key: String) -> BoxFuture<'static, Result<(), ServiceError>> {
        Box::pin(async move { check(&key) })
    }

    fn find(
        &self,
        key: String,
        query: String,
        _: Option<String>,
    ) -> BoxFuture<'static, Result<Vec<Place>, ServiceError>> {
        Box::pin(async move {
            check(&key)?;
            let offset = f64::from(u32::try_from(query.chars().count()).unwrap()) / 100.0;
            Ok(vec![Place {
                name: query,
                address: "西湖区".into(),
                location: Coord {
                    lng: 120.1 + offset,
                    lat: 30.2 + offset,
                },
                kind: "公园".into(),
                distance: None,
            }])
        })
    }

    fn nearby_food(
        &self,
        key: String,
        at: Coord,
    ) -> BoxFuture<'static, Result<Vec<Place>, ServiceError>> {
        Box::pin(async move {
            check(&key)?;
            Ok(vec![Place {
                name: "知味观".into(),
                address: "湖滨".into(),
                location: at,
                kind: "中餐厅".into(),
                distance: Some(320),
            }])
        })
    }

    fn travel(
        &self,
        key: String,
        _: Coord,
        _: Coord,
    ) -> BoxFuture<'static, Result<Travel, ServiceError>> {
        Box::pin(async move {
            check(&key)?;
            Ok(Travel::Walk { minutes: 15 })
        })
    }

    fn image(
        &self,
        key: String,
        _: Coord,
        _: u8,
        _: u32,
        _: u32,
    ) -> BoxFuture<'static, Result<Arc<[u8]>, ServiceError>> {
        Box::pin(async move {
            check(&key)?;
            Ok(Arc::from(&b"png"[..]))
        })
    }
}

#[derive(Debug)]
struct FakeSearch;

impl Search for FakeSearch {
    fn search(&self, key: String, _: String) -> BoxFuture<'static, Result<Vec<Hit>, ServiceError>> {
        Box::pin(async move {
            check(&key)?;
            Ok(Vec::new())
        })
    }
}

fn save_trip_call() -> ModelChunk {
    ModelChunk::ToolCallDelta {
        index: 0,
        id: Some("trip".into()),
        name: Some("save_trip".into()),
        arguments: serde_json::json!({
            "title": "杭州 · 1 天",
            "city": "杭州",
            "party": "2 大 1 小",
            "days": [{
                "date": "2026-11-01",
                "change": "下雨，下午改成室内",
                "stops": [
                    { "name": "断桥", "time": "09:00", "note": "人少" },
                    { "name": "中国茶叶博物馆", "time": "15:00", "note": "室内" }
                ]
            }]
        })
        .to_string(),
    }
}

async fn latest_trip_message(client: &mut TestClient, thread: &str) -> xiaoban_protocol::Message {
    for _ in 0..100 {
        let Response::Messages { messages } = client
            .request(Request::ListMessages {
                thread_id: thread.into(),
            })
            .await
        else {
            panic!("expected messages");
        };
        if let Some(message) = messages
            .into_iter()
            .rev()
            .find(|message| matches!(message.attachment, Some(Attachment::Trip { .. })))
        {
            return message;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("no trip was saved");
}

async fn finish_message(client: &mut TestClient, turn_id: &str) -> xiaoban_protocol::Message {
    loop {
        match client.next_event().await {
            Event::TurnCompleted {
                turn_id: id,
                message,
                ..
            } if id == turn_id => return message,
            Event::TurnFailed {
                turn_id: id,
                failure,
            } if id == turn_id => panic!("{failure:?}"),
            _ => {}
        }
    }
}

async fn connect_amap(client: &mut TestClient, thread: &str) {
    let Response::ServiceConfigured { connected, .. } = client
        .request(Request::ConfigureService {
            service: ServiceId::Amap,
            api_key: "wrong".into(),
            resume_thread_id: Some(thread.into()),
        })
        .await
    else {
        panic!("expected configure result");
    };
    assert!(!connected);

    let Response::ServiceConfigured {
        connected,
        services,
    } = client
        .request(Request::ConfigureService {
            service: ServiceId::Amap,
            api_key: GOOD_SERVICE_KEY.into(),
            resume_thread_id: Some(thread.into()),
        })
        .await
    else {
        panic!("expected configure result");
    };
    assert!(connected);
    assert!(
        services
            .iter()
            .any(|status| status.service == ServiceId::Amap && status.connected)
    );
}

#[tokio::test]
async fn trips_ask_for_a_map_key_then_resume_and_save_located_stops() {
    let provider = ScriptedProvider::sequence([
        vec![save_trip_call()],
        vec![ModelChunk::Text("要先接上地图".into())],
        vec![save_trip_call()],
        vec![ModelChunk::Text("排好了".into())],
    ]);
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;

    let Response::TurnAccepted { turn_id, .. } = client
        .request(Request::SendMessage {
            thread_id: thread.clone(),
            text: "去杭州玩一天".into(),
            context: Vec::new(),
            quote: None,
        })
        .await
    else {
        panic!("expected turn");
    };
    let asked = finish_message(&mut client, &turn_id).await;
    assert_eq!(
        asked.attachment,
        Some(Attachment::ServiceNeeded {
            service: ServiceId::Amap
        })
    );

    connect_amap(&mut client, &thread).await;
    let saved = latest_trip_message(&mut client, &thread).await;
    let Some(Attachment::Trip { trip_id, version }) = saved.attachment else {
        panic!("expected a trip card, got {:?}", saved.attachment);
    };
    assert_eq!(version, 1);

    let Response::Trip { trip, latest } = client
        .request(Request::GetTrip {
            trip_id: trip_id.clone(),
            version: None,
        })
        .await
    else {
        panic!("expected trip");
    };
    assert_eq!(latest, 1);
    assert!(trip.verified);
    let day = &trip.days[0];
    assert_eq!(day.change.as_deref(), Some("下雨，下午改成室内"));
    assert_eq!(
        day.weather.as_ref().map(|weather| weather.sky),
        Some(Sky::Rain)
    );
    assert!(day.stops.iter().all(|stop| stop.location.is_some()));
    assert_eq!(day.stops[0].hop.as_deref(), Some("步行 15 分钟"));
    assert_eq!(day.stops[1].hop, None);

    let Response::Map { map } = client
        .request(Request::TripMap {
            trip_id,
            version: None,
            day: Some(0),
            width: 900,
            height: 900,
        })
        .await
    else {
        panic!("expected map");
    };
    assert!(map.image.starts_with("data:image/png;base64,"));

    let Response::Places { places } = client
        .request(Request::NearbyFood {
            location: day.stops[0].location.unwrap(),
        })
        .await
    else {
        panic!("expected places");
    };
    assert_eq!(places[0].name, "知味观");
    hub.shutdown().await;
}

#[tokio::test]
async fn declining_a_service_lets_the_trip_be_saved_unverified() {
    let provider = ScriptedProvider::sequence([
        vec![save_trip_call()],
        vec![ModelChunk::Text("要先接上地图".into())],
        vec![save_trip_call()],
        vec![ModelChunk::Text("按我知道的排了".into())],
    ]);
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "去杭州玩一天", Vec::new()).await;

    let Response::Ack = client
        .request(Request::DeclineService {
            service: ServiceId::Amap,
            thread_id: thread.clone(),
        })
        .await
    else {
        panic!("expected ack");
    };
    let saved = latest_trip_message(&mut client, &thread).await;
    let Some(Attachment::Trip { trip_id, .. }) = saved.attachment else {
        panic!("expected a trip card");
    };
    let Response::Trip { trip, .. } = client
        .request(Request::GetTrip {
            trip_id,
            version: None,
        })
        .await
    else {
        panic!("expected trip");
    };
    assert!(!trip.verified);
    assert!(
        trip.days[0]
            .stops
            .iter()
            .all(|stop| stop.location.is_none())
    );
    hub.shutdown().await;
}
