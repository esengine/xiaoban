mod auth;
mod config;
mod discovery;
mod error;
mod handlers;
mod interpret;
mod location;
mod memory;
mod model;
mod network;
mod preferences;
mod prompts;
mod runtime;
mod secrets;
mod server;
mod session;
mod state;
mod tools;
mod turns;

pub use config::HubConfig;
pub use error::HubError;
pub use location::{FixedLocator, Locator, NoLocator};
pub use prompts::Prompts;
pub use runtime::HubRuntime;
pub use secrets::{KEYCHAIN_SERVICE, KeyringSecrets, MemorySecrets, SecretError, SecretStore};
pub use server::{Hub, HubHandle};

use xiaoban_i18n::{Locale, Localizer, keys};

pub fn system_locale() -> Locale {
    sys_locale::get_locale().map_or_else(Locale::default, |tag| Locale::negotiate(&tag))
}

pub fn default_hub_name(locale: Locale) -> String {
    Localizer::new(locale).text(keys::HUB_DEFAULT_NAME)
}
