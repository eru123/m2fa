import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import jsQR from "jsqr";
import { emitTo } from "@tauri-apps/api/event";
import { api } from "../api";
import type { ImportSummary } from "../types";
import { CameraIcon, ImageIcon, KeyboardIcon, PlusIcon, RefreshIcon, XIcon } from "../components/icons";
import { closeDialog } from "./close";

type Tab = "manual" | "image" | "camera";

interface NewDialogProps {
  initialMode?: Tab;
}

function describeUri(uri: string): string {
  const m = uri.match(/^otpauth:\/\/totp\/([^?]*)\??(.*)$/i);
  if (!m) return uri;
  let label = m[1];
  try {
    label = decodeURIComponent(m[1]);
  } catch {
    /* keep raw */
  }
  const issuer = new URLSearchParams(m[2]).get("issuer") ?? "";
  return issuer !== "" ? `${issuer} · ${label}` : label;
}

export function NewDialog({ initialMode = "manual" }: NewDialogProps) {
  const [tab, setTab] = useState<Tab>(initialMode);
  const [label, setLabel] = useState("");
  const [issuer, setIssuer] = useState("");
  const [secret, setSecret] = useState("");
  const [digits, setDigits] = useState("6");
  const [period, setPeriod] = useState("30");
  const [algorithm, setAlgorithm] = useState("SHA1");
  const [scanned, setScanned] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // camera tab: stream and scan frames until a code is found or tab changes
  useEffect(() => {
    if (tab !== "camera") return;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let cancelled = false;
    setCameraError(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
        }
        timer = window.setInterval(() => {
          const video = videoRef.current;
          if (!video || video.readyState < 2 || scanned !== null) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return;
          if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
          const canvas = canvasRef.current;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, w, h);
          const frame = ctx.getImageData(0, 0, w, h);
          const hit = jsQR(frame.data, w, h);
          if (hit && hit.data.toLowerCase().startsWith("otpauth://")) {
            setScanned(hit.data);
          }
        }, 250);
      })
      .catch(() => {
        if (!cancelled) setCameraError("Camera unavailable — use a QR image or manual entry.");
      });
    return () => {
      cancelled = true;
      if (timer !== null) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [tab, scanned]);

  const submitUri = (uri: string) => {
    if (busy) return;
    setBusy(true);
    setResult(null);
    api
      .importLines(uri)
      .then((summary) => {
        setResult(summary);
        setBusy(false);
        if (summary.imported === 1) {
          emitTo("main", "accounts-changed").catch(() => undefined);
          closeTimerRef.current = window.setTimeout(() => closeDialog(), 1200);
        }
      })
      .catch(() => {
        setBusy(false);
        setResult({ imported: 0, duplicated: 0, failed: 1, errors: ["Request failed"] });
      });
  };

  const submitManual = () => {
    if (busy) return;
    if (label.trim() === "" || secret.trim() === "") {
      setResult({ imported: 0, duplicated: 0, failed: 1, errors: ["Label and secret are required."] });
      return;
    }
    const uri =
      `otpauth://totp/${encodeURIComponent(label.trim())}` +
      `?secret=${encodeURIComponent(secret.replace(/\s+/g, ""))}` +
      `&issuer=${encodeURIComponent(issuer.trim())}` +
      `&digits=${digits}&period=${period}&algorithm=${algorithm}`;
    submitUri(uri);
  };

  const handleQrFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrError(null);
    setScanned(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          setQrError("Could not read the image.");
          return;
        }
        ctx.drawImage(img, 0, 0);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hit = jsQR(frame.data, canvas.width, canvas.height);
        if (!hit) {
          setQrError("No QR code found in this image.");
          return;
        }
        if (!hit.data.toLowerCase().startsWith("otpauth://")) {
          setQrError("The QR code is not an otpauth:// URI.");
          return;
        }
        setScanned(hit.data);
      };
      img.onerror = () => setQrError("Could not read the image.");
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const resultLine = (summary: ImportSummary) => (
    <div className="import-result" role="status">
      <div className="import-result-line">
        {summary.imported === 1 ? (
          <span className="res-ok">Added</span>
        ) : summary.duplicated === 1 ? (
          <span className="res-dup">That account already exists.</span>
        ) : (
          <span className="res-fail">
            {summary.errors[0] ?? "Could not add this account."}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="dialog-page">
      <h2 className="dialog-title">Add account</h2>

      <div className="dialog-tabs" role="tablist">
        {(
          [
            ["manual", "Manual", KeyboardIcon],
            ["image", "QR image", ImageIcon],
            ["camera", "Camera", CameraIcon],
          ] as Array<[Tab, string, typeof KeyboardIcon]>
        ).map(([id, name, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "tab-btn active" : "tab-btn"}
            onClick={() => {
              setTab(id);
              setScanned(null);
              setResult(null);
            }}
          >
            <Icon /> {name}
          </button>
        ))}
      </div>

      <div className="dialog-body">
        {tab === "manual" && (
          <>
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="new-label">
                Label
              </label>
              <input
                id="new-label"
                className="dialog-input"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            </div>
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="new-issuer">
                Issuer
              </label>
              <input
                id="new-issuer"
                className="dialog-input"
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
              />
            </div>
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="new-secret">
                Secret (base32)
              </label>
              <input
                id="new-secret"
                className="dialog-input mono"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div className="dialog-form-row">
              <div className="dialog-field">
                <label className="dialog-label" htmlFor="new-digits">
                  Digits
                </label>
                <select
                  id="new-digits"
                  className="dialog-input"
                  value={digits}
                  onChange={(e) => setDigits(e.target.value)}
                >
                  <option value="6">6</option>
                  <option value="7">7</option>
                  <option value="8">8</option>
                  <option value="9">9</option>
                </select>
              </div>
              <div className="dialog-field">
                <label className="dialog-label" htmlFor="new-period">
                  Period (s)
                </label>
                <input
                  id="new-period"
                  className="dialog-input"
                  type="number"
                  min={1}
                  max={86400}
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                />
              </div>
              <div className="dialog-field">
                <label className="dialog-label" htmlFor="new-algo">
                  Algorithm
                </label>
                <select
                  id="new-algo"
                  className="dialog-input"
                  value={algorithm}
                  onChange={(e) => setAlgorithm(e.target.value)}
                >
                  <option value="SHA1">SHA1</option>
                  <option value="SHA256">SHA256</option>
                  <option value="SHA512">SHA512</option>
                </select>
              </div>
            </div>
          </>
        )}

        {tab === "image" && (
          <>
            <div
              className="file-drop"
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
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
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 15l4-4 5 5" />
                <path d="M14 13l2.5-2.5L21 15" />
                <circle cx="9" cy="8.5" r="1.5" />
              </svg>
              <div className="file-text">
                <span className="file-browse">Browse QR image</span>
                <span className="file-name mono">PNG or JPEG with an otpauth QR code</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleQrFile}
                aria-hidden="true"
                tabIndex={-1}
              />
            </div>
            {qrError !== null && <div className="dialog-confirm-error">{qrError}</div>}
          </>
        )}

        {tab === "camera" && (
          <>
            <video ref={videoRef} className="scan-video" muted playsInline autoPlay />
            {cameraError !== null && <div className="dialog-confirm-error">{cameraError}</div>}
            {cameraError === null && scanned === null && (
              <div className="scan-hint">Point the camera at an otpauth QR code…</div>
            )}
          </>
        )}

        {scanned !== null && (
          <div className="scan-preview">
            <div className="scan-preview-title">Detected</div>
            <div className="scan-preview-value mono">{describeUri(scanned)}</div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setScanned(null);
                setResult(null);
              }}
            >
              <RefreshIcon /> Scan again
            </button>
          </div>
        )}

        {result !== null && resultLine(result)}
      </div>

      <div className="dialog-actions">
        <button type="button" className="btn btn-ghost" onClick={() => closeDialog()} disabled={busy}>
          <XIcon /> Cancel
        </button>
        {tab === "manual" ? (
          <button type="button" className="btn btn-primary" onClick={submitManual} disabled={busy}>
            <PlusIcon /> {busy ? "Adding…" : "Add"}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => scanned !== null && submitUri(scanned)}
            disabled={busy || scanned === null}
          >
            <PlusIcon /> {busy ? "Adding…" : "Add"}
          </button>
        )}
      </div>
    </div>
  );
}
