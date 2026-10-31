use std::sync::Mutex;

use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde_json::{Value, json};
use xiaoban_agent::{ToolCall, ToolRunner, ToolSpec};
use xiaoban_i18n::{Key as MessageKey, Localizer, keys};
use xiaoban_protocol::{Attachment, Event, ServiceId};

use crate::services::ServiceError;
use crate::state::SharedState;
use crate::trip::{self, TripDraft};
use crate::weather::{MAX_DAYS, WeatherError};

pub const REMEMBER: &str = "remember";
pub const WEATHER: &str = "weather";
pub const FIND_PLACES: &str = "find_places";
pub const WEB_SEARCH: &str = "web_search";
pub const SAVE_TRIP: &str = "save_trip";
const DEFAULT_DAYS: u8 = 7;

fn text(localizer: &Localizer, key: MessageKey) -> Value {
    json!({ "type": "string", "description": localizer.text(key) })
}

fn object(properties: &Value, required: &[&str]) -> Value {
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false,
    })
}

fn spec(name: &str, description: String, parameters: Value) -> ToolSpec {
    ToolSpec {
        name: name.to_owned(),
        description,
        parameters,
    }
}

pub fn specs(localizer: &Localizer) -> Vec<ToolSpec> {
    let l = localizer;
    let stop = object(
        &json!({
            "name": text(l, keys::TOOL_SAVE_TRIP_STOP_NAME),
            "time": text(l, keys::TOOL_SAVE_TRIP_STOP_TIME),
            "note": text(l, keys::TOOL_SAVE_TRIP_STOP_NOTE),
        }),
        &["name", "time", "note"],
    );
    let day = object(
        &json!({
            "date": text(l, keys::TOOL_SAVE_TRIP_DAY_DATE),
            "change": text(l, keys::TOOL_SAVE_TRIP_DAY_CHANGE),
            "stops": { "type": "array", "items": stop, "minItems": 1 },
        }),
        &["date", "stops"],
    );
    vec![
        spec(
            REMEMBER,
            l.text(keys::TOOL_REMEMBER_DESCRIPTION),
            object(
                &json!({
                    "subject": text(l, keys::TOOL_REMEMBER_SUBJECT),
                    "value": text(l, keys::TOOL_REMEMBER_VALUE),
                }),
                &["subject", "value"],
            ),
        ),
        spec(
            WEATHER,
            l.text(keys::TOOL_WEATHER_DESCRIPTION),
            object(
                &json!({
                    "place": text(l, keys::TOOL_WEATHER_PLACE),
                    "days": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": MAX_DAYS,
                        "description": l.text(keys::TOOL_WEATHER_DAYS),
                    },
                }),
                &["place"],
            ),
        ),
        spec(
            FIND_PLACES,
            l.text(keys::TOOL_FIND_PLACES_DESCRIPTION),
            object(
                &json!({
                    "query": text(l, keys::TOOL_FIND_PLACES_QUERY),
                    "city": text(l, keys::TOOL_FIND_PLACES_CITY),
                }),
                &["query"],
            ),
        ),
        spec(
            WEB_SEARCH,
            l.text(keys::TOOL_WEB_SEARCH_DESCRIPTION),
            object(
                &json!({ "query": text(l, keys::TOOL_WEB_SEARCH_QUERY) }),
                &["query"],
            ),
        ),
        spec(
            SAVE_TRIP,
            l.text(keys::TOOL_SAVE_TRIP_DESCRIPTION),
            object(
                &json!({
                    "title": text(l, keys::TOOL_SAVE_TRIP_TITLE),
                    "city": text(l, keys::TOOL_SAVE_TRIP_CITY),
                    "party": text(l, keys::TOOL_SAVE_TRIP_PARTY),
                    "needs": text(l, keys::TOOL_SAVE_TRIP_NEEDS),
                    "reminder": text(l, keys::TOOL_SAVE_TRIP_REMINDER),
                    "cost": text(l, keys::TOOL_SAVE_TRIP_COST),
                    "update": { "type": "boolean", "description": l.text(keys::TOOL_SAVE_TRIP_UPDATE) },
                    "days": { "type": "array", "items": day, "minItems": 1 },
                }),
                &["title", "city", "party", "days"],
            ),
        ),
    ]
}

fn error(message: &str) -> String {
    json!({ "error": message }).to_string()
}

#[derive(Deserialize)]
struct RememberArgs {
    subject: String,
    value: String,
}

#[derive(Deserialize)]
struct WeatherArgs {
    place: String,
    days: Option<u8>,
}

#[derive(Deserialize)]
struct FindArgs {
    query: String,
    city: Option<String>,
}

#[derive(Deserialize)]
struct SearchArgs {
    query: String,
}

pub enum Key {
    Ready(String),
    Declined,
    Missing,
}

pub struct HubTools<'a> {
    state: &'a SharedState,
    thread_id: &'a str,
    attachment: Mutex<Option<Attachment>>,
}

impl<'a> HubTools<'a> {
    pub fn new(state: &'a SharedState, thread_id: &'a str) -> Self {
        Self {
            state,
            thread_id,
            attachment: Mutex::new(None),
        }
    }

    pub fn attachment(&self) -> Option<Attachment> {
        self.attachment.lock().unwrap().clone()
    }

    fn attach(&self, attachment: Attachment) {
        let mut slot = self.attachment.lock().unwrap();
        if !matches!(*slot, Some(Attachment::Trip { .. })) {
            *slot = Some(attachment);
        }
    }

    pub async fn key(&self, service: ServiceId) -> Key {
        match self.state.secrets.load_service(service) {
            Ok(Some(key)) if !key.trim().is_empty() => return Key::Ready(key),
            Ok(_) => {}
            Err(error) => tracing::error!(%error, "failed to read service key"),
        }
        let declined = self
            .state
            .store
            .service_declined(self.thread_id.to_owned(), service)
            .await
            .unwrap_or(false);
        if declined {
            Key::Declined
        } else {
            Key::Missing
        }
    }

    fn missing(&self, service: ServiceId) -> String {
        self.attach(Attachment::ServiceNeeded { service });
        error(
            "not connected: the app is now showing the user a card to connect this service. Briefly say what you found so far and that the card below connects it; do not ask for the key in text.",
        )
    }

    fn declined() -> String {
        error(
            "the user chose not to connect this service in this conversation; continue from your own knowledge and say that places and travel times are unverified",
        )
    }

    fn failed(failure: ServiceError) -> String {
        match failure {
            ServiceError::InvalidKey => error("the saved key was rejected by the service"),
            ServiceError::Unavailable => error("the service is unavailable right now"),
        }
    }

    async fn remember(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<RememberArgs>(arguments) else {
            return error("arguments must be {subject, value}");
        };
        let (subject, value) = (args.subject.trim().to_owned(), args.value.trim().to_owned());
        if subject.is_empty() || value.is_empty() {
            return error("subject and value must not be empty");
        }
        match self.state.store.remember(subject, value).await {
            Ok(memory) => {
                self.state.publish(Event::MemorySaved { memory });
                json!({ "saved": true }).to_string()
            }
            Err(failure) => {
                tracing::error!(%failure, "failed to save memory");
                error("could not save")
            }
        }
    }

    async fn weather(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<WeatherArgs>(arguments) else {
            return error("arguments must be {place, days?}");
        };
        let place = args.place.trim().to_owned();
        if place.is_empty() {
            return error("place must not be empty");
        }
        let days = args.days.unwrap_or(DEFAULT_DAYS);
        match self.state.weather.forecast(place, days).await {
            Ok(forecast) => serde_json::to_string(&forecast).unwrap_or_default(),
            Err(WeatherError::NotFound) => error("place not found"),
            Err(WeatherError::Unavailable) => error("weather service unavailable"),
        }
    }

    async fn find_places(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<FindArgs>(arguments) else {
            return error("arguments must be {query, city?}");
        };
        let key = match self.key(ServiceId::Amap).await {
            Key::Ready(key) => key,
            Key::Declined => return Self::declined(),
            Key::Missing => return self.missing(ServiceId::Amap),
        };
        let city = args.city.filter(|city| !city.trim().is_empty());
        match self.state.maps.find(key, args.query, city).await {
            Ok(places) => json!({ "places": places }).to_string(),
            Err(failure) => Self::failed(failure),
        }
    }

    async fn web_search(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<SearchArgs>(arguments) else {
            return error("arguments must be {query}");
        };
        let key = match self.key(ServiceId::Bocha).await {
            Key::Ready(key) => key,
            Key::Declined => return Self::declined(),
            Key::Missing => return self.missing(ServiceId::Bocha),
        };
        match self.state.search.search(key, args.query).await {
            Ok(hits) => json!({ "results": hits }).to_string(),
            Err(failure) => Self::failed(failure),
        }
    }

    async fn save_trip(&self, arguments: &str) -> String {
        let draft = match serde_json::from_str::<TripDraft>(arguments) {
            Ok(draft) => draft,
            Err(failure) => return error(&format!("invalid trip: {failure}")),
        };
        let key = match self.key(ServiceId::Amap).await {
            Key::Ready(key) => Some(key),
            Key::Declined => None,
            Key::Missing => return self.missing(ServiceId::Amap),
        };
        match trip::save(self.state, self.thread_id, draft, key).await {
            Ok((trip, report)) => {
                *self.attachment.lock().unwrap() = Some(Attachment::Trip {
                    trip_id: trip.id.clone(),
                    version: trip.version,
                });
                report.to_string()
            }
            Err(failure) => {
                tracing::error!(%failure, "failed to save trip");
                error("could not save the trip")
            }
        }
    }
}

impl ToolRunner for HubTools<'_> {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            let arguments = call.function.arguments.as_str();
            match call.function.name.as_str() {
                REMEMBER => self.remember(arguments).await,
                WEATHER => self.weather(arguments).await,
                FIND_PLACES => self.find_places(arguments).await,
                WEB_SEARCH => self.web_search(arguments).await,
                SAVE_TRIP => self.save_trip(arguments).await,
                other => error(&format!("unknown tool {other}")),
            }
        })
    }
}
