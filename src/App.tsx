import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import type { AccountMeta, CodeSet } from "./types";
import { EmptyState } from "./components/EmptyState";
import { ImportModal } from "./components/ImportModal";
import { OtpCard } from "./components/OtpCard";
import { OtpRow } from "./components/OtpRow";

type ViewMode = "card" | "list";
type Theme = "dark" | "light";

const VIEW_STORAGE_KEY = "m2fa.view";
const THEME_STORAGE_KEY = "m2fa.theme";

function loadView(): ViewMode {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === "list" ? "list" : "card";
  } catch {
    return "card";
  }
}

function loadTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export default function App() {
  const [codes, setCodes] = useState<CodeSet[]>([]);
  const [metaById, setMetaById] = useState<Record<string, AccountMeta>>({});
  const [view, setView] = useState<ViewMode>(loadView);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const copyTimerRef = useRef<number | null>(null);

  const refreshCodes = useCallback(() => {
    api.getCodes().then(setCodes).catch(() => undefined);
  }, []);

  const refreshMetas = useCallback(() => {
    api
      .listAccounts()
      .then((list) => {
        const map: Record<string, AccountMeta> = {};
        for (const meta of list) map[meta.id] = meta;
        setMetaById(map);
      })
      .catch(() => undefined);
  }, []);

  // Poll codes every second (+ immediately), keep account metadata fresh for badges.
  useEffect(() => {
    refreshCodes();
    refreshMetas();
    const interval = window.setInterval(refreshCodes, 1000);
    return () => window.clearInterval(interval);
  }, [refreshCodes, refreshMetas]);

  // 100ms ticker for smooth countdown rings.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, []);

  // Persist view mode.
  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* localStorage unavailable */
    }
  }, [view]);

  // Apply and persist theme.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* localStorage unavailable */
    }
  }, [theme]);

  // Clear any pending copy timeout on unmount.
  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const copy = useCallback((code: string, id: string) => {
    api.copyText(code).catch(() => undefined);
    setCopiedId(id);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopiedId(null), 1200);
  }, []);

  const handleDelete = useCallback(
    (id: string, label: string) => {
      if (!window.confirm(`Delete "${label}"?`)) return;
      api
        .deleteAccount(id)
        .then(() => {
          refreshCodes();
          refreshMetas();
        })
        .catch(() => undefined);
    },
    [refreshCodes, refreshMetas],
  );

  const handleImported = useCallback(() => {
    refreshCodes();
    refreshMetas();
  }, [refreshCodes, refreshMetas]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return codes;
    return codes.filter(
      (c) => c.label.toLowerCase().includes(q) || c.issuer.toLowerCase().includes(q),
    );
  }, [codes, query]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <svg className="brand-logo" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              className="logo-body"
              d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z"
            />
            <path
              className="logo-lock-stroke"
              d="M9.6 11.6v-1.4a2.4 2.4 0 0 1 4.8 0v1.4"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <rect className="logo-lock-fill" x="8.9" y="11.6" width="6.2" height="4.6" rx="1.1" />
          </svg>
          <div className="brand-text">
            <div className="brand-title">2FA Manager</div>
            <div className="brand-sub">{codes.length} accounts</div>
          </div>
        </div>

        <div className="header-actions">
          <input
            className="search-input"
            type="text"
            placeholder="Search…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search accounts"
          />
          <div className="view-toggle" role="group" aria-label="View mode">
            <button
              type="button"
              className={view === "card" ? "toggle-btn active" : "toggle-btn"}
              title="Card view"
              aria-pressed={view === "card"}
              onClick={() => setView("card")}
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
                <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
                <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
                <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
              </svg>
            </button>
            <button
              type="button"
              className={view === "list" ? "toggle-btn active" : "toggle-btn"}
              title="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <svg
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 6h16" />
                <path d="M4 12h16" />
                <path d="M4 18h16" />
              </svg>
            </button>
          </div>
          <button
            type="button"
            className="icon-btn"
            title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? (
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2" />
                <path d="M12 20v2" />
                <path d="M4.9 4.9l1.4 1.4" />
                <path d="M17.7 17.7l1.4 1.4" />
                <path d="M2 12h2" />
                <path d="M20 12h2" />
                <path d="M4.9 19.1l1.4-1.4" />
                <path d="M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
          <button type="button" className="btn" onClick={() => setModalOpen(true)}>
            Import
          </button>
        </div>
      </header>

      <main className="app-main">
        {codes.length === 0 ? (
          <EmptyState onImport={() => setModalOpen(true)} />
        ) : filtered.length === 0 ? (
          <div className="no-results">No accounts match your search.</div>
        ) : view === "card" ? (
          <div className="card-grid">
            {filtered.map((c) => (
              <OtpCard
                key={c.id}
                code={c}
                now={now}
                copied={copiedId === c.id}
                algorithm={metaById[c.id]?.algorithm}
                onCopy={copy}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          <div className="row-list">
            {filtered.map((c) => (
              <OtpRow
                key={c.id}
                code={c}
                now={now}
                copied={copiedId === c.id}
                algorithm={metaById[c.id]?.algorithm}
                onCopy={copy}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {modalOpen && <ImportModal onClose={() => setModalOpen(false)} onImported={handleImported} />}
    </div>
  );
}
