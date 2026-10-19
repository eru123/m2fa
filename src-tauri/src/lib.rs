mod commands;
mod otp;
mod otpauth;
mod state;
mod store;
mod vault;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            use tauri::Manager;
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = store::open(&dir.join("m2fa.db")).map_err(to_boxed_error)?;
            let vault = vault::Vault::open().map_err(to_boxed_error)?;
            app.manage(state::App {
                db: std::sync::Mutex::new(db),
                vault,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_accounts,
            commands::get_codes,
            commands::import_lines,
            commands::delete_account,
            commands::copy_to_clipboard,
            commands::release_main_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn to_boxed_error(e: String) -> Box<dyn std::error::Error> {
    e.into()
}
