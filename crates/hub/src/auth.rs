use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Mutex;
use std::time::Duration;

use sha2::{Digest, Sha256};
use xiaoban_protocol::{Credential, DeviceHello, ErrorCode, ProtocolError};
use xiaoban_store::{Store, now_ms};

const CODE_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Default)]
pub struct Pairing {
    codes: Mutex<HashMap<String, i64>>,
}

#[derive(Debug)]
pub struct Authenticated {
    pub device_id: String,
    pub local: bool,
    pub issued_token: Option<String>,
}

impl Pairing {
    pub fn issue(&self) -> (String, i64) {
        let value = u32::from_le_bytes(uuid::Uuid::new_v4().as_bytes()[..4].try_into().unwrap());
        let code = format!("{:06}", value % 1_000_000);
        let expires_at = now_ms() + i64::try_from(CODE_TTL.as_millis()).unwrap_or(i64::MAX);
        let mut codes = self.codes.lock().unwrap();
        let now = now_ms();
        codes.retain(|_, expires| *expires > now);
        codes.insert(code.clone(), expires_at);
        (code, expires_at)
    }

    fn redeem(&self, code: &str) -> bool {
        let mut codes = self.codes.lock().unwrap();
        codes
            .remove(code)
            .is_some_and(|expires_at| expires_at > now_ms())
    }
}

fn new_token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn unauthorized(message: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::Unauthorized, message)
}

pub async fn authenticate(
    store: &Store,
    pairing: &Pairing,
    hello: &DeviceHello,
    peer: SocketAddr,
) -> Result<Authenticated, ProtocolError> {
    match &hello.credential {
        Credential::Local if peer.ip().is_loopback() => Ok(Authenticated {
            device_id: hello.device_id.clone(),
            local: true,
            issued_token: None,
        }),
        Credential::Local => Err(unauthorized(
            "local access is only allowed from this machine",
        )),
        Credential::Paired { token } => {
            let device = store
                .device_by_token_hash(hash_token(token))
                .await?
                .ok_or_else(|| unauthorized("unknown or revoked device"))?;
            store.mark_device_seen(device.device.id.clone()).await?;
            Ok(Authenticated {
                device_id: device.device.id,
                local: false,
                issued_token: None,
            })
        }
        Credential::PairingCode { code } => {
            if !pairing.redeem(code) {
                return Err(unauthorized("pairing code is invalid or expired"));
            }
            let token = new_token();
            store
                .pair_device(
                    hello.device_id.clone(),
                    hello.name.clone(),
                    hello.platform,
                    hash_token(&token),
                )
                .await?;
            Ok(Authenticated {
                device_id: hello.device_id.clone(),
                local: false,
                issued_token: Some(token),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_are_single_use() {
        let pairing = Pairing::default();
        let (code, _) = pairing.issue();
        assert_eq!(code.len(), 6);
        assert!(pairing.redeem(&code));
        assert!(!pairing.redeem(&code));
    }

    #[test]
    fn token_hash_is_stable_and_hex() {
        assert_eq!(hash_token("a"), hash_token("a"));
        assert_eq!(hash_token("a").len(), 64);
    }
}
