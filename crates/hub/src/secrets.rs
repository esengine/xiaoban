use std::collections::HashMap;
use std::fmt::Debug;
use std::sync::Mutex;

use xiaoban_protocol::ProviderId;

pub const KEYCHAIN_SERVICE: &str = "app.xiaoban";

#[derive(Debug, thiserror::Error)]
#[error("secret storage failed: {0}")]
pub struct SecretError(String);

pub trait SecretStore: Debug + Send + Sync + 'static {
    fn load(&self, provider: ProviderId) -> Result<Option<String>, SecretError>;
    fn save(&self, provider: ProviderId, secret: &str) -> Result<(), SecretError>;
}

#[derive(Debug, Clone)]
pub struct KeyringSecrets {
    service: String,
}

impl KeyringSecrets {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
        }
    }

    fn entry(&self, provider: ProviderId) -> Result<keyring::Entry, SecretError> {
        keyring::Entry::new(&self.service, provider.as_str())
            .map_err(|err| SecretError(err.to_string()))
    }
}

impl SecretStore for KeyringSecrets {
    fn load(&self, provider: ProviderId) -> Result<Option<String>, SecretError> {
        match self.entry(provider)?.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(SecretError(err.to_string())),
        }
    }

    fn save(&self, provider: ProviderId, secret: &str) -> Result<(), SecretError> {
        self.entry(provider)?
            .set_password(secret)
            .map_err(|err| SecretError(err.to_string()))
    }
}

#[derive(Debug, Default)]
pub struct MemorySecrets {
    secrets: Mutex<HashMap<ProviderId, String>>,
}

impl SecretStore for MemorySecrets {
    fn load(&self, provider: ProviderId) -> Result<Option<String>, SecretError> {
        Ok(self.secrets.lock().unwrap().get(&provider).cloned())
    }

    fn save(&self, provider: ProviderId, secret: &str) -> Result<(), SecretError> {
        self.secrets
            .lock()
            .unwrap()
            .insert(provider, secret.to_owned());
        Ok(())
    }
}
