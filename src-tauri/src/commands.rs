use crate::{otp, otpauth, state::App, store};
use data_encoding::HEXLOWER;
use rand::RngCore;
use tauri::State;

#[derive(serde::Serialize)]
pub struct AccountMeta {
    pub id: String,
    pub label: String,
    pub issuer: String,
    pub algorithm: String,
    pub digits: u32,
    pub period: u32,
    pub created_at: i64,
}

#[derive(serde::Serialize)]
pub struct CodeSet {
    pub id: String,
    pub label: String,
    pub issuer: String,
    pub prev: String,
    pub current: String,
    pub next: String,
    pub period: u32,
    pub remaining_ms: u64,
}

#[derive(serde::Serialize)]
pub struct ImportSummary {
    pub imported: u32,
    pub duplicated: u32,
    pub failed: u32,
    pub errors: Vec<String>,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn list_accounts(app: State<App>) -> Result<Vec<AccountMeta>, String> {
    let conn = app.db.lock().map_err(|_| "database lock poisoned")?;
    store::list_accounts(&conn).map(|rows| {
        rows.into_iter()
            .map(|r| AccountMeta {
                id: r.id,
                label: r.label,
                issuer: r.issuer,
                algorithm: r.algorithm.as_str().to_string(),
                digits: r.digits,
                period: r.period,
                created_at: r.created_at,
            })
            .collect()
    })
}

#[tauri::command]
pub fn get_codes(app: State<App>) -> Result<Vec<CodeSet>, String> {
    let conn = app.db.lock().map_err(|_| "database lock poisoned")?;
    let rows = store::list_accounts(&conn)?;
    let now = now_ms();
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        // Skip unreadable rows instead of failing the whole board; a swapped
        // or corrupted ciphertext only loses its own account.
        let secret = match app.vault.unseal(&row.secret_enc, row.id.as_bytes()) {
            Ok(secret) => secret,
            Err(_) => continue,
        };
        let window = otp::totp_window(&secret, now, row.period, row.algorithm, row.digits);
        let period_ms = row.period as u64 * 1000;
        let remaining_ms = period_ms - now % period_ms;
        out.push(CodeSet {
            id: row.id,
            label: row.label,
            issuer: row.issuer,
            prev: window.prev,
            current: window.current,
            next: window.next,
            period: row.period,
            remaining_ms,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn import_lines(app: State<App>, content: String) -> Result<ImportSummary, String> {
    let mut summary = ImportSummary {
        imported: 0,
        duplicated: 0,
        failed: 0,
        errors: Vec::new(),
    };
    let conn = app.db.lock().map_err(|_| "database lock poisoned")?;
    for (idx, raw) in content.lines().enumerate() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        match otpauth::parse_otpauth_uri(line) {
            Ok(input) => {
                let fingerprint = app.vault.fingerprint(&input.secret);
                if store::account_exists(&conn, &fingerprint, &input.label, &input.issuer)? {
                    summary.duplicated += 1;
                    continue;
                }
                let mut id_bytes = [0u8; 16];
                rand::rng().fill_bytes(&mut id_bytes);
                let id = HEXLOWER.encode(&id_bytes);
                let secret_enc = app.vault.seal(&input.secret, id.as_bytes())?;
                store::insert_account(
                    &conn,
                    &id,
                    &input.label,
                    &input.issuer,
                    input.algorithm,
                    input.digits,
                    input.period,
                    &secret_enc,
                    &fingerprint,
                    now_ms() as i64,
                )?;
                summary.imported += 1;
            }
            Err(reason) => {
                summary.failed += 1;
                // Never echo the raw line: it may contain a secret.
                summary.errors.push(format!("line {}: {}", idx + 1, reason));
            }
        }
    }
    Ok(summary)
}

#[tauri::command]
pub fn delete_account(app: State<App>, id: String) -> Result<bool, String> {
    let conn = app.db.lock().map_err(|_| "database lock poisoned")?;
    store::delete_account(&conn, &id)
}

#[tauri::command]
pub fn delete_accounts(app: State<App>, ids: Vec<String>) -> Result<u32, String> {
    if ids.len() > 10_000 {
        return Err("too many accounts in one request".into());
    }
    let conn = app.db.lock().map_err(|_| "database lock poisoned")?;
    store::delete_accounts(&conn, &ids)
}

#[tauri::command]
pub fn update_account(
    app: State<App>,
    id: String,
    label: String,
    issuer: String,
) -> Result<bool, String> {
    let label = label.trim();
    let issuer = issuer.trim();
    if label.is_empty() {
        return Err("label must not be empty".into());
    }
    if label.len() > 256 || issuer.len() > 256 {
        return Err("label or issuer is too long".into());
    }
    let conn = app.db.lock().map_err(|_| "database lock poisoned")?;
    store::update_account(&conn, &id, label, issuer)
}

#[tauri::command]
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    arboard::Clipboard::new()
        .and_then(|mut clip| clip.set_text(text))
        .map_err(|e| format!("clipboard: {e}"))
}

/// Re-enable the main window from the dialog child window. Done in Rust so
/// recovery never depends on the (disabled) main window's JS still running.
#[tauri::command]
pub fn release_main_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window
            .set_enabled(true)
            .map_err(|e| format!("enable main window: {e}"))?;
        let _ = window.set_focus();
    }
    Ok(())
}

fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

/// Build one otpauth:// migration line from account data.
fn build_otpauth_uri(
    label: &str,
    issuer: &str,
    algorithm: crate::otp::Algo,
    digits: u32,
    period: u32,
    secret_b32: &str,
) -> String {
    format!(
        "otpauth://totp/{}?secret={}&issuer={}&algorithm={}&digits={}&period={}",
        percent_encode(label),
        secret_b32,
        percent_encode(issuer),
        algorithm.as_str(),
        digits,
        period
    )
}

/// UTC timestamp as YYYYMMDD-HHMMSS for export filenames.
fn timestamp_name() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let (h, m, s) = (rem / 3600, (rem % 3600) / 60, rem % 60);
    // civil-from-days (Howard Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let mth = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if mth <= 2 { y + 1 } else { y };
    format!("{y:04}{mth:02}{d:02}-{h:02}{m:02}{s:02}")
}

/// Export the selected accounts as otpauth:// lines to a file in the user's
/// Downloads folder. Runs entirely in Rust — secrets are unsealed and
/// written here and never cross into any webview. Returns the file path.
#[tauri::command]
pub fn export_accounts(
    app: tauri::AppHandle,
    state: State<App>,
    ids: Vec<String>,
) -> Result<String, String> {
    use std::collections::HashSet;
    use tauri::Manager;

    if ids.is_empty() {
        return Err("nothing selected to export".into());
    }
    if ids.len() > 10_000 {
        return Err("too many accounts in one request".into());
    }
    let wanted: HashSet<&str> = ids.iter().map(|s| s.as_str()).collect();

    let conn = state.db.lock().map_err(|_| "database lock poisoned")?;
    let rows = store::list_accounts(&conn)?;
    let mut lines = Vec::new();
    for row in rows {
        if !wanted.contains(row.id.as_str()) {
            continue;
        }
        let secret = state
            .vault
            .unseal(&row.secret_enc, row.id.as_bytes())
            .map_err(|e| format!("decrypt account for export: {e}"))?;
        let secret_b32 = data_encoding::BASE32_NOPAD.encode(&secret);
        lines.push(build_otpauth_uri(
            &row.label,
            &row.issuer,
            row.algorithm,
            row.digits,
            row.period,
            &secret_b32,
        ));
    }
    if lines.is_empty() {
        return Err("no matching accounts".into());
    }

    let dir = app
        .path()
        .download_dir()
        .map_err(|e| format!("resolve downloads folder: {e}"))?;
    let path = dir.join(format!("m2fa-export-{}.txt", timestamp_name()));
    let body = format!("{}\n", lines.join("\r\n"));
    std::fs::write(&path, body).map_err(|e| format!("write export file: {e}"))?;
    Ok(path.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::otp::Algo;

    #[test]
    fn percent_encode_keeps_safe_chars() {
        assert_eq!(percent_encode("Amazon Web Services"), "Amazon%20Web%20Services");
        assert_eq!(percent_encode("a.b-c_d~e"), "a.b-c_d~e");
        assert_eq!(percent_encode("ü@:"), "%C3%BC%40%3A");
    }

    #[test]
    fn otpauth_uri_roundtrips_through_the_parser() {
        let uri = build_otpauth_uri(
            "root@998",
            "Amazon Web Services",
            Algo::Sha256,
            8,
            60,
            "JBSWY3DPEHPK3PXP",
        );
        let parsed = crate::otpauth::parse_otpauth_uri(&uri).expect("parses");
        assert_eq!(parsed.label, "root@998");
        assert_eq!(parsed.issuer, "Amazon Web Services");
        assert_eq!(parsed.algorithm, Algo::Sha256);
        assert_eq!(parsed.digits, 8);
        assert_eq!(parsed.period, 60);
    }
}
