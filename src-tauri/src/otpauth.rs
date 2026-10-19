use crate::otp::Algo;
use data_encoding::BASE32_NOPAD;

/// A parsed otpauth://totp/... URI ready for storage.
#[derive(Debug, Clone, PartialEq)]
pub struct AccountInput {
    pub label: String,
    pub issuer: String,
    pub secret: Vec<u8>,
    pub algorithm: Algo,
    pub digits: u32,
    pub period: u32,
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Percent-decode; invalid `%XX` escapes are kept literally. With
/// `plus_as_space` (query strings) `+` also decodes to a space.
fn percent_decode(input: &str, plus_as_space: bool) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'%' if i + 2 < bytes.len() => {
                match (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                    (Some(hi), Some(lo)) => {
                        out.push((hi << 4) | lo);
                        i += 3;
                    }
                    _ => {
                        out.push(b'%');
                        i += 1;
                    }
                }
            }
            b'+' if plus_as_space => {
                out.push(b' ');
                i += 1;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query(query: &str) -> Vec<(String, String)> {
    query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| {
            let (k, v) = match pair.split_once('=') {
                Some((k, v)) => (k, v),
                None => (pair, ""),
            };
            (
                percent_decode(k, true).to_ascii_lowercase(),
                percent_decode(v, true),
            )
        })
        .collect()
}

fn decode_base32_secret(raw: &str) -> Result<Vec<u8>, String> {
    let cleaned: String = raw
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .map(|c| c.to_ascii_uppercase())
        .collect();
    if cleaned.is_empty() {
        return Err("secret parameter is empty".into());
    }
    let secret = BASE32_NOPAD
        .decode(cleaned.as_bytes())
        .map_err(|e| format!("secret is not valid base32: {e}"))?;
    if secret.is_empty() {
        return Err("secret decodes to zero bytes".into());
    }
    Ok(secret)
}

/// Parse one `otpauth://totp/<label>?secret=...` line.
///
/// Tolerates real-world exporters: percent-encoded *and* raw spaces/colons in
/// the label, `Issuer:account` style labels, a missing `issuer` parameter,
/// and both padded and unpadded base32 secrets.
pub fn parse_otpauth_uri(line: &str) -> Result<AccountInput, String> {
    let line = line.trim();
    if line.is_empty() {
        return Err("empty line".into());
    }
    let lower = line.to_ascii_lowercase();
    if !lower.starts_with("otpauth://") {
        return Err("not an otpauth:// URI".into());
    }
    let rest = &line["otpauth://".len()..];
    let (kind, tail) = match rest.split_once('/') {
        Some((k, t)) => (k.to_ascii_lowercase(), t),
        None => return Err("missing path after otpauth://".into()),
    };
    if kind == "hotp" {
        return Err("HOTP (counter-based) URIs are not supported".into());
    }
    if kind != "totp" {
        return Err(format!("unsupported otpauth type '{kind}'").into());
    }

    let (path, query) = match tail.split_once('?') {
        Some((p, q)) => (p, q),
        None => (tail, ""),
    };
    let label_raw = percent_decode(path.trim_start_matches('/'), false);

    let params = parse_query(query);
    let get = |name: &str| {
        params
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.clone())
    };

    let secret = decode_base32_secret(&get("secret").ok_or("missing secret parameter")?)?;

    let digits: u32 = match get("digits") {
        Some(d) => d
            .trim()
            .parse()
            .map_err(|_| format!("invalid digits value '{}'", d))?,
        None => 6,
    };
    if !(1..=10).contains(&digits) {
        return Err(format!("digits must be between 1 and 10, got {digits}"));
    }

    let period: u32 = match get("period") {
        Some(p) => p
            .trim()
            .parse()
            .map_err(|_| format!("invalid period value '{p}'"))?,
        None => 30,
    };
    if period == 0 || period > 86_400 {
        return Err(format!("period must be 1-86400 seconds, got {period}"));
    }

    let algorithm = match get("algorithm") {
        Some(a) => Algo::parse(&a).ok_or(format!("unsupported algorithm '{a}'"))?,
        None => Algo::Sha1,
    };

    // Google-style "Issuer:account" lives in the path; an explicit issuer
    // query parameter wins when both are present.
    let (issuer_from_label, mut label) = match label_raw.split_once(':') {
        Some((issuer, label)) if !issuer.trim().is_empty() && !label.trim().is_empty() => {
            (issuer.trim().to_string(), label.trim().to_string())
        }
        _ => (String::new(), label_raw.trim().to_string()),
    };
    if label.is_empty() {
        label = "Unnamed".to_string();
    }
    let issuer = get("issuer")
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or(issuer_from_label);

    Ok(AccountInput {
        label,
        issuer,
        secret,
        algorithm,
        digits,
        period,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_label_without_issuer() {
        let a = parse_otpauth_uri("otpauth://totp/Heroku?secret=JBSWY3DPEHPK3PXP").unwrap();
        assert_eq!(a.label, "Heroku");
        assert_eq!(a.issuer, "");
        assert_eq!(a.digits, 6);
        assert_eq!(a.period, 30);
        assert_eq!(a.algorithm, Algo::Sha1);
        assert!(!a.secret.is_empty());
    }

    #[test]
    fn percent_encoded_label_with_encoded_issuer() {
        let a = parse_otpauth_uri(
            "otpauth://totp/Amazon%20Web%20Services:root%40acct123?secret=JBSWY3DPEHPK3PXR&issuer=Amazon%20Web%20Services",
        )
        .unwrap();
        assert_eq!(a.label, "root@acct123");
        assert_eq!(a.issuer, "Amazon Web Services");
    }

    #[test]
    fn raw_spaces_and_colon_in_label() {
        let a = parse_otpauth_uri(
            "otpauth://totp/Amazon Web Services:2fas@998?secret=JBSWY3DPEHPK3PXQ&issuer=Amazon%20Web%20Services",
        )
        .unwrap();
        assert_eq!(a.label, "2fas@998");
        assert_eq!(a.issuer, "Amazon Web Services");
    }

    #[test]
    fn encoded_colon_in_label() {
        let a = parse_otpauth_uri(
            "otpauth://totp/Google%3Abob.psuq%40gmail.com?secret=JBSWY3DPEHPK3PXS&issuer=Google",
        )
        .unwrap();
        assert_eq!(a.label, "bob.psuq@gmail.com");
        assert_eq!(a.issuer, "Google");
    }

    #[test]
    fn full_parameters() {
        let a = parse_otpauth_uri(
            "otpauth://totp/Zoho:bob@example.org?secret=JBSWY3DPEHPK3PXT&period=30&digits=6&algorithm=SHA1&issuer=Zoho",
        )
        .unwrap();
        assert_eq!(a.label, "bob@example.org");
        assert_eq!(a.issuer, "Zoho");
        assert_eq!(a.period, 30);
        assert_eq!(a.digits, 6);
        assert_eq!(a.algorithm, Algo::Sha1);
    }

    #[test]
    fn issuer_from_label_when_query_missing() {
        let a = parse_otpauth_uri("otpauth://totp/Username:lighty?secret=JBSWY3DPEHPK3PXU")
            .unwrap();
        assert_eq!(a.label, "lighty");
        assert_eq!(a.issuer, "Username");
    }

    #[test]
    fn rejects_bad_lines() {
        assert!(parse_otpauth_uri("").is_err());
        assert!(parse_otpauth_uri("https://example.com").is_err());
        assert!(parse_otpath_hotp().is_err());
        assert!(parse_otpauth_uri("otpauth://totp/X").is_err()); // no secret
        assert!(parse_otpauth_uri("otpauth://totp/X?secret=!!!").is_err()); // bad base32
        assert!(parse_otpauth_uri("otpauth://totp/X?secret=JBSWY3DPEHPK3PXP&algorithm=MD5").is_err());
        assert!(parse_otpauth_uri("otpauth://totp/X?secret=JBSWY3DPEHPK3PXP&digits=99").is_err());
    }

    fn parse_otpath_hotp() -> Result<AccountInput, String> {
        parse_otpauth_uri("otpauth://hotp/X?secret=JBSWY3DPEHPK3PXP&counter=1")
    }

    #[test]
    fn known_base32_secret_decodes() {
        // "JBSWY3DPEHPK3PXP" is the canonical "Hello!\xde\xad\xbe\xef" seed.
        let a = parse_otpauth_uri("otpauth://totp/T?secret=JBSWY3DPEHPK3PXP").unwrap();
        assert_eq!(a.secret, b"Hello!\xde\xad\xbe\xef");
    }
}
