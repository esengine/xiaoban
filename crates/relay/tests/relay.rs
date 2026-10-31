use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream, connect_async};
use xiaoban_protocol::RelayFrame;
use xiaoban_relay::Relay;

type Ws = WebSocketStream<MaybeTlsStream<TcpStream>>;

async fn next_text(ws: &mut Ws) -> String {
    let message = tokio::time::timeout(Duration::from_secs(5), ws.next())
        .await
        .expect("timed out")
        .unwrap()
        .unwrap();
    message.into_text().unwrap().to_string()
}

#[tokio::test]
async fn forwards_opaque_payloads_between_hub_and_device() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    tokio::spawn(axum::serve(listener, Relay::default().router()).into_future());
    let base = format!("ws://{addr}/v1/rooms/home");

    let (mut hub, _) = connect_async(format!("{base}?role=hub")).await.unwrap();
    let (mut phone, _) = connect_async(format!("{base}?role=device&peer=phone"))
        .await
        .unwrap();

    let joined: RelayFrame = serde_json::from_str(&next_text(&mut hub).await).unwrap();
    assert_eq!(
        joined,
        RelayFrame::PeerJoined {
            peer: "phone".into()
        }
    );

    phone
        .send(Message::Text("ciphertext-1".into()))
        .await
        .unwrap();
    let data: RelayFrame = serde_json::from_str(&next_text(&mut hub).await).unwrap();
    assert_eq!(
        data,
        RelayFrame::Data {
            peer: "phone".into(),
            payload: "ciphertext-1".into()
        }
    );

    let reply = serde_json::to_string(&RelayFrame::Data {
        peer: "phone".into(),
        payload: "ciphertext-2".into(),
    })
    .unwrap();
    hub.send(Message::Text(reply.into())).await.unwrap();
    assert_eq!(next_text(&mut phone).await, "ciphertext-2");
}
