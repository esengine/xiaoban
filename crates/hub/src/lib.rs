mod agents;
mod apps;
mod archive;
mod auth;
mod calendar;
mod changes;
mod code_requests;
mod code_tools;
mod commands;
mod conflicts;
mod cooking;
mod config;
mod confirms;
mod discovery;
mod dish_photos;
mod error;
mod file_tools;
mod files;
mod git_ops;
mod github;
mod handlers;
mod interpret;
mod kitchen;
mod location;
mod memory;
mod model;
mod network;
mod operate;
mod operate_tools;
mod pauses;
mod preferences;
mod prompts;
mod router;
mod runtime;
mod secrets;
mod server;
mod services;
mod session;
mod state;
mod steps;
mod subthreads;
mod thinking;
mod thread_tools;
mod tidy;
mod tools;
mod trip;
mod trip_requests;
mod vcs_tools;
mod turns;
mod weather;
mod workspace;

pub use apps::{AppEntry, Apps, NoApps};
pub use config::HubConfig;
pub use error::HubError;
pub use location::{FixedLocator, Locator, NoLocator};
pub use operate::{ActFailure, MAX_ELEMENTS, NoOperator, Operator, Snapshot, UiAction, UiElement};
pub use prompts::Prompts;
pub use router::{NoRouter, Router};
pub use runtime::HubRuntime;
pub use secrets::{KEYCHAIN_SERVICE, KeyringSecrets, MemorySecrets, SecretError, SecretStore};
pub use server::{Hub, HubHandle};
pub use services::{DeepseekWeb, Hit, Page, ServiceError, Web};
pub use weather::{Day, FixedWeather, Forecast, Now, OpenMeteo, Weather, WeatherError};

use xiaoban_i18n::{Locale, Localizer, keys};

pub fn system_locale() -> Locale {
    sys_locale::get_locale().map_or_else(Locale::default, |tag| Locale::negotiate(&tag))
}

pub fn default_hub_name(locale: Locale) -> String {
    Localizer::new(locale).text(keys::HUB_DEFAULT_NAME)
}
