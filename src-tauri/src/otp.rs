use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::{Sha256, Sha512};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Algo {
    Sha1,
    Sha256,
    Sha512,
}

impl Algo {
    pub fn as_str(&self) -> &'static str {
        match self {
            Algo::Sha1 => "SHA1",
            Algo::Sha256 => "SHA256",
            Algo::Sha512 => "SHA512",
        }
    }

    pub fn parse(s: &str) -> Option<Algo> {
        match s.trim().to_ascii_uppercase().as_str() {
            "SHA1" | "SHA-1" => Some(Algo::Sha1),
            "SHA256" | "SHA-256" => Some(Algo::Sha256),
            "SHA512" | "SHA-512" => Some(Algo::Sha512),
            _ => None,
        }
    }
}

fn dynamic_truncate(digest: &[u8]) -> u32 {
    let offset = (digest[digest.len() - 1] & 0x0f) as usize;
    ((digest[offset] & 0x7f) as u32) << 24
        | (digest[offset + 1] as u32) << 16
        | (digest[offset + 2] as u32) << 8
        | (digest[offset + 3] as u32)
}

fn hotp_raw(secret: &[u8], counter: u64, algo: Algo, digits: u32) -> u32 {
    let msg = counter.to_be_bytes();
    let bin = match algo {
        Algo::Sha1 => {
            let mut mac = Hmac::<Sha1>::new_from_slice(secret).expect("hmac accepts any key len");
            mac.update(&msg);
            dynamic_truncate(mac.finalize().into_bytes().as_slice())
        }
        Algo::Sha256 => {
            let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("hmac accepts any key len");
            mac.update(&msg);
            dynamic_truncate(mac.finalize().into_bytes().as_slice())
        }
        Algo::Sha512 => {
            let mut mac = Hmac::<Sha512>::new_from_slice(secret).expect("hmac accepts any key len");
            mac.update(&msg);
            dynamic_truncate(mac.finalize().into_bytes().as_slice())
        }
    };
    bin % 10u32.pow(digits)
}

/// RFC 4226 HOTP, zero-padded to `digits`.
pub fn hotp(secret: &[u8], counter: u64, algo: Algo, digits: u32) -> String {
    let value = hotp_raw(secret, counter, algo, digits);
    format!("{:0width$}", value, width = digits as usize)
}

pub struct TotpWindow {
    pub prev: String,
    pub current: String,
    pub next: String,
}

/// RFC 6238 TOTP for the window containing `now_ms`, plus the previous and
/// next windows so the UI can preview neighbouring codes.
pub fn totp_window(secret: &[u8], now_ms: u64, period: u32, algo: Algo, digits: u32) -> TotpWindow {
    let counter = now_ms / 1000 / period as u64;
    TotpWindow {
        prev: hotp(secret, counter.saturating_sub(1), algo, digits),
        current: hotp(secret, counter, algo, digits),
        next: hotp(secret, counter + 1, algo, digits),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // RFC 4226 reference secret, ASCII "12345678901234567890".
    const RFC_KEY: &[u8] = b"12345678901234567890";

    #[test]
    fn rfc4226_hotp_vectors() {
        let expected = [
            "755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583",
            "399871", "520489",
        ];
        for (counter, want) in expected.iter().enumerate() {
            assert_eq!(
                &hotp(RFC_KEY, counter as u64, Algo::Sha1, 6),
                want,
                "HOTP counter {counter}"
            );
        }
    }

    #[test]
    fn rfc6238_totp_vectors() {
        let cases = [
            (59u64, "94287082"),
            (1111111109, "07081804"),
            (1111111111, "14050471"),
        ];
        for (t, want) in cases {
            let w = totp_window(RFC_KEY, t * 1000, 30, Algo::Sha1, 8);
            assert_eq!(w.current, want, "TOTP at t={t}");
        }
    }

    #[test]
    fn window_neighbours_differ() {
        let w = totp_window(b"peekaboo-secret", 1_700_000_000_000, 30, Algo::Sha1, 6);
        assert_eq!(w.current.len(), 6);
        // neighbours are for the adjacent counters; they *may* collide by
        // chance but the counters used must be distinct, so spot-check via
        // hotp directly.
        let c = 1_700_000_000_000u64 / 1000 / 30;
        assert_eq!(w.current, hotp(b"peekaboo-secret", c, Algo::Sha1, 6));
        assert_eq!(w.prev, hotp(b"peekaboo-secret", c - 1, Algo::Sha1, 6));
        assert_eq!(w.next, hotp(b"peekaboo-secret", c + 1, Algo::Sha1, 6));
    }

    #[test]
    fn algo_parse_roundtrip() {
        assert_eq!(Algo::parse("sha256"), Some(Algo::Sha256));
        assert_eq!(Algo::parse("SHA-512"), Some(Algo::Sha512));
        assert_eq!(Algo::parse("md5"), None);
    }
}
