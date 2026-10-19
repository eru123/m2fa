import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const DIALOG_LABEL = "dialog";

export interface DialogSpec {
  title: string;
  width: number;
  height: number;
}

/**
 * Open (or focus) the shared child dialog window. Real OS child window:
 * stays on top of the main window, no HTML overlay involved.
 */
export async function openDialog(query: string, spec: DialogSpec): Promise<void> {
  const existing = await WebviewWindow.getByLabel(DIALOG_LABEL);
  if (existing) {
    existing.setFocus().catch(() => undefined);
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
  dialog.once("tauri://error", (event: { payload: unknown }) => {
    console.error("dialog window failed", event.payload);
  });
}
