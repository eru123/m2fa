import { useId } from "react";

interface CodeRingProps {
  /** TOTP period in seconds. */
  period: number;
  /** Current time in ms (ticked by the app) — remaining time is computed locally. */
  now: number;
  /** Pixel size: 44 for cards, 36 for list rows. */
  size?: number;
}

export function CodeRing({ period, now, size = 44 }: CodeRingProps) {
  const gradId = `ring-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const stroke = size >= 40 ? 3.5 : 3;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = period * 1000;
  const remaining = Math.max(0, total - (now % total));
  const fraction = remaining / total;
  const urgent = remaining <= 5000;
  const offset = circumference * (1 - fraction);
  const seconds = Math.ceil(remaining / 1000);
  const c = size / 2;

  return (
    <svg
      className="code-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${seconds} seconds remaining`}
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={c}
        cy={c}
        r={r}
        fill="none"
        stroke={urgent ? "#f59e0b" : `url(#${gradId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text
        className="ring-num"
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fill={urgent ? "#f59e0b" : "#e8ecf2"}
        fontSize={size >= 40 ? 12 : 11}
      >
        {seconds}
      </text>
    </svg>
  );
}
