const AVATAR_COLORS = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#84cc16",
  "#f97316",
  "#06b6d4",
  "#a855f7",
] as const;

/** Deterministic solid hex color for avatar backgrounds. */
export function colorFromString(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Group an OTP code in halves with a thin space when the digit count is even ("123456" -> "123 456"). */
export function groupCode(code: string): string {
  if (code.length > 0 && code.length % 2 === 0) {
    const half = code.length / 2;
    return `${code.slice(0, half)}\u2009${code.slice(half)}`;
  }
  return code;
}
