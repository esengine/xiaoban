use std::net::SocketAddr;
use std::sync::Arc;

use axum::extract::ws::{Message as WsMessage, WebSocket};
use futures_util::{SinkExt, StreamExt};
use tokio::sync::{broadcast, mpsc};
use xiaoban_protocol::{ClientFrame, ErrorCode, PROTOCOL_VERSION, ProtocolError, ServerFrame};

use crate::auth::{self, Authenticated};
use crate::handlers;
use crate::state::SharedState;

pub async fn run(socket: WebSocket, peer: SocketAddr, state: SharedState) {
    let (mut sink, mut stream) = socket.split();
    let (out, mut outbox) = mpsc::channel::<ServerFrame>(256);

    let writer = tokio::spawn(async move {
        while let Some(frame) = outbox.recv().await {
            let Ok(text) = serde_json::to_string(&frame) else {
                continue;
            };
            if sink.send(WsMessage::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    let Some(session) = handshake(&mut stream, peer, &state, &out).await else {
        drop(out);
        let _ = writer.await;
        return;
    };
    tracing::info!(device = %session.device_id, %peer, "device connected");

    let forward = tokio::spawn(forward_events(state.events.subscribe(), out.clone()));

    while let Some(Ok(message)) = stream.next().await {
        let WsMessage::Text(text) = message else {
            continue;
        };
        match serde_json::from_str::<ClientFrame>(&text) {
            Ok(ClientFrame::Request { id, body }) => {
                let state = Arc::clone(&state);
                let out = out.clone();
                let local = session.local;
                tokio::spawn(async move {
                    let frame = match handlers::handle(&state, local, body).await {
                        Ok(body) => ServerFrame::Response { id, body },
                        Err(error) => ServerFrame::Error {
                            id: Some(id),
                            error,
                        },
                    };
                    let _ = out.send(frame).await;
                });
            }
            Ok(ClientFrame::Hello { .. }) => {
                let _ = out
                    .send(error(None, ErrorCode::BadRequest, "already authenticated"))
                    .await;
            }
            Err(err) => {
                let _ = out
                    .send(error(None, ErrorCode::BadRequest, &err.to_string()))
                    .await;
            }
        }
    }

    forward.abort();
    drop(out);
    let _ = writer.await;
    tracing::info!(device = %session.device_id, "device disconnected");
}

async fn handshake(
    stream: &mut futures_util::stream::SplitStream<WebSocket>,
    peer: SocketAddr,
    state: &SharedState,
    out: &mpsc::Sender<ServerFrame>,
) -> Option<Authenticated> {
    let reply = |frame| async move {
        let _ = out.send(frame).await;
    };
    let text = loop {
        match stream.next().await? {
            Ok(WsMessage::Text(text)) => break text,
            Ok(WsMessage::Close(_)) | Err(_) => return None,
            Ok(_) => {}
        }
    };
    let Ok(ClientFrame::Hello { protocol, device }) = serde_json::from_str::<ClientFrame>(&text)
    else {
        reply(error(None, ErrorCode::BadRequest, "expected hello")).await;
        return None;
    };
    if protocol != PROTOCOL_VERSION {
        reply(error(
            None,
            ErrorCode::UnsupportedProtocol,
            "protocol version mismatch",
        ))
        .await;
        return None;
    }
    match auth::authenticate(&state.store, &state.pairing, &device, peer).await {
        Ok(session) => {
            reply(ServerFrame::Welcome {
                protocol: PROTOCOL_VERSION,
                hub: state.info.clone(),
                device_token: session.issued_token.clone(),
            })
            .await;
            Some(session)
        }
        Err(err) => {
            reply(ServerFrame::Error {
                id: None,
                error: err,
            })
            .await;
            None
        }
    }
}

async fn forward_events(
    mut events: broadcast::Receiver<xiaoban_protocol::Event>,
    out: mpsc::Sender<ServerFrame>,
) {
    loop {
        match events.recv().await {
            Ok(event) => {
                if out.send(ServerFrame::Event { event }).await.is_err() {
                    return;
                }
            }
            Err(broadcast::error::RecvError::Lagged(skipped)) => {
                tracing::warn!(skipped, "event subscriber lagged");
            }
            Err(broadcast::error::RecvError::Closed) => return,
        }
    }
}

fn error(id: Option<u64>, code: ErrorCode, message: &str) -> ServerFrame {
    ServerFrame::Error {
        id,
        error: ProtocolError::new(code, message),
    }
}
