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
    fn load_named(&self, name: &str) -> Result<Option<String>, SecretError>;
    fn save_named(&self, name: &str, secret: Option<&str>) -> Result<(), SecretError>;
}

type Secrets = HashMap<ProviderId, String>;

const BUNDLE: &str = "providers";
const NAMED: &str = "capabilities";

fn failed(err: impl std::fmt::Display) -> SecretError {
    SecretError(err.to_string())
}

pub struct KeyringSecrets {
    service: String,
    cache: Mutex<Option<Secrets>>,
    named: Mutex<Option<HashMap<String, String>>>,
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
            cache: Mutex::new(None),
            named: Mutex::new(None),
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

    fn write(&self, secrets: &Secrets) -> Result<(), SecretError> {
        let json = serde_json::to_string(secrets).map_err(failed)?;
        self.entry(BUNDLE)?.set_password(&json).map_err(failed)
    }

    fn migrate_legacy(&self) -> Result<Secrets, SecretError> {
        let mut secrets = Secrets::new();
        for provider in ProviderId::ALL {
            let entry = self.entry(provider.as_str())?;
            if let Some(secret) = Self::read(&entry)? {
                secrets.insert(provider, secret);
            }
        }
        if !secrets.is_empty() {
            self.write(&secrets)?;
            for provider in secrets.keys() {
                let _ = self.entry(provider.as_str())?.delete_credential();
            }
        }
        Ok(secrets)
    }

    fn with<T>(
        &self,
        f: impl FnOnce(&mut Secrets) -> Result<T, SecretError>,
    ) -> Result<T, SecretError> {
        let mut cache = self.cache.lock().unwrap();
        if cache.is_none() {
            let loaded = match Self::read(&self.entry(BUNDLE)?)? {
                Some(json) => serde_json::from_str(&json).map_err(failed)?,
                None => self.migrate_legacy()?,
            };
            *cache = Some(loaded);
        }
        f(cache.as_mut().expect("cache was just filled"))
    }

    fn with_named<T>(
        &self,
        f: impl FnOnce(&mut HashMap<String, String>) -> Result<T, SecretError>,
    ) -> Result<T, SecretError> {
        let mut named = self.named.lock().unwrap();
        if named.is_none() {
            let loaded = match Self::read(&self.entry(NAMED)?)? {
                Some(json) => serde_json::from_str(&json).map_err(failed)?,
                None => HashMap::new(),
            };
            *named = Some(loaded);
        }
        f(named.as_mut().expect("named secrets were just loaded"))
    }
}

impl SecretStore for KeyringSecrets {
    fn load(&self, provider: ProviderId) -> Result<Option<String>, SecretError> {
        self.with(|secrets| Ok(secrets.get(&provider).cloned()))
    }

    fn save(&self, provider: ProviderId, secret: &str) -> Result<(), SecretError> {
        self.with(|secrets| {
            let mut next = secrets.clone();
            next.insert(provider, secret.to_owned());
            self.write(&next)?;
            *secrets = next;
            Ok(())
        })
    }

    fn load_named(&self, name: &str) -> Result<Option<String>, SecretError> {
        self.with_named(|secrets| Ok(secrets.get(name).cloned()))
    }

    fn save_named(&self, name: &str, secret: Option<&str>) -> Result<(), SecretError> {
        self.with_named(|secrets| {
            let mut next = secrets.clone();
            match secret {
                Some(secret) => next.insert(name.to_owned(), secret.to_owned()),
                None => next.remove(name),
            };
            let json = serde_json::to_string(&next).map_err(failed)?;
            self.entry(NAMED)?.set_password(&json).map_err(failed)?;
            *secrets = next;
            Ok(())
        })
    }
}

#[derive(Debug, Default)]
pub struct MemorySecrets {
    secrets: Mutex<HashMap<ProviderId, String>>,
    named: Mutex<HashMap<String, String>>,
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

    fn load_named(&self, name: &str) -> Result<Option<String>, SecretError> {
        Ok(self.named.lock().unwrap().get(name).cloned())
    }

    fn save_named(&self, name: &str, secret: Option<&str>) -> Result<(), SecretError> {
        let mut named = self.named.lock().unwrap();
        match secret {
            Some(secret) => named.insert(name.to_owned(), secret.to_owned()),
            None => named.remove(name),
        };
        Ok(())
    }
}
