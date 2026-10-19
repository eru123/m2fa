// Generates app-icon.png (1024x1024 RGBA) for 2FA Manager without any
// dependencies: procedural shield + padlock matching the in-app header logo.
// Usage: node scripts/gen-icon.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const SIZE = 1024;
const SS = 4; // supersamples per axis (16 per pixel) for smooth edges

// ---------- tiny PNG writer ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function writePng(path, width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    rgba.copy(raw, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log(`wrote ${path} (${width}x${height}, ${png.length} bytes)`);
}

// ---------- geometry ----------
function flatten(cmds, seg = 26) {
  const pts = [];
  let cur = [0, 0];
  const cubic = (p0, p1, p2, p3) => {
    for (let i = 1; i <= seg; i++) {
      const t = i / seg, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  for (const [k, ...a] of cmds) {
    if (k === "M") { cur = [a[0], a[1]]; pts.push([...cur]); }
    else if (k === "L") { cur = [a[0], a[1]]; pts.push([...cur]); }
    else if (k === "C") { cubic(cur, [a[0], a[1]], [a[2], a[3]], [a[4], a[5]]); cur = [a[4], a[5]]; }
  }
  return pts;
}
function inPoly(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const dx = Math.abs(px - cx) - (hw - r);
  const dy = Math.abs(py - cy) - (hh - r);
  const ax = Math.max(dx, 0), ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r;
}
function inRoundRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  if ((px >= x0 + r && px <= x1 - r) || (py >= y0 + r && py <= y1 - r)) return true;
  const cx = px < x0 + r ? x0 + r : x1 - r;
  const cy = py < y0 + r ? y0 + r : y1 - r;
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

// ---------- palette ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex("#0f1520");
const SHIELD = hex("#2563eb");
const LOCK = hex("#ffffff");
const BORDER = hex("#2a3547");
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

// shield in 24-unit space, scaled to ~66% of the canvas, centered
const S = 42, OX = 512 - 12 * S, OY = 512 - 12.1 * S;
const T = (p) => [p[0] * S + OX, p[1] * S + OY];
const shield = flatten([
  ["M", 12, 2.2], ["L", 20, 5.2], ["L", 20, 11],
  ["C", 20, 16, 16.6, 20.4, 12, 22],
  ["C", 7.4, 20.4, 4, 16, 4, 11],
  ["L", 4, 5.2],
]).map(T);
// shield bounding box (24-space corners) for a cheap early-out test
const GA = [4 * S + OX, 2.2 * S + OY], GB = [20 * S + OX, 22 * S + OY];

// padlock, same 24-space transform
const LOCK_CX = 12 * S + OX, LOCK_CY = 11.9 * S + OY;
const SH_OUT = 2.6 * S, SH_IN = 1.15 * S;
const BODY = [8.8 * S + OX, 11.5 * S + OY, 15.2 * S + OX, 16.6 * S + OY, 1.3 * S];

// ---------- render ----------
const rgba = Buffer.alloc(SIZE * SIZE * 4);
const SSF = 1 / SS;
let guard = 0;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) * SSF, py = y + (sy + 0.5) * SSF;
        const bgSd = sdRoundRect(px, py, 512, 512, 511, 511, 188);
        if (bgSd > 0) continue; // transparent corner
        // solid dark slate background
        let col = BG;
        // hairline border band for definition on dark desktops
        if (bgSd > -8) col = mix(col, BORDER, 0.55);
        // solid blue shield
        const inShieldX = px > GA[0] - 4 && px < GB[0] + 4 && py > GA[1] - 4 && py < GB[1] + 4;
        if (inShieldX && inPoly(px, py, shield)) {
          col = SHIELD;
        }
        // padlock cut in background dark
        const dxc = px - LOCK_CX, dyc = py - LOCK_CY;
        const dist = Math.sqrt(dxc * dxc + dyc * dyc);
        if ((dist <= SH_OUT && dist >= SH_IN && py <= LOCK_CY) ||
            inRoundRect(px, py, BODY[0], BODY[1], BODY[2], BODY[3], BODY[4])) {
          col = LOCK;
        }
        r += col[0]; g += col[1]; b += col[2]; a += 255;
      }
    }
    const n = SS * SS;
    const i = (y * SIZE + x) * 4;
    const cov = a / (255 * n);
    const covered = a / 255; // sub-samples that hit a layer
    rgba[i] = covered > 0 ? Math.round(r / covered) : 0;
    rgba[i + 1] = covered > 0 ? Math.round(g / covered) : 0;
    rgba[i + 2] = covered > 0 ? Math.round(b / covered) : 0;
    rgba[i + 3] = Math.round(cov * 255);
    guard++;
  }
}
writePng("app-icon.png", SIZE, SIZE, rgba);
console.log(`rendered ${guard} pixels`);
