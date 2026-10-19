use crate::{otp, otpauth, state::App, store};
use data_encoding::HEXLOWER;
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};
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

/// SHA-256 fingerprint of the raw secret, used for duplicate detection
/// without ever storing the secret itself.
fn secret_fingerprint(secret: &[u8]) -> String {
    HEXLOWER.encode(Sha256::digest(secret).as_slice())
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
        let secret = app.vault.unseal(&row.secret_enc)?;
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
                let fingerprint = secret_fingerprint(&input.secret);
                if store::account_exists(&conn, &fingerprint, &input.label, &input.issuer)? {
                    summary.duplicated += 1;
                    continue;
                }
                let secret_enc = app.vault.seal(&input.secret)?;
                let mut id_bytes = [0u8; 16];
                OsRng.fill_bytes(&mut id_bytes);
                let id = HEXLOWER.encode(id_bytes);
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
pub fn copy_to_clipboard(text: String) -> Result<(), String> {
    arboard::Clipboard::new()
        .and_then(|mut clip| clip.set_text(text))
        .map_err(|e| format!("clipboard: {e}"))
}
