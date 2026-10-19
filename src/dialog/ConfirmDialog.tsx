import { useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { api } from "../api";
import { closeDialog } from "./close";

interface ConfirmDialogProps {
  id: string;
  label: string;
}

export function ConfirmDialog({ id, label }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmDelete = () => {
    if (busy || id === "") return;
    setBusy(true);
    setError(null);
    api
      .deleteAccount(id)
      .then(() => emitTo("main", "accounts-changed"))
      .then(() => closeDialog())
      .catch(() => {
        setBusy(false);
        setError("Delete failed. Try again.");
      });
  };

  return (
    <div className="dialog-page dialog-confirm">
      <div className="dialog-confirm-message">
        Delete <span className="dialog-confirm-label">{label}</span> permanently? Its encrypted
        secret will be removed from the vault.
      </div>
      {error !== null && <div className="dialog-confirm-error">{error}</div>}
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={() => closeDialog()} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary dialog-confirm-delete"
          onClick={confirmDelete}
          disabled={busy}
        >
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  );
}
