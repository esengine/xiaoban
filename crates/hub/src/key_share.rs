use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng};
use chacha20poly1305::{ChaCha20Poly1305, Key};
use sha2::{Digest, Sha256};
use x25519_dalek::{EphemeralSecret, PublicKey};
use xiaoban_protocol::{ErrorCode, ProtocolError, ProviderId, Response};

use crate::state::SharedState;

const CONTEXT: &[u8] = b"xiaoban provider keys v1";

fn bad(detail: &str) -> ProtocolError {
    ProtocolError::new(ErrorCode::BadRequest, detail)
}

pub fn derive(shared: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(CONTEXT);
    hasher.update(shared);
    hasher.finalize().into()
}

pub fn seal(peer: &str, plain: &[u8]) -> Result<(String, String, String), ProtocolError> {
    let bytes: [u8; 32] = STANDARD
        .decode(peer)
        .ok()
        .and_then(|bytes| bytes.try_into().ok())
        .ok_or_else(|| bad("public key must be 32 bytes of base64"))?;
    let secret = EphemeralSecret::random();
    let public = PublicKey::from(&secret);
    let shared = secret.diffie_hellman(&PublicKey::from(bytes));
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&derive(shared.as_bytes())));
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
    let sealed = cipher
        .encrypt(&nonce, plain)
        .map_err(|_| ProtocolError::new(ErrorCode::Internal, "could not seal the keys"))?;
    Ok((
        STANDARD.encode(public.as_bytes()),
        STANDARD.encode(nonce),
        STANDARD.encode(sealed),
    ))
}

pub async fn share(state: &SharedState, peer: &str) -> Result<Response, ProtocolError> {
    let mut keys = serde_json::Map::new();
    for provider in ProviderId::ALL {
        if let Some(key) = crate::model::secret(state, provider).await? {
            keys.insert(provider.as_str().to_owned(), serde_json::Value::String(key));
        }
    }
    let plain = serde_json::to_vec(&keys).unwrap_or_default();
    let (public_key, nonce, ciphertext) = seal(peer, &plain)?;
    Ok(Response::ProviderKeys {
        public_key,
        nonce,
        ciphertext,
        model: state.active().model,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use x25519_dalek::StaticSecret;

    #[test]
    fn the_phone_can_open_what_the_hub_seals() {
        let phone = StaticSecret::random();
        let phone_public = STANDARD.encode(PublicKey::from(&phone).as_bytes());
        let (hub_public, nonce, sealed) = seal(&phone_public, br#"{"deepseek":"sk-1"}"#).unwrap();
        let hub_public: [u8; 32] = STANDARD.decode(hub_public).unwrap().try_into().unwrap();
        let shared = phone.diffie_hellman(&PublicKey::from(hub_public));
        let cipher = ChaCha20Poly1305::new(Key::from_slice(&derive(shared.as_bytes())));
        let nonce = STANDARD.decode(nonce).unwrap();
        let plain = cipher
            .decrypt(nonce.as_slice().into(), STANDARD.decode(sealed).unwrap().as_slice())
            .unwrap();
        assert_eq!(plain, br#"{"deepseek":"sk-1"}"#);
        assert!(seal("short", b"x").is_err());
    }
}
