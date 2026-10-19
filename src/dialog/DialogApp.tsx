import { useEffect } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ImportDialog } from "./ImportDialog";

/** Routes the shared dialog child window by its query parameters. */
export default function DialogApp() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");

  useEffect(() => {
    // WebView2 syncs document.title to the native window title.
    document.title = type === "delete" ? "Delete account" : "Import accounts";
  }, [type]);

  if (type === "delete") {
    return <ConfirmDialog id={params.get("id") ?? ""} label={params.get("label") ?? ""} />;
  }
  return <ImportDialog />;
}
