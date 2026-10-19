import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { CodeSet } from "../types";
import { matchBrand } from "../brands";
import { colorFromString, groupCode } from "../util";
import { CodeRing } from "./CodeRing";

interface OtpRowProps {
  code: CodeSet;
  /** Current time in ms for the countdown ring. */
  now: number;
  copied: boolean;
  /** Algorithm from account metadata, when loaded (used for the algorithm badge). */
  algorithm?: string;
  onCopy: (code: string, id: string) => void;
  onDelete: (id: string, label: string) => void;
}

export function OtpRow({ code, now, copied, algorithm, onCopy, onDelete }: OtpRowProps) {
  const brand = matchBrand(code.issuer, code.label);
  const color = brand?.color ?? colorFromString(code.issuer !== "" ? `${code.issuer}||${code.label}` : code.label);
  const ink = brand?.ink ?? "#ffffff";
  const initial = (brand?.name ?? (code.issuer !== "" ? code.issuer : code.label))
    .charAt(0)
    .toUpperCase();
  const showBadge = (algorithm !== undefined && algorithm !== "SHA1") || code.period !== 30;
  const badgeText = `${algorithm ?? "SHA1"} · ${code.period}s`;

  const handleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onCopy(code.current, code.id);
    }
  };

  return (
    <div
      className={copied ? "otp-row copied" : "otp-row"}
      role="button"
      tabIndex={0}
      title="Click to copy the current code"
      onClick={() => onCopy(code.current, code.id)}
      onKeyDown={handleKey}
    >
      <div className="avatar avatar-sm" style={{ background: color, color: ink }} title={brand?.name}>
        {initial}
      </div>

      <div className="row-id">
        <div className="row-label" title={code.label}>
          {code.label}
        </div>
        {code.issuer !== "" && (
          <div className="row-issuer" title={code.issuer}>
            {code.issuer}
          </div>
        )}
      </div>

      <div className="row-prev mono">
        <span className="pill-label">prev</span>
        <span>{code.prev}</span>
      </div>

      <div className="row-current">
        <span key={code.current} className="code-value code-value-sm mono">
          {groupCode(code.current)}
        </span>
        <CodeRing period={code.period} now={now} size={24} />
      </div>

      <div className="row-next mono">
        <span className="pill-label">next</span>
        <span>{code.next}</span>
      </div>

      {showBadge && <span className="algo-badge row-badge mono">{badgeText}</span>}

      <button
        type="button"
        className="row-delete"
        aria-label={`Delete ${code.label}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(code.id, code.label);
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
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

      {copied && (
        <div className="copy-overlay" aria-hidden="true">
          <span className="copy-check">
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
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
    </div>
  );
}
