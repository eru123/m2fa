import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import DialogApp from "./DialogApp";
import "../styles.css";

// Title-bar close and other OS close paths must also release the main
// window; do it through the backend so it works even if the main window's
// JS cannot process events while disabled.
getCurrentWebviewWindow().onCloseRequested(() => {
  invoke("release_main_window").catch(() => undefined);
  emitTo("main", "dialog-closed").catch(() => undefined);
});

createRoot(document.getElementById("root")!).render(<DialogApp />);
