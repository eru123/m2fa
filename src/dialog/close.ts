import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Close the dialog child window from inside it. The main window is
 * re-enabled through a Rust command first — recovery must not depend on
 * the (input-disabled) main window's own JS — then everything else is
 * fire-and-forget so nothing can block the close.
 */
export function closeDialog(): void {
  invoke("release_main_window").catch(() => undefined);
  emitTo("main", "dialog-closed").catch(() => undefined);
  getCurrentWebviewWindow().close().catch(() => undefined);
}
