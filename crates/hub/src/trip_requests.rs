use xiaoban_i18n::keys;
use xiaoban_protocol::{
    ErrorCode, ProtocolError, ProviderId, Request, Response, ServiceId, ServiceStatus,
};

use crate::services::ServiceError;
use crate::state::SharedState;
use crate::turns;

type Handled = Result<Response, ProtocolError>;

pub async fn handle(state: &SharedState, local: bool, request: Request) -> Handled {
    match request {
        Request::Services => Ok(Response::Services {
            services: statuses(state),
        }),
        Request::ConfigureService {
            service,
            api_key,
            resume_thread_id,
        } => configure(state, local, service, &api_key, resume_thread_id).await,
        Request::DeclineService { service, thread_id } => decline(state, service, thread_id).await,
        Request::GetTrip { trip_id, version } => trip(state, trip_id, version).await,
        Request::TripCalendar { trip_id, version } => {
            let (trip, _) = load_trip(state, trip_id, version).await?;
            Ok(Response::TripCalendar {
                calendar: crate::calendar::build(&trip),
            })
        }
        Request::EventCalendar { event } => Ok(Response::TripCalendar {
            calendar: crate::calendar::single(&event),
        }),
        _ => Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "not a trip request",
        )),
    }
}

pub fn search_key(state: &SharedState) -> Option<String> {
    if let Some(key) = state.active().search_key {
        return Some(key);
    }
    match state.secrets.load(ProviderId::Deepseek) {
        Ok(key) => key.filter(|key| !key.trim().is_empty()),
        Err(error) => {
            tracing::error!(%error, "failed to read the DeepSeek key");
            None
        }
    }
}

fn statuses(state: &SharedState) -> Vec<ServiceStatus> {
    vec![ServiceStatus {
        service: ServiceId::WebSearch,
        connected: search_key(state).is_some(),
    }]
}

fn resume_wire(state: &SharedState, connected: bool) -> String {
    state.localizer.text(if connected {
        keys::SERVICE_RESUME_SEARCH
    } else {
        keys::SERVICE_DECLINED_SEARCH
    })
}

async fn configure(
    state: &SharedState,
    local: bool,
    service: ServiceId,
    api_key: &str,
    resume: Option<String>,
) -> Handled {
    if !local {
        return Err(ProtocolError::new(
            ErrorCode::Unauthorized,
            "service keys can only be changed on the hub's own machine",
        ));
    }
    let ServiceId::WebSearch = service;
    let api_key = api_key.trim().to_owned();
    if api_key.is_empty() {
        return Err(ProtocolError::new(ErrorCode::BadRequest, "key is empty"));
    }
    let connected = match state.web.verify(api_key.clone()).await {
        Ok(()) | Err(ServiceError::NoBalance) => true,
        Err(ServiceError::InvalidKey) => false,
        Err(error) => return Err(ProtocolError::new(ErrorCode::Internal, error.to_string())),
    };
    if connected {
        state
            .secrets
            .save(ProviderId::Deepseek, &api_key)
            .map_err(|error| ProtocolError::new(ErrorCode::Internal, error.to_string()))?;
        if let Some(thread_id) = resume {
            turns::resume(state, thread_id, &resume_wire(state, true))?;
        }
    }
    Ok(Response::ServiceConfigured {
        connected,
        services: statuses(state),
    })
}

async fn decline(state: &SharedState, service: ServiceId, thread_id: String) -> Handled {
    state
        .store
        .decline_service(thread_id.clone(), service)
        .await?;
    turns::resume(state, thread_id, &resume_wire(state, false))?;
    Ok(Response::Ack)
}

async fn load_trip(
    state: &SharedState,
    trip_id: String,
    version: Option<u32>,
) -> Result<(xiaoban_protocol::Trip, u32), ProtocolError> {
    state
        .store
        .trip(trip_id, version)
        .await?
        .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "no such trip"))
}

async fn trip(state: &SharedState, trip_id: String, version: Option<u32>) -> Handled {
    let (trip, latest) = load_trip(state, trip_id, version).await?;
    Ok(Response::Trip { trip, latest })
}
