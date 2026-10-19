/** Deterministic hue (0-359) from a string, used for avatar colors. */
export function hueFromString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** Group an OTP code in halves with a thin space when the digit count is even ("123456" -> "123 456"). */
export function groupCode(code: string): string {
  if (code.length > 0 && code.length % 2 === 0) {
    const half = code.length / 2;
    return `${code.slice(0, half)}\u2009${code.slice(half)}`;
  }
  return code;
}
