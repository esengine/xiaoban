use xiaoban_protocol::{ErrorCode, ProtocolError, Request, Response};

use crate::state::SharedState;
use crate::{model, turns};

pub async fn handle(
    state: &SharedState,
    local: bool,
    request: Request,
) -> Result<Response, ProtocolError> {
    Ok(match request {
        Request::ListThreads => Response::Threads {
            threads: state.store.list_threads().await?,
        },
        Request::CreateThread { title } => {
            let title = title
                .map(|title| title.trim().to_owned())
                .filter(|title| !title.is_empty());
            let thread = state.store.create_thread(title).await?;
            state.publish(xiaoban_protocol::Event::ThreadUpdated {
                thread: thread.clone(),
            });
            Response::Thread { thread }
        }
        Request::ListMessages { thread_id } => Response::Messages {
            messages: state.store.list_messages(thread_id).await?,
        },
        Request::SendMessage {
            thread_id,
            text,
            context,
        } => {
            let text = text.trim().to_owned();
            if text.is_empty() {
                return Err(ProtocolError::new(
                    ErrorCode::BadRequest,
                    "message is empty",
                ));
            }
            let (turn_id, message) = turns::start(state, thread_id, text, context).await?;
            Response::TurnAccepted { turn_id, message }
        }
        Request::CancelTurn { turn_id } => {
            if !state.turns.cancel(&turn_id) {
                return Err(ProtocolError::new(
                    ErrorCode::NotFound,
                    "turn is not running",
                ));
            }
            Response::Ack
        }
        Request::CreatePairingCode => {
            let (code, expires_at) = state.pairing.issue();
            Response::PairingCode { code, expires_at }
        }
        Request::ListDevices => Response::Devices {
            devices: state.store.list_devices().await?,
        },
        Request::RevokeDevice { device_id } => {
            state.store.revoke_device(device_id).await?;
            Response::Ack
        }
        Request::ModelStatus => Response::ModelStatus {
            model: state.active().model,
        },
        Request::ListProviders => model::list_providers(state).await?,
        Request::ConfigureProvider {
            provider,
            api_key,
            model,
            base_url,
            label,
        } => {
            if !local {
                return Err(ProtocolError::new(
                    ErrorCode::Unauthorized,
                    "providers can only be configured on the hub's own machine",
                ));
            }
            let selection = model::Selection {
                provider: Some(provider),
                api_key,
                model,
                base_url,
                label,
            };
            model::configure(state, selection).await?
        }
        Request::UsageSummary => {
            let totals = state.store.usage_totals().await?;
            Response::Usage {
                usage: totals.usage,
                turns: totals.turns,
            }
        }
    })
}
