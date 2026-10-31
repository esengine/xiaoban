mod auth;
mod config;
mod discovery;
mod error;
mod handlers;
mod model;
mod runtime;
mod secrets;
mod server;
mod session;
mod state;
mod turns;

pub use config::HubConfig;
pub use error::HubError;
pub use runtime::HubRuntime;
pub use secrets::{KEYCHAIN_SERVICE, KeyringSecrets, MemorySecrets, SecretError, SecretStore};
pub use server::{Hub, HubHandle};

use xiaoban_agent::StablePrefix;
use xiaoban_i18n::{Locale, Localizer, keys};

pub fn system_locale() -> Locale {
    sys_locale::get_locale().map_or_else(Locale::default, |tag| Locale::negotiate(&tag))
}

pub fn system_prefix(locale: Locale) -> StablePrefix {
    StablePrefix::new(Localizer::new(locale).text(keys::PROMPT_SYSTEM))
}

pub fn default_hub_name(locale: Locale) -> String {
    Localizer::new(locale).text(keys::HUB_DEFAULT_NAME)
}
