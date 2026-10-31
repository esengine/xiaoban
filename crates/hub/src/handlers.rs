use xiaoban_protocol::{
    AutonomyLevel, ContextNote, ErrorCode, Event, ProtocolError, Request, Response,
};

use crate::state::SharedState;
use crate::{interpret, model, preferences, turns};

type Handled = Result<Response, ProtocolError>;

fn bad_request(detail: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::BadRequest, detail)
}

fn trimmed(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

pub async fn handle(state: &SharedState, local: bool, request: Request) -> Handled {
    match request {
        Request::ListThreads => Ok(Response::Threads {
            threads: state.store.list_threads().await?,
        }),
        Request::CreateThread { title } => create_thread(state, title.as_deref()).await,
        Request::ListMessages { thread_id } => Ok(Response::Messages {
            messages: state.store.list_messages(thread_id).await?,
        }),
        Request::SendMessage {
            thread_id,
            text,
            context,
        } => send(state, thread_id, &text, context).await,
        Request::CancelTurn { turn_id } => cancel(state, &turn_id),
        Request::CreatePairingCode => Ok(pairing_code(state)),
        Request::ListDevices => Ok(Response::Devices {
            devices: state.store.list_devices().await?,
        }),
        Request::RevokeDevice { device_id } => {
            state.store.revoke_device(device_id).await?;
            Ok(Response::Ack)
        }
        Request::ModelStatus => Ok(Response::ModelStatus {
            model: state.active().model,
        }),
        Request::ListProviders => model::list_providers(state).await,
        Request::ConfigureProvider {
            provider,
            api_key,
            model,
            base_url,
            label,
        } => {
            let selection = model::Selection {
                provider: Some(provider),
                api_key,
                model,
                base_url,
                label,
            };
            configure(state, local, selection).await
        }
        Request::UsageSummary => usage(state).await,
        Request::Preferences => Ok(Response::Preferences {
            preferences: preferences::load(state).await?,
        }),
        Request::SetAutonomy { level } => set_autonomy(state, level).await,
        Request::Remember { subject, value } => remember(state, &subject, &value).await,
        Request::ListMemories => Ok(Response::Memories {
            memories: state.store.list_memories().await?,
        }),
        Request::InterpretAnswer {
            subject,
            question,
            answer,
        } => interpret_answer(state, &subject, &question, &answer).await,
        Request::CompleteOnboarding => {
            preferences::complete_onboarding(state).await?;
            Ok(Response::Ack)
        }
    }
}

async fn create_thread(state: &SharedState, title: Option<&str>) -> Handled {
    let thread = state.store.create_thread(title.and_then(trimmed)).await?;
    state.publish(Event::ThreadUpdated {
        thread: thread.clone(),
    });
    Ok(Response::Thread { thread })
}

async fn send(
    state: &SharedState,
    thread_id: String,
    text: &str,
    context: Vec<ContextNote>,
) -> Handled {
    let text = trimmed(text).ok_or_else(|| bad_request("message is empty"))?;
    let (turn_id, message) = turns::start(state, thread_id, text, context).await?;
    Ok(Response::TurnAccepted { turn_id, message })
}

fn cancel(state: &SharedState, turn_id: &str) -> Handled {
    if state.turns.cancel(turn_id) {
        Ok(Response::Ack)
    } else {
        Err(ProtocolError::new(
            ErrorCode::NotFound,
            "turn is not running",
        ))
    }
}

fn pairing_code(state: &SharedState) -> Response {
    let (code, expires_at) = state.pairing.issue();
    Response::PairingCode {
        code,
        expires_at,
        addresses: crate::network::lan_addresses(),
        port: state.port,
    }
}

async fn configure(state: &SharedState, local: bool, selection: model::Selection) -> Handled {
    if !local {
        return Err(ProtocolError::new(
            ErrorCode::Unauthorized,
            "providers can only be configured on the hub's own machine",
        ));
    }
    model::configure(state, selection).await
}

async fn usage(state: &SharedState) -> Handled {
    let totals = state.store.usage_totals().await?;
    Ok(Response::Usage {
        usage: totals.usage,
        turns: totals.turns,
    })
}

async fn set_autonomy(state: &SharedState, level: AutonomyLevel) -> Handled {
    preferences::set_autonomy(state, level).await?;
    Ok(Response::Ack)
}

async fn remember(state: &SharedState, subject: &str, value: &str) -> Handled {
    let subject = trimmed(subject).ok_or_else(|| bad_request("memory subject is empty"))?;
    let value = trimmed(value).ok_or_else(|| bad_request("memory is empty"))?;
    let memory = state.store.remember(subject, value).await?;
    state.publish(Event::MemorySaved {
        memory: memory.clone(),
    });
    Ok(Response::Memory { memory })
}

async fn interpret_answer(
    state: &SharedState,
    subject: &str,
    question: &str,
    answer: &str,
) -> Handled {
    let subject = trimmed(subject).ok_or_else(|| bad_request("memory subject is empty"))?;
    let answer = trimmed(answer).ok_or_else(|| bad_request("answer is empty"))?;
    Ok(interpret::answer(state, subject, question.trim(), answer).await?)
}
