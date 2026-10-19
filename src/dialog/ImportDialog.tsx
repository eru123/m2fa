import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { api } from "../api";
import type { ImportSummary } from "../types";
import { closeDialog } from "./close";

export function ImportDialog() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const close = () => {
    closeDialog();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineCount = useMemo(
    () => text.split("\n").filter((line) => line.trim().length > 0).length,
    [text],
  );

  const handleFileChosen = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      setText(typeof content === "string" ? content : "");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleBrowseKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openFilePicker();
    }
  };

  const submitImport = () => {
    if (busy || lineCount === 0) return;
    setBusy(true);
    api
      .importLines(text)
      .then((summary) => {
        setResult(summary);
        setBusy(false);
        emitTo("main", "accounts-changed").catch(() => undefined);
        if (summary.failed === 0) {
          closeTimerRef.current = window.setTimeout(() => close(), 1600);
        }
      })
      .catch(() => {
        setBusy(false);
        setResult({ imported: 0, duplicated: 0, failed: 1, errors: ["Import request failed"] });
      });
  };

  return (
    <div className="dialog-page">
      <h2 className="dialog-title">Import accounts</h2>
      <p className="dialog-hint">One otpauth:// URI per line</p>

      <div className="dialog-body">
        <div
          className="file-drop"
          role="button"
          tabIndex={0}
          onClick={openFilePicker}
          onKeyDown={handleBrowseKey}
        >
          <svg
            className="file-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
            <path d="M14 3v5h5" />
            <path d="M12 17v-6" />
            <path d="M9.5 13.5L12 11l2.5 2.5" />
          </svg>
          <div className="file-text">
            <span className="file-browse">Browse file</span>
            <span className="file-name mono">{fileName ?? ".txt file with otpauth:// URIs"}</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            hidden
            onChange={handleFileChosen}
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>

        <textarea
          className="dialog-textarea mono"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="otpauth://totp/Example:alice@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
          spellCheck={false}
        />

        {result !== null && (
          <div className="import-result" role="status">
            <div className="import-result-line">
              <span className="res-ok">Imported {result.imported}</span>
              {result.duplicated > 0 && (
                <span className="res-dup">, {result.duplicated} duplicates skipped</span>
              )}
              {result.failed > 0 && <span className="res-fail">, {result.failed} failed</span>}
            </div>
            {result.errors.length > 0 && (
              <ul className="import-errors">
                {result.errors.map((err, i) => (
                  <li key={`${i}:${err}`}>{err}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submitImport}
          disabled={busy || lineCount === 0}
        >
          {busy ? "Importing…" : `Import ${lineCount} ${lineCount === 1 ? "line" : "lines"}`}
        </button>
      </div>
    </div>
  );
}
