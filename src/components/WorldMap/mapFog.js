/**
 * mapFog.js — the fog of war, pre-rendered as one layer per unlock state.
 *
 * The fog is the hook: it should hide enough to make you curious and show
 * enough to make you want the next section. So instead of a flat curtain:
 *  - a glimpse band a few tiles past the frontier where the land shows
 *    through thinning cloud, and
 *  - past that, solid cover: the Lumen Reaches' sea of sunlit cumulus, Neon
 *    Meridian's dark polluted smog, full of lightning.
 * Beacons (mapBeacons.js) are drawn on top so landmarks still call out.
 */

import { bayer, clamp, hash2, smoothstep, valueNoise } from './mapNoise';

export const GLIMPSE_TILES = 7;

/** Chamfer distance in tiles from every tile to the charted area (0 inside it). */
export function chartDistance(size, unlocked) {
  const d = new Float32Array(size * size).fill(1e9);
  for (const key of unlocked) {
    const comma = key.indexOf(',');
    const x = +key.slice(0, comma);
    const y = +key.slice(comma + 1);
    if (x >= 0 && y >= 0 && x < size && y < size) d[y * size + x] = 0;
  }
  const D = 1.414;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - size] + 1);
        if (x > 0) v = Math.min(v, d[i - size - 1] + D);
        if (x < size - 1) v = Math.min(v, d[i - size + 1] + D);
      }
      d[i] = v;
    }
  }
  for (let y = size - 1; y >= 0; y -= 1) {
    for (let x = size - 1; x >= 0; x -= 1) {
      const i = y * size + x;
      let v = d[i];
      if (x < size - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < size - 1) {
        v = Math.min(v, d[i + size] + 1);
        if (x < size - 1) v = Math.min(v, d[i + size + 1] + D);
        if (x > 0) v = Math.min(v, d[i + size - 1] + D);
      }
      d[i] = v;
    }
  }
  return d;
}

/* ------------------------------ clouds & smog ----------------------------- */

// Ramps run shadow → lit top. Lumen: sunlit cumulus with lavender shadows.
// Neon: dark grey, polluted smog (mapLightning.js flickers storms through it).
const STYLES = {
  clouds: {
    ramp: [[0x6f, 0x78, 0xa8], [0x8b, 0x95, 0xc2], [0xa8, 0xb1, 0xd8], [0xc3, 0xcb, 0xe8], [0xda, 0xe0, 0xf3], [0xec, 0xf0, 0xfa], [0xfa, 0xfb, 0xff]],
    under: [0x8a, 0x93, 0xbf],
    haze: [0xdc, 0xe6, 0xf6],
    hazeMax: 0.56,
    glow: null,
  },
  smog: {
    ramp: [[0x06, 0x06, 0x07], [0x0a, 0x0a, 0x0b], [0x0f, 0x0f, 0x10], [0x14, 0x14, 0x15], [0x19, 0x19, 0x1b], [0x20, 0x20, 0x22], [0x28, 0x28, 0x2a]],
    under: [0x0c, 0x0c, 0x0d],
    haze: [0x0e, 0x0e, 0x0f],
    hazeMax: 0.72,
    glow: null,
    // Pollution: slow blotches of darker murk drifting through the smog.
    murk: [0x08, 0x08, 0x09],
    murkMax: 0.35,
  },
};
const LIGHT = (() => {
  const v = [-0.52, -0.62, 0.58];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();

/**
 * A sea of cumulus seen from above: big billows at the back, small puffs on
 * top of them. Every puff grows with how deep in the fog it sits, so near the
 * frontier the clouds break into scattered wisps over hazy land (the glimpse
 * band) and further out they merge into a solid, rolling layer. Southern puffs
 * overlap northern ones, like stacked cotton lit from the north-west.
 */
function buildPuffs(W, cell, rMin, rMax, seed, sizeFor) {
  const cells = Math.ceil(W / cell) + 2;
  const X = new Float32Array(cells * cells);
  const Y = new Float32Array(cells * cells);
  const Rr = new Float32Array(cells * cells);
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      const k = cy * cells + cx;
      const px = (cx - 1 + 0.1 + hash2(cx, cy, seed) * 0.8) * cell;
      const py = (cy - 1 + 0.1 + hash2(cx, cy, seed + 2) * 0.8) * cell;
      const g = sizeFor(px, py, hash2(cx, cy, seed + 4));
      X[k] = px;
      Y[k] = py;
      Rr[k] = g <= 0.03 ? 0 : (rMin + hash2(cx, cy, seed + 6) * (rMax - rMin)) * (0.3 + 0.7 * g);
    }
  }
  return { cells, cell, X, Y, R: Rr, seed };
}

/** Front-most puff covering (px, py); billows get cauliflower edges. */
function puffAt(pf, px, py, lumpy) {
  const cx = Math.floor(px / pf.cell) + 1;
  const cy = Math.floor(py / pf.cell) + 1;
  let best = -1;
  let bestY = -1e9;
  for (let oy = -2; oy <= 2; oy += 1) {
    const gy = cy + oy;
    if (gy < 0 || gy >= pf.cells) continue;
    for (let ox = -2; ox <= 2; ox += 1) {
      const gx = cx + ox;
      if (gx < 0 || gx >= pf.cells) continue;
      const k = gy * pf.cells + gx;
      const r = pf.R[k];
      if (!r || pf.Y[k] <= bestY) continue;
      const dx = px - pf.X[k];
      const dy = py - pf.Y[k];
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r * 1.21) continue;
      let rr = r;
      if (lumpy) rr = r * (0.8 + 0.3 * valueNoise(dx / r * 1.7 + k * 0.37, dy / r * 1.7, pf.seed));
      if (d2 <= rr * rr) { best = k; bestY = pf.Y[k]; }
    }
  }
  return best;
}

function paintClouds(world, unlocked, dist, P, style) {
  const { size } = world;
  const CLOUD = style.ramp;
  const UNDER = style.under;
  const HAZE = style.haze;
  const W = size * P;
  const data = new Uint8ClampedArray(W * W * 4);
  const dAt = (u, v) => {
    const x = clamp(u - 0.5, 0, size - 1.001);
    const y = clamp(v - 0.5, 0, size - 1.001);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const i = y0 * size + x0;
    const a = Math.min(dist[i], 24);
    const b = Math.min(dist[i + 1] ?? a, 24);
    const c = Math.min(dist[i + size] ?? a, 24);
    const d = Math.min(dist[i + size + 1] ?? a, 24);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const depthPx = (px, py) => dAt(px / P, py / P);
  // Billows fill the deep fog; wisps only live in the band near the frontier.
  const big = buildPuffs(W, 28, 15, 28, 621, (px, py, h) => smoothstep(2.4, 6.5, depthPx(px, py) + (h - 0.5) * 2));
  const small = buildPuffs(W, 10, 3.5, 7, 631, (px, py, h) => {
    if (h < 0.3) return 0;
    const d = depthPx(px, py) + (h - 0.5) * 1.6;
    return smoothstep(0.9, 2.6, d) * (1 - smoothstep(4.5, 7, d));
  });

  const murky = (c, X, Y) => {
    if (!style.murk) return c;
    const m = smoothstep(0.35, 0.8, valueNoise(X * 0.01, Y * 0.01, 641)) * style.murkMax;
    const M = style.murk;
    return [c[0] + (M[0] - c[0]) * m, c[1] + (M[1] - c[1]) * m, c[2] + (M[2] - c[2]) * m];
  };

  const shadePuff = (pf, k, X, Y, dp, back) => {
    const r = pf.R[k];
    const nx = (X - pf.X[k]) / r;
    const ny = (Y - pf.Y[k]) / r;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const lambert = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
    let idx = 1.1 + lambert * 5 - smoothstep(6, 16, dp) * 0.6 - (back ? 0.5 : 0);
    if (nx * nx + ny * ny > 0.8 && nx + ny > 0.25) idx -= 1.3;
    idx = Math.round(idx + bayer(X, Y) * 0.8);
    const c = murky(CLOUD[idx < 0 ? 0 : idx > 6 ? 6 : idx], X, Y);
    if (!style.glow) return c;
    // Smog: the undersides catch the city's light, in patches of one colour.
    const g = style.glow[Math.floor(valueNoise(X * 0.012, Y * 0.012, 621) * style.glow.length * 0.999)];
    const a = clamp(0.42 - lambert * 0.5, 0, style.glowMax) * (0.4 + 0.6 * valueNoise(X * 0.04, Y * 0.04, 623));
    return [c[0] + (g[0] - c[0]) * a, c[1] + (g[1] - c[1]) * a, c[2] + (g[2] - c[2]) * a];
  };

  for (let Y = 0; Y < W; Y += 1) {
    const v = (Y + 0.5) / P;
    const ty = Math.floor(v);
    for (let X = 0; X < W; X += 1) {
      const u = (X + 0.5) / P;
      const tx = Math.floor(u);
      const charted = dist[ty * size + tx] === 0;
      const dp = dAt(u, v);
      if (charted && dp < 0.35) continue;
      const i = (Y * W + X) * 4;
      let c = null;
      if (!charted) {
        // Only look up the puff layers that can exist at this depth.
        const ks = dp > 0.2 && dp < 8.5 ? puffAt(small, X, Y, false) : -1;
        if (ks >= 0) c = shadePuff(small, ks, X, Y, dp, false);
        else if (dp > 1.2) {
          const kb = puffAt(big, X, Y, true);
          if (kb >= 0) c = shadePuff(big, kb, X, Y, dp, false);
        }
      }
      if (c) {
        data[i] = c[0];
        data[i + 1] = c[1];
        data[i + 2] = c[2];
        data[i + 3] = 255;
        continue;
      }
      // Between puffs: deep in the fog, the lower cloud deck; near the frontier, haze over land.
      const under = charted ? 0 : smoothstep(5, 7.5, dp);
      if (under + bayer(X, Y) * 0.2 > 0.55) {
        const shade = valueNoise(X * 0.08, Y * 0.08, 611) - 0.5;
        const u = murky(UNDER, X, Y);
        data[i] = u[0] + shade * 18;
        data[i + 1] = u[1] + shade * 18;
        data[i + 2] = u[2] + shade * 16;
        data[i + 3] = 255;
        continue;
      }
      // Haze depends only on the smooth distance, so it never steps along tile edges.
      const a = smoothstep(0.15, 5, dp) * style.hazeMax * (charted ? 0.5 : 1);
      if (a <= 0) continue;
      data[i] = HAZE[0];
      data[i + 1] = HAZE[1];
      data[i + 2] = HAZE[2];
      data[i + 3] = Math.round(a * 255);
    }
  }
  return { data, W };
}

/* ------------------------------ layer cache ------------------------------- */

const layerCache = new Map();

/**
 * @returns {{ canvas, scale, dist }} fog for this unlock state — canvas covers
 * the whole world at `scale` px per tile; draw it scaled to the map.
 */
/** Pure pixels for a fog state (no DOM) — used by getFogLayer and the map worker. */
export function paintFogPixels(world, unlocked) {
  const P = 8;
  const dist = chartDistance(world.size, unlocked);
  const { data, W } = paintClouds(world, unlocked, dist, P, STYLES[world.fog] || STYLES.clouds);
  return { data, W, P, dist };
}

const fogKey = (world, unlocked) => `${world.level || 1}:${unlocked.size}`;

/** A layer built elsewhere (the map worker) joins the same cache. */
export function primeFogLayer(world, unlocked, layer) {
  const tagged = { ...layer, level: world.level || 1 };
  layerCache.set(fogKey(world, unlocked), tagged);
  if (layerCache.size > 6) layerCache.delete(layerCache.keys().next().value);
  return tagged;
}

export function peekCachedFogLayer(world, unlocked) {
  return layerCache.get(fogKey(world, unlocked)) || null;
}

export function getFogLayer(world, unlocked) {
  const key = fogKey(world, unlocked);
  const hit = layerCache.get(key);
  if (hit) return hit;
  const { data, W, P, dist } = paintFogPixels(world, unlocked);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = W;
  canvas.getContext('2d').putImageData(new ImageData(data, W, W), 0, 0);
  const layer = { canvas, scale: P, dist, level: world.level || 1 };
  layerCache.set(key, layer);
  if (layerCache.size > 6) layerCache.delete(layerCache.keys().next().value);
  return layer;
}

