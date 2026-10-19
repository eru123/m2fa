use crate::vault::Vault;
use std::sync::Mutex;

/// Shared Tauri-managed state: the SQLite handle and the open vault.
pub struct App {
    pub db: Mutex<rusqlite::Connection>,
    pub vault: Vault,
}
