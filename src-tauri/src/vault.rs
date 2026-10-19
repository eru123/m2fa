use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;

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
    mac_key: [u8; KEY_LEN],
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
        let mut mac_key = [0u8; KEY_LEN];
        mac_key.copy_from_slice(&key);
        let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| format!("init cipher: {e}"))?;
        Ok(Vault { cipher, mac_key })
    }

    /// Deterministic, key-bound fingerprint of a secret, used for duplicate
    /// detection. HMAC rather than plain SHA-256 so someone holding the
    /// database cannot verify secret guesses offline.
    pub fn fingerprint(&self, secret: &[u8]) -> String {
        let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(&self.mac_key)
            .expect("hmac accepts any key length");
        mac.update(secret);
        data_encoding::HEXLOWER.encode(mac.finalize().into_bytes().as_slice())
    }

    /// Encrypt plaintext as `[12-byte nonce || ciphertext+tag]`, bound to
    /// `aad` (the account id) so ciphertexts cannot be swapped between rows.
    pub fn seal(&self, plaintext: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::rng().fill_bytes(&mut nonce_bytes);
        let ciphertext = self
            .cipher
            .encrypt(
                Nonce::from_slice(&nonce_bytes),
                Payload {
                    msg: plaintext,
                    aad,
                },
            )
            .map_err(|e| format!("encrypt secret: {e}"))?;
        let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&ciphertext);
        Ok(out)
    }

    /// Decrypt a blob produced by [`Vault::seal`] with the same `aad`.
    pub fn unseal(&self, blob: &[u8], aad: &[u8]) -> Result<Vec<u8>, String> {
        if blob.len() <= NONCE_LEN {
            return Err("encrypted secret is truncated".into());
        }
        let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
        self.cipher
            .decrypt(
                Nonce::from_slice(nonce_bytes),
                Payload {
                    msg: ciphertext,
                    aad,
                },
            )
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
        let blob = vault.seal(secret, b"account-1").expect("seal");
        assert_ne!(&blob[..], &secret[..]);
        let back = vault.unseal(&blob, b"account-1").expect("unseal");
        assert_eq!(back, secret);
    }

    #[test]
    fn wrong_aad_is_rejected() {
        let vault = Vault::open().expect("vault opens");
        let blob = vault.seal(b"top secret", b"account-1").expect("seal");
        assert!(vault.unseal(&blob, b"account-2").is_err());
    }

    #[test]
    fn fingerprint_is_keyed_and_stable() {
        let vault = Vault::open().expect("vault opens");
        assert_eq!(vault.fingerprint(b"same"), vault.fingerprint(b"same"));
        // keyed fingerprint must not equal the plain sha256 of the secret
        use sha2::Digest;
        let plain = data_encoding::HEXLOWER.encode(Sha256::digest(b"same").as_slice());
        assert_ne!(vault.fingerprint(b"same"), plain);
    }

    #[test]
    fn seal_is_non_deterministic() {
        let vault = Vault::open().expect("vault opens");
        let a = vault.seal(b"same input", b"aad").expect("seal a");
        let b = vault.seal(b"same input", b"aad").expect("seal b");
        assert_ne!(a, b, "fresh random nonce must change the ciphertext");
    }
}
