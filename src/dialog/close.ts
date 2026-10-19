import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Close the dialog child window from inside it, notifying the main window
 * first so it can re-enable its input (emulated modality).
 */
export async function closeDialog(): Promise<void> {
  try {
    await emitTo("main", "dialog-closed");
  } catch {
    /* main window already gone */
  }
  try {
    await getCurrentWebviewWindow().close();
  } catch {
    /* already closing */
  }
}
