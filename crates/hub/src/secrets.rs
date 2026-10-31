use std::collections::HashMap;
use std::fmt::Debug;
use std::hash::Hash;
use std::sync::Mutex;

use serde::Serialize;
use serde::de::DeserializeOwned;
use xiaoban_protocol::{ProviderId, ServiceId};

pub const KEYCHAIN_SERVICE: &str = "app.xiaoban";

#[derive(Debug, thiserror::Error)]
#[error("secret storage failed: {0}")]
pub struct SecretError(String);

pub trait SecretStore: Debug + Send + Sync + 'static {
    fn load(&self, provider: ProviderId) -> Result<Option<String>, SecretError>;
    fn save(&self, provider: ProviderId, secret: &str) -> Result<(), SecretError>;
    fn load_service(&self, service: ServiceId) -> Result<Option<String>, SecretError>;
    fn save_service(&self, service: ServiceId, secret: &str) -> Result<(), SecretError>;
}

const PROVIDERS: &str = "providers";
const SERVICES: &str = "services";

fn failed(err: impl std::fmt::Display) -> SecretError {
    SecretError(err.to_string())
}

type Bundle<K> = Mutex<Option<HashMap<K, String>>>;

pub struct KeyringSecrets {
    service: String,
    providers: Bundle<ProviderId>,
    services: Bundle<ServiceId>,
}

impl Debug for KeyringSecrets {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("KeyringSecrets")
            .field("service", &self.service)
            .finish_non_exhaustive()
    }
}

impl KeyringSecrets {
    pub fn new(service: impl Into<String>) -> Self {
        Self {
            service: service.into(),
            providers: Mutex::new(None),
            services: Mutex::new(None),
        }
    }

    fn entry(&self, user: &str) -> Result<keyring::Entry, SecretError> {
        keyring::Entry::new(&self.service, user).map_err(failed)
    }

    fn read(entry: &keyring::Entry) -> Result<Option<String>, SecretError> {
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(failed(err)),
        }
    }

    fn write<K: Serialize>(
        &self,
        name: &str,
        secrets: &HashMap<K, String>,
    ) -> Result<(), SecretError> {
        let json = serde_json::to_string(secrets).map_err(failed)?;
        self.entry(name)?.set_password(&json).map_err(failed)
    }

    fn migrate_legacy(&self) -> Result<HashMap<ProviderId, String>, SecretError> {
        let mut secrets = HashMap::new();
        for provider in ProviderId::ALL {
            let entry = self.entry(provider.as_str())?;
            if let Some(secret) = Self::read(&entry)? {
                secrets.insert(provider, secret);
            }
        }
        if !secrets.is_empty() {
            self.write(PROVIDERS, &secrets)?;
            for provider in secrets.keys() {
                let _ = self.entry(provider.as_str())?.delete_credential();
            }
        }
        Ok(secrets)
    }

    fn with<K, T>(
        &self,
        name: &str,
        bundle: &Bundle<K>,
        fallback: impl FnOnce() -> Result<HashMap<K, String>, SecretError>,
        f: impl FnOnce(&mut HashMap<K, String>) -> Result<T, SecretError>,
    ) -> Result<T, SecretError>
    where
        K: Eq + Hash + DeserializeOwned,
    {
        let mut cache = bundle.lock().unwrap();
        if cache.is_none() {
            let loaded = match Self::read(&self.entry(name)?)? {
                Some(json) => serde_json::from_str(&json).map_err(failed)?,
                None => fallback()?,
            };
            *cache = Some(loaded);
        }
        f(cache.as_mut().expect("cache was just filled"))
    }

    fn store<K>(
        &self,
        name: &str,
        bundle: &Bundle<K>,
        key: K,
        secret: &str,
    ) -> Result<(), SecretError>
    where
        K: Eq + Hash + Clone + Serialize + DeserializeOwned,
    {
        let fallback = || {
            if name == PROVIDERS {
                return Err(failed("providers bundle must be loaded through migration"));
            }
            Ok(HashMap::new())
        };
        self.with(name, bundle, fallback, |secrets| {
            let mut next = secrets.clone();
            next.insert(key, secret.to_owned());
            self.write(name, &next)?;
            *secrets = next;
            Ok(())
        })
    }
}

impl SecretStore for KeyringSecrets {
    fn load(&self, provider: ProviderId) -> Result<Option<String>, SecretError> {
        self.with(
            PROVIDERS,
            &self.providers,
            || self.migrate_legacy(),
            |secrets| Ok(secrets.get(&provider).cloned()),
        )
    }

    fn save(&self, provider: ProviderId, secret: &str) -> Result<(), SecretError> {
        self.load(provider)?;
        self.store(PROVIDERS, &self.providers, provider, secret)
    }

    fn load_service(&self, service: ServiceId) -> Result<Option<String>, SecretError> {
        self.with(
            SERVICES,
            &self.services,
            || Ok(HashMap::new()),
            |secrets| Ok(secrets.get(&service).cloned()),
        )
    }

    fn save_service(&self, service: ServiceId, secret: &str) -> Result<(), SecretError> {
        self.store(SERVICES, &self.services, service, secret)
    }
}

#[derive(Debug, Default)]
pub struct MemorySecrets {
    secrets: Mutex<HashMap<ProviderId, String>>,
    services: Mutex<HashMap<ServiceId, String>>,
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

    fn load_service(&self, service: ServiceId) -> Result<Option<String>, SecretError> {
        Ok(self.services.lock().unwrap().get(&service).cloned())
    }

    fn save_service(&self, service: ServiceId, secret: &str) -> Result<(), SecretError> {
        self.services
            .lock()
            .unwrap()
            .insert(service, secret.to_owned());
        Ok(())
    }
}
