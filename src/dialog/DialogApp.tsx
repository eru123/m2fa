import { useEffect } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { EditDialog } from "./EditDialog";
import { ImportDialog } from "./ImportDialog";
import { NewDialog } from "./NewDialog";

/** Routes the shared dialog child window by its query parameters. */
export default function DialogApp() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");

  useEffect(() => {
    // WebView2 syncs document.title to the native window title.
    document.title =
      type === "edit"
        ? "Edit account"
        : type === "new"
          ? "Add account"
          : type === "delete"
            ? params.get("ids") !== null && params.get("ids") !== ""
              ? "Delete accounts"
              : "Delete account"
            : "Import accounts";
  }, [type, params]);

  if (type === "delete") {
    return (
      <ConfirmDialog
        id={params.get("id") ?? ""}
        label={params.get("label") ?? ""}
        ids={params.get("ids") ?? ""}
      />
    );
  }
  if (type === "edit") {
    return (
      <EditDialog
        id={params.get("id") ?? ""}
        label={params.get("label") ?? ""}
        issuer={params.get("issuer") ?? ""}
      />
    );
  }
  if (type === "new") {
    return <NewDialog initialMode={(params.get("mode") as "manual" | "image" | "camera") ?? "manual"} />;
  }
  return <ImportDialog />;
}
