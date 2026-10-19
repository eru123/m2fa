import { createRoot } from "react-dom/client";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import DialogApp from "./DialogApp";
import "../styles.css";

// Title-bar close and other OS close paths must also let the main window
// re-enable its input.
getCurrentWebviewWindow().onCloseRequested(() => {
  emitTo("main", "dialog-closed").catch(() => undefined);
});

createRoot(document.getElementById("root")!).render(<DialogApp />);
