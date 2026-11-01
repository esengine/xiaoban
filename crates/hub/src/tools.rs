use std::sync::Mutex;

use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio_util::sync::CancellationToken;
use xiaoban_agent::{ToolCall, ToolRunner, ToolSpec};
use xiaoban_i18n::{Key as MessageKey, Localizer, keys};
use xiaoban_protocol::{Attachment, Event, Location, MemoryCategory, MemoryKind, ServiceId};
use xiaoban_store::NewMemory;

use crate::services::ServiceError;
use crate::state::SharedState;
use crate::trip::{self, DetailRequest, TripDraft};
use crate::weather::{MAX_DAYS, WeatherError};

pub const REMEMBER: &str = "remember";
pub const FORGET: &str = "forget";
pub const WEATHER: &str = "weather";
pub const READ_PAGE: &str = "read_page";
pub const LOCATE: &str = "locate";
pub const FIND_APPS: &str = "find_apps";
pub const OPEN_APP: &str = "open_app";
pub const WEB_SEARCH: &str = "web_search";
pub const SAVE_TRIP: &str = "save_trip";
pub const SAVE_PLACE_DETAIL: &str = "save_place_detail";
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

fn with_description(mut schema: Value, description: String) -> Value {
    schema["description"] = Value::String(description);
    schema
}

fn spec(name: &str, description: String, parameters: Value) -> ToolSpec {
    ToolSpec {
        name: name.to_owned(),
        description,
        parameters,
    }
}

fn detail_schema(l: &Localizer) -> Value {
    let link = object(
        &json!({
            "title": text(l, keys::TOOL_SAVE_TRIP_SOURCE_TITLE),
            "url": text(l, keys::TOOL_SAVE_TRIP_SOURCE_URL),
            "date": text(l, keys::TOOL_SAVE_TRIP_SOURCE_DATE),
        }),
        &["title", "url"],
    );
    object(
        &json!({
            "why": text(l, keys::TOOL_SAVE_TRIP_DETAIL_WHY),
            "suits": { "type": "array", "items": { "type": "string" }, "description": l.text(keys::TOOL_SAVE_TRIP_DETAIL_SUITS) },
            "duration": text(l, keys::TOOL_SAVE_TRIP_DETAIL_DURATION),
            "quiet": text(l, keys::TOOL_SAVE_TRIP_DETAIL_QUIET),
            "tickets": text(l, keys::TOOL_SAVE_TRIP_DETAIL_TICKETS),
            "tickets_source": link,
            "reviews": {
                "type": "array",
                "maxItems": 3,
                "description": l.text(keys::TOOL_SAVE_TRIP_DETAIL_REVIEWS),
                "items": object(&json!({ "text": text(l, keys::TOOL_SAVE_TRIP_REVIEW_TEXT), "source": link }), &["text", "source"]),
            },
        }),
        &["why"],
    )
}

fn trip_day(l: &Localizer) -> Value {
    let detail = detail_schema(l);
    let stop = object(
        &json!({
            "name": text(l, keys::TOOL_SAVE_TRIP_STOP_NAME),
            "time": text(l, keys::TOOL_SAVE_TRIP_STOP_TIME),
            "note": text(l, keys::TOOL_SAVE_TRIP_STOP_NOTE),
            "next": object(
                &json!({
                    "mode": {
                        "type": "string",
                        "enum": ["walk", "taxi", "transit"],
                        "description": l.text(keys::TOOL_SAVE_TRIP_NEXT_MODE),
                    },
                    "minutes": { "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_SAVE_TRIP_NEXT_MINUTES) },
                }),
                &["mode", "minutes"],
            ),
            "detail": with_description(detail, l.text(keys::TOOL_SAVE_TRIP_STOP_DETAIL)),
        }),
        &["name", "time", "note"],
    );
    object(
        &json!({
            "date": text(l, keys::TOOL_SAVE_TRIP_DAY_DATE),
            "change": text(l, keys::TOOL_SAVE_TRIP_DAY_CHANGE),
            "stops": { "type": "array", "items": stop, "minItems": 1 },
        }),
        &["date", "stops"],
    )
}

pub fn specs(localizer: &Localizer) -> Vec<ToolSpec> {
    let mut specs = base_specs(localizer);
    specs.extend(crate::operate_tools::specs(localizer));
    specs.extend(crate::file_tools::specs(localizer));
    specs.push(crate::file_tools::recall_spec(localizer));
    specs.extend(crate::file_tools::history_specs(localizer));
    specs.extend(crate::thread_tools::specs(localizer));
    specs.extend(crate::subthreads::specs(localizer));
    specs.push(crate::agents::spec(localizer));
    specs.push(crate::plan::spec(localizer));
    specs.push(crate::recipes::spec(localizer));
    specs.extend(crate::capability::specs(localizer));
    specs
}

fn remember_spec(l: &Localizer) -> ToolSpec {
    spec(
        REMEMBER,
        l.text(keys::TOOL_REMEMBER_DESCRIPTION),
        object(
            &json!({
                "subject": text(l, keys::TOOL_REMEMBER_SUBJECT),
                "value": text(l, keys::TOOL_REMEMBER_VALUE),
                "category": {
                    "type": "string",
                    "enum": MemoryCategory::ALL.map(MemoryCategory::as_str),
                    "description": l.text(keys::TOOL_REMEMBER_CATEGORY),
                },
                "galaxy": text(l, keys::TOOL_REMEMBER_GALAXY),
                "kind": {
                    "type": "string",
                    "enum": MemoryKind::ALL.map(MemoryKind::as_str),
                    "description": l.text(keys::TOOL_REMEMBER_KIND),
                },
                "importance": {
                    "type": "integer",
                    "enum": [1, 2, 3],
                    "description": l.text(keys::TOOL_REMEMBER_IMPORTANCE),
                },
                "aliases": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": l.text(keys::TOOL_REMEMBER_ALIASES),
                },
                "pinned": { "type": "boolean", "description": l.text(keys::TOOL_REMEMBER_PINNED) },
                "expires": text(l, keys::TOOL_REMEMBER_EXPIRES),
                "replaces": text(l, keys::TOOL_REMEMBER_REPLACES),
            }),
            &[
                "subject",
                "value",
                "category",
                "galaxy",
                "kind",
                "importance",
                "aliases",
            ],
        ),
    )
}

fn forget_spec(l: &Localizer) -> ToolSpec {
    spec(
        FORGET,
        l.text(keys::TOOL_FORGET_DESCRIPTION),
        object(
            &json!({ "subject": text(l, keys::TOOL_FORGET_SUBJECT) }),
            &["subject"],
        ),
    )
}

fn base_specs(localizer: &Localizer) -> Vec<ToolSpec> {
    let l = localizer;
    let day = trip_day(l);
    vec![
        remember_spec(l),
        forget_spec(l),
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
            WEB_SEARCH,
            l.text(keys::TOOL_WEB_SEARCH_DESCRIPTION),
            object(
                &json!({ "query": text(l, keys::TOOL_WEB_SEARCH_QUERY) }),
                &["query"],
            ),
        ),
        spec(
            FIND_APPS,
            l.text(keys::TOOL_FIND_APPS_DESCRIPTION),
            object(
                &json!({ "query": text(l, keys::TOOL_FIND_APPS_QUERY) }),
                &["query"],
            ),
        ),
        spec(
            OPEN_APP,
            l.text(keys::TOOL_OPEN_APP_DESCRIPTION),
            object(
                &json!({
                    "id": text(l, keys::TOOL_OPEN_APP_ID),
                    "name": text(l, keys::TOOL_OPEN_APP_NAME),
                }),
                &["id", "name"],
            ),
        ),
        spec(
            LOCATE,
            l.text(keys::TOOL_LOCATE_DESCRIPTION),
            object(&json!({}), &[]),
        ),
        spec(
            READ_PAGE,
            l.text(keys::TOOL_READ_PAGE_DESCRIPTION),
            object(
                &json!({ "url": text(l, keys::TOOL_READ_PAGE_URL) }),
                &["url"],
            ),
        ),
        spec(
            SAVE_PLACE_DETAIL,
            l.text(keys::TOOL_SAVE_PLACE_DETAIL_DESCRIPTION),
            object(
                &json!({
                    "day": { "type": "integer", "minimum": 1, "description": l.text(keys::TOOL_SAVE_PLACE_DETAIL_DAY) },
                    "stop": text(l, keys::TOOL_SAVE_PLACE_DETAIL_STOP),
                    "detail": detail_schema(l),
                }),
                &["day", "stop", "detail"],
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
    #[serde(default)]
    category: Option<String>,
    #[serde(default)]
    galaxy: Option<String>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    importance: Option<u8>,
    #[serde(default)]
    aliases: Vec<String>,
    #[serde(default)]
    pinned: Option<bool>,
    #[serde(default)]
    expires: Option<String>,
    #[serde(default)]
    replaces: Option<String>,
}

#[derive(Deserialize)]
struct ForgetArgs {
    subject: String,
}

const MAX_ALIASES: usize = 100;

fn end_of_day(date: &str) -> Option<i64> {
    let day: jiff::civil::Date = date.trim().parse().ok()?;
    let zoned = day
        .at(23, 59, 59, 0)
        .to_zoned(jiff::tz::TimeZone::system())
        .ok()?;
    Some(zoned.timestamp().as_millisecond())
}

fn clean_aliases(aliases: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    aliases
        .into_iter()
        .map(|alias| alias.trim().to_owned())
        .filter(|alias| !alias.is_empty() && seen.insert(alias.to_lowercase()))
        .take(MAX_ALIASES)
        .collect()
}

#[derive(Deserialize)]
struct WeatherArgs {
    place: String,
    days: Option<u8>,
}

#[derive(Deserialize)]
struct AppQuery {
    query: String,
}

#[derive(Deserialize)]
struct AppTarget {
    id: String,
}

#[derive(Deserialize)]
struct PageArgs {
    url: String,
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
    pub(crate) state: &'a SharedState,
    pub(crate) thread_id: &'a str,
    pub(crate) turn_id: &'a str,
    pub(crate) cancel: CancellationToken,
    pub(crate) allowed_once: Mutex<Vec<String>>,
    pub(crate) mouse_once: Mutex<Vec<String>>,
    pub(crate) sub_agent: bool,
    pub(crate) touched: Mutex<std::collections::BTreeMap<std::path::PathBuf, Option<Vec<u8>>>>,
    attachment: Mutex<Option<Attachment>>,
}

impl<'a> HubTools<'a> {
    pub fn new(
        state: &'a SharedState,
        thread_id: &'a str,
        turn_id: &'a str,
        cancel: CancellationToken,
    ) -> Self {
        Self {
            state,
            thread_id,
            turn_id,
            cancel,
            allowed_once: Mutex::new(Vec::new()),
            mouse_once: Mutex::new(Vec::new()),
            sub_agent: false,
            touched: Mutex::new(std::collections::BTreeMap::new()),
            attachment: Mutex::new(None),
        }
    }

    pub fn sub_agent(
        state: &'a SharedState,
        thread_id: &'a str,
        turn_id: &'a str,
        cancel: CancellationToken,
    ) -> Self {
        Self {
            sub_agent: true,
            ..Self::new(state, thread_id, turn_id, cancel)
        }
    }

    pub fn attachment(&self) -> Option<Attachment> {
        self.attachment.lock().unwrap().clone()
    }

    pub(crate) fn attach(&self, attachment: Attachment) {
        let mut slot = self.attachment.lock().unwrap();
        if !matches!(*slot, Some(Attachment::Trip { .. })) {
            *slot = Some(attachment);
        }
    }

    pub async fn key(&self, service: ServiceId) -> Key {
        if let Some(key) = crate::trip_requests::search_key(self.state) {
            return Key::Ready(key);
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
            "the user chose not to connect web search in this conversation; continue from your own knowledge and say that prices, opening hours and other details are unverified",
        )
    }

    fn failed(failure: ServiceError) -> String {
        match failure {
            ServiceError::InvalidKey => error("the saved DeepSeek key was rejected"),
            ServiceError::NoBalance => {
                error("the DeepSeek account has no balance left; tell the user to top it up")
            }
            ServiceError::NotFound => error("nothing usable was found"),
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
        let memory = NewMemory {
            subject,
            value,
            category: MemoryCategory::parse(args.category.as_deref().unwrap_or_default()),
            galaxy: args.galaxy,
            kind: MemoryKind::parse(args.kind.as_deref().unwrap_or_default()),
            importance: args.importance.unwrap_or(2),
            pinned: args.pinned.unwrap_or(false),
            aliases: clean_aliases(args.aliases),
            expires_at: args.expires.as_deref().and_then(end_of_day),
            replaces: args.replaces.filter(|old| !old.trim().is_empty()),
        };
        match self.state.store.remember(memory).await {
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

    async fn forget(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<ForgetArgs>(arguments) else {
            return error("arguments must be {subject}");
        };
        match self
            .state
            .store
            .forget_memory(args.subject.trim().to_owned())
            .await
        {
            Ok(Some(memory_id)) => {
                self.state.publish(Event::MemoryForgotten { memory_id });
                json!({ "forgotten": true }).to_string()
            }
            Ok(None) => error("no memory with that subject"),
            Err(failure) => {
                tracing::error!(%failure, "failed to forget memory");
                error("could not forget")
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

    async fn web_search(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<SearchArgs>(arguments) else {
            return error("arguments must be {query}");
        };
        let key = match self.key(ServiceId::WebSearch).await {
            Key::Ready(key) => key,
            Key::Declined => return Self::declined(),
            Key::Missing => return self.missing(ServiceId::WebSearch),
        };
        match self.state.web.search(key, args.query, None).await {
            Ok(hits) => json!({ "results": hits }).to_string(),
            Err(failure) => Self::failed(failure),
        }
    }

    async fn find_apps(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<AppQuery>(arguments) else {
            return error("arguments must be {query}");
        };
        let apps = self.state.apps.list().await;
        let found: Vec<_> = crate::apps::find(&apps, &args.query)
            .into_iter()
            .map(|app| json!({ "id": app.id, "name": app.name }))
            .collect();
        if found.is_empty() && !apps.is_empty() {
            let installed: Vec<_> = apps
                .iter()
                .map(|app| json!({ "id": app.id, "name": app.name }))
                .collect();
            return json!({
                "apps": [],
                "hint": "no app matched; apps are often renamed (a delivery app may now show a new brand name), so look through every installed app below and pick the one the user means before saying it is not installed",
                "installed": installed,
            })
            .to_string();
        }
        json!({ "apps": found }).to_string()
    }

    async fn open_app(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<AppTarget>(arguments) else {
            return error("arguments must be {id, name}");
        };
        let apps = self.state.apps.list().await;
        let Some(app) = apps.into_iter().find(|app| app.id == args.id) else {
            return error("unknown app id; call find_apps first and use an id it returned");
        };
        match self.state.apps.open(app.id).await {
            Ok(()) => json!({ "opened": app.name }).to_string(),
            Err(failure) => {
                tracing::warn!(%failure, "could not open app");
                error("the app could not be opened")
            }
        }
    }

    async fn locate(&self) -> String {
        match self.state.locator.locate().await {
            Location::Found { city, district, .. } => {
                json!({ "city": city, "district": district }).to_string()
            }
            Location::Denied => {
                error("location access is turned off; use the home city you remember and say so")
            }
            Location::Unavailable => error(
                "location is unavailable right now; use the home city you remember and say so",
            ),
        }
    }

    async fn read_page(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<PageArgs>(arguments) else {
            return error("arguments must be {url}");
        };
        let key = match self.key(ServiceId::WebSearch).await {
            Key::Ready(key) => key,
            Key::Declined => return Self::declined(),
            Key::Missing => return self.missing(ServiceId::WebSearch),
        };
        match self.state.web.fetch(key, args.url).await {
            Ok(page) => serde_json::to_string(&page).unwrap_or_default(),
            Err(failure) => Self::failed(failure),
        }
    }

    async fn save_trip(&self, arguments: &str) -> String {
        let draft = match serde_json::from_str::<TripDraft>(arguments) {
            Ok(draft) => draft,
            Err(failure) => {
                tracing::warn!(%failure, "save_trip arguments rejected");
                return error(&format!("invalid trip: {failure}"));
            }
        };
        let verified = matches!(self.key(ServiceId::WebSearch).await, Key::Ready(_));
        match trip::save(self.state, self.thread_id, draft, verified).await {
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

impl HubTools<'_> {
    async fn save_place_detail(&self, arguments: &str) -> String {
        let request = match serde_json::from_str::<DetailRequest>(arguments) {
            Ok(request) => request,
            Err(failure) => {
                tracing::warn!(%failure, "save_place_detail arguments rejected");
                return error(&format!("invalid detail: {failure}"));
            }
        };
        let verified = matches!(self.key(ServiceId::WebSearch).await, Key::Ready(_));
        match trip::save_detail(self.state, self.thread_id, request, verified).await {
            Ok((trip, report)) => {
                *self.attachment.lock().unwrap() = Some(Attachment::Trip {
                    trip_id: trip.id.clone(),
                    version: trip.version,
                });
                report.to_string()
            }
            Err(trip::DetailError::Store(failure)) => {
                tracing::error!(%failure, "failed to save place detail");
                error("could not save the detail")
            }
            Err(failure) => error(&failure.to_string()),
        }
    }
}

impl ToolRunner for HubTools<'_> {
    fn notes(&self) -> Vec<String> {
        self.state.pauses.take_notes(self.turn_id)
    }

    fn reusable(&self, name: &str) -> bool {
        !crate::capability::is_mcp(name) && !matches!(
            name,
            REMEMBER
                | FORGET
                | LOCATE
                | OPEN_APP
                | SAVE_TRIP
                | SAVE_PLACE_DETAIL
                | crate::operate_tools::LOOK_AT_APP
                | crate::operate_tools::CLICK
                | crate::operate_tools::TYPE_TEXT
                | crate::operate_tools::PRESS_KEYS
                | crate::operate_tools::DO_STEPS
                | crate::agents::SPAWN_AGENTS
                | crate::subthreads::OPEN_SUBTHREADS
                | crate::subthreads::MESSAGE_SUBTHREAD
                | crate::operate_tools::CONFIRM
                | crate::code_tools::WRITE_FILE
                | crate::code_tools::EDIT_FILE
                | crate::code_tools::RUN_COMMAND
                | crate::code_tools::READ_FILE
                | crate::code_tools::LIST_DIR
                | crate::code_tools::SEARCH_FILES
                | crate::vcs_tools::GIT
                | crate::vcs_tools::GH
                | crate::kitchen::FRIDGE
                | crate::kitchen::DISHES
                | crate::kitchen::PREFERENCES
                | crate::kitchen::SHOPPING
                | crate::cooking::STEPS
                | crate::recipes::RECIPE
                | crate::week::PLAN
                | crate::ledger::ADD
                | crate::ledger::EDIT
                | crate::ledger::REMOVE
                | crate::ledger::BUDGET
                | crate::ledger::SORT
                | crate::life::LIFE
                | crate::plan::PLAN
                | crate::doc::START
                | crate::doc::SECTION
                | crate::doc::EDIT
                | crate::doc::SUGGEST
                | crate::sheet::CREATE
                | crate::sheet::EDIT
                | crate::slides::START
                | crate::slides::PAGE
                | crate::slides::EDIT
        )
    }

    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            let arguments = call.function.arguments.as_str();
            match call.function.name.as_str() {
                REMEMBER => self.remember(arguments).await,
                FORGET => self.forget(arguments).await,
                WEATHER => self.weather(arguments).await,
                READ_PAGE => self.read_page(arguments).await,
                LOCATE => self.locate().await,
                FIND_APPS => self.find_apps(arguments).await,
                OPEN_APP => self.open_app(arguments).await,
                crate::operate_tools::LOOK_AT_APP => self.look_at_app(arguments).await,
                crate::operate_tools::CLICK => self.element_action(arguments, false).await,
                crate::operate_tools::TYPE_TEXT => self.element_action(arguments, true).await,
                crate::operate_tools::PRESS_KEYS => self.press_keys(arguments).await,
                crate::operate_tools::DO_STEPS => self.do_steps(arguments).await,
                crate::file_tools::FILE_SEARCH => self.file_search(arguments).await,
                crate::file_tools::FILE_READ => self.file_read(arguments).await,
                crate::file_tools::RECALL => self.recall(arguments).await,
                crate::file_tools::HISTORY_SEARCH => self.history_search(arguments).await,
                crate::file_tools::HISTORY_READ => self.history_read(arguments).await,
                crate::thread_tools::LIST_THREADS => self.list_threads(arguments).await,
                crate::subthreads::OPEN_SUBTHREADS if self.sub_agent => {
                    error("a sub-agent cannot open subthreads")
                }
                crate::subthreads::OPEN_SUBTHREADS => self.open_subthreads(arguments).await,
                crate::agents::SPAWN_AGENTS => self.spawn_agents(arguments, &call.id).await,
                crate::subthreads::MESSAGE_SUBTHREAD => self.message_subthread(arguments).await,
                crate::thread_tools::FIND_THREADS => self.find_threads(arguments).await,
                crate::file_tools::HISTORY_OUTLINE => self.history_outline().await,
                crate::thread_tools::READ_THREAD => self.read_thread(arguments).await,
                crate::operate_tools::CONFIRM => self.confirm(arguments).await,
                WEB_SEARCH => self.web_search(arguments).await,
                SAVE_TRIP => self.save_trip(arguments).await,
                SAVE_PLACE_DETAIL => self.save_place_detail(arguments).await,
                name if crate::kitchen::is_tool(name) => self.kitchen_tool(name, arguments).await,
                name if crate::ledger::is_tool(name) => self.ledger_tool(name, arguments).await,
                crate::life::LIFE => self.life(arguments).await,
                crate::plan::PLAN => self.plan(arguments).await,
                crate::recipes::RECIPE => self.recipe(arguments).await,
                crate::capability::FIND => self.find_capability(arguments).await,
                crate::capability::SKILL_READ => self.skill_read(arguments).await,
                name if crate::capability::is_mcp(name) => self.mcp_tool(name, arguments).await,
                name if crate::doc::is_tool(name) => self.doc_tool(name, arguments).await,
                name if crate::sheet::is_tool(name) => self.sheet_tool(name, arguments).await,
                name if crate::slides::is_tool(name) => self.slides_tool(name, arguments).await,
                name if crate::code_tools::is_code_tool(name) => {
                    self.run_code_tool(name, arguments).await
                }
                other => error(&format!("unknown tool {other}")),
            }
        })
    }
}
