/**
 * neonProps.js — sprites for Neon Meridian: buildings seen in 3/4 view (a
 * moonlit roof over a south-facing facade of lit windows), neon signs, and
 * the city's landmarks. Anything that emits light pushes a glow source; the
 * renderer blends all glows in one pass after the sprites.
 */

import { hash2, valueNoise } from './mapNoise.js';
import { pick, packHex } from './lumenPalette.js';
import { drawCanopy } from './lumenProps.js';
import { N, NEON_KEYS, NEON_PX, NEON_RGB, NIGHT_SHADOW, WINDOWS } from './neonPalette.js';

const P = (cv, x, y, c) => cv.put(Math.round(x), Math.round(y), c);
function rect(cv, x0, y0, w, h, c) {
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, y0 + y, c);
}
const neonOf = (seed, k = 0) => NEON_KEYS[Math.floor(hash2(Math.floor(seed * 9973), k, 41) * NEON_KEYS.length)];
const glowAt = (glows, x, y, r, key, a = 0.3, reflect = false) => glows.push({ x, y, r, rgb: NEON_RGB[key] || key, a, reflect });

const MATERIALS = {
  tower: ['glass', 'facade', 'glass'],
  apartment: ['facade', 'brick', 'facade'],
  shop: ['facade', 'brick'],
  warehouse: ['metal'],
  factory: ['metal'],
  datacenter: ['facade'],
  lab: ['lab'],
  canalhouse: ['brick', 'facade', 'brick'],
};

/* ------------------------------ buildings ------------------------------- */

/** A building record from neonWorld (tile rect + facade height in px). */
export function drawBuilding(cv, b, S, glows) {
  const X0 = b.x * S + 1;
  const Y0 = b.y * S + 1;
  const Wp = b.w * S - 2;
  const Dp = b.d * S - 2;
  if (b.style === 'pagoda') {
    drawPagodaHouse(cv, X0 + Wp / 2, Y0 + Dp, Math.min(Wp, 14), b.seed, glows);
    return;
  }
  const mats = MATERIALS[b.style] || MATERIALS.apartment;
  const mat = N[mats[Math.floor(b.seed * 97) % mats.length]];
  const tiers = [{ inset: 0, h: b.h }];
  if (b.style === 'tower' && b.h > 34 && Wp >= 14 && b.seed > 0.3) {
    const h1 = Math.round(b.h * (0.55 + b.seed * 0.15));
    tiers[0].h = h1;
    tiers.push({ inset: Math.max(2, Math.round(Math.min(Wp, Dp) * 0.2)), h: b.h - h1 });
  }
  let base = 0;
  tiers.forEach((tier, ti) => {
    const x0 = X0 + tier.inset;
    const w = Wp - tier.inset * 2;
    const d = Dp - tier.inset * 2;
    const foot = Y0 - base + tier.inset;
    const top = ti === tiers.length - 1;
    drawFacade(cv, x0, foot + d - tier.h, w, tier.h, mat, b, ti === 0, glows);
    drawRoof(cv, x0, foot - tier.h, w, d, b, top, glows);
    base += tier.h;
  });
}

/** Where a tall tower's aircraft light sits (as drawRoof places it), or null. */
export function antennaTip(b, S) {
  if (b.style !== 'tower' || b.h <= 36) return null;
  const s = Math.floor(b.seed * 9973);
  if (hash2(s, 24, 55) >= 0.6) return null;
  const Wp = b.w * S - 2;
  const Dp = b.d * S - 2;
  const inset = b.h > 34 && Wp >= 14 && b.seed > 0.3 ? Math.max(2, Math.round(Math.min(Wp, Dp) * 0.2)) : 0;
  const w = Wp - inset * 2;
  if (w < 5 || Dp - inset * 2 < 4) return null;
  const x0 = b.x * S + 1 + inset;
  const y0 = b.y * S + 1 - b.h + inset;
  return { x: x0 + 2 + Math.floor(hash2(s, 23, 53) * (w - 4)), y: y0 - 5 };
}

function drawFacade(cv, x0, top, w, h, mat, b, ground, glows) {
  const s = Math.floor(b.seed * 9973);
  const style = b.style;
  const lit = style === 'datacenter' ? 0 : style === 'warehouse' ? 0.2 : 0.4 + hash2(s, 1, 3) * 0.42;
  const tone = hash2(s, 2, 5);
  const win = style === 'factory' ? [NEON_PX.orange, NEON_PX.orange, NEON_PX.yellow]
    : tone < 0.58 ? WINDOWS.warm : tone < 0.86 ? WINDOWS.cool : WINDOWS.pink;
  const step = style === 'warehouse' || style === 'factory' ? 4 : 3;
  const store = ground && ['shop', 'apartment', 'tower', 'canalhouse'].includes(style) && h > 6;
  const storeKey = neonOf(b.seed, 3);
  for (let y = 0; y < h; y += 1) {
    const floor = Math.floor((y - 2) / 3);
    const darkFloor = hash2(s, floor, 9) < 0.1;
    for (let x = 0; x < w; x += 1) {
      const X = x0 + x;
      const Y = top + y;
      let idx = 1.4 + (1 - y / h) * 0.9 + (x === 0 ? 1.8 : 0) - (x >= w - 2 ? 1.3 : 0) + (y === 0 ? 1.2 : 0);
      if (style === 'warehouse' && x % 2 === 0) idx -= 0.6; // corrugated panels
      let c = pick(mat, idx, X, Y, 0.5);
      const inWin = x >= 1 && x < w - 1 && y >= 2 && y < h - (store ? 3 : 1)
        && (x - 1) % step < step - 1 && (y - 2) % 3 === 0;
      if (style === 'datacenter') {
        if (y >= 1 && y < h - 1 && x % 2 === 1 && y % 2 === 1) {
          const on = hash2(s + x, y, 11) < 0.5;
          c = on ? (hash2(s, x + y, 13) < 0.6 ? NEON_PX.green : NEON_PX.cyan) : WINDOWS.dim;
        }
      } else if (inWin) {
        const col = Math.floor((x - 1) / step);
        const on = !darkFloor && hash2(s + floor * 31, col, 7) < lit;
        c = on ? win[hash2(s, col + floor * 7, 17) < 0.25 ? 2 : 1] : WINDOWS.off;
      }
      if (store && y >= h - 3 && x >= 1 && x < w - 1) {
        c = y === h - 3 ? NEON_PX[storeKey] : (x % 4 === 0 ? WINDOWS.off : WINDOWS.warm[2]);
      }
      cv.put(X, Y, c);
    }
  }
  if (store) glowAt(glows, x0 + w / 2, top + h - 1, Math.min(10, 4 + w / 3), storeKey, 0.3, true);
  // Vertical neon sign hung on a corner of taller buildings.
  if (h > 12 && hash2(s, 4, 19) < (style === 'tower' ? 0.55 : style === 'apartment' || style === 'canalhouse' ? 0.4 : 0.15)) {
    const key = neonOf(b.seed, 5);
    const sx = hash2(s, 6, 23) < 0.5 ? x0 - 1 : x0 + w - 2;
    const sh = Math.min(h - 5, 6 + Math.floor(hash2(s, 7, 29) * 14));
    const sy = top + 3 + Math.floor(hash2(s, 8, 31) * Math.max(1, h - sh - 6));
    for (let y = 0; y < sh; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const edge = x !== 1 || y === 0 || y === sh - 1;
        P(cv, sx + x, sy + y, edge ? NEON_PX[key] : (hash2(s + y, x, 37) < 0.5 ? packHex('#ffffff') : WINDOWS.off));
      }
    }
    glowAt(glows, sx + 1, sy + sh / 2, 7 + sh / 3, key, 0.34, true);
  }
  // Edge lights up the corners of the tallest glass towers.
  if (style === 'tower' && h > 40 && hash2(s, 9, 43) < 0.35) {
    const key = neonOf(b.seed, 10);
    for (let y = 2; y < h - 2; y += 1) { P(cv, x0, top + y, NEON_PX[key]); P(cv, x0 + w - 1, top + y, NEON_PX[key]); }
    glowAt(glows, x0, top + h / 2, 6, key, 0.18);
    glowAt(glows, x0 + w - 1, top + h / 2, 6, key, 0.18);
  }
}

function drawRoof(cv, x0, y0, w, d, b, top, glows) {
  const s = Math.floor(b.seed * 9973);
  const style = b.style;
  const gable = style === 'canalhouse';
  const roofRamp = gable ? [N.brick, N.pagoda, N.glass][s % 3]
    : [N.roof, N.roof, N.roofTeal, N.roofPlum, N.roofRust, N.metal][s % 6];
  for (let y = 0; y < d; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const X = x0 + x;
      const Y = y0 + y;
      let idx = 3 + (y === 0 ? 2 : 0) + (x === 0 ? 0.8 : 0) - (x === w - 1 || y === d - 1 ? 1.8 : 0);
      if (gable) idx = y < d / 2 ? 3.4 : 1.6 + (y === Math.floor(d / 2) ? 1.8 : 0);
      if (style === 'factory' && !gable) idx += ((x + y) % 6 < 3 ? 0.9 : -0.6); // sawtooth roof
      if (style === 'warehouse' && x % 5 === 2) idx += 1.2; // skylights
      cv.put(X, Y, pick(roofRamp, idx, X, Y, 0.5));
    }
  }
  if (!top || w < 5 || d < 4) return;
  const r = hash2(s, 21, 47);
  if (!gable && style !== 'datacenter') {
    const n = 1 + Math.floor(hash2(s, 27, 61) * 3);
    for (let k = 0; k < n; k += 1) {
      const lx = x0 + 1 + Math.floor(hash2(s, 28 + k, 63) * (w - 3));
      const ly = y0 + 1 + Math.floor(hash2(s, 31 + k, 67) * (d - 2));
      const c = hash2(s, 34 + k, 71) < 0.65 ? WINDOWS.warm[2] : WINDOWS.cool[2];
      P(cv, lx, ly, c);
      P(cv, lx + 1, ly, c);
    }
  }
  if (style === 'tower') {
    if (r < 0.13) { // crown lighting
      const key = neonOf(b.seed, 22);
      for (let x = 0; x < w; x += 1) { P(cv, x0 + x, y0, NEON_PX[key]); P(cv, x0 + x, y0 + d - 1, NEON_PX[key]); }
      for (let y = 0; y < d; y += 1) { P(cv, x0, y0 + y, NEON_PX[key]); P(cv, x0 + w - 1, y0 + y, NEON_PX[key]); }
      glowAt(glows, x0 + w / 2, y0 + d / 2, Math.max(w, d) * 0.8, key, 0.22);
    } else if (r < 0.22 && w >= 10 && d >= 8) { // helipad
      const cx = x0 + w / 2;
      const cy = y0 + d / 2;
      const rr = Math.min(w, d) / 2 - 1.5;
      for (let a = 0; a < 40; a += 2) P(cv, cx + Math.cos(a / 40 * Math.PI * 2) * rr, cy + Math.sin(a / 40 * Math.PI * 2) * rr * 0.8, packHex('#8f8452'));
      P(cv, cx, cy, packHex('#b5a660'));
    }
    // Antenna with an aircraft light on the taller towers.
    if (b.h > 36 && hash2(s, 24, 55) < 0.6) {
      const ax = x0 + 2 + Math.floor(hash2(s, 23, 53) * (w - 4));
      for (let k = 0; k < 6; k += 1) P(cv, ax, y0 + 1 - k, N.metal[3]);
      P(cv, ax, y0 - 5, NEON_PX.red);
      glowAt(glows, ax, y0 - 5, 3, 'red', 0.4);
    } else {
      rect(cv, x0 + 1 + Math.floor(r * (w - 4)), y0 + 1, 2, 2, N.metal[4]);
    }
  } else if (style === 'factory') {
    const cx = x0 + 2 + Math.floor(r * (w - 5));
    const ch = 10 + Math.floor(hash2(s, 25, 57) * 12);
    for (let k = 0; k < ch; k += 1) { P(cv, cx, y0 + 2 - k, N.metal[4]); P(cv, cx + 1, y0 + 2 - k, N.metal[2]); if (k % 5 === 2) { P(cv, cx, y0 + 2 - k, N.metal[1]); P(cv, cx + 1, y0 + 2 - k, N.metal[1]); } }
    P(cv, cx, y0 + 1 - ch, NEON_PX.orange);
    P(cv, cx + 1, y0 + 1 - ch, NEON_PX.orange);
    glowAt(glows, cx + 1, y0 + 1 - ch, 6, 'orange', 0.4);
  } else if (style === 'datacenter') {
    for (let y = 2; y < d - 1; y += 3) for (let x = 2; x < w - 2; x += 3) { P(cv, x0 + x, y0 + y, N.metal[1]); P(cv, x0 + x + 1, y0 + y, N.metal[4]); }
  } else if (!gable && r > 0.78 && w >= 8) {
    // Rooftop billboard on its frame, facing the street.
    const key = neonOf(b.seed, 26);
    const bw = Math.min(w - 2, 10);
    const bx = x0 + Math.floor((w - bw) / 2);
    for (let yy = 0; yy < 4; yy += 1) for (let xx = 0; xx < bw; xx += 1) P(cv, bx + xx, y0 - 3 + yy, yy === 0 || yy === 3 || xx === 0 || xx === bw - 1 ? NEON_PX[key] : ((xx + yy + s) % 3 ? packHex('#ffffff') : NEON_PX[key]));
    P(cv, bx + 1, y0 + 1, N.metal[3]);
    P(cv, bx + bw - 2, y0 + 1, N.metal[3]);
    glowAt(glows, bx + bw / 2, y0 - 1, bw * 0.9, key, 0.35);
  } else if (!gable) {
    // Rooftop clutter: AC units, a water tank, sometimes a garden.
    if (r < 0.25 && w >= 7) {
      for (let y = 1; y < d - 1; y += 1) for (let x = 1; x < w - 1; x += 1) if (hash2(x0 + x, y0 + y, 59) < 0.5) P(cv, x0 + x, y0 + y, pick(N.tree, 4 + hash2(x, y, 61) * 2, x0 + x, y0 + y));
    } else {
      rect(cv, x0 + 1 + Math.floor(r * (w - 4)), y0 + 1, 2, 2, N.metal[4]);
      if (d >= 6) {
        const tx = x0 + w - 4;
        const ty = y0 + d - 4;
        rect(cv, tx, ty, 3, 3, N.metal[3]);
        P(cv, tx, ty, N.metal[5]);
      }
    }
  }
}

/* ------------------------------ small props ----------------------------- */

/* ------------------------------ landmarks -------------------------------- */

function shadowEllipse(cv, cx, cy, rx, ry, a = 0.4) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy += 1) {
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx += 1) {
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (d <= 1) cv.blend(cx + dx, cy + dy, NIGHT_SHADOW, a * (1 - d * 0.5));
    }
  }
}

/** A box in 3/4 view with lit windows: shared by several landmarks. */
function box(cv, x0, baseY, w, d, h, mat, s, winKind = 'cool', lit = 0.5) {
  const top = baseY - h;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let c = pick(mat, 2 + (1 - y / h) + (x === 0 ? 1.5 : 0) - (x >= w - 2 ? 1 : 0), x0 + x, top + y, 0.5);
      if (x >= 1 && x < w - 1 && y >= 2 && y < h - 1 && (x - 1) % 3 < 2 && (y - 2) % 3 === 0) {
        c = hash2(s + x, y, 3) < lit ? WINDOWS[winKind][1] : WINDOWS.off;
      }
      cv.put(x0 + x, top + y, c);
    }
  }
  for (let y = 0; y < d; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, top - d + y, pick(N.roof, 2.6 + (y === 0 ? 1.4 : 0) - (x === w - 1 ? 1.2 : 0), x0 + x, top - d + y, 0.4));
  return top - d;
}

/* ------------------------------ maglev ----------------------------------- */

/** Height of the maglev deck above the street, in art px. */
export const MAGLEV_H = 10;

/**
 * Rail samples [i0, i1) of the maglev guideway (samples are 1 art px apart):
 * a pale deck with a cyan light strip on slim pylons. Over water the strip is
 * mirrored, rippling, in the sea below.
 */
export function drawMaglev(cv, rail, i0, i1, S, glows, isWater) {
  for (let i = i0; i < i1; i += 1) {
    const p = rail[i];
    const X = Math.round(p.x * S);
    const Yg = Math.round(p.y * S);
    const Y = Yg - MAGLEV_H;
    const wet = isWater(X, Yg);
    const horiz = Math.abs(p.tx) >= Math.abs(p.ty);
    if (i % 16 === 8) {
      for (let y = Y + (horiz ? 3 : 1); y <= Yg; y += 1) { P(cv, X, y, N.metal[3]); P(cv, X + 1, y, N.metal[1]); }
      cv.blend(X + 2, Yg + 1, NIGHT_SHADOW, 0.3);
      if (wet) { P(cv, X - 1, Yg + 1, N.shore[3]); P(cv, X + 2, Yg + 1, N.shore[3]); }
    }
    if (horiz) {
      P(cv, X, Y - 1, N.concrete[5]);
      P(cv, X, Y, N.concrete[4]);
      P(cv, X, Y + 1, N.concrete[2]);
      P(cv, X, Y + 2, i % 4 === 3 ? N.concrete[1] : NEON_PX.cyan);
    } else {
      P(cv, X - 1, Y, N.concrete[5]);
      P(cv, X, Y, N.concrete[4]);
      P(cv, X + 1, Y, N.concrete[3]);
      P(cv, X + 2, Y, i % 4 === 3 ? N.concrete[1] : NEON_PX.cyan);
    }
    if (i % 6 === 0) glowAt(glows, X + (horiz ? 0 : 2), Y + (horiz ? 2 : 0), 5, 'cyan', 0.2);
    if (wet) {
      // Broken, rippling reflection of the light strip.
      const r = valueNoise(i * 0.09, 3.1, 907);
      if (r > 0.42) {
        const a = (r - 0.42) * 0.7;
        const wob = Math.round(Math.sin(i * 0.31) * 1.5);
        cv.blend(X, Yg + MAGLEV_H - 1 + wob, NEON_RGB.cyan, a);
        if (i % 3 === 0) cv.blend(X, Yg + MAGLEV_H + 2 - wob, NEON_RGB.cyan, a * 0.5);
      }
    }
  }
}

/** A glass maglev station sitting on the deck at rail sample p. */
export function drawMaglevStation(cv, p, S, glows) {
  const X = Math.round(p.x * S);
  const Y = Math.round(p.y * S) - MAGLEV_H;
  const horiz = Math.abs(p.tx) >= Math.abs(p.ty);
  const w = horiz ? 28 : 11;
  const d = horiz ? 6 : 24;
  const x0 = X - Math.floor(w / 2) + (horiz ? 0 : 1);
  const base = horiz ? Y + 3 : Y + 13;
  const roof = box(cv, x0, base, w, d, 7, N.glass, X * 7 + Y, 'cool', 0.95);
  for (let x = 0; x < w; x += 1) { P(cv, x0 + x, roof, NEON_PX.magenta); P(cv, x0 + x, base - 1, NEON_PX.cyan); }
  for (let y = 0; y < d; y += 1) { P(cv, x0, roof + y, NEON_PX.magenta); P(cv, x0 + w - 1, roof + y, N.glass[5]); }
  // A little "M" sign on a mast.
  const sx = x0 + 2;
  for (let k = 0; k < 5; k += 1) P(cv, sx, roof - k, N.metal[4]);
  rect(cv, sx - 1, roof - 9, 5, 4, N.facade[1]);
  for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [1, 0], [2, 1], [3, 0], [3, 1], [3, 2]]) P(cv, sx - 1 + dx + 0.5, roof - 8 + dy, NEON_PX.cyan);
  glowAt(glows, sx + 1, roof - 7, 7, 'cyan', 0.45);
  glowAt(glows, x0 + w / 2, roof + d / 2, Math.max(w, d) * 0.75, 'cyan', 0.3);
  glowAt(glows, x0 + 1, roof, 6, 'magenta', 0.4);
}

/** Painter base of a station (its south edge). */
export function maglevStationBase(p, S) {
  const horiz = Math.abs(p.tx) >= Math.abs(p.ty);
  return Math.round(p.y * S) + (horiz ? 4 : 14);
}

const LANDMARKS = {
  /** Port Nova arrivals hall: a long glass hall under a curved roof and a big cyan sign. */
  terminal(cv, e, S, glows) {
    const x0 = e.x * S + 2;
    const w = e.w * S - 4;
    const base = e.y * S + 3 * S - 2;
    shadowEllipse(cv, x0 + w / 2 + 6, base, w / 2 + 4, 4);
    const top = base - 10;
    for (let y = 0; y < 10; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, top + y, y < 7 ? (x % 4 === 0 ? N.glass[1] : WINDOWS.cool[y < 3 ? 1 : 0]) : N.concrete[3]);
    for (let y = 0; y < 12; y += 1) {
      const inset = Math.round(Math.max(0, 5 - y) * 0.9);
      for (let x = inset; x < w - inset; x += 1) cv.put(x0 + x, top - 12 + y, pick(N.lab, 4 - y * 0.2 + (x < w / 3 ? 0.8 : 0), x0 + x, top - 12 + y, 0.4));
    }
    rect(cv, x0 + w / 2 - 12, top - 2, 24, 3, NEON_PX.cyan);
    for (let k = 0; k < 20; k += 3) rect(cv, x0 + w / 2 - 10 + k, top - 1, 2, 1, packHex('#ffffff'));
    glowAt(glows, x0 + w / 2, top, 20, 'cyan', 0.4, true);
  },
  containers(cv, e, S) {
    const cols = ['#b8323b', '#2f6fd6', '#2aa39a', '#e08a2c', '#d8c14a', '#7d49c9'];
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 3; c += 1) {
        const stack = 1 + Math.floor(hash2(e.x + c, e.y + r, 5) * 3);
        for (let k = 0; k < stack; k += 1) {
          const col = packHex(cols[Math.floor(hash2(e.x + c, r + k, 7) * cols.length)]);
          const x0 = e.x * S + 1 + c * 7;
          const y0 = e.y * S + 2 + r * 5 - k * 3;
          for (let y = 0; y < 4; y += 1) for (let x = 0; x < 6; x += 1) cv.put(x0 + x, y0 + y, x % 2 === 0 && y > 0 ? col : (y === 0 ? packHex('#ffffff') : col));
          cv.blend(x0 + 6, y0 + 1, NIGHT_SHADOW, 0.5);
          cv.blend(x0 + 6, y0 + 2, NIGHT_SHADOW, 0.5);
        }
      }
    }
  },
  crane(cv, e, S, glows) {
    const x0 = e.x * S;
    const base = e.y * S + S;
    for (let y = 0; y < 34; y += 1) { P(cv, x0, base - y, N.metal[4]); P(cv, x0 + 10, base - y, N.metal[3]); if (y % 4 === 0) for (let x = 0; x < 11; x += 1) P(cv, x0 + x, base - y, N.metal[2]); }
    for (let x = -14; x < 18; x += 1) { P(cv, x0 + x, base - 34, packHex('#e0a53a')); P(cv, x0 + x, base - 33, packHex('#a8741f')); }
    for (let y = 0; y < 12; y += 1) P(cv, x0 - 10, base - 33 + y, N.metal[3]);
    rect(cv, x0 - 12, base - 21, 5, 3, packHex('#2aa39a'));
    P(cv, x0 + 17, base - 35, NEON_PX.red);
    glowAt(glows, x0 + 17, base - 35, 3, 'red', 0.5);
  },
  ferry(cv, e, S, glows) {
    const x0 = e.x * S;
    const y0 = e.y * S;
    const key = ['cyan', 'magenta', 'yellow'][e.v % 3];
    for (let x = 0; x < 16; x += 1) {
      const inset = x < 2 || x > 13 ? 1 : 0;
      P(cv, x0 + x, y0 + inset, N.lab[4]);
      P(cv, x0 + x, y0 + 1, N.lab[3]);
      P(cv, x0 + x, y0 + 2, NEON_PX[key]);
      if (!inset) P(cv, x0 + x, y0 + 3, N.metal[1]);
    }
    rect(cv, x0 + 5, y0 - 3, 6, 3, N.glass[3]);
    for (let x = 6; x < 10; x += 2) P(cv, x0 + x, y0 - 2, WINDOWS.cool[2]);
    glowAt(glows, x0 + 8, y0 + 3, 8, key, 0.35);
  },
  /** The Arcology: a stepped megatower with light strips and a crown. */
  arcology(cv, e, S, glows) {
    const cx = e.x * S + (e.w * S) / 2;
    const base = e.y * S + e.d * S - 2;
    shadowEllipse(cv, cx + 16, base, 30, 7, 0.55);
    const tiers = [[38, 32, 70], [28, 24, 60], [20, 16, 48], [12, 10, 30]];
    let y = base;
    tiers.forEach(([w, d, h], i) => {
      const x0 = Math.round(cx - w / 2);
      const top = y - h;
      for (let yy = 0; yy < h; yy += 1) {
        for (let xx = 0; xx < w; xx += 1) {
          let c = pick(N.glass, 3 + (1 - yy / h) * 1.4 + (xx < 2 ? 1.4 : 0) - (xx > w - 3 ? 1.2 : 0), x0 + xx, top + yy, 0.5);
          if ((xx - 1) % 3 < 2 && (yy - 1) % 3 === 0 && xx > 0 && xx < w - 1) c = hash2(xx + i * 40, yy, 5) < 0.75 ? WINDOWS.cool[hash2(xx, yy, 7) < 0.4 ? 2 : 1] : WINDOWS.off;
          if (xx === Math.floor(w / 2) || xx === 1 || xx === w - 2) c = i % 2 ? NEON_PX.magenta : NEON_PX.cyan;
          cv.put(x0 + xx, top + yy, c);
        }
      }
      const rt = top - d;
      for (let yy = 0; yy < d; yy += 1) for (let xx = 0; xx < w; xx += 1) cv.put(x0 + xx, rt + yy, pick(N.roof, 3 + (yy === 0 ? 1.5 : 0), x0 + xx, rt + yy, 0.4));
      for (let xx = 0; xx < w; xx += 1) { P(cv, x0 + xx, rt, NEON_PX.cyan); P(cv, x0 + xx, top - 1, NEON_PX.magenta); }
      glowAt(glows, cx, top, w, i % 2 ? 'magenta' : 'cyan', 0.25);
      y = rt + d - Math.round(d * 0.35);
    });
    for (let k = 0; k < 26; k += 1) { P(cv, cx, y - k, N.metal[5]); P(cv, cx + 1, y - k, N.metal[3]); }
    P(cv, cx, y - 27, packHex('#ffffff'));
    glowAt(glows, cx, y - 27, 14, 'cyan', 0.7);
    glowAt(glows, cx, y - 8, 30, 'magenta', 0.18);
    glowAt(glows, cx, base, 30, 'cyan', 0.3, true);
  },
  /** Pixel Palace arcade: rainbow neon front and a big pixel-ghost sign. */
  arcade(cv, e, S, glows) {
    const x0 = e.x * S + 2;
    const w = e.w * S - 4;
    const base = e.y * S + e.d * S - 1;
    const rows = ['magenta', 'orange', 'yellow', 'green', 'cyan', 'violet'];
    const top = base - 14;
    for (let y = 0; y < 14; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, top + y, y < 12 && (x + y) % 3 !== 0 ? NEON_PX[rows[Math.floor(y / 2) % 6]] : N.facade[2]);
    rect(cv, x0 + w / 2 - 3, base - 5, 6, 5, WINDOWS.off);
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, top - 8 + y, pick(N.roof, 3 + (y === 0 ? 1 : 0), x0 + x, top - 8 + y, 0.4));
    const ghost = ['..###..', '.#####.', '##.#.##', '#######', '#######', '#.#.#.#'];
    ghost.forEach((row, gy) => [...row].forEach((ch, gx) => { if (ch === '#') P(cv, x0 + w / 2 - 3 + gx, top - 16 + gy, NEON_PX.pink); if (ch === '.' && gy === 2) P(cv, x0 + w / 2 - 3 + gx, top - 16 + gy, packHex('#ffffff')); }));
    glowAt(glows, x0 + w / 2, top - 12, 12, 'pink', 0.45);
    glowAt(glows, x0 + w / 2, base, 16, 'violet', 0.35, true);
  },
  /** Verdant Dome: a glass hemisphere full of trees. */
  dome(cv, e, S, glows) {
    const cx = e.x * S + (e.w * S) / 2;
    const cy = e.y * S + (e.d * S) / 2 + 4;
    const rx = 26;
    const ry = 20;
    for (let k = 0; k < 16; k += 1) drawCanopy(cv, cx - 18 + (k % 6) * 7 + hash2(k, 1, 3) * 3, cy - 8 + Math.floor(k / 6) * 7, 3.4, N.tree, hash2(k, 2, 5), false);
    for (let dy = -ry; dy <= ry; dy += 1) {
      for (let dx = -rx; dx <= rx; dx += 1) {
        const d = (dx / rx) ** 2 + (dy / ry) ** 2;
        if (d > 1) continue;
        const rim = d > 0.9;
        const grid = (Math.abs(dx) % 6 === 0 || Math.abs(dy) % 5 === 0) && !rim;
        const X = cx + dx;
        const Y = cy + dy;
        if (rim) cv.put(X, Y, dx + dy < 0 ? packHex('#bff7ff') : N.lab[3]);
        else if (grid) cv.blend(X, Y, [150, 240, 255], 0.35);
        else cv.blend(X, Y, [60, 200, 180], 0.14 + (dx + dy < -8 ? 0.12 : 0));
      }
    }
    glowAt(glows, cx, cy, 30, 'green', 0.28);
  },
  /** Fusion reactor: round hall, glowing core ring, two cooling towers. */
  reactor(cv, e, S, glows) {
    const cx = e.x * S + (e.w * S) / 2 - 6;
    const base = e.y * S + e.d * S - 4;
    shadowEllipse(cv, cx + 10, base, 22, 5);
    for (let dy = -9; dy <= 9; dy += 1) {
      for (let dx = -18; dx <= 18; dx += 1) {
        const d = (dx / 18) ** 2 + (dy / 9) ** 2;
        if (d > 1) continue;
        const X = cx + dx;
        const Y = base - 10 + dy;
        let c = pick(N.lab, 3.6 - (dx + dy) * 0.08, X, Y, 0.4);
        if (d > 0.5 && d < 0.68) c = NEON_PX.cyan;
        if (d < 0.18) c = packHex('#d9fbff');
        cv.put(X, Y, c);
      }
    }
    for (let y = 0; y < 8; y += 1) for (let x = -18; x <= 18; x += 1) if (Math.abs(x) < 18 - y * 0.3) cv.put(cx + x, base - 2 + y - 8, pick(N.lab, 2.2 - (x > 12 ? 1 : 0), cx + x, base + y, 0.4));
    glowAt(glows, cx, base - 10, 24, 'cyan', 0.5);
    for (const tx of [cx + 28, cx + 40]) {
      for (let y = 0; y < 22; y += 1) {
        const half = Math.round(5 + Math.abs(y - 14) * 0.25);
        for (let x = -half; x <= half; x += 1) cv.put(tx + x, base - y, pick(N.concrete, 3.4 + (x < 0 ? 1 : -0.6) + (y < 2 ? -1 : 0), tx + x, base - y, 0.4));
      }
    }
  },
  /** The Foundry: sawtooth halls, four tall stacks with glowing tops. */
  foundryStacks(cv, e, S, glows) {
    const x0 = e.x * S + 2;
    const base = e.y * S + e.d * S - 2;
    const w = e.w * S - 4;
    shadowEllipse(cv, x0 + w / 2 + 10, base, w / 2 + 6, 5);
    box(cv, x0, base, w, 14, 12, N.metal, 71, 'warm', 0.3);
    for (let x = 0; x < w; x += 1) for (let y = 0; y < 3; y += 1) if ((x + y) % 6 < 3) P(cv, x0 + x, base - 12 - 14 + y, N.metal[4]);
    rect(cv, x0 + w / 2 - 5, base - 5, 10, 5, packHex('#ff9a3c'));
    glowAt(glows, x0 + w / 2, base - 2, 16, 'orange', 0.5, true);
    [0.12, 0.32, 0.55, 0.78].forEach((f, i) => {
      const sx = Math.round(x0 + w * f);
      const h = 40 + i * 6;
      for (let y = 0; y < h; y += 1) {
        P(cv, sx, base - 12 - y, N.concrete[4]);
        P(cv, sx + 1, base - 12 - y, N.concrete[3]);
        P(cv, sx + 2, base - 12 - y, N.concrete[1]);
        if (y % 8 === 6) { P(cv, sx, base - 12 - y, NEON_PX.red); P(cv, sx + 2, base - 12 - y, NEON_PX.red); }
      }
      rect(cv, sx, base - 12 - h, 3, 1, NEON_PX.orange);
      glowAt(glows, sx + 1, base - 12 - h, 7, 'orange', 0.45);
    });
  },
  /** Data Vault core: a black monolith covered in blinking lights. */
  vaultCore(cv, e, S, glows) {
    const x0 = e.x * S + 4;
    const w = e.w * S - 8;
    const base = e.y * S + e.d * S - 2;
    shadowEllipse(cv, x0 + w / 2 + 10, base, w / 2 + 6, 5);
    const h = 26;
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      let c = pick(N.facade, 1.2 + (x === 0 ? 1.4 : 0), x0 + x, base - h + y, 0.4);
      if (x % 2 === 1 && y % 2 === 1 && y > 1) c = hash2(x, y, 3) < 0.45 ? (hash2(x, y, 5) < 0.5 ? NEON_PX.green : NEON_PX.cyan) : WINDOWS.dim;
      cv.put(x0 + x, base - h + y, c);
    }
    for (let y = 0; y < 18; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, base - h - 18 + y, pick(N.roof, 2.4 + (y === 0 ? 1.4 : 0), x0 + x, base - h - 18 + y, 0.4));
    for (let k = 0; k < 3; k += 1) {
      const fx = x0 + 6 + k * Math.floor((w - 12) / 2);
      for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (dx * dx + dy * dy <= 9) P(cv, fx + dx, base - h - 9 + dy, dx * dx + dy * dy <= 2 ? N.metal[5] : N.metal[1]);
    }
    glowAt(glows, x0 + w / 2, base - h / 2, w * 0.7, 'green', 0.2);
  },
  /** Skyport: a mooring mast with a docked airship. */
  skyport(cv, e, S, glows) {
    const cx = e.x * S + 12;
    const base = e.y * S + e.d * S - 2;
    shadowEllipse(cv, cx + 14, base, 22, 5);
    for (let y = 0; y < 44; y += 1) { P(cv, cx, base - y, N.metal[4]); P(cv, cx + 1, base - y, N.metal[2]); if (y % 6 === 0) { P(cv, cx - 1, base - y, N.metal[3]); P(cv, cx + 2, base - y, N.metal[3]); } }
    const by = base - 50;
    for (let dy = -7; dy <= 7; dy += 1) {
      for (let dx = -22; dx <= 22; dx += 1) {
        const d = (dx / 22) ** 2 + (dy / 7) ** 2;
        if (d > 1) continue;
        let c = pick(N.lab, 4 - dy * 0.25 - (dx > 12 ? 1 : 0), cx + 18 + dx, by + dy, 0.4);
        if (Math.abs(dx - 2) < 9 && Math.abs(dy) < 3) c = (dx + dy) % 3 === 0 ? NEON_PX.magenta : NEON_PX.pink;
        cv.put(cx + 18 + dx, by + dy, c);
      }
    }
    for (let x = 12; x < 22; x += 1) P(cv, cx + x, by + 8, N.metal[2]);
    glowAt(glows, cx + 20, by, 18, 'magenta', 0.3);
  },
  /** Old Town's great pagoda. */
  pagoda(cv, e, S, glows) {
    drawPagodaHouse(cv, e.x * S + (e.w * S) / 2, e.y * S + e.d * S - 2, 20, 0.6, glows, 3);
  },
  /** The Sleeping Titan: a fallen giant robot rusting in the wastes. */
  titan(cv, e, S, glows) {
    const x0 = e.x * S + 4;
    const y0 = e.y * S + 12;
    const rust = N.rust;
    const partBox = (x, y, w, h) => {
      for (let yy = 0; yy < h; yy += 1) for (let xx = 0; xx < w; xx += 1) {
        const X = x0 + x + xx;
        const Y = y0 + y + yy;
        let c = pick(rust, 3.2 + (yy === 0 ? 1.4 : 0) - (yy === h - 1 ? 1.4 : 0) + (valueNoise(X * 0.4, Y * 0.4, 7) - 0.5) * 2, X, Y, 0.6);
        if ((xx + yy * 3) % 11 === 0) c = N.metal[2];
        cv.put(X, Y, c);
      }
      cv.blend(x0 + x + w, y0 + y + h, NIGHT_SHADOW, 0.4);
    };
    shadowEllipse(cv, x0 + 38, y0 + 12, 40, 6, 0.45);
    partBox(0, 4, 12, 10); // head
    partBox(12, 2, 26, 14); // torso
    partBox(38, 4, 18, 5); // leg
    partBox(38, 10, 20, 5); // leg
    partBox(14, -8, 6, 10); // raised arm
    partBox(24, 16, 16, 4); // arm
    P(cv, x0 + 4, y0 + 8, NEON_PX.red);
    P(cv, x0 + 5, y0 + 8, NEON_PX.red);
    glowAt(glows, x0 + 4, y0 + 8, 6, 'red', 0.5);
  },
  /** Deep Listening Array: dishes on the cliffs. */
  array(cv, e, S, glows) {
    for (let k = 0; k < 3; k += 1) {
      const cx = e.x * S + 8 + k * 12;
      const cy = e.y * S + 14 + (k % 2) * 6;
      for (let dy = -5; dy <= 5; dy += 1) for (let dx = -6; dx <= 6; dx += 1) {
        const d = (dx / 6) ** 2 + (dy / 5) ** 2;
        if (d > 1) continue;
        P(cv, cx + dx, cy + dy - 6, d > 0.7 ? N.lab[5] : pick(N.lab, 3.5 - (dx + dy) * 0.15, cx + dx, cy + dy, 0.4));
      }
      for (let y = 0; y < 6; y += 1) P(cv, cx, cy + y, N.metal[3]);
      P(cv, cx + 2, cy - 9, NEON_PX.red);
      glowAt(glows, cx + 2, cy - 9, 3, 'red', 0.4);
    }
  },
  /** The Great Dam: a concrete wall with a lit crest and a roaring spillway. */
  dam(cv, e, S, glows) {
    const cx = e.x * S + S / 2;
    const cy = e.y * S + S;
    for (let x = -34; x <= 34; x += 1) {
      const bow = Math.round((x / 34) ** 2 * 4);
      for (let y = 0; y < 10; y += 1) P(cv, cx + x, cy - 6 + bow + y, pick(N.concrete, 4.4 - y * 0.25 + (x < 0 ? 0.4 : 0), cx + x, cy + y, 0.4));
      P(cv, cx + x, cy - 7 + bow, x % 4 === 0 ? NEON_PX.yellow : N.concrete[5]);
    }
    for (let y = 0; y < 12; y += 1) for (let x = -3; x <= 3; x += 1) P(cv, cx + x, cy + 4 + y, hash2(x, y, 3) > 0.35 ? packHex('#dff4ff') : N.shore[3]);
    glowAt(glows, cx, cy - 6, 30, 'yellow', 0.12);
  },
  turbine(cv, e, S) {
    const cx = e.x * S + S / 2;
    const base = e.y * S + S;
    for (let y = 0; y < 30; y += 1) P(cv, cx, base - y, N.lab[5 - Math.floor(y / 12)]);
    rect(cv, cx - 1, base - 31, 3, 2, N.lab[4]);
  },
  rocket(cv, e, S, glows) {
    const cx = e.x * S + S / 2;
    const base = e.y * S + S;
    for (let dy = -3; dy <= 3; dy += 1) for (let dx = -12; dx <= 12; dx += 1) if ((dx / 12) ** 2 + (dy / 3.5) ** 2 <= 1) P(cv, cx + dx, base + dy, dy === 0 && Math.abs(dx) > 9 ? NEON_PX.yellow : N.concrete[3]);
    for (let y = 0; y < 40; y += 1) { P(cv, cx + 8, base - y, N.metal[3]); if (y % 5 === 0) for (let x = 4; x < 8; x += 1) P(cv, cx + x, base - y, N.metal[2]); }
    for (let y = 0; y < 34; y += 1) {
      const half = y < 8 ? Math.floor(y / 3) : 3;
      for (let x = -half; x <= half; x += 1) P(cv, cx + x, base - 36 + y, (y > 12 && y < 15) || (y > 26 && y < 28) ? packHex('#e23b4f') : pick(N.lab, 5.4 - (x > 0 ? 1.6 : 0), cx + x, base - 36 + y, 0.3));
    }
    for (const fx of [-4, 4]) for (let y = 0; y < 4; y += 1) P(cv, cx + fx, base - 3 - y, packHex('#e23b4f'));
    glowAt(glows, cx, base - 20, 20, 'blue', 0.2);
  },
  /** Space elevator: base station and the tether rising out of sight. */
  elevator(cv, e, S, glows) {
    const cx = e.x * S + S / 2;
    const base = e.y * S + S;
    for (let dy = -5; dy <= 5; dy += 1) for (let dx = -10; dx <= 10; dx += 1) if (Math.abs(dx) + Math.abs(dy) * 1.6 <= 11) P(cv, cx + dx, base + dy - 2, pick(N.lab, 4 - (dx + dy) * 0.12, cx + dx, base + dy, 0.4));
    for (let y = 0; y < 150; y += 1) {
      const fade = 1 - y / 150;
      cv.blend(cx, base - 8 - y, [210, 240, 255], 0.9 * fade);
      if (y % 12 === 0) cv.blend(cx, base - 8 - y, [255, 255, 255], fade);
    }
    glowAt(glows, cx, base - 4, 14, 'cyan', 0.45);
  },
  /** Oceanlab: a research rig standing in the black water. */
  rig(cv, e, S, glows) {
    const x0 = e.x * S;
    const y0 = e.y * S;
    for (const [lx, ly] of [[2, 14], [22, 14], [2, 4], [22, 4]]) for (let y = 0; y < 8; y += 1) { P(cv, x0 + lx, y0 + ly + y, N.metal[3]); cv.blend(x0 + lx + 1, y0 + ly + y + 1, NIGHT_SHADOW, 0.4); }
    rect(cv, x0, y0 + 2, 26, 12, N.concrete[3]);
    box(cv, x0 + 2, y0 + 10, 10, 6, 7, N.lab, 5, 'cool', 0.6);
    for (let a = 0; a < 30; a += 1) P(cv, x0 + 19 + Math.cos(a / 30 * Math.PI * 2) * 4, y0 + 7 + Math.sin(a / 30 * Math.PI * 2) * 3, packHex('#e8c75a'));
    for (let y = 0; y < 16; y += 1) P(cv, x0 + 24, y0 + 2 - y, N.metal[4]);
    P(cv, x0 + 24, y0 - 14, NEON_PX.red);
    glowAt(glows, x0 + 12, y0 + 8, 20, 'cyan', 0.25);
  },
};

/** Low Old Town house or the great pagoda: stacked curved roofs with lanterns. */
function drawPagodaHouse(cv, cx, base, w, seed, glows, tiers = 1) {
  cx = Math.round(cx);
  shadowEllipse(cv, cx + 4, base, w / 2 + 3, 2.4, 0.4);
  let y = base;
  for (let t = 0; t < tiers; t += 1) {
    const ww = Math.round(w * (1 - t * 0.22));
    const wallH = 5;
    for (let yy = 0; yy < wallH; yy += 1) for (let x = -ww / 2 + 2; x < ww / 2 - 2; x += 1) P(cv, cx + x, y - yy, yy < 2 ? WINDOWS.warm[1] : N.brick[3]);
    y -= wallH;
    for (let yy = 0; yy < 5; yy += 1) {
      const half = ww / 2 + (yy === 4 ? 1 : 0) - yy * 0.6;
      for (let x = -Math.round(half); x <= Math.round(half); x += 1) P(cv, cx + x, y - yy, pick(N.pagoda, 4 - yy * 0.4 + (x < 0 ? 0.8 : -0.6), cx + x, y - yy, 0.4));
    }
    P(cv, cx - Math.round(ww / 2) - 1, y - 1, N.pagoda[5]);
    P(cv, cx + Math.round(ww / 2) + 1, y - 1, N.pagoda[4]);
    y -= 5;
  }
  for (const lx of [-w / 2, w / 2]) {
    P(cv, cx + lx, base - 4, NEON_PX.red);
    glowAt(glows, cx + lx, base - 4, 5, 'red', 0.45, true);
  }
  if (seed > 0.5) glowAt(glows, cx, base - 2, 8, 'orange', 0.2);
}

export function drawNeonLandmark(cv, e, S, glows) {
  const fn = LANDMARKS[e.type];
  if (fn) fn(cv, e, S, glows);
}

/** Where a landmark sprite "stands" for painter's ordering (its south edge). */
export function landmarkBase(e, S) {
  if (e.type === 'ferry' || e.type === 'rig') return e.y * S + 16;
  const d = e.d || (e.type === 'terminal' ? 3 : 1);
  return e.y * S + d * S;
}

/* ------------------------------ finds ------------------------------------ */

const FINDS = {
  noodles(cv, x, y, glows) { rect(cv, x - 5, y - 6, 10, 2, NEON_PX.red); rect(cv, x - 5, y - 4, 10, 4, N.brick[3]); rect(cv, x - 4, y - 3, 8, 1, WINDOWS.warm[2]); glowAt(glows, x, y - 4, 8, 'red', 0.4, true); },
  vending(cv, x, y, glows) { ['cyan', 'magenta', 'green'].forEach((k, i) => { rect(cv, x - 6 + i * 4, y - 7, 3, 7, N.facade[2]); rect(cv, x - 6 + i * 4, y - 6, 3, 4, NEON_PX[k]); glowAt(glows, x - 5 + i * 4, y - 4, 5, k, 0.35, true); }); },
  robodog(cv, x, y, glows) { rect(cv, x - 3, y - 4, 6, 2, N.lab[4]); rect(cv, x + 2, y - 6, 2, 2, N.lab[5]); for (const lx of [-3, -1, 1, 2]) P(cv, x + lx, y - 2, N.metal[4]); P(cv, x + 3, y - 5, NEON_PX.cyan); glowAt(glows, x + 3, y - 5, 3, 'cyan', 0.5); },
  koi(cv, x, y, glows) { for (let dy = -3; dy <= 3; dy += 1) for (let dx = -6; dx <= 6; dx += 1) if ((dx / 6) ** 2 + (dy / 3) ** 2 <= 1) P(cv, x + dx, y + dy - 3, (dx / 6) ** 2 + (dy / 3) ** 2 > 0.75 ? N.concrete[4] : N.shore[1]); P(cv, x - 2, y - 3, NEON_PX.orange); P(cv, x + 2, y - 4, NEON_PX.pink); glowAt(glows, x, y - 3, 7, 'cyan', 0.25); },
  graffiti(cv, x, y) { for (let k = 0; k < 14; k += 1) for (let j = 0; j < 5; j += 1) P(cv, x - 7 + k, y - 5 + j, j === 4 ? N.concrete[2] : NEON_PX[NEON_KEYS[Math.floor(valueNoise(k * 0.4, j * 0.4, 3) * NEON_KEYS.length) % NEON_KEYS.length]]); },
  hovercar(cv, x, y, glows) { rect(cv, x - 5, y - 3, 10, 3, N.lab[3]); rect(cv, x - 3, y - 5, 6, 2, N.glass[3]); P(cv, x - 5, y - 2, NEON_PX.red); P(cv, x + 4, y - 1, NEON_PX.cyan); glowAt(glows, x + 4, y - 1, 4, 'cyan', 0.35); },
  court(cv, x, y, glows) { for (let k = -8; k <= 8; k += 1) { P(cv, x + k, y - 8, NEON_PX.orange); P(cv, x + k, y, NEON_PX.orange); } for (let j = -8; j <= 0; j += 1) { P(cv, x - 8, y + j, NEON_PX.orange); P(cv, x + 8, y + j, NEON_PX.orange); P(cv, x, y + j, NEON_PX.orange); } glowAt(glows, x, y - 4, 10, 'orange', 0.2); },
  fortune(cv, x, y, glows) { rect(cv, x - 3, y - 9, 6, 9, N.brick[4]); rect(cv, x - 2, y - 8, 4, 4, WINDOWS.pink[1]); P(cv, x, y - 7, NEON_PX.violet); glowAt(glows, x, y - 6, 6, 'violet', 0.4, true); },
  cybertree(cv, x, y, glows) { drawCanopy(cv, x, y - 6, 4.5, [packHex('#062a2a'), packHex('#0a4a45'), packHex('#0f6b62'), packHex('#19a08f'), packHex('#3fe0c4'), packHex('#a8fff0')], 0.7, true); glowAt(glows, x, y - 6, 10, 'green', 0.35); },
  drones(cv, x, y, glows) { for (let k = 0; k < 14; k += 1) P(cv, x, y - k, N.metal[4]); for (const [dx, dy] of [[-5, -16], [4, -18], [0, -21]]) { P(cv, x + dx, y + dy, N.metal[5]); P(cv, x + dx - 1, y + dy, N.metal[3]); P(cv, x + dx + 1, y + dy, N.metal[3]); P(cv, x + dx, y + dy + 1, NEON_PX.green); glowAt(glows, x + dx, y + dy + 1, 3, 'green', 0.5); } },
  booth(cv, x, y, glows) { rect(cv, x - 2, y - 9, 5, 9, NEON_PX.red); rect(cv, x - 1, y - 7, 3, 5, WINDOWS.warm[2]); glowAt(glows, x, y - 5, 6, 'red', 0.35, true); },
  catcafe(cv, x, y, glows) { box(cv, x - 7, y, 14, 6, 9, N.brick, 9, 'warm', 0.7); const cat = ['#.#', '###', '.#.']; cat.forEach((row, cy) => [...row].forEach((ch, cx) => { if (ch === '#') P(cv, x - 1 + cx, y - 20 + cy, NEON_PX.pink); })); glowAt(glows, x, y - 19, 6, 'pink', 0.5); },
  satellite(cv, x, y) { for (let dy = -3; dy <= 3; dy += 1) for (let dx = -5; dx <= 5; dx += 1) if ((dx / 5) ** 2 + (dy / 3) ** 2 <= 1) P(cv, x + dx, y + dy - 2, pick(N.lab, 3 - dx * 0.2, x + dx, y + dy, 0.3)); for (let k = 0; k < 5; k += 1) P(cv, x + k, y - 2 - k, N.metal[4]); },
  billboard(cv, x, y, glows) { for (let k = 0; k < 8; k += 1) { P(cv, x - 5, y - k, N.metal[3]); P(cv, x + 5, y - k, N.metal[3]); } for (let j = 0; j < 7; j += 1) for (let k = -7; k <= 7; k += 1) P(cv, x + k, y - 15 + j, hash2(k, j, 5) < 0.2 ? NEON_PX.green : (k + j) % 5 === 0 ? NEON_PX.magenta : NEON_PX.cyan); glowAt(glows, x, y - 12, 12, 'cyan', 0.35); },
  skate(cv, x, y, glows) { for (let dy = -4; dy <= 4; dy += 1) for (let dx = -8; dx <= 8; dx += 1) { const d = (dx / 8) ** 2 + (dy / 4) ** 2; if (d <= 1) P(cv, x + dx, y + dy - 4, d > 0.8 ? NEON_PX.violet : pick(N.concrete, 2 + d * 2, x + dx, y + dy, 0.4)); } glowAt(glows, x, y - 4, 10, 'violet', 0.3); },
  foodtruck(cv, x, y, glows) { rect(cv, x - 7, y - 6, 14, 6, N.lab[4]); rect(cv, x - 4, y - 5, 6, 2, WINDOWS.warm[2]); rect(cv, x - 7, y - 7, 14, 1, NEON_PX.yellow); P(cv, x - 5, y, N.metal[1]); P(cv, x + 5, y, N.metal[1]); glowAt(glows, x - 1, y - 4, 8, 'yellow', 0.35, true); },
  botshrine(cv, x, y, glows) { rect(cv, x - 5, y - 2, 10, 2, N.concrete[4]); rect(cv, x - 2, y - 8, 4, 6, N.lab[4]); rect(cv, x - 1, y - 10, 2, 2, N.lab[5]); P(cv, x, y - 9, NEON_PX.cyan); glowAt(glows, x, y - 8, 6, 'cyan', 0.35); },
  bigdrone(cv, x, y, glows) { rect(cv, x - 6, y - 4, 12, 3, N.metal[3]); for (const dx of [-8, 7]) { P(cv, x + dx, y - 5, N.metal[5]); P(cv, x + dx + 1, y - 5, N.metal[5]); } P(cv, x, y - 3, NEON_PX.red); glowAt(glows, x, y - 3, 4, 'red', 0.45); },
};

export function drawNeonFind(cv, x, y, sprite, glows) {
  const fn = FINDS[sprite];
  if (fn) fn(cv, Math.round(x), Math.round(y), glows);
}

export function drawChestNight(cv, X, Y, glows) {
  const x0 = Math.round(X) - 3;
  const y0 = Math.round(Y) - 5;
  for (let y = 0; y < 6; y += 1) for (let x = 0; x < 7; x += 1) {
    let c = y < 2 ? N.metal[4] : N.metal[2];
    if (x === 0 || x === 6 || y === 2) c = NEON_PX.cyan;
    if (y === 5) c = N.metal[0];
    cv.put(x0 + x, y0 + y, c);
  }
  cv.put(x0 + 3, y0 + 3, packHex('#ffffff'));
  glowAt(glows, x0 + 3, y0 + 3, 6, 'cyan', 0.35);
}

