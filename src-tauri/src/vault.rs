use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;

const KEYRING_SERVICE: &str = "m2fa";
const KEYRING_USER: &str = "vault-master-key";
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;

/// Secret-key vault. The AES-256 master key lives in the OS credential store
/// (Windows Credential Manager / macOS Keychain / Secret Service) and is only
/// fetched into memory at runtime; SQLite holds nothing but AES-256-GCM
/// ciphertext blobs.
pub struct Vault {
    cipher: Aes256Gcm,
}

impl Vault {
    pub fn open() -> Result<Self, String> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|e| format!("keyring entry: {e}"))?;
        let key = match entry.get_password() {
            Ok(stored) => data_encoding::BASE64
                .decode(stored.as_bytes())
                .map_err(|e| format!("stored vault key is not valid base64: {e}"))?,
            Err(keyring::Error::NoEntry) => {
                let mut key = vec![0u8; KEY_LEN];
                rand::rng().fill_bytes(&mut key);
                let encoded = data_encoding::BASE64.encode(&key);
                entry
                    .set_password(&encoded)
                    .map_err(|e| format!("store vault key: {e}"))?;
                key
            }
            Err(e) => return Err(format!("read vault key: {e}")),
        };
        if key.len() != KEY_LEN {
            return Err("stored vault key has wrong length".into());
        }
        let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("init cipher: {e}"))?;
        Ok(Vault { cipher })
    }

    /// Encrypt plaintext as `[12-byte nonce || ciphertext+tag]`.
    pub fn seal(&self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::rng().fill_bytes(&mut nonce_bytes);
        let ciphertext = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
            .map_err(|e| format!("encrypt secret: {e}"))?;
        let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ciphertext);
        Ok(out)
    }

    /// Decrypt a blob produced by [`Vault::seal`].
    pub fn unseal(&self, blob: &[u8]) -> Result<Vec<u8>, String> {
        if blob.len() <= NONCE_LEN {
            return Err("encrypted secret is truncated".into());
        }
        let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
        self.cipher
            .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
            .map_err(|e| format!("decrypt secret: {e}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_unseal_roundtrip() {
        let vault = Vault::open().expect("vault opens");
        let secret = b"the quick brown fox jumps over the lazy dog";
        let blob = vault.seal(secret).expect("seal");
        assert_ne!(&blob[..], &secret[..]);
        let back = vault.unseal(&blob).expect("unseal");
        assert_eq!(back, secret);
    }

    #[test]
    fn seal_is_non_deterministic() {
        let vault = Vault::open().expect("vault opens");
        let a = vault.seal(b"same input").expect("seal a");
        let b = vault.seal(b"same input").expect("seal b");
        assert_ne!(a, b, "fresh random nonce must change the ciphertext");
    }
}
