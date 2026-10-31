use xiaoban_protocol::{
    AutonomyLevel, ContextNote, ErrorCode, Event, ProtocolError, Quote, Request, Response,
};

use crate::state::SharedState;
use crate::trip_requests;
use crate::{interpret, model, preferences, turns};

type Handled = Result<Response, ProtocolError>;

fn bad_request(detail: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::BadRequest, detail)
}

fn trimmed(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_owned())
}

#[allow(clippy::too_many_lines)]
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
            quote,
            files,
        } => {
            if !local && !files.is_empty() {
                return Err(bad_request("files can only be attached on this computer"));
            }
            send(state, thread_id, &text, context, quote, files).await
        }
        Request::CancelTurn { turn_id } => cancel(state, &turn_id),
        Request::RetryTurn { thread_id } => {
            let (turn_id, message) = turns::retry(state, thread_id).await?;
            Ok(Response::TurnAccepted { turn_id, message })
        }
        Request::RenameThread { thread_id, title } => rename_thread(state, thread_id, &title).await,
        Request::DeleteThread { thread_id } => delete_thread(state, thread_id).await,
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
        request @ (Request::Remember { .. }
        | Request::ListMemories
        | Request::TidyMemories
        | Request::ForgetMemory { .. }
        | Request::ListGalaxies
        | Request::PinMemory { .. }) => memories(state, local, request).await,
        Request::InterpretAnswer {
            subject,
            question,
            answer,
            follow_up,
            can_locate,
        } => {
            let question = interpret::Question {
                subject: &subject,
                text: &question,
                follow_up: follow_up.as_deref(),
                can_locate,
            };
            interpret_answer(state, question, &answer).await
        }
        Request::Locate => locate(state, local).await,
        Request::FileData { file_id } => file_data(state, &file_id),
        request @ (Request::AnswerConfirm { .. }
        | Request::PendingConfirms
        | Request::OperateStatus
        | Request::PauseTurn { .. }
        | Request::BackgroundTurn { .. }
        | Request::ResumeTurn { .. }
        | Request::AddNote { .. }) => crate::operate_tools::handle(state, request),
        request @ (Request::Services
        | Request::ConfigureService { .. }
        | Request::DeclineService { .. }
        | Request::GetTrip { .. }
        | Request::TripCalendar { .. }) => trip_requests::handle(state, local, request).await,
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

async fn memories(state: &SharedState, local: bool, request: Request) -> Handled {
    match request {
        Request::Remember { subject, value } => remember(state, &subject, &value).await,
        Request::ListMemories => Ok(Response::Memories {
            memories: state.store.list_memories().await?,
        }),
        Request::TidyMemories => tidy(state, local).await,
        Request::ForgetMemory { subject } => forget(state, subject).await,
        Request::ListGalaxies => Ok(Response::Galaxies {
            galaxies: state.store.list_galaxies().await?,
        }),
        Request::PinMemory { memory_id, pinned } => {
            let memory = state
                .store
                .set_memory_pinned(memory_id, pinned)
                .await?
                .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "no such memory"))?;
            state.publish(Event::MemorySaved { memory });
            Ok(Response::Ack)
        }
        _ => Err(bad_request("not a memory request")),
    }
}

async fn forget(state: &SharedState, subject: String) -> Handled {
    let memory_id =
        state.store.forget_memory(subject).await?.ok_or_else(|| {
            ProtocolError::new(ErrorCode::NotFound, "no memory with that subject")
        })?;
    state.publish(Event::MemoryForgotten { memory_id });
    Ok(Response::Ack)
}

async fn tidy(state: &SharedState, local: bool) -> Handled {
    if !local {
        return Err(bad_request("only this computer can tidy memories"));
    }
    let tally = crate::tidy::run(state).await;
    let count = |value: usize| u32::try_from(value).unwrap_or(u32::MAX);
    Ok(Response::MemoriesTidied {
        merged: count(tally.merged),
        replaced: count(tally.replaced),
        moved: count(tally.moved),
        summaries: count(tally.summaries),
    })
}

fn file_data(state: &SharedState, file_id: &str) -> Handled {
    state
        .files
        .data_url_by_id(file_id)
        .map(|url| Response::FileData { url })
        .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "no such image"))
}

async fn send(
    state: &SharedState,
    thread_id: String,
    text: &str,
    context: Vec<ContextNote>,
    quote: Option<Quote>,
    files: Vec<String>,
) -> Handled {
    let text = trimmed(text).ok_or_else(|| bad_request("message is empty"))?;
    let quote = quote.and_then(|quote| {
        let text = trimmed(&quote.text)?;
        Some(Quote { text, ..quote })
    });
    let (turn_id, message) = turns::start(state, thread_id, text, context, quote, files).await?;
    Ok(Response::TurnAccepted { turn_id, message })
}

async fn rename_thread(state: &SharedState, thread_id: String, title: &str) -> Handled {
    let title = trimmed(title).ok_or_else(|| bad_request("title is empty"))?;
    let thread = state.store.rename_thread(thread_id, title).await?;
    state.publish(Event::ThreadUpdated {
        thread: thread.clone(),
    });
    Ok(Response::Thread { thread })
}

async fn delete_thread(state: &SharedState, thread_id: String) -> Handled {
    let primary = preferences::load(state).await?.primary_thread_id;
    if primary.as_deref() == Some(thread_id.as_str()) {
        return Err(bad_request("the main conversation cannot be deleted"));
    }
    state.store.delete_thread(thread_id.clone()).await?;
    state.publish(Event::ThreadDeleted { thread_id });
    Ok(Response::Ack)
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
        memory: state.store.memory_usage_total().await?,
    })
}

async fn set_autonomy(state: &SharedState, level: AutonomyLevel) -> Handled {
    preferences::set_autonomy(state, level).await?;
    Ok(Response::Ack)
}

async fn remember(state: &SharedState, subject: &str, value: &str) -> Handled {
    let subject = trimmed(subject).ok_or_else(|| bad_request("memory subject is empty"))?;
    let value = trimmed(value).ok_or_else(|| bad_request("memory is empty"))?;
    let memory = state
        .store
        .remember(xiaoban_store::NewMemory::simple(
            subject,
            value,
            xiaoban_protocol::MemoryCategory::Other,
        ))
        .await?;
    state.publish(Event::MemorySaved {
        memory: memory.clone(),
    });
    Ok(Response::Memory { memory })
}

async fn interpret_answer(
    state: &SharedState,
    question: interpret::Question<'_>,
    answer: &str,
) -> Handled {
    if question.subject.trim().is_empty() {
        return Err(bad_request("memory subject is empty"));
    }
    let answer = trimmed(answer).ok_or_else(|| bad_request("answer is empty"))?;
    Ok(interpret::answer(state, question, answer).await?)
}

async fn locate(state: &SharedState, local: bool) -> Handled {
    if !local {
        return Err(ProtocolError::new(
            ErrorCode::Unauthorized,
            "only the hub's own machine can be located",
        ));
    }
    Ok(Response::Located {
        location: state.locator.locate().await,
    })
}
