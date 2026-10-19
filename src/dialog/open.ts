import { getCurrentWindow, Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

const DIALOG_LABEL = "dialog";

export interface DialogSpec {
  title: string;
  width: number;
  height: number;
}

let watchdogId: number | null = null;

function reenableMain(main: Window): void {
  if (watchdogId !== null) {
    window.clearInterval(watchdogId);
    watchdogId = null;
  }
  main.setEnabled(true).catch(() => undefined);
  main.setFocus().catch(() => undefined);
}

/**
 * Block the main window and start a watchdog that re-enables it the moment
 * the dialog window is gone — polled locally, so recovery does not depend
 * on event delivery from the child (crash, killed window, dropped event).
 */
function guardMainWindow(main: Window): void {
  main.setEnabled(false).catch(() => undefined);
  if (watchdogId !== null) window.clearInterval(watchdogId);
  watchdogId = window.setInterval(() => {
    WebviewWindow.getByLabel(DIALOG_LABEL)
      .then((open) => {
        if (!open) reenableMain(main);
      })
      .catch(() => reenableMain(main));
  }, 400);
}

/** Fast path for the dialog-closed event from the child window. */
export function releaseMainWindow(): void {
  reenableMain(getCurrentWindow());
}

/**
 * Open (or focus) the shared child dialog window and block the main window
 * while it is open. This Tauri version has no native `modal` window flag,
 * so modality is emulated by disabling the main window's input.
 */
export async function openDialog(query: string, spec: DialogSpec): Promise<void> {
  const main = getCurrentWindow();
  const existing = await WebviewWindow.getByLabel(DIALOG_LABEL);
  if (existing) {
    existing.setFocus().catch(() => undefined);
    guardMainWindow(main);
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
    guardMainWindow(main);
    dialog.setFocus().catch(() => undefined);
  });
  dialog.once("tauri://destroyed", () => {
    reenableMain(main);
  });
  dialog.once("tauri://error", (event: { payload: unknown }) => {
    console.error("dialog window failed", event.payload);
    reenableMain(main);
  });
}
