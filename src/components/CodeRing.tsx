interface CodeRingProps {
  /** TOTP period in seconds. */
  period: number;
  /** Current time in ms (ticked by the app) — remaining time is computed locally. */
  now: number;
  /** Pixel size: 32 for cards, 24 for list rows. */
  size?: number;
}

export function CodeRing({ period, now, size = 32 }: CodeRingProps) {
  const stroke = size >= 28 ? 3 : 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const total = period * 1000;
  const remaining = Math.max(0, total - (now % total));
  const fraction = remaining / total;
  const offset = circumference * (1 - fraction);
  const seconds = Math.ceil(remaining / 1000);
  const c = size / 2;
  // green while more than two thirds of the window remains (21-30s on a 30s
  // period), orange in the middle third (11-20s), red in the last (0-10s)
  const tier = fraction > 2 / 3 ? "ok" : fraction > 1 / 3 ? "warn" : "danger";

  return (
    <svg
      className="code-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${seconds} seconds remaining`}
    >
      <circle className="ring-track" cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} />
      <circle
        className={`ring-prog ${tier}`}
        cx={c}
        cy={c}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${c} ${c})`}
      />
      <text
        className={`ring-num ${tier}`}
        x={c}
        y={c}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size >= 28 ? 10 : 9}
      >
        {seconds}
      </text>
    </svg>
  );
}
