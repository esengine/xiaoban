use std::sync::Arc;
use std::time::Duration;

use futures_util::future::BoxFuture;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};
use xiaoban_agent::{
    AgentError, ConfiguredProvider, Connector, ModelProvider, OpenAiConfig, ProviderPreset,
    ModelChunk, RecordingProvider, ScriptedProvider, prefix_reuse,
};
use xiaoban_hub::{Hub, HubConfig, HubHandle, HubRuntime, MemorySecrets, Prompts, SecretStore};
use xiaoban_i18n::Locale;
use xiaoban_protocol::{
    AutonomyLevel, ClientFrame, ContextNote, Credential, DeviceHello, ErrorCode, Event,
    FailureKind, PROTOCOL_VERSION, Platform, ProviderId, Request, Response, Role,
    ServerFrame,
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
        self.next_id += 1;
        let id = self.next_id;
        self.send(&ClientFrame::Request { id, body }).await;
        loop {
            match self.recv().await {
                ServerFrame::Response { id: got, body } if got == id => return body,
                ServerFrame::Error {
                    id: Some(got),
                    error,
                } if got == id => {
                    panic!("request failed: {error:?}")
                }
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
            onboarding: format!("{chat_prompt}\n\nonboarding"),
        },
        connector: Arc::new(FixedConnector(Arc::new(provider))),
        secrets,
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
    assert_eq!(contents, ["新版提示词", "明天几点出门", "7:40", "要带伞吗"]);
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
async fn onboarding_is_a_model_led_conversation_that_saves_memories_through_tools() {
    let provider = RecordingProvider::new(ScriptedProvider::sequence([
        vec![ModelChunk::ToolCallDelta {
            index: 0,
            id: Some("c1".into()),
            name: Some("remember".into()),
            arguments: r#"{"subject":"称呼","value":"阿哲"}"#.into(),
        }],
        vec![ModelChunk::Text("好的阿哲，平时几点出门？".into())],
    ]));
    let hub = Hub::start(HubConfig::ephemeral(), runtime(provider.clone()))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;

    let Response::Thread { thread } = client.request(Request::StartOnboarding).await else {
        panic!("expected onboarding thread");
    };
    let Response::Thread { thread: again } = client.request(Request::StartOnboarding).await else {
        panic!("expected onboarding thread");
    };
    assert_eq!(again, thread);
    let Response::Threads { threads } = client.request(Request::ListThreads).await else {
        panic!("expected threads");
    };
    assert_eq!(threads, Vec::new());
    let Response::Messages { messages } = client
        .request(Request::ListMessages {
            thread_id: thread.id.clone(),
        })
        .await
    else {
        panic!("expected messages");
    };
    assert_eq!(messages.len(), 1);
    assert_eq!(messages[0].role, Role::Assistant);
    let opening = messages[0].text.clone();

    let Response::TurnAccepted { turn_id, .. } = client
        .request(Request::SendMessage {
            thread_id: thread.id.clone(),
            text: "叫我阿哲".into(),
            context: Vec::new(),
        })
        .await
    else {
        panic!("expected turn");
    };
    let (mut used, mut saved) = (false, None);
    loop {
        match client.next_event().await {
            Event::ToolUsed { tool, .. } => used = tool == "remember",
            Event::MemorySaved { memory } => saved = Some(memory),
            Event::TurnCompleted {
                turn_id: id,
                message,
                ..
            } if id == turn_id => {
                assert_eq!(message.text, "好的阿哲，平时几点出门？");
                break;
            }
            Event::TurnFailed { failure, .. } => panic!("turn failed: {failure:?}"),
            _ => {}
        }
    }
    assert!(used);
    let saved = saved.expect("memory should be announced");
    assert_eq!((saved.subject.as_str(), saved.value.as_str()), ("称呼", "阿哲"));

    let requests = provider.requests();
    assert_eq!(requests.len(), 2);
    assert!(requests[0].messages[0].content.ends_with("onboarding"));
    assert_eq!(requests[0].messages[1].content, opening);
    assert_eq!(requests[0].tools[0].name, "remember");
    assert!(prefix_reuse(&requests[0], &requests[1]).is_intact());
    hub.shutdown().await;
}
