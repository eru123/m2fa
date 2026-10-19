import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Close the dialog child window from inside it. The main window is notified
 * fire-and-forget and the close is issued in parallel — nothing here may
 * await IPC on the (input-disabled) main window, or the close could hang.
 */
export function closeDialog(): void {
  emitTo("main", "dialog-closed").catch(() => undefined);
  getCurrentWebviewWindow().close().catch(() => undefined);
}
