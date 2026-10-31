use futures_util::future::BoxFuture;
use serde::Deserialize;
use serde_json::json;
use xiaoban_agent::{ToolCall, ToolRunner, ToolSpec};
use xiaoban_i18n::{Localizer, keys};
use xiaoban_protocol::Event;

use crate::state::SharedState;
use crate::weather::{MAX_DAYS, WeatherError};

pub const REMEMBER: &str = "remember";
pub const WEATHER: &str = "weather";
const DEFAULT_DAYS: u8 = 7;

pub fn specs(localizer: &Localizer) -> Vec<ToolSpec> {
    vec![
        ToolSpec {
            name: REMEMBER.to_owned(),
            description: localizer.text(keys::TOOL_REMEMBER_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "subject": {
                        "type": "string",
                        "description": localizer.text(keys::TOOL_REMEMBER_SUBJECT),
                    },
                    "value": {
                        "type": "string",
                        "description": localizer.text(keys::TOOL_REMEMBER_VALUE),
                    },
                },
                "required": ["subject", "value"],
                "additionalProperties": false,
            }),
        },
        ToolSpec {
            name: WEATHER.to_owned(),
            description: localizer.text(keys::TOOL_WEATHER_DESCRIPTION),
            parameters: json!({
                "type": "object",
                "properties": {
                    "place": {
                        "type": "string",
                        "description": localizer.text(keys::TOOL_WEATHER_PLACE),
                    },
                    "days": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": MAX_DAYS,
                        "description": localizer.text(keys::TOOL_WEATHER_DAYS),
                    },
                },
                "required": ["place"],
                "additionalProperties": false,
            }),
        },
    ]
}

#[derive(Deserialize)]
struct WeatherArgs {
    place: String,
    days: Option<u8>,
}

#[derive(Deserialize)]
struct RememberArgs {
    subject: String,
    value: String,
}

pub struct HubTools<'a> {
    pub state: &'a SharedState,
}

impl HubTools<'_> {
    async fn remember(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<RememberArgs>(arguments) else {
            return json!({ "error": "arguments must be {subject, value}" }).to_string();
        };
        let (subject, value) = (args.subject.trim().to_owned(), args.value.trim().to_owned());
        if subject.is_empty() || value.is_empty() {
            return json!({ "error": "subject and value must not be empty" }).to_string();
        }
        match self.state.store.remember(subject, value).await {
            Ok(memory) => {
                self.state.publish(Event::MemorySaved { memory });
                json!({ "saved": true }).to_string()
            }
            Err(error) => {
                tracing::error!(%error, "failed to save memory");
                json!({ "error": "could not save" }).to_string()
            }
        }
    }
}

impl HubTools<'_> {
    async fn weather(&self, arguments: &str) -> String {
        let Ok(args) = serde_json::from_str::<WeatherArgs>(arguments) else {
            return json!({ "error": "arguments must be {place, days?}" }).to_string();
        };
        let place = args.place.trim().to_owned();
        if place.is_empty() {
            return json!({ "error": "place must not be empty" }).to_string();
        }
        let days = args.days.unwrap_or(DEFAULT_DAYS);
        match self.state.weather.forecast(place, days).await {
            Ok(forecast) => serde_json::to_string(&forecast).unwrap_or_default(),
            Err(WeatherError::NotFound) => json!({ "error": "place not found" }).to_string(),
            Err(WeatherError::Unavailable) => {
                json!({ "error": "weather service unavailable" }).to_string()
            }
        }
    }
}

impl ToolRunner for HubTools<'_> {
    fn run<'a>(&'a self, call: &'a ToolCall) -> BoxFuture<'a, String> {
        Box::pin(async move {
            match call.function.name.as_str() {
                REMEMBER => self.remember(&call.function.arguments).await,
                WEATHER => self.weather(&call.function.arguments).await,
                other => json!({ "error": format!("unknown tool {other}") }).to_string(),
            }
        })
    }
}
