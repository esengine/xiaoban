use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use axum::Router;
use axum::extract::ws::{Message, WebSocket};
use axum::extract::{Path, Query, State, WebSocketUpgrade};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use futures_util::{SinkExt, StreamExt};
use serde::Deserialize;
use tokio::sync::mpsc;
use xiaoban_protocol::{RelayFrame, RelayRole};

type Outbox = mpsc::Sender<String>;

#[derive(Debug, Default)]
struct Room {
    hub: Option<Outbox>,
    devices: HashMap<String, Outbox>,
}

#[derive(Debug, Default, Clone)]
pub struct Relay {
    rooms: Arc<Mutex<HashMap<String, Room>>>,
}

#[derive(Debug, Deserialize)]
struct Join {
    role: RelayRole,
    #[serde(default)]
    peer: Option<String>,
}

impl Relay {
    pub fn router(self) -> Router {
        Router::new()
            .route("/v1/rooms/{room}", get(join))
            .route("/healthz", get(|| async { "ok" }))
            .with_state(self)
    }

    fn attach(&self, room: &str, role: RelayRole, peer: &str, outbox: Outbox) -> bool {
        let mut rooms = self.rooms.lock().unwrap();
        let entry = rooms.entry(room.to_owned()).or_default();
        match role {
            RelayRole::Hub => {
                if entry.hub.as_ref().is_some_and(|hub| !hub.is_closed()) {
                    return false;
                }
                entry.hub = Some(outbox);
                true
            }
            RelayRole::Device => {
                entry.devices.insert(peer.to_owned(), outbox);
                if let Some(hub) = &entry.hub {
                    let _ = hub.try_send(encode(&RelayFrame::PeerJoined {
                        peer: peer.to_owned(),
                    }));
                }
                true
            }
        }
    }

    fn detach(&self, room: &str, role: RelayRole, peer: &str) {
        let mut rooms = self.rooms.lock().unwrap();
        let Some(entry) = rooms.get_mut(room) else {
            return;
        };
        match role {
            RelayRole::Hub => entry.hub = None,
            RelayRole::Device => {
                entry.devices.remove(peer);
                if let Some(hub) = &entry.hub {
                    let _ = hub.try_send(encode(&RelayFrame::PeerLeft {
                        peer: peer.to_owned(),
                    }));
                }
            }
        }
        if entry.hub.is_none() && entry.devices.is_empty() {
            rooms.remove(room);
        }
    }

    fn route(&self, room: &str, role: RelayRole, peer: &str, text: String) {
        let rooms = self.rooms.lock().unwrap();
        let Some(entry) = rooms.get(room) else {
            return;
        };
        match role {
            RelayRole::Device => {
                if let Some(hub) = &entry.hub {
                    let frame = RelayFrame::Data {
                        peer: peer.to_owned(),
                        payload: text,
                    };
                    let _ = hub.try_send(encode(&frame));
                }
            }
            RelayRole::Hub => {
                if let Ok(RelayFrame::Data { peer, payload }) = serde_json::from_str(&text)
                    && let Some(device) = entry.devices.get(&peer)
                {
                    let _ = device.try_send(payload);
                }
            }
        }
    }
}

fn encode(frame: &RelayFrame) -> String {
    serde_json::to_string(frame).unwrap_or_default()
}

async fn join(
    ws: WebSocketUpgrade,
    Path(room): Path<String>,
    Query(query): Query<Join>,
    State(relay): State<Relay>,
) -> Response {
    let peer = match (query.role, query.peer) {
        (RelayRole::Hub, _) => "hub".to_owned(),
        (RelayRole::Device, Some(peer)) if !peer.is_empty() => peer,
        (RelayRole::Device, _) => {
            return (StatusCode::BAD_REQUEST, "device peer id required").into_response();
        }
    };
    ws.on_upgrade(move |socket| connection(socket, relay, room, query.role, peer))
}

async fn connection(socket: WebSocket, relay: Relay, room: String, role: RelayRole, peer: String) {
    let (mut sink, mut stream) = socket.split();
    let (outbox, mut inbox) = mpsc::channel::<String>(256);
    if !relay.attach(&room, role, &peer, outbox) {
        let _ = sink.send(Message::Close(None)).await;
        return;
    }
    let writer = tokio::spawn(async move {
        while let Some(text) = inbox.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });
    while let Some(Ok(message)) = stream.next().await {
        if let Message::Text(text) = message {
            relay.route(&room, role, &peer, text.to_string());
        }
    }
    relay.detach(&room, role, &peer);
    writer.abort();
}
