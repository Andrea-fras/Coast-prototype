/**
 * Deterministic noise helpers shared by the world generators, renderers and
 * fog. The backend mirrors each world's terrain, so changing these changes
 * the worlds: re-export the terrain files (scripts/export-map-terrain.mjs).
 */

export function hash2(x, y, s = 0) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) & 0xffff) / 65535;
}

function smooth(t) { return t * t * (3 - 2 * t); }

export function valueNoise(x, y, s = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = hash2(x0, y0, s);
  const b = hash2(x0 + 1, y0, s);
  const c = hash2(x0, y0 + 1, s);
  const d = hash2(x0 + 1, y0 + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function fbm(x, y, s = 0) {
  return valueNoise(x, y, s) * 0.55
    + valueNoise(x * 2.1, y * 2.1, s + 7) * 0.3
    + valueNoise(x * 4.3, y * 4.3, s + 13) * 0.15;
}

/** Sharp crests instead of rounded hills — mountain ridges. */
export function ridged(x, y, s = 0) {
  const a = 1 - Math.abs(valueNoise(x, y, s) * 2 - 1);
  const b = 1 - Math.abs(valueNoise(x * 2.03, y * 2.03, s + 5) * 2 - 1);
  return a * a * 0.65 + b * b * 0.35;
}

/** 4×4 ordered-dither threshold in [-0.5, 0.5). */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x, y) {
  return BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5 + 1 / 32;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(a, b, v) {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Polynomial smooth minimum — organic unions of land blobs. */
export function smin(a, b, k) {
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}
