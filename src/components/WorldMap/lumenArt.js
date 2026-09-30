/**
 * lumenArt.js — paints the level 2 world at 8 art pixels per tile.
 *
 * What makes it read as an upgrade over level 1 (flat 4×4 tiles):
 *  - lit relief: every slope is shaded from a north-west sun with ordered
 *    dithering between hue-shifted ramps, and terraces get real cliff faces
 *  - water with depth bands, surf, reefs, shelves and cliff shadows
 *  - organic edges: materials are looked up through a domain warp, so biomes
 *    blend like paint instead of snapping to the tile grid
 *  - a river with banks, roads with bridges and stairs, crop fields, dunes
 *  - shaded trees and buildings that cast soft shadows
 */

import { LUMEN_RIVER, ellipseDist, splineSamples } from './lumenWorld.js';
import { clamp, fbm, hash2, valueNoise } from './mapNoise.js';
import { FOAM, R, SHADOW, WHITE, makeCanvas, packHex, pick } from './lumenPalette.js';
import { drawLibrary as drawLibraryRuins, drawPier, drawShadow, drawSkyhaven, drawSprite } from './lumenProps.js';

/* ------------------------------ distance -------------------------------- */

/** Two-pass chamfer (in pixels) to the nearest pixel where mask is 1. */
export function distanceField(mask, W, H) {
  const d = new Float32Array(W * H);
  const INF = 1e9;
  for (let i = 0; i < d.length; i += 1) d[i] = mask[i] ? 0 : INF;
  const D = 1.4142;
  for (let y = 0; y < H; y += 1) {
    const row = y * W;
    for (let x = 0; x < W; x += 1) {
      const i = row + x;
      let v = d[i];
      if (v === 0) continue;
      if (x > 0 && d[i - 1] + 1 < v) v = d[i - 1] + 1;
      if (y > 0) {
        if (d[i - W] + 1 < v) v = d[i - W] + 1;
        if (x > 0 && d[i - W - 1] + D < v) v = d[i - W - 1] + D;
        if (x < W - 1 && d[i - W + 1] + D < v) v = d[i - W + 1] + D;
      }
      d[i] = v;
    }
  }
  for (let y = H - 1; y >= 0; y -= 1) {
    const row = y * W;
    for (let x = W - 1; x >= 0; x -= 1) {
      const i = row + x;
      let v = d[i];
      if (v === 0) continue;
      if (x < W - 1 && d[i + 1] + 1 < v) v = d[i + 1] + 1;
      if (y < H - 1) {
        if (d[i + W] + 1 < v) v = d[i + W] + 1;
        if (x < W - 1 && d[i + W + 1] + D < v) v = d[i + W + 1] + D;
        if (x > 0 && d[i + W - 1] + D < v) v = d[i + W - 1] + D;
      }
      d[i] = v;
    }
  }
  return d;
}

/* ------------------------------ render ---------------------------------- */

const WATER_SEA = 0;
const LAND = 1;
const WATER_LAKE = 2;
const WATER_RIVER = 3;
const WATER_LAGOON = 4;

/**
 * Paint the world. Returns { width, height, data } (RGBA bytes) plus the
 * intermediate masks the fog and animation layers reuse.
 */
export function renderLumenPixels(world) {
  const { size, scale: S, terrain } = world;
  const W = size * S;
  const cv = makeCanvas(W, W);
  const { px } = cv;
  const tileAt = (x, y) => terrain[clamp(y, 0, size - 1)][clamp(x, 0, size - 1)];

  /* 1 — what every pixel is: land, sea, lake, river or lagoon */
  const kind = new Uint8Array(W * W);
  const riverT = new Float32Array(W * W).fill(-1); // 0 at the river's centre → 1 at its bank
  const { lakes, shelves, atoll } = world.ellipses;
  // Only test the ellipses a pixel could possibly be inside (bounding boxes in tiles).
  const box = (e, pad) => [e.x - Math.max(e.rx, e.ry) - pad, e.y - Math.max(e.rx, e.ry) - pad, e.x + Math.max(e.rx, e.ry) + pad, e.y + Math.max(e.rx, e.ry) + pad];
  const inBox = (b, u, v) => u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3];
  const lakeBoxes = lakes.map((l) => box(l, 1));
  const atollBox = box(atoll, 1);
  for (let Y = 0; Y < W; Y += 1) {
    const v = (Y + 0.5) / S;
    for (let X = 0; X < W; X += 1) {
      const u = (X + 0.5) / S;
      const i = Y * W + X;
      if (world.landField(u, v) < 0) { kind[i] = LAND; continue; }
      let k = WATER_SEA;
      for (let li = 0; li < lakes.length; li += 1) {
        if (inBox(lakeBoxes[li], u, v) && ellipseDist(u, v, lakes[li]) < 0.4) k = WATER_LAKE;
      }
      if (k === WATER_SEA && inBox(atollBox, u, v) && ellipseDist(u, v, atoll) < -atoll.ring) k = WATER_LAGOON;
      kind[i] = k;
    }
  }
  // Broad, slow noise sampled once per tile corner and blended per pixel.
  const N1 = size + 1;
  const swellGrid = new Float32Array(N1 * N1);
  const seaGrid = new Float32Array(N1 * N1);
  for (let j = 0; j < N1; j += 1) {
    for (let k = 0; k < N1; k += 1) {
      swellGrid[j * N1 + k] = fbm(k * 0.05, j * 0.05, 63);
      seaGrid[j * N1 + k] = valueNoise(k * 0.6, j * 0.6, 43);
    }
  }
  const lerpGrid = (g, u, v) => {
    const x0 = Math.min(size - 1, Math.floor(u));
    const y0 = Math.min(size - 1, Math.floor(v));
    const fx = u - x0;
    const fy = v - y0;
    const a = g[y0 * N1 + x0];
    const b = g[y0 * N1 + x0 + 1];
    const c = g[(y0 + 1) * N1 + x0];
    const d = g[(y0 + 1) * N1 + x0 + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const shelfBoxes = shelves.map((sh) => box(sh, 9));
  const riverSamples = world.river?.samples || splineSamples(LUMEN_RIVER, 0.1);
  for (const p of riverSamples) {
    const r = (p.w * S) / 2;
    const cx = p.x * S;
    const cy = p.y * S;
    const r0 = Math.ceil(r + 1);
    for (let dy = -r0; dy <= r0; dy += 1) {
      for (let dx = -r0; dx <= r0; dx += 1) {
        const X = Math.floor(cx + dx);
        const Y = Math.floor(cy + dy);
        if (X < 0 || Y < 0 || X >= W || Y >= W) continue;
        const d = Math.hypot(X + 0.5 - cx, Y + 0.5 - cy) / r;
        if (d > 1) continue;
        const i = Y * W + X;
        if (kind[i] === WATER_SEA || kind[i] === WATER_LAKE) continue;
        if (riverT[i] < 0 || d < riverT[i]) riverT[i] = d;
        kind[i] = WATER_RIVER;
      }
    }
  }

  const landMask = new Uint8Array(W * W);
  const waterMask = new Uint8Array(W * W);
  const seaLandMask = new Uint8Array(W * W);
  for (let i = 0; i < kind.length; i += 1) {
    landMask[i] = kind[i] === LAND ? 1 : 0;
    waterMask[i] = kind[i] === LAND ? 0 : 1;
    seaLandMask[i] = kind[i] === WATER_SEA || kind[i] === WATER_LAGOON ? 0 : 1;
  }
  const dWater = distanceField(waterMask, W, W); // land px → nearest water px
  const dLand = distanceField(landMask, W, W); // water px → nearest land px
  const dSeaShore = distanceField(seaLandMask, W, W); // sea px → nearest shore (incl. river mouths)

  /* 2 — terrace level per pixel, looked up through a gentle domain warp */
  const warpAt = (u, v) => [
    (valueNoise(u * 0.9, v * 0.9, 71) - 0.5) * 0.9,
    (valueNoise(u * 0.9, v * 0.9, 73) - 0.5) * 0.9,
  ];
  const lvPx = new Int8Array(W * W).fill(-1);
  const tileIdx = new Int32Array(W * W).fill(-1);
  for (let Y = 0; Y < W; Y += 1) {
    const v = (Y + 0.5) / S;
    for (let X = 0; X < W; X += 1) {
      const i = Y * W + X;
      if (kind[i] !== LAND && kind[i] !== WATER_RIVER) continue;
      const u = (X + 0.5) / S;
      const [wx, wy] = warpAt(u, v);
      let tx = Math.floor(u + wx);
      let ty = Math.floor(v + wy);
      let t = tileAt(tx, ty);
      if (t.lv < 0) {
        tx = Math.floor(u);
        ty = Math.floor(v);
        t = tileAt(tx, ty);
      }
      tileIdx[i] = clamp(ty, 0, size - 1) * size + clamp(tx, 0, size - 1);
      lvPx[i] = t.lv < 0 ? 0 : t.lv;
    }
  }

  /* 3 — heights for relief shading (bilinear over tile centres) */
  const hAt = (u, v) => {
    const x = u - 0.5;
    const y = v - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const h = (xx, yy) => {
      const t = tileAt(xx, yy);
      return t.lv < 0 ? 0 : t.h;
    };
    const a = h(x0, y0);
    const b = h(x0 + 1, y0);
    const c = h(x0, y0 + 1);
    const d = h(x0 + 1, y0 + 1);
    return {
      h: a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy,
      gx: (1 - fy) * (b - a) + fy * (d - c),
      gy: (1 - fx) * (c - a) + fx * (d - b),
    };
  };

  /* 4a — farm parcels: rows of varied height, fields of varied width (brick bond) */
  const parcelRow = new Int16Array(size);
  const rowTop = [];
  for (let y = 0, r = 0; y < size; r += 1) {
    const hgt = 3 + Math.floor(hash2(r, 1, 221) * 4);
    rowTop.push(y);
    for (let k = 0; k < hgt && y < size; k += 1, y += 1) parcelRow[y] = r;
  }
  const colStarts = rowTop.map((_, r) => {
    const xs = [];
    for (let x = -Math.floor(hash2(r, 2, 223) * 5), c = 0; x < size + 8; c += 1) {
      xs.push(x);
      x += 3 + Math.floor(hash2(r, c, 227) * 6);
    }
    return xs;
  });
  const CROPS = ['wheat', 'lavender', 'tulip', 'wheat', 'sunflower', 'cabbage', 'lavender', 'orchard', 'pasture', 'wheat', 'tulip', 'meadow'];
  function parcelAt(u, v) {
    const r = parcelRow[clamp(Math.floor(v), 0, size - 1)];
    const xs = colStarts[r];
    let c = 0;
    while (c < xs.length - 1 && xs[c + 1] <= u) c += 1;
    const h = hash2(r, c, 229);
    return {
      r,
      c,
      fu: u - xs[c],
      fv: v - rowTop[r],
      crop: CROPS[Math.floor(h * CROPS.length)],
      vertical: hash2(r, c, 231) > 0.5,
    };
  }

  /* 4 — base colour */
  const beachOK = (b) => b !== 'fjord' && b !== 'marsh' && b !== 'volcano' && b !== 'rock';
  for (let Y = 0; Y < W; Y += 1) {
    const v = (Y + 0.5) / S;
    for (let X = 0; X < W; X += 1) {
      const i = Y * W + X;
      const u = (X + 0.5) / S;
      const k = kind[i];
      if (k === LAND) {
        px[i] = landColor(tileAt(tileIdx[i] % size, Math.floor(tileIdx[i] / size)), X, Y, u, v, i);
      } else {
        px[i] = waterColor(k, X, Y, u, v, i);
      }
    }
  }

  function landColor(t, X, Y, u, v, i) {
    const { gx, gy, h } = hAt(u, v);
    const light = clamp((gx + gy) * 5.5, -1.6, 1.6);
    const n1 = valueNoise(u * 1.3, v * 1.3, 17) - 0.5;
    const n2 = valueNoise(u * 3.1, v * 3.1, 19) - 0.5;
    const grain = hash2(X, Y, 3);
    const shoreD = dWater[i];
    const nearSea = t.cd <= 3;
    const beachW = 4.5 + valueNoise(u * 0.8, v * 0.8, 29) * 4;
    let kk = t.k;
    if (kk === 'plaza' || kk === 'road') kk = 'grass';
    if (nearSea && t.lv === 0 && beachOK(t.b) && shoreD <= beachW && kk !== 'plaza') kk = 'sand';
    if (kk === 'sand' && t.b === 'dunes') kk = 'desert';
    if (t.b === 'fjord' && nearSea && shoreD <= beachW + 1) kk = 'ice';
    if (t.b === 'atoll') kk = 'sand';
    const bank = shoreD <= 2.2 && !nearSea;

    switch (kk) {
      case 'sand': {
        if (shoreD <= 1.6 && nearSea) return pick(R.wetSand, 1 + n2 * 2, X, Y);
        const idx = 3 + light * 1.2 + n1 * 1.6 + (shoreD < 3 ? -0.8 : 0.4);
        if (grain > 0.985) return R.sand[1];
        if (grain < 0.01) return R.sand[5];
        return pick(R.sand, idx, X, Y);
      }
      case 'desert': {
        // Dunes: long windward slopes, a sharp crest, then a shaded slip face.
        const bend = fbm(u * 0.07, v * 0.07, 91) * 7;
        const s1 = (u * 0.42 + v * 0.2 + bend) % 1;
        const face = s1 < 0 ? s1 + 1 : s1;
        const dune = face < 0.8 ? face * 1.6 : -1.3;
        const ripple = Math.sin((u * 3.4 + v * 1.1 + bend * 2) * 3) * 0.3;
        const idx = 2.6 + light * 1.8 + dune + ripple + n1 * 0.7;
        if (grain > 0.994) return R.desert[0];
        return pick(R.desert, idx, X, Y, 0.8);
      }
      case 'scrub': {
        const idx = 2.6 + light * 1.8 + n1 * 1.6;
        if (grain > 0.9) return pick(R.meadow, 1 + n2 * 2, X, Y);
        return pick(R.desert, idx, X, Y);
      }
      case 'mesa': {
        const ring = Math.sin((u + v * 0.3) * 1.6 + n1 * 3);
        return pick(R.mesaTop, 3 + light * 2 + ring * 0.6 + n2, X, Y);
      }
      case 'field': return fieldColor(t, X, Y, u, v, light, n1);
      case 'meadow': {
        const idx = 4 + light * 2.4 + n1 * 1.8 + n2 * 0.8;
        if (grain > 0.978) return flower(X, Y);
        return pick(R.meadow, idx, X, Y);
      }
      case 'forest':
      case 'pine': {
        const rampSel = t.b === 'fjord' ? R.snow : R.forestFloor;
        const idx = (t.b === 'fjord' ? 3.5 : 2.2) + light * 1.8 + n1 * 1.5;
        return pick(rampSel, idx, X, Y);
      }
      case 'deep': {
        if (grain > 0.994) return R.blossom[6];
        return pick(R.deepFloor, 2 + light * 1.8 + n1 * 1.6, X, Y);
      }
      case 'blossom': {
        if (grain > 0.95) return pick(R.blossom, 5 + n2 * 2, X, Y, 0.5); // fallen petals
        return pick(R.grass, 3.4 + light * 2 + n1 * 1.6, X, Y);
      }
      case 'autumn': {
        if (grain > 0.9) return pick(R.autumn, 3.5 + n2 * 3, X, Y, 0.5); // leaf litter
        return pick(R.autumnFloor, 2.4 + light * 1.8 + n1 * 1.6, X, Y);
      }
      case 'alpine': {
        if (grain > 0.975) return grain > 0.99 ? R.snow[5] : R.meadow[6];
        return pick(R.alpine, 3 + light * 2.4 + n1 * 1.8, X, Y);
      }
      case 'marsh': return marshColor(X, Y, u, v, light, n1, grain);
      case 'tundra': {
        if (grain > 0.97) return R.snow[5];
        return pick(R.tundra, 2.4 + light * 1.8 + n1 * 1.8, X, Y);
      }
      case 'rock': {
        const crack = valueNoise(u * 4.5, v * 1.6, 23) > 0.78 ? -1.2 : 0;
        const snowCap = h > 0.62 && light > -0.2 && n2 > -0.1;
        if (snowCap) return pick(R.snow, 4 + light * 1.6 + n1, X, Y);
        return pick(R.rock, 4 + light * 2.6 + n1 * 1.4 + crack, X, Y);
      }
      case 'peak': {
        const crack = valueNoise(u * 4.5, v * 1.6, 23) > 0.8 ? -1.4 : 0;
        return pick(R.snow, 4.2 + light * 2.2 + n1 * 1.2 + crack, X, Y);
      }
      case 'snow': {
        if (grain > 0.993) return WHITE;
        return pick(R.snow, 4.4 + light * 2 + n1 * 1.2, X, Y);
      }
      case 'ice': {
        const crack = Math.abs(valueNoise(u * 2.2, v * 2.2, 41) - 0.5) < 0.03 ? -1.5 : 0;
        return pick(R.ice, 3 + light * 1.4 + n1 + crack, X, Y);
      }
      case 'ash': {
        const glow = valueNoise(u * 1.8, v * 1.8, 131);
        if (glow > 0.93) return pick(R.lava, 2 + (glow - 0.93) * 30, X, Y);
        return pick(R.volcanic, 3.6 + light * 2.4 + n1 * 1.4, X, Y);
      }
      case 'scree': {
        if (grain > 0.97) return R.volcanic[1];
        return pick(R.rock, 3 + light * 2 + n1 * 1.6, X, Y);
      }
      case 'glade': {
        if (grain > 0.975) return grain > 0.99 ? packHex('#fff1d6') : packHex('#ffd84d');
        return pick(R.meadow, 4.4 + light * 1.6 + n1 * 1.2, X, Y);
      }
      case 'lava': {
        const crust = valueNoise(u * 2.4, v * 2.4, 137);
        if (crust < 0.42) return pick(R.volcanic, 1.5 + crust * 3 + light, X, Y);
        return pick(R.lava, 2 + (crust - 0.42) * 8, X, Y, 0.6);
      }
      case 'grass':
      default: {
        let idx = 4 + light * 2.4 + n1 * 1.8 + n2 * 0.8;
        if (bank) idx -= 1.2;
        if (grain > 0.985) return pick(R.grass, idx + 2, X, Y); // sunlit blades
        if (grain < 0.012) return pick(R.grass, idx - 2, X, Y); // tuft shadows
        if (grain > 0.993 && t.b !== 'fjord') return flower(X, Y);
        return pick(t.b === 'fjord' ? R.alpine : R.grass, idx, X, Y);
      }
    }
  }

  function flower(X, Y) {
    const f = hash2(X, Y, 8);
    if (f < 0.25) return packHex('#fff7e6');
    if (f < 0.5) return packHex('#ffd84d');
    if (f < 0.72) return packHex('#ff86b8');
    if (f < 0.88) return packHex('#b98cff');
    return packHex('#ff6b5a');
  }

  function fieldColor(t, X, Y, u, v, light, n1) {
    const p = parcelAt(u, v);
    if (p.fu < 0.13 || p.fv < 0.13) return pick(R.oak, 2.4 + light + n1, X, Y); // hedgerow
    if (p.crop === 'meadow' || p.crop === 'orchard') return pick(R.meadow, 4 + light * 2 + n1 * 2, X, Y);
    if (p.crop === 'pasture') return pick(R.grass, 4.6 + light * 2 + n1 * 1.6, X, Y);
    const row = p.vertical ? X % 4 : Y % 3;
    const cr = R.crop[p.crop];
    if (row === 0) return pick(R.dirt, 2.5 + light, X, Y, 0.5);
    return pick(cr, 2.2 + light * 1.6 + (row === 1 ? 0.7 : -0.2) + n1, X, Y, 0.6);
  }

  function marshColor(X, Y, u, v, light, n1, grain) {
    const pool = fbm(u * 0.55, v * 0.55, 151);
    if (pool > 0.6) {
      if (grain > 0.96) return pick(R.meadow, 3.5 + n1 * 2, X, Y); // lily pads
      const glint = valueNoise(u * 2.6, v * 7, 153) > 0.8 ? 1.2 : 0;
      return pick(R.marshWater, 2.6 - (pool - 0.6) * 5 + n1 + glint, X, Y, 0.7);
    }
    if (pool > 0.575) return pick(R.marsh, 1.2 + n1, X, Y);
    if (grain > 0.97) return pick(R.meadow, 5 + n1 * 2, X, Y); // reeds catching light
    return pick(R.marsh, 3 + light * 1.8 + n1 * 1.6, X, Y);
  }

  function waterColor(k, X, Y, u, v, i) {
    const n1 = lerpGrid(seaGrid, u, v) - 0.5;
    const n2 = valueNoise(u * 2.1, v * 2.1, 47) - 0.5;
    if (k === WATER_RIVER) {
      const t = riverT[i];
      const flow = valueNoise(u * 3.2, v * 0.9, 53);
      if (dWater[i] < 0 && flow > 0.8) return R.river[5];
      const idx = 4 - t * 3.2 + n2 * 1.2 + (flow > 0.74 ? 0.9 : 0);
      return pick(R.river, idx, X, Y, 0.7);
    }
    const shore = dLand[i] / S; // tiles to land
    if (k === WATER_LAKE) {
      if (dLand[i] <= 1) return pick(R.surf, 1, X, Y);
      return pick(R.lake, 4.2 - Math.min(shore, 2.6) * 1.4 + n2, X, Y);
    }
    if (k === WATER_LAGOON) {
      if (dLand[i] <= 1.2) return pick(R.surf, 1.4, X, Y);
      return pick(R.lagoon, 4 - Math.min(shore, 3) * 1.1 + n2 * 1.4, X, Y);
    }
    // Sea: depth bands by distance from shore; shelves shoal gradually.
    // Open water bottoms out at a mid-blue rather than going black.
    let depth = Math.min(dSeaShore[i] / S + n1 * 1.4, 7.4 + n1 * 1.2);
    for (let si = 0; si < shelves.length; si += 1) {
      if (!inBox(shelfBoxes[si], u, v)) continue;
      // Shelves shoal linearly towards their middle; by the box edge the ramp is deeper
      // than the cap above, so there is no seam.
      const e = ellipseDist(u, v, shelves[si]) + (fbm(u * 0.3, v * 0.3, 57) - 0.5) * 4;
      depth = Math.min(depth, 1.1 + Math.max(0, e + 3) * 1.1 + n1);
    }
    if (dLand[i] <= 1.1) return hash2(X, Y, 61) > 0.28 ? FOAM : R.surf[1];
    if (dLand[i] <= 2.2 && valueNoise(u * 5, v * 5, 67) > 0.45) return R.surf[0];
    const wave = valueNoise(u * 0.7 + v * 0.2, v * 3.1, 59) > 0.86 ? 0.8 : 0;
    if (depth < 0.7) return pick(R.shallow, 4 - depth * 1.5 + n2, X, Y, 1);
    if (depth < 1.7) return pick(R.shallow, 3 - (depth - 0.7) * 2.6 + n2 + wave * 0.4, X, Y, 1);
    if (depth < 2.9) return pick(R.mid, 2.2 - (depth - 1.7) * 1.8 + n2 + wave * 0.6, X, Y, 1);
    const swell = (lerpGrid(swellGrid, u, v) - 0.5) * 2.2;
    if (depth < 5.2) return pick(R.ocean, 3.2 - (depth - 2.9) * 1.35 + n2 + wave + swell * 0.5, X, Y, 1);
    return pick(R.deep, 3.1 - Math.min(2.6, (depth - 5.2) * 0.45) + n2 + wave + swell, X, Y, 1);
  }

  /* 5 — cliffs: faces hang below every drop in terrace level */
  const face = new Uint8Array(W * W);
  const FACE = 5;
  for (let X = 0; X < W; X += 1) {
    let remain = 0;
    let row = 0;
    let len = 0;
    let top = null;
    for (let Y = 1; Y < W; Y += 1) {
      const i = Y * W + X;
      const above = lvPx[i - W];
      const here = lvPx[i];
      if (above >= 0 && above > here) {
        const diff = above - Math.max(here, 0);
        len = Math.min(13, FACE * diff + Math.round(valueNoise(X * 0.2, Y * 0.05, 83) * 2));
        remain = len;
        row = 0;
        const ti = tileIdx[i - W];
        top = ti >= 0 ? terrain[Math.floor(ti / size)][ti % size] : null;
        // Rim light along the plateau edge.
        cv.blend(X, Y - 1, [255, 244, 214], 0.28);
      }
      if (remain > 0) {
        face[i] = 1;
        px[i] = faceColor(top, X, Y, row, len);
        remain -= 1;
        row += 1;
        if (remain === 0) {
          // Soft contact shadow at the foot of the cliff.
          cv.blend(X, Y + 1, SHADOW, 0.32);
          cv.blend(X, Y + 2, SHADOW, 0.18);
        }
      }
    }
  }

  function faceColor(top, X, Y, row, len) {
    const b = top?.b;
    const k = top?.k;
    const striation = valueNoise(X * 0.55, Y * 0.12, 97) - 0.5;
    const shade = 1 - row / Math.max(1, len); // lighter near the top
    if (row === 0 && (k === 'grass' || k === 'meadow' || k === 'blossom' || k === 'deep' || k === 'field' || k === 'forest' || k === 'alpine' || k === 'autumn')) {
      // Turf lip hanging over the edge.
      return hash2(X, Y, 5) > 0.35 ? pick(R.grass, 3, X, Y) : pick(R.earth, 3, X, Y);
    }
    if (b === 'dunes' || k === 'mesa' || k === 'desert') {
      const band = Math.floor((Y + striation * 3) / 2) % R.strata.length;
      return R.strata[(band + R.strata.length) % R.strata.length];
    }
    if (b === 'fjord' || k === 'peak' || k === 'snow' || k === 'ice') {
      return pick(R.rock, 2 + shade * 3.2 + striation * 2, X, Y, 0.6);
    }
    if (b === 'volcano') return pick(R.volcanic, 1 + shade * 3 + striation * 2, X, Y, 0.6);
    if (k === 'rock') return pick(R.rock, 1.5 + shade * 3 + striation * 2.2, X, Y, 0.6);
    return pick(R.earth, 0.6 + shade * 3.4 + striation * 2, X, Y, 0.6);
  }

  // Side edges: a higher plateau to the west throws shade east; lit rims face west/north.
  for (let Y = 1; Y < W - 1; Y += 1) {
    for (let X = 2; X < W - 1; X += 1) {
      const i = Y * W + X;
      const here = lvPx[i];
      if (here < 0 || face[i]) continue;
      if (lvPx[i - 1] > here || lvPx[i - 2] > here) cv.blend(X, Y, SHADOW, lvPx[i - 1] > here ? 0.34 : 0.18);
      else if (lvPx[i + 1] >= 0 && lvPx[i + 1] < here && !face[i + 1]) cv.blend(X, Y, SHADOW, 0.3);
      else if ((lvPx[i - 1] >= 0 && lvPx[i - 1] < here) || (lvPx[i - W] >= 0 && lvPx[i - W] < here)) {
        cv.blend(X, Y, [255, 244, 214], 0.22);
      }
    }
  }

  // Cliffs and headlands shade the water just south-east of them.
  for (let Y = 2; Y < W; Y += 1) {
    for (let X = 2; X < W; X += 1) {
      const i = Y * W + X;
      if (kind[i] === LAND || kind[i] === WATER_RIVER) continue;
      const src = (Y - 2) * W + (X - 2);
      if (lvPx[src] >= 1 || face[src]) cv.blend(X, Y, SHADOW, 0.3);
    }
  }

  /* 6 — waterfall where the river pours over a cliff */
  for (let i = 0; i < W * W; i += 1) {
    if (!face[i] || kind[i] !== WATER_RIVER) continue;
    const X = i % W;
    const Y = (i / W) | 0;
    const streak = valueNoise(X * 0.9, Y * 0.18, 107);
    px[i] = streak > 0.6 ? WHITE : pick(R.river, 3.5 + streak * 3, X, Y, 0.5);
  }

  /* 7 — roads, bridges, stairs */
  const road = new Uint8Array(W * W);
  const bridge = new Uint8Array(W * W);
  for (const path of world.roads?.paths || []) {
    let pts = path.map(([x, y]) => [x + 0.5, y + 0.5]);
    for (let it = 0; it < 2; it += 1) {
      const out = [pts[0]];
      for (let k = 0; k < pts.length - 1; k += 1) {
        const [ax, ay] = pts[k];
        const [bx, by] = pts[k + 1];
        out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    for (let k = 0; k < pts.length - 1; k += 1) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[k + 1];
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * S * 2);
      for (let s = 0; s <= steps; s += 1) {
        const x = (ax + (bx - ax) * (s / steps)) * S;
        const y = (ay + (by - ay) * (s / steps)) * S;
        for (let dy = -2; dy <= 2; dy += 1) {
          for (let dx = -2; dx <= 2; dx += 1) {
            if (dx * dx + dy * dy > 4.5) continue;
            const X = Math.floor(x + dx);
            const Y = Math.floor(y + dy);
            if (X < 0 || Y < 0 || X >= W || Y >= W) continue;
            const i = Y * W + X;
            if (kind[i] === WATER_RIVER) bridge[i] = 1;
            else if (kind[i] === LAND) road[i] = 1;
          }
        }
      }
    }
  }
  for (let i = 0; i < W * W; i += 1) {
    if (!road[i]) continue;
    const X = i % W;
    const Y = (i / W) | 0;
    const edge = !road[i - 1] || !road[i + 1] || !road[i - W] || !road[i + W];
    const inTown = hash2(0, 0, 0) >= 0 && tileIdx[i] >= 0 && terrain[Math.floor(tileIdx[i] / size)][tileIdx[i] % size].k === 'plaza';
    if (face[i]) {
      // Stone stairs up the cliff.
      px[i] = (Y % 2 === 0) ? R.stone[5] : R.stone[2];
      if (edge) px[i] = R.stone[1];
      continue;
    }
    const g = hash2(X, Y, 71);
    if (inTown) {
      px[i] = edge ? R.cobble[1] : cobble(X, Y);
    } else {
      px[i] = edge ? R.dirt[1] : pick(R.dirt, 3.2 + (g - 0.5) * 1.6, X, Y, 0.6);
      if (g > 0.97) px[i] = R.dirt[5];
    }
  }
  for (let i = 0; i < W * W; i += 1) {
    if (!bridge[i]) continue;
    const X = i % W;
    const Y = (i / W) | 0;
    const rail = !bridge[i - 1] || !bridge[i + 1];
    px[i] = rail ? R.wood[1] : (X + Y) % 3 === 0 ? R.wood[2] : R.wood[4];
    cv.blend(X + 1, Y + 2, SHADOW, 0.25);
  }

  function cobble(X, Y) {
    const bx = Math.floor((X + (Math.floor(Y / 3) % 2) * 2) / 4);
    const by = Math.floor(Y / 3);
    const mortar = (X + (Math.floor(Y / 3) % 2) * 2) % 4 === 0 || Y % 3 === 0;
    if (mortar) return R.cobble[2];
    return R.cobble[4 + Math.floor(hash2(bx, by, 9) * 2.99)];
  }

  // Town plaza paving.
  for (let Y = 0; Y < W; Y += 1) {
    for (let X = 0; X < W; X += 1) {
      const i = Y * W + X;
      if (kind[i] !== LAND || face[i]) continue;
      const ti = tileIdx[i];
      if (ti < 0) continue;
      const t = terrain[Math.floor(ti / size)][ti % size];
      if (t.k === 'plaza' || t.k === 'street') px[i] = cobble(X, Y);
      else if (t.k === 'quay') px[i] = slab(X, Y);
    }
  }
  function slab(X, Y) {
    const mortar = X % 6 === 0 || Y % 4 === 0;
    if (mortar) return R.stone[3];
    return R.stone[4 + Math.floor(hash2(Math.floor(X / 6), Math.floor(Y / 4), 13) * 2.99)];
  }
  // Quay walls: dressed stone dropping into the water below the quay.
  for (let Y = 1; Y < W - 3; Y += 1) {
    for (let X = 0; X < W; X += 1) {
      const i = Y * W + X;
      if (kind[i] === LAND || kind[i] === WATER_RIVER) continue;
      const up = (Y - 1) * W + X;
      if (kind[up] !== LAND) continue;
      const ti = tileIdx[up];
      if (ti < 0) continue;
      const t = terrain[Math.floor(ti / size)][ti % size];
      if (t.k !== 'quay' && t.k !== 'plaza' && t.k !== 'street') continue;
      for (let k = 0; k < 3; k += 1) {
        const j = (Y + k) * W + X;
        if (kind[j] === LAND) break;
        px[j] = k === 2 ? R.stone[1] : (X + k) % 5 === 0 ? R.stone[2] : R.stone[3 - k];
      }
      cv.blend(X, Y + 3, SHADOW, 0.3);
    }
  }

  /* 8 — trees, props and buildings */
  const sprites = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      if (t.lv < 0 || t.river || t.road || t.built || t.k === 'plaza' || t.k === 'street' || t.k === 'quay') continue;
      const r = hash2(x, y, 401);
      if (t.town) {
        if (t.k !== 'sand' && r < 0.1) sprites.push({ kind: r < 0.05 ? 'tree' : 'bush', X: x * S + S / 2, Y: y * S + S / 2, rmp: R.oak, size: r < 0.05 ? 3.4 : 2, seed: r });
        continue;
      }
      const jx = (hash2(x, y, 403) - 0.5) * 4;
      const jy = (hash2(x, y, 405) - 0.5) * 4;
      const X = x * S + S / 2 + jx;
      const Y = y * S + S / 2 + jy;
      const k = t.k;
      const ci = Math.round(Y) * W + Math.round(X);
      if (ci < 0 || ci >= W * W || kind[ci] !== LAND || road[ci] || face[ci] || t.clear) continue;
      if (t.b === 'dunes' && r < 0.55) {
        let nearLake = false;
        for (let dy = -2; dy <= 2 && !nearLake; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (tileAt(x + dx, y + dy).k === 'lake') nearLake = true;
        if (nearLake) { sprites.push({ kind: 'palm', X, Y, seed: r }); continue; }
      }
      if (k === 'forest' && r < 0.82) sprites.push({ kind: 'tree', X, Y, rmp: t.b === 'isle' ? R.palm : R.oak, size: 4 + hash2(x, y, 7) * 1.6, seed: r });
      else if (k === 'deep' && r < 0.9) sprites.push({ kind: 'tree', X, Y, rmp: R.elder, size: 4.6 + hash2(x, y, 7) * 2, seed: r });
      else if (k === 'blossom' && r < 0.72) sprites.push({ kind: 'tree', X, Y, rmp: R.blossom, size: 4 + hash2(x, y, 7) * 1.4, seed: r });
      else if (k === 'autumn' && r < 0.78) sprites.push({ kind: 'tree', X, Y, rmp: R.autumn, size: 4 + hash2(x, y, 7) * 1.4, seed: r });
      else if (k === 'pine' && r < 0.8) sprites.push({ kind: 'pine', X, Y, snowy: t.b === 'fjord' || t.b === 'peaks', size: 5 + hash2(x, y, 7) * 2, seed: r });
      else if ((k === 'grass' || k === 'meadow') && r < 0.045) sprites.push({ kind: 'tree', X, Y, rmp: t.b === 'blossom' ? R.blossom : R.oak, size: 3.6 + hash2(x, y, 7), seed: r });
      else if ((k === 'grass' || k === 'meadow' || k === 'alpine') && r < 0.11) sprites.push({ kind: 'bush', X, Y, rmp: R.oak, size: 2 + hash2(x, y, 7), seed: r });
      else if ((k === 'rock' || k === 'alpine' || k === 'scrub' || k === 'ash') && r < 0.07) sprites.push({ kind: 'boulder', X, Y, rmp: k === 'ash' ? R.volcanic : R.rock, size: 2 + hash2(x, y, 7) * 1.5, seed: r });
      else if (k === 'desert' && r < 0.03) sprites.push({ kind: 'cactus', X, Y, seed: r });
      else if (k === 'scrub' && r < 0.3) sprites.push({ kind: 'bush', X, Y, rmp: R.alpine, size: 1.6 + hash2(x, y, 7), seed: r });
      else if (k === 'sand' && (t.b === 'atoll' || t.b === 'isle') && r < 0.2) sprites.push({ kind: 'palm', X, Y, seed: r });
      else if (k === 'marsh' && r < 0.05) sprites.push({ kind: 'tree', X, Y, rmp: R.marsh, size: 3.4, seed: r });
    }
  }
  let skyhaven = null;
  // Mountains: biggest first, spaced so each silhouette reads.
  const taken = new Uint8Array(size * size);
  const peaks = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      if (t.lv >= 0 && t.hm > 0.24 && !t.river && !t.road && !t.clear) peaks.push([t.hm + hash2(x, y, 441) * 0.08, x, y]);
    }
  }
  peaks.sort((a, b) => b[0] - a[0]);
  for (const [m, x, y] of peaks) {
    if (taken[y * size + x]) continue;
    const t = terrain[y][x];
    const big = m > 0.34;
    const r1 = hash2(x, y, 443);
    const w = big ? Math.round(18 + (m - 0.34) * 64 + r1 * 10) : Math.round(10 + r1 * 7);
    const hgt = Math.round(w * (big ? 0.62 + hash2(x, y, 445) * 0.34 : 0.45 + hash2(x, y, 445) * 0.15));
    const rad = Math.max(1, Math.round((w / S) * (big ? 0.5 : 0.75)));
    if (!big && r1 > 0.55) continue;
    for (let dy = -rad; dy <= rad; dy += 1) {
      for (let dx = -rad; dx <= rad; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < size && ny < size) taken[ny * size + nx] = 1;
      }
    }
    sprites.push({
      kind: big ? 'mountain' : 'hill', X: x * S + S / 2 + (hash2(x, y, 447) - 0.5) * 6, Y: y * S + S * 0.9, w, hgt,
      snowy: t.b === 'fjord' || m > 0.43, seed: hash2(x, y, 449), twin: big && hash2(x, y, 451) > 0.55,
    });
  }
  // Orchards and sheep in the farm parcels.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      if (t.k !== 'field' || t.road || t.river) continue;
      const p = parcelAt(x + 0.5, y + 0.5);
      if (p.fu < 0.6 || p.fv < 0.6) continue;
      if (p.crop === 'orchard') {
        for (const [ox, oy] of [[2, 2], [6, 6]]) sprites.push({ kind: 'tree', X: x * S + ox, Y: y * S + oy + 2, rmp: R.oak, size: 2.4, seed: hash2(x + ox, y, 451) });
      } else if (p.crop === 'pasture' && hash2(x, y, 453) < 0.3) {
        sprites.push({ kind: 'sheep', X: x * S + 2 + hash2(x, y, 455) * 4, Y: y * S + 3 + hash2(x, y, 457) * 3, seed: hash2(x, y, 459) });
      }
    }
  }
  for (const e of world.entities || []) {
    const X = e.x * S;
    const Y = e.y * S;
    if (e.type === 'pier') { drawPier(cv, X, Y, e.len, S); continue; }
    if (e.type === 'house' || e.type === 'hall' || e.type === 'warehouse') sprites.push({ kind: e.type, X, Y, v: e.v, sortY: Y + 15 });
    else if (e.type === 'lighthouse') sprites.push({ kind: 'lighthouse', X: X + S / 2, Y: Y + S * 0.7 });
    else if (['fountain', 'stall', 'lamp', 'boat', 'ship'].includes(e.type)) sprites.push({ kind: e.type, X, Y, v: e.v });
    else if (e.type === 'treasure_chest') sprites.push({ kind: 'treasure_chest', X: X + S / 2, Y: Y + S * 0.8 });
    else if (e.type === 'library') drawLibraryRuins(cv, X, Y, S);
    else if (e.type === 'find') {
      // Underwater and floating finds sit mid-tile; standing ones on the tile's bottom edge.
      const wet = ['kelp', 'seals', 'bottle', 'arch'].includes(e.sprite);
      sprites.push({ kind: 'find', sprite: e.sprite, X: X + S / 2, Y: Y + S * (wet ? 0.5 : 0.85) });
    }
    else if (e.type === 'skyhaven') skyhaven = { X, Y };
    else if (['windmill', 'elderTree', 'shrine', 'temple', 'observatory', 'crystalCave', 'volcano', 'forge', 'lodge', 'stiltHouse', 'camp', 'igloo', 'hut', 'crystal', 'wreck', 'iceberg'].includes(e.type)) {
      sprites.push({ kind: e.type, X: X + S / 2, Y: Y + S * (e.type === 'iceberg' || e.type === 'wreck' ? 0.5 : 0.9), seed: e.seed, big: e.big });
    }
  }

  // Shadows first so no canopy is darkened by its neighbour's shadow.
  for (const s of sprites) drawShadow(cv, s);
  sprites.sort((a, b) => (a.sortY ?? a.Y) - (b.sortY ?? b.Y));
  for (const s of sprites) drawSprite(cv, s);

  // Skyhaven floats high above the sea: its shadow falls far below it.
  if (skyhaven) {
    const sx = skyhaven.X;
    const sy = skyhaven.Y;
    for (let dy = -7; dy <= 7; dy += 1) {
      for (let dx = -26; dx <= 26; dx += 1) {
        const d = (dx / 26) ** 2 + (dy / 7) ** 2;
        if (d <= 1) cv.blend(sx + dx + 6, sy + dy + 18, SHADOW, 0.3 * (1 - d * 0.6));
      }
    }
    drawSkyhaven(cv, sx - 28, sy - 70);
  }

  return { width: W, height: W, data: new Uint8ClampedArray(px.buffer), masks: { kind, lvPx, face, W } };
}

