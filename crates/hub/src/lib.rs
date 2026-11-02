mod agenda;
mod agents;
mod apps;
mod archive;
mod auth;
mod calendar;
mod capability;
mod changes;
mod code_requests;
mod code_tools;
mod commands;
mod conflicts;
mod cooking;
mod recipes;
mod floorplan;
mod week;
mod config;
mod asks;
mod confirms;
mod discovery;
mod dish_photos;
mod error;
mod file_tools;
mod files;
mod git_ops;
mod github;
mod handlers;
mod insights;
mod interpret;
mod key_share;
mod kitchen;
mod ledger;
mod ledger_import;
mod location;
mod mail;
mod mail_imap;
mod mail_rules;
mod mcp;
mod memory;
mod model;
mod network;
mod notify;
mod browser;
mod pages;
mod operate;
mod operate_tools;
mod plan;
mod pauses;
mod preferences;
#[cfg(test)]
mod prefix_report;
mod prompts;
mod registry;
mod router;
mod schedules;
mod todo_parse;
mod todos;
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
mod weather_page;
mod presence;
mod price;
mod price_check;
mod trip_spend;
mod life;
mod daily;
mod doc;
mod sheet;
mod share;
mod slides;
mod sheet_formula;
mod workspace;

pub use agenda::{Agenda, AgendaError, FixedAgenda, NoAgenda};
pub use apps::{AppEntry, Apps, NoApps};
pub use config::HubConfig;
pub use error::HubError;
pub use location::{FixedLocator, Locator, NoLocator};
pub use mail_imap::{Batch, ImapMail, Login, MailError, MailSource, Raw};
pub use operate::{ActFailure, MAX_ELEMENTS, NoOperator, Operator, Snapshot, UiAction, UiElement};
pub use prompts::Prompts;
pub use pages::{NoPages, PageReport, Pages};
pub use router::{NoRouter, Router};

pub fn todo_wake_at(
    todo: &xiaoban_protocol::Todo,
    settings: &xiaoban_protocol::NotifySettings,
) -> Option<i64> {
    todos::remind_at(todo, settings, &jiff::tz::TimeZone::system())
}
pub use runtime::HubRuntime;
pub use secrets::{KEYCHAIN_SERVICE, KeyringSecrets, MemorySecrets, SecretError, SecretStore};
pub use server::{Hub, HubHandle, LocalLink};
pub use services::{DeepseekWeb, Hit, Page, ServiceError, Web};
pub use presence::{NoPresence, Presence};
pub use weather::{Day, FixedWeather, Forecast, Now, OpenMeteo, Weather, WeatherError};

use xiaoban_i18n::{Locale, Localizer, keys};

pub fn system_locale() -> Locale {
    sys_locale::get_locale().map_or_else(Locale::default, |tag| Locale::negotiate(&tag))
}

pub fn default_hub_name(locale: Locale) -> String {
    Localizer::new(locale).text(keys::HUB_DEFAULT_NAME)
}
