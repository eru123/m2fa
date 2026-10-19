import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CodeSet } from "../types";
import { matchBrand } from "../brands";
import { BRAND_ICONS } from "../brand-icons";
import { colorFromString, groupCode } from "../util";
import { CodeRing } from "./CodeRing";

interface OtpCardProps {
  code: CodeSet;
  /** Current time in ms for the countdown ring. */
  now: number;
  copied: boolean;
  /** Algorithm from account metadata, when loaded (used for the algorithm badge). */
  algorithm?: string;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onCopy: (code: string, id: string) => void;
  onDelete: (id: string, label: string) => void;
}

export function OtpCard({
  code,
  now,
  copied,
  algorithm,
  selectionMode,
  selected,
  onToggleSelect,
  onCopy,
  onDelete,
}: OtpCardProps) {
  const displayName = code.issuer !== "" ? code.issuer : code.label;
  const brand = matchBrand(code.issuer, code.label);
  const color = brand?.color ?? colorFromString(code.issuer !== "" ? `${code.issuer}||${code.label}` : code.label);
  const ink = brand?.ink ?? "#ffffff";
  const initial = (brand?.name ?? displayName).charAt(0).toUpperCase();
  const iconPath = brand ? BRAND_ICONS[brand.id] : undefined;
  const showBadge = (algorithm !== undefined && algorithm !== "SHA1") || code.period !== 30;
  const badgeText = `${algorithm ?? "SHA1"} · ${code.period}s`;

  const activate = () => {
    if (selectionMode) {
      onToggleSelect(code.id);
    } else {
      onCopy(code.current, code.id);
    }
  };

  const handleKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate();
    }
  };

  const classes = ["otp-card"];
  if (copied && !selectionMode) classes.push("copied");
  if (selected) classes.push("selected");

  return (
    <article
      className={classes.join(" ")}
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? selected : undefined}
      title={selectionMode ? "Toggle selection" : "Click to copy the current code"}
      onClick={activate}
      onKeyDown={handleKey}
    >
      {selectionMode ? (
        <span className="select-check" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
      ) : (
        <button
          type="button"
          className="card-delete"
          aria-label={`Delete ${code.label}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(code.id, code.label);
          }}
        >
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
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
          </svg>
        </button>
      )}

      <div className="card-top">
        <div className="avatar" style={{ background: color, color: ink }} title={brand?.name}>
          {iconPath ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d={iconPath} fill="currentColor" />
            </svg>
          ) : (
            initial
          )}
        </div>
        <div className="card-id">
          {code.issuer !== "" && (
            <div className="card-issuer" title={code.issuer}>
              {code.issuer}
            </div>
          )}
          <div className="card-label" title={code.label}>
            {code.label}
          </div>
        </div>
        <CodeRing period={code.period} now={now} size={32} />
      </div>

      <div className="card-code">
        <span key={code.current} className="code-value mono">
          {groupCode(code.current)}
        </span>
      </div>

      <div className="card-bottom">
        <div className="pill">
          <span className="pill-label">prev</span>
          <span className="pill-code prev-code mono">{code.prev}</span>
        </div>
        <div className="pill">
          <span className="pill-label">next</span>
          <span className="pill-code next-code mono">{code.next}</span>
        </div>
        {showBadge && <span className="algo-badge mono">{badgeText}</span>}
      </div>

      {copied && !selectionMode && (
        <div className="copy-overlay" aria-hidden="true">
          <span className="copy-check">
            <svg
              viewBox="0 0 24 24"
              width="28"
              height="28"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span className="copy-text">Copied!</span>
        </div>
      )}
    </article>
  );
}
