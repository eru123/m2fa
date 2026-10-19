interface EmptyStateProps {
  onImport: () => void;
}

export function EmptyState({ onImport }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <svg className="empty-shield" width="88" height="88" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="emptyShieldGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6366f1" />
            <stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path
          d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z"
          fill="url(#emptyShieldGrad)"
          opacity="0.92"
        />
        <path
          d="M9.6 11.6v-1.4a2.4 2.4 0 0 1 4.8 0v1.4"
          stroke="#0a0e14"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <rect x="8.9" y="11.6" width="6.2" height="4.6" rx="1.1" fill="#0a0e14" />
      </svg>
      <div className="empty-title">No accounts yet</div>
      <div className="empty-sub">Import a file with otpauth:// URIs to get started</div>
      <button type="button" className="btn btn-primary btn-lg" onClick={onImport}>
        Import now
      </button>
    </div>
  );
}
