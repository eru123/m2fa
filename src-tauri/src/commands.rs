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
