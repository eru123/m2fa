import { useEffect, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { api } from "../api";
import { CheckIcon, XIcon } from "../components/icons";
import { closeDialog } from "./close";

interface EditDialogProps {
  id: string;
  label: string;
  issuer: string;
}

export function EditDialog({ id, label: initialLabel, issuer: initialIssuer }: EditDialogProps) {
  const [label, setLabel] = useState(initialLabel);
  const [issuer, setIssuer] = useState(initialIssuer);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const save = () => {
    if (busy) return;
    if (label.trim() === "") {
      setError("Label is required.");
      return;
    }
    setBusy(true);
    setError(null);
    api
      .updateAccount(id, label.trim(), issuer.trim())
      .then(() => emitTo("main", "accounts-changed"))
      .then(() => closeDialog())
      .catch(() => {
        setBusy(false);
        setError("Save failed. Try again.");
      });
  };

  return (
    <div className="dialog-page">
      <h2 className="dialog-title">Edit account</h2>
      <div className="dialog-body dialog-form">
        <div className="dialog-field">
          <label className="dialog-label" htmlFor="edit-label">
            Label
          </label>
          <input
            id="edit-label"
            className="dialog-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
        </div>
        <div className="dialog-field">
          <label className="dialog-label" htmlFor="edit-issuer">
            Issuer
          </label>
          <input
            id="edit-issuer"
            className="dialog-input"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
          />
        </div>
        {error !== null && <div className="dialog-confirm-error">{error}</div>}
      </div>
      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={() => closeDialog()} disabled={busy}>
          <XIcon /> Cancel
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>
          <CheckIcon /> {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
