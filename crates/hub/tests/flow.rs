use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};
use xiaoban_agent::{
    Agent, ModelProvider, RecordingProvider, ScriptedProvider, StablePrefix, prefix_reuse,
};
use xiaoban_hub::{Hub, HubConfig, HubHandle};
use xiaoban_protocol::{
    ClientFrame, ContextNote, Credential, DeviceHello, ErrorCode, Event, PROTOCOL_VERSION,
    Platform, Request, Response, Role, ServerFrame,
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

fn agent(provider: impl ModelProvider) -> Agent {
    Agent::new(provider, StablePrefix::new("system"))
}

async fn start_hub(chunks: &[&str]) -> HubHandle {
    let agent = agent(ScriptedProvider::new(chunks.iter().copied()));
    Hub::start(HubConfig::ephemeral(), agent).await.unwrap()
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
    let hub = Hub::start(HubConfig::ephemeral(), agent(provider.clone()))
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
    let hub = Hub::start(HubConfig::ephemeral(), agent(provider))
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

    let hub = Hub::start(config.clone(), agent(ScriptedProvider::new(["7:40"])))
        .await
        .unwrap();
    let (mut client, _) = TestClient::connect(&hub, "desktop", Credential::Local).await;
    let thread = new_thread(&mut client).await;
    converse(&mut client, &thread, "明天几点出门", Vec::new()).await;
    drop(client);
    hub.shutdown().await;

    let provider = RecordingProvider::new(ScriptedProvider::new(["带"]));
    let upgraded = Agent::new(provider.clone(), StablePrefix::new("新版提示词"));
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
