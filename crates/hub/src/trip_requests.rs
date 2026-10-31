use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use xiaoban_i18n::keys;
use xiaoban_protocol::{
    Coord, ErrorCode, MapView, ProtocolError, Request, Response, ServiceId, ServiceStatus,
};

use crate::geo::{MAX_SIDE, fit};
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
        Request::TripMap {
            trip_id,
            version,
            day,
            width,
            height,
        } => {
            let request = MapRequest {
                trip_id,
                version,
                day,
                width,
                height,
            };
            map(state, request).await
        }
        Request::NearbyFood { location } => nearby_food(state, location).await,
        _ => Err(ProtocolError::new(
            ErrorCode::BadRequest,
            "not a trip request",
        )),
    }
}

fn local_only(local: bool) -> Result<(), ProtocolError> {
    if local {
        return Ok(());
    }
    Err(ProtocolError::new(
        ErrorCode::Unauthorized,
        "service keys can only be changed on the hub's own machine",
    ))
}

fn service_key(state: &SharedState, service: ServiceId) -> Result<String, ProtocolError> {
    state
        .secrets
        .load_service(service)
        .map_err(|error| ProtocolError::new(ErrorCode::Internal, error.to_string()))?
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "service is not connected"))
}

fn unavailable(error: ServiceError) -> ProtocolError {
    ProtocolError::new(ErrorCode::Internal, error.to_string())
}

fn statuses(state: &SharedState) -> Vec<ServiceStatus> {
    ServiceId::ALL
        .into_iter()
        .map(|service| ServiceStatus {
            service,
            connected: matches!(state.secrets.load_service(service), Ok(Some(key)) if !key.trim().is_empty()),
        })
        .collect()
}

async fn verify(state: &SharedState, service: ServiceId, key: String) -> Result<(), ServiceError> {
    match service {
        ServiceId::Amap => state.maps.verify(key).await,
        ServiceId::Bocha => state
            .search
            .search(key, state.localizer.text(keys::SERVICE_VERIFY_QUERY))
            .await
            .map(drop),
    }
}

fn resume_wire(state: &SharedState, service: ServiceId, connected: bool) -> String {
    let key = match (service, connected) {
        (ServiceId::Amap, true) => keys::SERVICE_RESUME_AMAP,
        (ServiceId::Bocha, true) => keys::SERVICE_RESUME_BOCHA,
        (ServiceId::Amap, false) => keys::SERVICE_DECLINED_AMAP,
        (ServiceId::Bocha, false) => keys::SERVICE_DECLINED_BOCHA,
    };
    state.localizer.text(key)
}

async fn configure(
    state: &SharedState,
    local: bool,
    service: ServiceId,
    api_key: &str,
    resume: Option<String>,
) -> Handled {
    local_only(local)?;
    let api_key = api_key.trim().to_owned();
    if api_key.is_empty() {
        return Err(ProtocolError::new(ErrorCode::BadRequest, "key is empty"));
    }
    let connected = match verify(state, service, api_key.clone()).await {
        Ok(()) => true,
        Err(ServiceError::InvalidKey) => false,
        Err(error) => return Err(unavailable(error)),
    };
    if connected {
        state
            .secrets
            .save_service(service, &api_key)
            .map_err(|error| ProtocolError::new(ErrorCode::Internal, error.to_string()))?;
        if let Some(thread_id) = resume {
            turns::resume(state, thread_id, &resume_wire(state, service, true))?;
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
    turns::resume(state, thread_id, &resume_wire(state, service, false))?;
    Ok(Response::Ack)
}

async fn trip(state: &SharedState, trip_id: String, version: Option<u32>) -> Handled {
    let (trip, latest) = state
        .store
        .trip(trip_id, version)
        .await?
        .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "no such trip"))?;
    Ok(Response::Trip { trip, latest })
}

struct MapRequest {
    trip_id: String,
    version: Option<u32>,
    day: Option<u32>,
    width: u32,
    height: u32,
}

async fn map(state: &SharedState, request: MapRequest) -> Handled {
    let key = service_key(state, ServiceId::Amap)?;
    let (trip, _) = state
        .store
        .trip(request.trip_id, request.version)
        .await?
        .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "no such trip"))?;
    let points: Vec<Coord> = trip
        .days
        .iter()
        .enumerate()
        .filter(|(index, _)| {
            request
                .day
                .is_none_or(|day| usize::try_from(day).ok() == Some(*index))
        })
        .flat_map(|(_, day)| day.stops.iter().filter_map(|stop| stop.location))
        .collect();
    let (width, height) = (
        request.width.clamp(1, MAX_SIDE),
        request.height.clamp(1, MAX_SIDE),
    );
    let (center, zoom) = fit(&points, width, height)
        .ok_or_else(|| ProtocolError::new(ErrorCode::NotFound, "trip has no located stops"))?;
    let image = state
        .maps
        .image(key, center, zoom, width, height)
        .await
        .map_err(unavailable)?;
    Ok(Response::Map {
        map: MapView {
            image: format!("data:image/png;base64,{}", STANDARD.encode(&image)),
            center,
            zoom,
            width,
            height,
        },
    })
}

async fn nearby_food(state: &SharedState, location: Coord) -> Handled {
    let key = service_key(state, ServiceId::Amap)?;
    let places = state
        .maps
        .nearby_food(key, location)
        .await
        .map_err(unavailable)?;
    Ok(Response::Places { places })
}
