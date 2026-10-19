import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const DIALOG_LABEL = "dialog";

export interface DialogSpec {
  title: string;
  width: number;
  height: number;
}

/**
 * Open (or focus) the shared child dialog window and block the main window
 * while it is open — this Tauri version has no native `modal` window flag,
 * so modality is emulated by disabling the main window's input until the
 * dialog reports itself closed (see close.ts / dialog-closed event).
 */
export async function openDialog(query: string, spec: DialogSpec): Promise<void> {
  const main = getCurrentWindow();
  const existing = await WebviewWindow.getByLabel(DIALOG_LABEL);
  if (existing) {
    existing.setFocus().catch(() => undefined);
    main.setEnabled(false).catch(() => undefined);
    return;
  }
  const dialog = new WebviewWindow(DIALOG_LABEL, {
    url: `dialog.html?${query}`,
    title: spec.title,
    width: spec.width,
    height: spec.height,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    center: true,
    parent: "main",
  });
  dialog.once("tauri://created", () => {
    main.setEnabled(false).catch(() => undefined);
    dialog.setFocus().catch(() => undefined);
  });
  dialog.once("tauri://destroyed", () => {
    main.setEnabled(true).catch(() => undefined);
    main.setFocus().catch(() => undefined);
  });
  dialog.once("tauri://error", (event: { payload: unknown }) => {
    console.error("dialog window failed", event.payload);
    main.setEnabled(true).catch(() => undefined);
  });
}
