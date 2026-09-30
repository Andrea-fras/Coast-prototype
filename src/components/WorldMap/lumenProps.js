/**
 * lumenProps.js — sprites for the level 2 world: trees, peaks, buildings and
 * landmarks. Everything is drawn procedurally into the pixel canvas with the
 * shared ramps, lit from the north-west, and casts a shadow to the south-east.
 */

import { hash2, valueNoise } from './mapNoise.js';
import { R, SHADOW, packHex, pick } from './lumenPalette.js';

export function drawShadow(cv, s) {
  if (s.kind === 'mountain' || s.kind === 'hill') {
    const cx = s.X + s.w * 0.28;
    const cy = s.Y - 1;
    const rx = s.w * 0.62;
    const ry = s.w * 0.2;
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy += 1) {
      for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx += 1) {
        const d = (dx / rx) ** 2 + (dy / ry) ** 2;
        if (d <= 1) cv.blend(cx + dx, cy + dy, SHADOW, 0.26 * (1 - d * 0.5));
      }
    }
    return;
  }
  if (s.kind === 'sheep') return;
  const r = (s.size || 3) * (s.kind === 'pine' ? 0.8 : 1);
  if (s.kind === 'house' || s.kind === 'hall' || s.kind === 'warehouse') {
    const w = s.kind === 'house' ? 17 : 25;
    for (let dy = 0; dy < 5; dy += 1) {
      for (let dx = 0; dx < w; dx += 1) cv.blend(s.X + 3 + dx, s.Y + 13 + dy, SHADOW, 0.3 - dy * 0.04);
    }
    for (let dy = -2; dy < 13; dy += 1) for (let dx = 0; dx < 3; dx += 1) cv.blend(s.X + w + dx, s.Y + dy + 2, SHADOW, 0.22 - dx * 0.06);
    if (s.kind === 'hall') for (let dy = -18; dy < 2; dy += 1) for (let dx = 0; dx < 4; dx += 1) cv.blend(s.X + 16 + dx, s.Y + dy + 3, SHADOW, 0.2);
    return;
  }
  if (s.kind === 'lighthouse') {
    for (let k = 0; k < 16; k += 1) for (let dx = 0; dx < 4; dx += 1) cv.blend(s.X + 4 + k * 0.9 + dx, s.Y - 2 + k * 0.5, SHADOW, 0.22);
    return;
  }
  if (['sheep', 'fountain', 'stall', 'lamp', 'boat', 'ship', 'treasure_chest', 'crystal', 'iceberg', 'wreck', 'camp', 'igloo', 'find'].includes(s.kind)) return;
  if (['windmill', 'elderTree', 'shrine', 'temple', 'observatory', 'crystalCave', 'volcano', 'forge', 'lodge', 'stiltHouse', 'hut'].includes(s.kind)) {
    const w = { windmill: 5, elderTree: 20, shrine: 9, temple: 30, observatory: 15, crystalCave: 14, volcano: 40, forge: 11, lodge: 11, stiltHouse: 9, hut: 6 }[s.kind];
    const cx = s.X + w * 0.45;
    const cy = s.Y - 1;
    const rx = w * 1.05;
    const ry = Math.max(2, w * 0.3);
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy += 1) {
      for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx += 1) {
        const d = (dx / rx) ** 2 + (dy / ry) ** 2;
        if (d <= 1) cv.blend(cx + dx, cy + dy, SHADOW, 0.26 * (1 - d * 0.5));
      }
    }
    return;
  }
  const cx = s.X + r * 0.55;
  const cy = s.Y + r * 0.35;
  const rx = r * 1.05;
  const ry = r * 0.62;
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy += 1) {
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx += 1) {
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (d > 1) continue;
      cv.blend(cx + dx, cy + dy, SHADOW, 0.3 * (1 - d * 0.45));
    }
  }
}

export function drawSprite(cv, s) {
  switch (s.kind) {
    case 'tree': return drawCanopy(cv, s.X, s.Y - s.size * 0.9, s.size, s.rmp, s.seed, true);
    case 'bush': return drawCanopy(cv, s.X, s.Y - s.size * 0.4, s.size, s.rmp, s.seed, false);
    case 'boulder': return drawCanopy(cv, s.X, s.Y - s.size * 0.3, s.size, s.rmp, s.seed, false, 0.35);
    case 'pine': return drawPine(cv, s.X, s.Y, s.size, s.snowy, s.seed);
    case 'palm': return drawPalm(cv, s.X, s.Y, s.seed);
    case 'cactus': return drawCactus(cv, s.X, s.Y, s.seed);
    case 'house': return drawHouse(cv, s.X, s.Y, s.v);
    case 'mountain':
      if (s.twin) drawMountain(cv, s.X + s.w * 0.36, s.Y + 1, Math.round(s.w * 0.7), Math.round(s.hgt * 0.72), s.snowy, (s.seed * 7) % 1);
      return drawMountain(cv, s.X, s.Y, s.w, s.hgt, s.snowy, s.seed);
    case 'hill': return drawMountain(cv, s.X, s.Y, s.w, s.hgt, false, s.seed, true);
    case 'sheep': return drawSheep(cv, s.X, s.Y, s.seed);
    case 'hall': return drawHall(cv, s.X, s.Y);
    case 'warehouse': return drawWarehouse(cv, s.X, s.Y);
    case 'fountain': return drawFountain(cv, s.X, s.Y);
    case 'stall': return drawStall(cv, s.X, s.Y, s.v);
    case 'lamp': return drawLamp(cv, s.X, s.Y);
    case 'boat': return drawBoat(cv, s.X, s.Y, s.v);
    case 'ship': return drawShip(cv, s.X, s.Y);
    case 'lighthouse': return drawLighthouse(cv, s.X, s.Y);
    case 'treasure_chest': return drawChest(cv, s.X, s.Y);
    case 'windmill': return drawWindmill(cv, s.X, s.Y);
    case 'elderTree': return drawElderTree(cv, s.X, s.Y);
    case 'shrine': return drawShrine(cv, s.X, s.Y);
    case 'temple': return drawTemple(cv, s.X, s.Y);
    case 'observatory': return drawObservatory(cv, s.X, s.Y);
    case 'crystalCave': return drawCrystalCave(cv, s.X, s.Y);
    case 'crystal': return drawCrystals(cv, s.X, s.Y, s.seed, s.big);
    case 'volcano': return drawVolcano(cv, s.X, s.Y);
    case 'forge': return drawForge(cv, s.X, s.Y);
    case 'lodge': return drawLodge(cv, s.X, s.Y);
    case 'stiltHouse': return drawStiltHouse(cv, s.X, s.Y);
    case 'camp': return drawCamp(cv, s.X, s.Y);
    case 'igloo': return drawIgloo(cv, s.X, s.Y);
    case 'hut': return drawHut(cv, s.X, s.Y);
    case 'wreck': return drawWreck(cv, s.X, s.Y);
    case 'iceberg': return drawIceberg(cv, s.X, s.Y, s.seed);
    case 'find': return drawFind(cv, s);
    default: return undefined;
  }
}

/** Lumpy, sun-lit ball of leaves (or a rock) with a dark rim on the shaded side. */
export function drawCanopy(cv, cx, cy, r, rmp, seed, trunk, lumpiness = 1) {
  const top = rmp.length - 1;
  if (trunk) {
    const tx = Math.round(cx);
    for (let y = Math.round(cy + r * 0.5); y <= Math.round(cy + r * 1.35); y += 1) {
      cv.put(tx - 1, y, R.trunk[1]);
      cv.put(tx, y, R.trunk[3]);
    }
  }
  const R0 = Math.ceil(r + 1);
  for (let dy = -R0; dy <= R0; dy += 1) {
    for (let dx = -R0; dx <= R0; dx += 1) {
      const ang = Math.atan2(dy, dx);
      const lump = r * (0.84 + 0.2 * lumpiness * valueNoise(Math.cos(ang) * 1.6 + seed * 50, Math.sin(ang) * 1.6, 5));
      const d = Math.hypot(dx, dy * 1.08);
      if (d > lump) continue;
      const X = Math.round(cx + dx);
      const Y = Math.round(cy + dy);
      const light = (-(dx + dy) / (r * 1.5)) + 0.25;
      const clump = valueNoise((dx + seed * 97) * 0.75, (dy + seed * 31) * 0.75, 3) - 0.5;
      let idx = top * 0.52 + light * top * 0.42 + clump * 2.2;
      if (d > lump - 1.1 && dx + dy > -1) idx -= 2; // shaded rim
      cv.put(X, Y, pick(rmp, idx, X, Y, 0.8));
    }
  }
}

/** A peak: lit west face, shaded east face, gullies, jagged snow cap. */
export function drawMountain(cv, cx, by, w, hgt, snowy, seed, grassy = false, pal = null) {
  const ROCK = pal?.rock || R.rock;
  const SNOW = pal?.snow || R.snow;
  const ALPINE = pal?.alpine || R.alpine;
  const top = by - hgt;
  const peakX = cx + (seed - 0.5) * w * 0.18;
  const s7 = Math.floor(seed * 997);
  for (let row = 0; row <= hgt; row += 1) {
    const t = row / hgt;
    const y = Math.round(top + row);
    const jag = (valueNoise(row * 0.45, s7, 5) - 0.5) * 2.6 * Math.min(1, t * 3);
    const spread = (w / 2) * Math.pow(t, 0.92);
    const left = peakX - spread - jag;
    const right = peakX + spread - jag * 0.5;
    const ridge = peakX + (valueNoise(row * 0.2, s7, 9) - 0.5) * 2.4 * t + t * w * 0.06;
    const snowLine = 0.3 + valueNoise(row * 0.35, s7, 11) * 0.2;
    for (let x = Math.round(left); x <= Math.round(right); x += 1) {
      const lit = x <= ridge;
      const gully = valueNoise(x * 0.55, y * 0.17, s7 + 3) > 0.7 && t > 0.15;
      let c;
      if (snowy && t < snowLine) {
        c = lit ? pick(SNOW, 5.6 - t * 2.4 - (gully ? 1.4 : 0), x, y) : pick(SNOW, 2.6 - t * 1.6 - (gully ? 1 : 0), x, y);
      } else {
        const acrossLit = (x - left) / Math.max(1, ridge - left);
        const rr = grassy && t > 0.35 ? ALPINE : ROCK;
        c = lit
          ? pick(rr, (grassy ? 3.6 : 4.6) + acrossLit * 1.4 - t * 1.8 - (gully ? 1.6 : 0), x, y)
          : pick(rr, (grassy ? 1.6 : 2.4) - t * 1.2 - (gully ? 1 : 0), x, y);
      }
      if (x >= Math.round(right) - 0 && !lit) c = ROCK[0];
      if (row >= hgt - 1) c = lit ? ROCK[2] : ROCK[1];
      cv.put(x, y, c);
    }
  }
}

function drawSheep(cv, cx, cy) {
  const X = Math.round(cx);
  const Y = Math.round(cy);
  const wool = [packHex('#f5f3ec'), packHex('#dcd8cf')];
  cv.blend(X + 1, Y + 2, SHADOW, 0.25);
  cv.blend(X + 2, Y + 2, SHADOW, 0.25);
  cv.put(X, Y, wool[0]);
  cv.put(X + 1, Y, wool[0]);
  cv.put(X, Y + 1, wool[1]);
  cv.put(X + 1, Y + 1, wool[1]);
  cv.put(X + 2, Y, packHex('#3b3440'));
}

function drawPine(cv, cx, by, h, snowy, seed) {
  const X0 = Math.round(cx);
  const Y0 = Math.round(by);
  cv.put(X0, Y0, R.trunk[1]);
  cv.put(X0, Y0 - 1, R.trunk[2]);
  const height = Math.round(h * 1.8);
  for (let k = 0; k < height; k += 1) {
    const y = Y0 - 2 - k;
    const layer = (k % 4) / 4;
    const half = Math.max(0, Math.round((height - k) * 0.42 + (1 - layer) * 1.2 - 0.6));
    for (let dx = -half; dx <= half; dx += 1) {
      const lit = dx < 0 ? 1.4 : -0.6;
      let idx = 2.6 + lit - (k === 0 ? 0 : 0) + (dx === half ? -1.2 : 0) + (valueNoise(dx + seed * 40, k, 7) - 0.5);
      let c = pick(R.pine, idx, X0 + dx, y, 0.6);
      if (snowy && layer < 0.3 && dx < half && hash2(X0 + dx, y, 11) > 0.35) c = dx < 0 ? R.snow[6] : R.snow[4];
      cv.put(X0 + dx, y, c);
    }
  }
}

function drawPalm(cv, cx, by, seed) {
  const X0 = Math.round(cx);
  const Y0 = Math.round(by);
  const lean = seed > 0.5 ? 1 : -1;
  for (let k = 0; k < 7; k += 1) {
    const x = X0 + Math.round(lean * (k * k) / 24);
    cv.put(x, Y0 - k, R.trunk[k % 2 ? 2 : 4]);
  }
  const tx = X0 + Math.round(lean * 2);
  const ty = Y0 - 7;
  const fronds = [[-1, 0], [1, 0], [-0.7, -0.7], [0.7, -0.7], [0, 1], [-0.8, 0.6], [0.8, 0.6]];
  for (const [fx, fy] of fronds) {
    for (let s = 1; s <= 4; s += 1) {
      const x = tx + Math.round(fx * s);
      const y = ty + Math.round(fy * s + (s * s) / 8);
      cv.put(x, y, R.palm[fx < 0 || fy < 0 ? 4 - (s > 3 ? 1 : 0) : 2]);
    }
  }
  cv.put(tx, ty, R.palm[5]);
}

function drawCactus(cv, cx, by) {
  const X0 = Math.round(cx);
  const Y0 = Math.round(by);
  for (let k = 0; k < 7; k += 1) {
    cv.put(X0, Y0 - k, R.cactus[4]);
    cv.put(X0 + 1, Y0 - k, R.cactus[2]);
  }
  for (let k = 0; k < 3; k += 1) {
    cv.put(X0 - 2, Y0 - 3 - k, R.cactus[4]);
    cv.put(X0 + 3, Y0 - 2 - k, R.cactus[2]);
  }
  cv.put(X0 - 1, Y0 - 3, R.cactus[3]);
  cv.put(X0 + 2, Y0 - 2, R.cactus[2]);
  cv.put(X0, Y0 - 7, R.cactus[5]);
}

/** 2×2-tile cottage seen from the south: pitched roof, plaster wall, door and windows. */
export function drawHouse(cv, X, Y, v = 0) {
  const roof = R.roof[v % R.roof.length];
  const x0 = Math.round(X);
  const y0 = Math.round(Y);
  // Roof: back slope (lit) and front slope (shaded) meeting at a ridge.
  for (let y = 0; y < 10; y += 1) {
    const inset = y < 1 ? 1 : 0;
    for (let x = -1 + inset; x < 17 - inset; x += 1) {
      let c;
      if (y === 4) c = roof[5];
      else if (y < 4) c = roof[3 + ((x + y) % 5 === 0 ? 1 : 0)];
      else c = roof[1 + (y === 9 ? -1 : 0) + ((x + y) % 5 === 0 ? 1 : 0)];
      if (x === -1 || x === 16) c = roof[0];
      cv.put(x0 + x, y0 + y - 2, c);
    }
  }
  // Chimney.
  const cx = x0 + (v % 2 ? 12 : 3);
  for (let y = -5; y < 0; y += 1) {
    cv.put(cx, y0 + y, R.stone[4]);
    cv.put(cx + 1, y0 + y, R.stone[2]);
  }
  // Wall.
  for (let y = 8; y < 15; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      let c = y === 8 ? R.plaster[1] : R.plaster[4 - (x > 12 ? 1 : 0)];
      if (y === 14) c = R.plaster[2];
      cv.put(x0 + x, y0 + y, c);
    }
  }
  // Door + windows with warm light.
  for (let y = 10; y < 15; y += 1) {
    cv.put(x0 + 7, y0 + y, R.wood[2]);
    cv.put(x0 + 8, y0 + y, R.wood[1]);
  }
  for (const wx of [2, 12]) {
    cv.put(x0 + wx, y0 + 10, packHex('#ffe39a'));
    cv.put(x0 + wx + 1, y0 + 10, packHex('#ffd06a'));
    cv.put(x0 + wx, y0 + 11, packHex('#f2b54f'));
    cv.put(x0 + wx + 1, y0 + 11, packHex('#e39c3c'));
  }
}

/* ------------------------------ town ------------------------------------- */

const AMBER = [packHex('#fff3c4'), packHex('#ffe08a'), packHex('#ffc94d'), packHex('#f2a33a')];
const GLOW = [255, 214, 120];

/** Soft additive-looking glow: blend towards warm light, fading with distance. */
export function glow(cv, cx, cy, r, rgb = GLOW, a = 0.35) {
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const d = Math.hypot(dx, dy) / r;
      if (d <= 1) cv.blend(cx + dx, cy + dy, rgb, a * (1 - d) * (1 - d));
    }
  }
}

function rect(cv, x0, y0, w, h, c) {
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, y0 + y, c);
}

/** Town hall: wide roof, arched door, and the lantern tower the harbour is named for. */
function drawHall(cv, X, Y) {
  const x0 = Math.round(X);
  const y0 = Math.round(Y);
  const roof = R.roof[2];
  for (let y = 0; y < 10; y += 1) {
    for (let x = -1; x < 25; x += 1) {
      let c = y < 4 ? roof[3 + ((x + y) % 6 === 0 ? 1 : 0)] : y === 4 ? roof[5] : roof[1 + ((x + y) % 6 === 0 ? 1 : 0)];
      if (x === -1 || x === 24) c = roof[0];
      cv.put(x0 + x, y0 + y - 2, c);
    }
  }
  for (let y = 8; y < 15; y += 1) {
    for (let x = 0; x < 24; x += 1) cv.put(x0 + x, y0 + y, y === 8 ? R.stone[3] : y === 14 ? R.stone[3] : R.stone[x > 19 ? 4 : 5]);
  }
  for (const wx of [2, 6, 16, 20]) rect(cv, x0 + wx, y0 + 10, 2, 2, AMBER[1]);
  rect(cv, x0 + 10, y0 + 10, 4, 5, R.wood[1]);
  cv.put(x0 + 11, y0 + 9, R.wood[1]);
  cv.put(x0 + 12, y0 + 9, R.wood[1]);
  // Tower.
  const tx = x0 + 8;
  for (let y = -16; y < 3; y += 1) {
    for (let x = 0; x < 8; x += 1) cv.put(tx + x, y0 + y, x === 0 ? R.stone[6] : x === 7 ? R.stone[2] : R.stone[4 + (x < 3 ? 1 : 0)]);
  }
  for (let y = -14; y < -9; y += 1) {
    for (let x = 1; x < 7; x += 1) cv.put(tx + x, y0 + y, AMBER[(x + y) % 3 === 0 ? 0 : 1]);
  }
  cv.put(tx + 3, y0 - 12, AMBER[3]);
  cv.put(tx + 4, y0 - 12, AMBER[3]);
  for (let y = 0; y < 7; y += 1) {
    const half = Math.max(0, 4 - Math.ceil(y * 0.66));
    for (let x = -half; x <= half; x += 1) cv.put(tx + 4 + x - (y === 6 ? 0 : 0), y0 - 17 - (6 - y), x < 0 ? roof[4] : roof[2]);
  }
  cv.put(tx + 4, y0 - 25, R.stone[1]);
  cv.put(tx + 4, y0 - 26, R.stone[1]);
  cv.put(tx + 5, y0 - 26, packHex('#ffb503'));
  cv.put(tx + 6, y0 - 26, packHex('#ff7b02'));
  cv.put(tx + 5, y0 - 25, packHex('#ffb503'));
  glow(cv, tx + 4, y0 - 12, 9, GLOW, 0.3);
}

function drawWarehouse(cv, X, Y) {
  const x0 = Math.round(X);
  const y0 = Math.round(Y);
  for (let y = 0; y < 9; y += 1) {
    for (let x = -1; x < 25; x += 1) {
      let c = R.wood[y < 4 ? 3 : 1] ;
      if (x % 3 === 0) c = R.wood[y < 4 ? 2 : 0];
      if (y === 4) c = R.wood[4];
      cv.put(x0 + x, y0 + y - 1, c);
    }
  }
  for (let y = 8; y < 15; y += 1) {
    for (let x = 0; x < 24; x += 1) cv.put(x0 + x, y0 + y, (x % 4 === 0) ? R.wood[1] : R.wood[3]);
  }
  rect(cv, x0 + 9, y0 + 10, 6, 5, R.wood[0]);
  for (const [cx, cy] of [[-3, 11], [-3, 8], [25, 12]]) {
    rect(cv, x0 + cx, y0 + cy, 3, 3, R.wood[4]);
    cv.put(x0 + cx, y0 + cy, R.wood[5]);
    cv.put(x0 + cx + 2, y0 + cy + 2, R.wood[2]);
  }
}

function drawFountain(cv, X, Y) {
  const cx = Math.round(X);
  const cy = Math.round(Y);
  for (let dy = -6; dy <= 6; dy += 1) {
    for (let dx = -8; dx <= 8; dx += 1) {
      const d = Math.hypot(dx / 8, dy / 6);
      if (d > 1) continue;
      let c;
      if (d > 0.78) c = dy < 0 ? R.stone[6] : R.stone[3];
      else c = pick(R.shallow, 3 + (-dx - dy) * 0.12, cx + dx, cy + dy);
      cv.put(cx + dx, cy + dy, c);
    }
  }
  rect(cv, cx - 1, cy - 5, 3, 5, R.stone[5]);
  cv.put(cx + 1, cy - 4, R.stone[3]);
  cv.put(cx, cy - 6, R.surf[2]);
}

const AWNINGS = [['#e25b50', '#fff4e6'], ['#3f6fd1', '#f4f7ff'], ['#3aa37a', '#f2fff6'], ['#f0a12e', '#fff8e1']];

function drawStall(cv, X, Y, v) {
  const x0 = Math.round(X);
  const y0 = Math.round(Y);
  const [a, b] = AWNINGS[v % AWNINGS.length].map(packHex);
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 9; x += 1) cv.put(x0 + x, y0 + y, (x >> 1) % 2 === 0 ? a : b);
  for (let x = 0; x < 9; x += 2) cv.put(x0 + x, y0 + 4, a);
  rect(cv, x0 + 1, y0 + 5, 7, 2, R.wood[3]);
  for (let x = 1; x < 8; x += 2) cv.put(x0 + x, y0 + 5, [packHex('#ffd84d'), packHex('#e2503f'), packHex('#7cc35a')][(x + v) % 3]);
  cv.put(x0 + 1, y0 + 7, R.wood[1]);
  cv.put(x0 + 7, y0 + 7, R.wood[1]);
}

function drawLamp(cv, X, Y) {
  const x0 = Math.round(X);
  const y0 = Math.round(Y);
  for (let y = 0; y < 6; y += 1) cv.put(x0, y0 - y, R.stone[1]);
  cv.put(x0, y0 - 6, AMBER[0]);
  cv.put(x0 + 1, y0 - 6, AMBER[1]);
  cv.put(x0, y0 - 7, AMBER[1]);
  glow(cv, x0, y0 - 6, 5, GLOW, 0.3);
}

export function drawBoat(cv, X, Y, v = 0) {
  const x0 = Math.round(X);
  const y0 = Math.round(Y);
  for (let x = -1; x < 12; x += 1) cv.blend(x0 + x + 1, y0 + 4, SHADOW, 0.25);
  for (let x = 0; x < 11; x += 1) {
    const inset = x === 0 || x === 10 ? 1 : 0;
    cv.put(x0 + x, y0 + 1 + inset, R.wood[4]);
    cv.put(x0 + x, y0 + 2, R.wood[2]);
    if (!inset) cv.put(x0 + x, y0 + 3, R.wood[1]);
  }
  for (let x = 2; x < 9; x += 1) cv.put(x0 + x, y0 + 1, R.wood[x === 2 ? 1 : 3]);
  if (v % 4 === 0) return;
  const sail = v % 2 ? packHex('#fbf6ea') : packHex('#f2e4c4');
  for (let y = 0; y < 8; y += 1) {
    cv.put(x0 + 5, y0 - y, R.wood[1]);
    for (let x = 1; x <= Math.floor((8 - y) * 0.6); x += 1) cv.put(x0 + 5 + x, y0 - y, x === 1 ? packHex('#d8ccb0') : sail);
  }
  if (v === 2) cv.put(x0 + 5, y0 - 8, packHex('#e25b50'));
}

function drawShip(cv, X, Y) {
  const x0 = Math.round(X);
  const y0 = Math.round(Y);
  for (let x = 0; x < 26; x += 1) cv.blend(x0 + x + 2, y0 + 7, SHADOW, 0.25);
  for (let y = 0; y < 6; y += 1) {
    const inset = Math.max(0, y - 2);
    for (let x = inset; x < 24 - inset; x += 1) {
      let c = y === 0 ? R.wood[4] : y === 2 ? packHex('#c9453b') : R.wood[y < 2 ? 3 : 1];
      if (x === inset || x === 23 - inset) c = R.wood[0];
      cv.put(x0 + x, y0 + y, c);
    }
  }
  for (const [mx, h] of [[7, 20], [16, 17]]) {
    for (let y = 0; y < h; y += 1) cv.put(x0 + mx, y0 - y, R.wood[1]);
    for (let s = 0; s < 3; s += 1) {
      const sy = y0 - h + 3 + s * 5;
      const half = 5 - s + (s === 2 ? 1 : 0);
      for (let y = 0; y < 4; y += 1) {
        for (let x = -half; x <= half; x += 1) cv.put(x0 + mx + x, sy + y, x < -half + 1 || y === 3 ? packHex('#d9cdb2') : packHex('#fbf6ea'));
      }
    }
    cv.put(x0 + mx, y0 - h - 1, packHex('#ffb503'));
    cv.put(x0 + mx + 1, y0 - h - 1, packHex('#ff7b02'));
  }
}

/** Wooden pier running south over the water from (x, y), len tiles long. */
export function drawPier(cv, X, Y, len, S) {
  const x0 = Math.round(X) + 1;
  const y0 = Math.round(Y);
  const h = len * S;
  for (let y = 0; y < h; y += 1) {
    cv.blend(x0 + 6, y0 + y + 1, SHADOW, 0.3);
    cv.blend(x0 + 7, y0 + y + 1, SHADOW, 0.18);
    for (let x = 0; x < 6; x += 1) cv.put(x0 + x, y0 + y, y % 3 === 2 ? R.wood[2] : R.wood[x < 1 ? 5 : 4]);
  }
  for (let y = 2; y < h; y += 4) {
    cv.put(x0 - 1, y0 + y, R.wood[0]);
    cv.put(x0 + 6, y0 + y, R.wood[0]);
  }
}

function drawLighthouse(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  // Rocks.
  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -7; dx <= 7; dx += 1) {
      const d = Math.hypot(dx / 7, dy / 3);
      if (d <= 1) cv.put(cx + dx, by + dy, pick(R.rock, 4 - (dx + dy) * 0.25 + valueNoise(dx, dy, 3) * 1.5, cx + dx, by + dy));
    }
  }
  const H = 26;
  for (let y = 0; y < H; y += 1) {
    const half = 3 + (y > H - 8 ? 1 : 0) + (y > H - 3 ? 0 : 0);
    const stripe = Math.floor(y / 4) % 2 === 0;
    for (let x = -half; x <= half; x += 1) {
      let c = stripe ? packHex(x < 1 ? '#f7f3ea' : '#d9d2c4') : packHex(x < 1 ? '#e2574c' : '#b53e38');
      if (x === half) c = stripe ? packHex('#b9b2a5') : packHex('#8f2f2c');
      cv.put(cx + x, by - y - 1, c);
    }
  }
  const top = by - H - 1;
  rect(cv, cx - 5, top, 11, 1, R.stone[1]);
  for (let y = 1; y <= 4; y += 1) for (let x = -2; x <= 2; x += 1) cv.put(cx + x, top - y, AMBER[x < 0 ? 0 : 1]);
  for (let y = 5; y <= 7; y += 1) {
    const half = 7 - y;
    for (let x = -half - 1; x <= half + 1; x += 1) cv.put(cx + x, top - y, packHex(x < 0 ? '#e2574c' : '#a8372f'));
  }
  glow(cv, cx, top - 3, 10, GLOW, 0.4);
}

function drawChest(cv, X, Y) {
  const x0 = Math.round(X) - 3;
  const y0 = Math.round(Y) - 5;
  for (let x = 0; x < 8; x += 1) cv.blend(x0 + x + 1, y0 + 6, SHADOW, 0.3);
  for (let y = 0; y < 6; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      let c = y < 2 ? R.wood[4] : R.wood[2];
      if (x === 0 || x === 6 || y === 2) c = packHex('#e0b44c');
      if (y === 5) c = R.wood[0];
      cv.put(x0 + x, y0 + y, c);
    }
  }
  cv.put(x0 + 3, y0 + 3, packHex('#fff1a8'));
}

/* ------------------------------ landmarks -------------------------------- */

/** Windmill tower and cap; the sails turn in the animation layer (drawWindmillSails). */
function drawWindmill(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  for (let y = 0; y < 17; y += 1) {
    const half = 4 - Math.floor(y / 6);
    for (let x = -half; x <= half; x += 1) {
      let c = R.plaster[x < 0 ? 5 : x === half ? 2 : 4];
      if (y % 5 === 4) c = R.plaster[x < 0 ? 3 : 2];
      cv.put(cx + x, by - y, c);
    }
  }
  rect(cv, cx - 1, by - 4, 2, 4, R.wood[1]);
  cv.put(cx + 1, by - 10, AMBER[1]);
  for (let y = 0; y < 5; y += 1) {
    const half = 4 - Math.floor(y * 0.8);
    for (let x = -half; x <= half; x += 1) cv.put(cx + x, by - 17 - y, R.roof[0][x < 0 ? 3 : 1]);
  }
  cv.put(cx, by - 15, R.wood[0]);
}

/** Static sails at a given angle — also used by the animation layer every frame. */
export function drawWindmillSails(ctxPut, cx, cy, angle, scale = 1) {
  for (let k = 0; k < 4; k += 1) {
    const a = angle + (k * Math.PI) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let s = 1; s <= 9; s += 1) {
      const x = cx + ca * s * scale;
      const y = cy + sa * s * scale;
      ctxPut(x, y, s > 3 ? 1 : 0);
      if (s > 3) ctxPut(x - sa * 1.6 * scale, y + ca * 1.6 * scale, 2);
    }
  }
}

const ELDER = [packHex('#123a33'), packHex('#1a4d40'), packHex('#22614b'), packHex('#2c7757'), packHex('#3a8e64'), packHex('#4fa673'), packHex('#6fbe85'), packHex('#9ad59c')];
/** The Elder Tree: a canopy six tiles across, roots, and a thousand lanterns. */
function drawElderTree(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  for (let y = 0; y < 16; y += 1) {
    const half = 3 + Math.floor(Math.max(0, y - 11) * 0.9);
    for (let x = -half; x <= half; x += 1) cv.put(cx + x, by - y, R.trunk[x < -1 ? 3 : x > 1 ? 1 : 2]);
  }
  for (const [dx, len] of [[-1, 9], [1, 8], [-0.5, 6], [0.6, 7]]) {
    for (let s = 0; s < len; s += 1) cv.put(cx + Math.round(dx * s * 1.4), by - 1 + Math.round(s * 0.25), R.trunk[2]);
  }
  const clumps = [[0, -32, 18], [-15, -25, 13], [15, -25, 13], [-9, -40, 12], [9, -41, 12], [0, -21, 13], [-20, -33, 9], [20, -33, 9]];
  clumps.forEach(([dx, dy, r], i) => drawCanopy(cv, cx + dx, by + dy, r, ELDER, 0.13 * (i + 1), false));
  const lanterns = [[-12, -26], [-4, -21], [6, -24], [14, -28], [-15, -33], [2, -33], [10, -38], [-7, -40], [-1, -27], [17, -22], [-18, -24]];
  for (const [dx, dy] of lanterns) glow(cv, cx + dx, by + dy, 6, GLOW, 0.35);
  for (const [dx, dy] of lanterns) {
    cv.put(cx + dx, by + dy - 1, R.trunk[0]);
    cv.put(cx + dx, by + dy, AMBER[0]);
    cv.put(cx + dx + 1, by + dy, AMBER[2]);
    cv.put(cx + dx, by + dy + 1, AMBER[2]);
  }
  for (const [dx, dy] of [[-10, 2], [9, 1], [-5, 4], [13, 3]]) {
    cv.put(cx + dx, by + dy, packHex('#fff1d6'));
    cv.put(cx + dx + 1, by + dy, packHex('#e25b50'));
    cv.put(cx + dx, by + dy - 1, packHex('#e25b50'));
  }
}

function drawShrine(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  const red = [packHex('#8f2a24'), packHex('#c43c2f'), packHex('#e2574c'), packHex('#f07b6a')];
  // Torii gate in front.
  for (let y = 0; y < 9; y += 1) { cv.put(cx - 7, by + 4 - y, red[1]); cv.put(cx + 7, by + 4 - y, red[1]); }
  for (let x = -9; x <= 9; x += 1) { cv.put(cx + x, by - 5, red[2]); cv.put(cx + x, by - 4, red[0]); }
  for (let x = -7; x <= 7; x += 1) cv.put(cx + x, by - 2, red[1]);
  // Pagoda: two tiers.
  for (const [ty, half, h] of [[-6, 6, 5], [-13, 4, 4]]) {
    for (let y = 0; y < h; y += 1) for (let x = -half + 1; x < half; x += 1) cv.put(cx + x, by + ty - y + 3, y === 0 ? R.plaster[2] : R.plaster[x < 0 ? 5 : 3]);
    for (let x = -half - 2; x <= half + 2; x += 1) { cv.put(cx + x, by + ty - h + 3, red[x < 0 ? 3 : 2]); cv.put(cx + x, by + ty - h + 4, red[0]); }
    cv.put(cx - half - 3, by + ty - h + 2, red[2]);
    cv.put(cx + half + 3, by + ty - h + 2, red[1]);
  }
  cv.put(cx, by - 15, packHex('#ffb503'));
  cv.put(cx, by - 16, packHex('#ffb503'));
  glow(cv, cx, by - 7, 8, [255, 190, 210], 0.25);
}

/** Stepped limestone pyramid with a golden capstone, a dark doorway and two obelisks. */
const LIME = [packHex('#6e5f4a'), packHex('#8f7e63'), packHex('#b3a283'), packHex('#d2c3a2'), packHex('#e9dfc3'), packHex('#fbf5e3')];
function drawTemple(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  const gold = [packHex('#9a6b12'), packHex('#d9a21f'), packHex('#ffd54a'), packHex('#fff2a8')];
  const steps = 7;
  for (let step = 0; step < steps; step += 1) {
    const half = 28 - step * 4;
    const top = by - (step + 1) * 5;
    for (let y = 0; y < 5; y += 1) {
      for (let x = -half; x <= half; x += 1) {
        let c = y === 0 ? LIME[5] : x < -half + 3 ? LIME[4] : x > half - 4 ? LIME[1] : LIME[3];
        if (y === 4) c = LIME[1];
        if (y === 0 && (x + step) % 7 === 0) c = gold[2];
        if (Math.abs(x) <= 3) c = y === 0 ? LIME[5] : y % 2 === 0 ? LIME[4] : LIME[2];
        cv.put(cx + x, top + y, c);
      }
    }
  }
  for (let y = 0; y < 6; y += 1) for (let x = -2; x <= 2; x += 1) cv.put(cx + x, by - 6 + y, y === 0 ? gold[1] : packHex('#1d1410'));
  for (let y = 0; y < 7; y += 1) {
    const half = 3 - Math.floor(y / 2);
    for (let x = -half; x <= half; x += 1) cv.put(cx + x, by - steps * 5 - 1 - y, gold[x < 0 ? 3 : y > 3 ? 1 : 2]);
  }
  glow(cv, cx, by - steps * 5 - 4, 12, [255, 220, 120], 0.4);
  for (const ox of [-35, 35]) {
    for (let y = 0; y < 20; y += 1) {
      cv.put(cx + ox, by - y, LIME[4]);
      cv.put(cx + ox + 1, by - y, LIME[2]);
    }
    cv.put(cx + ox, by - 20, gold[3]);
    cv.put(cx + ox + 1, by - 20, gold[2]);
    cv.put(cx + ox, by - 21, gold[2]);
    for (let k = 0; k < 8; k += 1) cv.blend(cx + ox + 2 + k, by - 1 + Math.floor(k / 3), SHADOW, 0.25);
  }
}

function drawObservatory(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  for (let y = 0; y < 4; y += 1) for (let x = -15 + y; x <= 15 - y; x += 1) cv.put(cx + x, by - y, R.stone[y === 3 ? 6 : x > 11 - y ? 2 : 4]);
  for (let y = 4; y < 15; y += 1) {
    for (let x = -10; x <= 10; x += 1) cv.put(cx + x, by - y, R.stone[x < -7 ? 6 : x > 7 ? 3 : 5]);
  }
  for (const wx of [-7, -3, 5]) { rect(cv, cx + wx, by - 10, 2, 3, AMBER[1]); cv.put(cx + wx, by - 11, AMBER[0]); }
  rect(cv, cx - 1, by - 8, 3, 4, R.wood[1]);
  const dome = [packHex('#6f7d9c'), packHex('#95a3c0'), packHex('#bcc8df'), packHex('#e4ebf6'), packHex('#ffffff')];
  for (let dy = 0; dy <= 11; dy += 1) {
    const half = Math.round(Math.sqrt(1 - (dy / 11.5) ** 2) * 11);
    for (let x = -half; x <= half; x += 1) {
      const l = (-(x) - dy * 0.6) / 10;
      cv.put(cx + x, by - 15 - dy, dome[Math.max(0, Math.min(4, Math.round(2.2 + l * 2.2)))]);
    }
  }
  for (let dy = 1; dy <= 11; dy += 1) { cv.put(cx + 3, by - 15 - dy, packHex('#20283d')); cv.put(cx + 4, by - 15 - dy, packHex('#2f3a57')); }
  for (let s = 0; s < 11; s += 1) {
    cv.put(cx + 4 + s, by - 22 - Math.round(s * 0.6), packHex('#e0b44c'));
    cv.put(cx + 4 + s, by - 21 - Math.round(s * 0.6), packHex('#8a6224'));
  }
  glow(cv, cx - 5, by - 9, 8, GLOW, 0.25);
}

const CRYSTAL = {
  cyan: [packHex('#1a4f7a'), packHex('#2c86b8'), packHex('#4fd0ec'), packHex('#9af4ff'), packHex('#effdff')],
  violet: [packHex('#3c2470'), packHex('#6a45b8'), packHex('#9c7cf0'), packHex('#cdb8ff'), packHex('#f6f0ff')],
  pink: [packHex('#6a1f54'), packHex('#b23f8c'), packHex('#ec79c6'), packHex('#ffb8e6'), packHex('#fff0fa')],
};

/** One faceted shard: lit left face, dark right face, bright tip. */
function shard(cv, bx, by, w, h, lean, pal) {
  for (let y = 0; y < h; y += 1) {
    const t = y / h;
    const half = Math.max(0, Math.round(w * Math.min(1, t * 2.2) / 2));
    const x0 = bx + Math.round(lean * (1 - t) * h * 0.35);
    for (let x = -half; x <= half; x += 1) {
      let c = x < 0 ? pal[3] : x === 0 ? pal[4] : pal[1];
      if (x === half && half > 0) c = pal[0];
      if (y < 2) c = pal[4];
      cv.put(x0 + x, by - h + y, c);
    }
  }
}

export function drawCrystals(cv, X, Y, seed = 0.5, big = false) {
  const pals = [CRYSTAL.cyan, CRYSTAL.violet, CRYSTAL.pink];
  const n = big ? 5 : 3;
  const base = Math.floor(seed * 3);
  glow(cv, Math.round(X), Math.round(Y) - (big ? 8 : 4), big ? 12 : 7, [150, 220, 255], 0.3);
  for (let k = 0; k < n; k += 1) {
    const off = (k - (n - 1) / 2) * (big ? 4 : 3);
    const h = Math.round((big ? 14 : 8) * (1 - Math.abs(off) / (n * 3.5)) + hash2(k, Math.floor(seed * 100), 7) * 4);
    shard(cv, Math.round(X + off), Math.round(Y), big ? 4 : 3, h, off * 0.25, pals[(base + k) % 3]);
  }
}

function drawCrystalCave(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  for (let dy = -12; dy <= 0; dy += 1) {
    for (let dx = -13; dx <= 13; dx += 1) {
      const d = Math.hypot(dx / 13, (dy + 1) / 12);
      if (d > 1) continue;
      cv.put(cx + dx, by + dy, pick(R.rock, 3.6 - (dx + dy) * 0.12 + valueNoise(dx * 0.4, dy * 0.4, 5) * 1.6, cx + dx, by + dy));
    }
  }
  for (let dy = -7; dy <= 0; dy += 1) {
    const half = Math.round(Math.sqrt(1 - ((dy + 1) / 8) ** 2) * 5);
    for (let x = -half; x <= half; x += 1) cv.put(cx + x, by + dy, dy > -2 ? packHex('#3c2470') : packHex('#1b1233'));
  }
  glow(cv, cx, by - 3, 9, [180, 140, 255], 0.35);
  drawCrystals(cv, cx - 11, by + 1, 0.2, true);
  drawCrystals(cv, cx + 12, by + 2, 0.7, false);
}

/** The Emberforge volcano: dark cone, lava channels, glowing crater. */
function drawVolcano(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  const H = 42;
  const Wd = 44;
  for (let row = 0; row <= H; row += 1) {
    const t = row / H;
    const half = Math.round(8 + (Wd - 8) * Math.pow(t, 1.1) + (valueNoise(row * 0.4, 3, 9) - 0.5) * 3 * t);
    const y = by - H + row;
    for (let x = -half; x <= half; x += 1) {
      const lit = x < -1 + t * 4;
      const gully = valueNoise(x * 0.35, y * 0.12, 21) > 0.7;
      let c = lit ? pick(R.volcanic, 4.4 - t * 1.4 - (gully ? 1.2 : 0) + (-x / half) * 0.8, cx + x, y) : pick(R.volcanic, 2 - t * 0.6 - (gully ? 1 : 0), cx + x, y);
      const flow = Math.abs(x - Math.sin(row * 0.22) * 5 - row * 0.25) < 1.2 + t * 0.6 || Math.abs(x + 9 + Math.sin(row * 0.3) * 3 - row * 0.1) < 0.9 && t > 0.35;
      if (flow && t > 0.08) c = pick(R.lava, 4.2 - t * 2.2 + valueNoise(x, row, 7), cx + x, y);
      if (x === half) c = R.volcanic[0];
      cv.put(cx + x, y, c);
    }
  }
  for (let dy = -3; dy <= 3; dy += 1) {
    for (let dx = -9; dx <= 9; dx += 1) {
      const d = Math.hypot(dx / 9, dy / 3);
      if (d > 1) continue;
      const c = d > 0.72 ? R.volcanic[dy < 0 ? 5 : 2] : pick(R.lava, 5.5 - d * 3, cx + dx, by - H + dy);
      cv.put(cx + dx, by - H + dy, c);
    }
  }
  glow(cv, cx, by - H, 14, [255, 140, 60], 0.4);
}

function drawForge(cv, X, Y) {
  const x0 = Math.round(X) - 9;
  const y0 = Math.round(Y) - 12;
  for (let y = 0; y < 7; y += 1) for (let x = -1; x < 19; x += 1) cv.put(x0 + x, y0 + y, R.volcanic[y < 3 ? 5 : 3]);
  for (let y = 7; y < 13; y += 1) for (let x = 0; x < 18; x += 1) cv.put(x0 + x, y0 + y, R.stone[x > 14 ? 1 : 2 + ((x + y) % 4 === 0 ? 1 : 0)]);
  rect(cv, x0 + 3, y0 + 9, 3, 2, packHex('#ff9a3c'));
  rect(cv, x0 + 12, y0 + 9, 3, 2, packHex('#ff9a3c'));
  rect(cv, x0 + 7, y0 + 8, 4, 5, packHex('#ffb45a'));
  for (let y = -8; y < 1; y += 1) { cv.put(x0 + 14, y0 + y, R.stone[3]); cv.put(x0 + 15, y0 + y, R.stone[1]); }
  cv.put(x0 + 14, y0 - 9, packHex('#ffd35d'));
  cv.put(x0 + 15, y0 - 9, packHex('#ff7726'));
  glow(cv, x0 + 9, y0 + 10, 8, [255, 150, 70], 0.35);
}

function drawLodge(cv, X, Y) {
  const x0 = Math.round(X) - 10;
  const y0 = Math.round(Y) - 13;
  for (let y = 0; y < 9; y += 1) {
    const inset = Math.max(0, 3 - y);
    for (let x = -1 + inset; x < 21 - inset; x += 1) cv.put(x0 + x, y0 + y, y === 3 ? R.roof[0][4] : R.roof[0][y < 3 ? 3 : 1]);
  }
  for (let y = 8; y < 14; y += 1) for (let x = 0; x < 20; x += 1) cv.put(x0 + x, y0 + y, y % 2 ? R.wood[2] : R.wood[4]);
  rect(cv, x0 + 8, y0 + 10, 3, 4, R.wood[0]);
  rect(cv, x0 + 3, y0 + 10, 2, 2, AMBER[1]);
  rect(cv, x0 + 15, y0 + 10, 2, 2, AMBER[1]);
  for (let y = -4; y < 2; y += 1) { cv.put(x0 + 16, y0 + y, R.stone[4]); cv.put(x0 + 17, y0 + y, R.stone[2]); }
  for (let k = 0; k < 4; k += 1) rect(cv, x0 + 22 + (k % 2) * 3, y0 + 12 - Math.floor(k / 2) * 2, 3, 2, R.wood[3]);
}

function drawStiltHouse(cv, X, Y) {
  const x0 = Math.round(X) - 7;
  const y0 = Math.round(Y) - 14;
  for (const sx of [1, 5, 9, 13]) for (let y = 11; y < 16; y += 1) cv.put(x0 + sx, y0 + y, R.wood[1]);
  for (let y = 0; y < 6; y += 1) {
    const inset = Math.max(0, 2 - y);
    for (let x = -1 + inset; x < 16 - inset; x += 1) cv.put(x0 + x, y0 + y, (x + y) % 3 === 0 ? packHex('#a8874a') : packHex(y < 3 ? '#d9b86a' : '#b8964f'));
  }
  for (let y = 6; y < 11; y += 1) for (let x = 0; x < 15; x += 1) cv.put(x0 + x, y0 + y, x % 3 === 0 ? R.wood[2] : R.wood[3]);
  rect(cv, x0 + 6, y0 + 7, 3, 4, R.wood[0]);
  for (let x = -6; x < 0; x += 1) cv.put(x0 + x, y0 + 12, R.wood[4]);
  for (const [lx, ly] of [[-4, 8], [18, 9], [20, 2]]) {
    cv.put(x0 + lx, y0 + ly + 1, R.wood[1]);
    cv.put(x0 + lx, y0 + ly + 2, R.wood[1]);
    cv.put(x0 + lx, y0 + ly, packHex('#c8ff8a'));
    glow(cv, x0 + lx, y0 + ly, 5, [190, 255, 150], 0.35);
  }
}

function drawCamp(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  for (const [ox, col] of [[-8, ['#e25b50', '#a8372f']], [7, ['#f0a12e', '#b8741c']]]) {
    for (let y = 0; y < 7; y += 1) {
      for (let x = -y; x <= y; x += 1) cv.put(cx + ox + x, by - 7 + y, packHex(x < 0 ? col[0] : col[1]));
    }
    cv.put(cx + ox, by - 1, R.wood[0]);
    cv.put(cx + ox, by - 2, R.wood[0]);
    for (let k = 0; k < 6; k += 1) cv.blend(cx + ox + 2 + k, by + 1, SHADOW, 0.25);
  }
  rect(cv, cx - 2, by + 1, 5, 1, R.wood[1]);
  cv.put(cx, by, packHex('#ffd35d'));
  cv.put(cx - 1, by, packHex('#ff7726'));
  cv.put(cx + 1, by, packHex('#ff7726'));
  glow(cv, cx, by, 6, [255, 170, 80], 0.35);
}

function drawIgloo(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  for (let dy = 0; dy <= 6; dy += 1) {
    const half = Math.round(Math.sqrt(1 - (dy / 7) ** 2) * 7);
    for (let x = -half; x <= half; x += 1) {
      let c = R.snow[x < 0 ? 6 : 4];
      if (dy % 2 === 0 && (x + dy) % 4 === 0) c = R.snow[2];
      if (x === half) c = R.snow[1];
      cv.put(cx + x, by - dy, c);
    }
  }
  rect(cv, cx - 1, by - 2, 3, 3, packHex('#2a3350'));
  for (let k = 0; k < 7; k += 1) cv.blend(cx + 5 + k, by + 1, SHADOW, 0.2);
}

function drawHut(cv, X, Y) {
  const cx = Math.round(X);
  const by = Math.round(Y);
  for (let y = 0; y < 4; y += 1) for (let x = -4; x <= 4; x += 1) cv.put(cx + x, by - y, R.wood[x < 0 ? 4 : 2]);
  rect(cv, cx - 1, by - 3, 2, 3, R.wood[0]);
  for (let y = 0; y < 6; y += 1) {
    const half = 6 - y;
    for (let x = -half; x <= half; x += 1) cv.put(cx + x, by - 4 - y, (x + y) % 3 === 0 ? packHex('#a8874a') : packHex(x < 0 ? '#e0c27a' : '#c2a05c'));
  }
}

/** Sunken ruins seen through the water: eroded floors, broken walls, columns, a rotunda. */
export function drawLibrary(cv, X, Y, S) {
  const x0 = Math.round(X - 4 * S);
  const y0 = Math.round(Y - 3 * S);
  const Wd = 8 * S;
  const Ht = 6 * S;
  const pale = [206, 232, 230];
  const lit = [236, 250, 246];
  const deep = [16, 52, 82];
  const eroded = (x, y) => valueNoise(x * 0.11, y * 0.11, 41) + (valueNoise(x * 0.4, y * 0.4, 43) - 0.5) * 0.3 > 0.58;
  for (let y = 4; y < Ht - 4; y += 1) {
    for (let x = 4; x < Wd - 4; x += 1) {
      if (eroded(x, y)) continue;
      const slab = hash2(Math.floor(x / 5), Math.floor(y / 5), 21);
      if (slab < 0.22) continue;
      cv.blend(x0 + x, y0 + y, pale, 0.1 + slab * 0.1);
    }
  }
  const wall = (x, y, a) => { if (!eroded(x, y)) cv.blend(x0 + x, y0 + y, lit, a); };
  for (let k = 3; k < Wd - 3; k += 1) { wall(k, 3, 0.42); wall(k, 4, 0.3); wall(k, Ht - 4, 0.36); }
  for (let k = 3; k < Ht - 3; k += 1) { wall(3, k, 0.42); wall(4, k, 0.3); wall(Wd - 4, k, 0.36); }
  for (let c = 0; c < 7; c += 1) {
    for (const cy of [12, Ht - 12]) {
      if (hash2(c, cy, 9) < 0.25) continue;
      const cx = 10 + c * 7;
      cv.blend(x0 + cx + 2, y0 + cy + 2, deep, 0.3);
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (dx * dx + dy * dy <= 4) cv.blend(x0 + cx + dx, y0 + cy + dy, dx + dy < 0 ? lit : pale, 0.5);
    }
  }
  const rcx = x0 + Wd / 2;
  const rcy = y0 + Ht / 2;
  for (let a = 0; a < 80; a += 1) {
    if (a > 50 && a < 62) continue;
    const ang = (a / 80) * Math.PI * 2;
    cv.blend(rcx + Math.cos(ang) * 10, rcy + Math.sin(ang) * 7, lit, 0.5);
    cv.blend(rcx + Math.cos(ang) * 9, rcy + Math.sin(ang) * 6, pale, 0.35);
  }
  const books = [[240, 190, 120], [150, 205, 240], [230, 140, 170], [170, 230, 170]];
  for (let k = 0; k < 6; k += 1) for (let y = 0; y < 3; y += 1) cv.blend(rcx - 6 + k * 2, rcy - 3 + y, books[k % 4], 0.4);
  for (let dy = -6; dy <= 6; dy += 1) for (let dx = -6; dx <= 6; dx += 1) {
    const d = Math.hypot(dx, dy) / 6;
    if (d <= 1) cv.blend(rcx + dx, rcy + 3 + dy, [140, 255, 230], 0.32 * (1 - d));
  }
}

function drawWreck(cv, X, Y) {
  const x0 = Math.round(X) - 12;
  const y0 = Math.round(Y) - 4;
  for (let y = 0; y < 8; y += 1) {
    const inset = Math.abs(y - 3);
    for (let x = inset; x < 26 - inset * 1.5; x += 1) {
      if (x > 17 && y > 3 && hash2(x, y, 3) > 0.4) continue; // broken stern
      let c = y < 2 ? R.wood[4] : R.wood[2];
      if ((x - inset) % 4 === 0) c = R.wood[0];
      cv.put(x0 + x, y0 + y, c);
    }
  }
  for (let y = 0; y < 13; y += 1) cv.put(x0 + 9 + Math.round(y * 0.45), y0 - y, R.wood[1]);
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < 4 - Math.floor(y / 2); x += 1) cv.put(x0 + 12 + x + Math.round(y * 0.4), y0 - 11 + y, packHex(hash2(x, y, 5) > 0.3 ? '#e9dfc6' : '#c7b894'));
  for (let x = -2; x < 28; x += 1) if (hash2(x, 1, 11) > 0.35) cv.put(x0 + x, y0 + 8, FOAM_PX);
}
const FOAM_PX = packHex('#eefcff');

function drawIceberg(cv, X, Y, seed) {
  const cx = Math.round(X);
  const cy = Math.round(Y);
  const r = 3 + Math.round(seed * 4);
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r - 2; dx <= r + 2; dx += 1) {
      const d = Math.hypot(dx / (r + 2), dy / r) + (valueNoise(dx * 0.6 + seed * 20, dy * 0.6, 3) - 0.5) * 0.5;
      if (d > 1.25) continue;
      if (d > 1) { cv.blend(cx + dx, cy + dy + 2, [190, 235, 250], 0.35); continue; }
      cv.put(cx + dx, cy + dy, dx + dy < 0 ? R.ice[5] : d > 0.75 ? R.ice[2] : R.ice[4]);
    }
  }
}

/**
 * Skyhaven — an island hanging in the sky: grassy top with a little temple,
 * a rocky root dangling beneath, and waterfalls that never reach the sea.
 * Drawn with its top-left at (X0, Y0); about 56×70 px.
 */
export function drawSkyhaven(cv, X0, Y0) {
  const cx = Math.round(X0) + 28;
  const top = Math.round(Y0) + 18;
  // Rocky underside.
  for (let row = 0; row < 40; row += 1) {
    const t = row / 40;
    const half = Math.round(24 * (1 - t) ** 1.3 + (valueNoise(row * 0.4, 1, 3) - 0.5) * 3);
    for (let x = -half; x <= half; x += 1) {
      const band = Math.floor((row + valueNoise(x * 0.3, 0, 5) * 3) / 4) % 3;
      let c = [R.earth[3], R.earth[2], R.rock[3]][band];
      if (x > half - 3) c = R.earth[0];
      if (x < -half + 2) c = R.earth[4];
      cv.put(cx + x, top + 6 + row, c);
    }
  }
  for (const [rx, len] of [[-12, 9], [-3, 14], [8, 11], [15, 7]]) {
    for (let k = 0; k < len; k += 1) cv.put(cx + rx + Math.round(Math.sin(k * 0.6) * 1.2), top + 12 + k + Math.abs(rx) * 0.4, R.oak[2]);
  }
  // Grassy top.
  for (let dy = -8; dy <= 7; dy += 1) {
    for (let dx = -27; dx <= 27; dx += 1) {
      const d = Math.hypot(dx / 27, dy / 8) + (valueNoise(dx * 0.25, dy * 0.25, 7) - 0.5) * 0.18;
      if (d > 1) continue;
      let c = pick(R.grass, 4.6 + (-dx - dy * 2) * 0.05 + valueNoise(dx * 0.5, dy * 0.5, 9), cx + dx, top + dy);
      if (d > 0.9 && dy > 0) c = R.earth[3];
      cv.put(cx + dx, top + dy, c);
    }
  }
  // Waterfalls off the rim.
  for (const wx of [-19, 12]) {
    for (let y = 0; y < 34; y += 1) {
      for (let k = 0; k < 3; k += 1) {
        const a = 1 - y / 34;
        if (hash2(wx + k, y, 13) < a) cv.put(cx + wx + k, top + 6 + y, hash2(wx + k, y, 17) > 0.5 ? packHex('#e8fbff') : packHex('#9fd8f0'));
      }
    }
  }
  // Temple + trees on top.
  for (let y = 0; y < 6; y += 1) for (let x = -5; x <= 5; x += 1) cv.put(cx + x, top - 4 - y + 4, x % 3 === 0 ? R.stone[6] : R.stone[4]);
  for (let dy = 0; dy <= 5; dy += 1) {
    const half = Math.round(Math.sqrt(1 - (dy / 6) ** 2) * 6);
    for (let x = -half; x <= half; x += 1) cv.put(cx + x, top - 6 - dy, x < 0 ? packHex('#ffe08a') : packHex('#e0b44c'));
  }
  drawCanopy(cv, cx - 16, top - 5, 5, R.oak, 0.3, true);
  drawCanopy(cv, cx + 18, top - 3, 4, R.blossom, 0.6, true);
  drawCanopy(cv, cx - 9, top + 2, 3, R.oak, 0.8, false);
}

/* ------------------------------ finds ------------------------------------ */

const PX = (cv, x, y, c) => cv.put(Math.round(x), Math.round(y), c);
function shadowEllipse(cv, cx, cy, rx, ry, a = 0.26) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy += 1) {
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx += 1) {
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (d <= 1) cv.blend(cx + dx, cy + dy, SHADOW, a * (1 - d * 0.5));
    }
  }
}

const FIND_SPRITES = {
  fisherHut(cv, x, y) {
    shadowEllipse(cv, x + 4, y + 1, 9, 2.5);
    drawHut(cv, x, y);
    for (let k = 0; k < 7; k += 1) for (let j = 0; j < 4; j += 1) if ((k + j) % 2 === 0) PX(cv, x + 7 + k, y - 5 + j, packHex('#d9cdb2'));
    PX(cv, x + 6, y - 6, R.wood[1]); PX(cv, x + 14, y - 6, R.wood[1]);
    for (let k = 0; k < 9; k += 1) PX(cv, x - 12 + k, y + 3, k % 8 === 0 ? R.wood[1] : R.wood[4]);
    PX(cv, x - 11, y + 2, R.wood[3]); PX(cv, x - 5, y + 2, R.wood[3]);
  },
  stones(cv, x, y) {
    for (let k = 0; k < 9; k += 1) {
      const a = (k / 9) * Math.PI * 2;
      const sx = Math.round(x + Math.cos(a) * 9);
      const sy = Math.round(y + Math.sin(a) * 5);
      if (k === 2) continue;
      cv.blend(sx + 1, sy + 1, SHADOW, 0.3);
      cv.blend(sx + 2, sy + 1, SHADOW, 0.2);
      for (let j = 0; j < 5; j += 1) { PX(cv, sx, sy - j, R.stone[5 - (j === 0 ? 1 : 0)]); PX(cv, sx + 1, sy - j, R.stone[2]); }
      PX(cv, sx, sy - 5, R.stone[6]);
    }
    for (let j = 0; j < 2; j += 1) for (let i = -1; i <= 2; i += 1) PX(cv, x + i, y - j, R.stone[j ? 5 : 3]);
  },
  scarecrow(cv, x, y) {
    cv.blend(x + 2, y + 1, SHADOW, 0.3); cv.blend(x + 3, y + 1, SHADOW, 0.25);
    for (let j = 0; j < 9; j += 1) PX(cv, x, y - j, R.wood[1]);
    for (let i = -3; i <= 3; i += 1) PX(cv, x + i, y - 6, R.wood[2]);
    for (let j = 0; j < 3; j += 1) for (let i = -1; i <= 1; i += 1) PX(cv, x + i, y - 5 + j, packHex(j === 0 ? '#e25b50' : '#b53e38'));
    PX(cv, x, y - 8, packHex('#f2d58a')); PX(cv, x - 1, y - 8, packHex('#f2d58a'));
    for (let i = -2; i <= 2; i += 1) PX(cv, x + i, y - 9, packHex('#2b3350'));
    PX(cv, x, y - 10, packHex('#2b3350')); PX(cv, x - 1, y - 10, packHex('#2b3350'));
  },
  hives(cv, x, y) {
    for (let k = 0; k < 3; k += 1) {
      const hx = x - 7 + k * 6;
      shadowEllipse(cv, hx + 2, y + 1, 3, 1.2, 0.3);
      for (let j = 0; j < 5; j += 1) {
        const half = j < 1 ? 1 : 2;
        for (let i = -half; i <= half; i += 1) PX(cv, hx + i, y - j, packHex(j % 2 ? '#e5b43a' : '#f7d169'));
      }
      PX(cv, hx, y - 1, packHex('#3a2a14'));
    }
    for (let k = 0; k < 5; k += 1) PX(cv, x - 8 + k * 4, y + 3, packHex(k % 2 ? '#ff86b8' : '#ffd84d'));
  },
  well(cv, x, y) {
    shadowEllipse(cv, x + 3, y + 2, 6, 2);
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -4; dx <= 4; dx += 1) if ((dx / 4.5) ** 2 + (dy / 2.5) ** 2 <= 1) PX(cv, x + dx, y + dy, Math.abs(dx) < 3 && Math.abs(dy) < 2 ? R.deep[1] : R.stone[dy < 0 ? 5 : 3]);
    for (let j = 1; j < 8; j += 1) { PX(cv, x - 4, y - j, R.wood[2]); PX(cv, x + 4, y - j, R.wood[1]); }
    for (let i = -5; i <= 5; i += 1) { PX(cv, x + i, y - 8, R.roof[0][3]); PX(cv, x + i, y - 9, R.roof[0][4]); }
    PX(cv, x, y - 6, R.wood[0]); PX(cv, x, y - 5, packHex('#8a6a48'));
  },
  balloon(cv, x, y) {
    shadowEllipse(cv, x + 6, y + 2, 5, 1.8, 0.28);
    for (let j = 0; j < 12; j += 1) PX(cv, x + Math.round(j * 0.15), y - j, packHex('#d9cdb2'));
    const cy = y - 22;
    for (let dy = -7; dy <= 7; dy += 1) {
      for (let dx = -6; dx <= 6; dx += 1) {
        const d = (dx / 6.2) ** 2 + ((dy + (dy > 0 ? dy * 0.2 : 0)) / 7) ** 2;
        if (d > 1) continue;
        const stripe = Math.floor((dx + 7) / 2.2) % 2;
        const lit = dx + dy < 0;
        PX(cv, x + 2 + dx, cy + dy, packHex(stripe ? (lit ? '#ff6b5a' : '#c9453b') : (lit ? '#ffe08a' : '#e0b44c')));
      }
    }
    for (let j = 0; j < 3; j += 1) { PX(cv, x - 1, cy + 8 + j, R.wood[1]); PX(cv, x + 5, cy + 8 + j, R.wood[1]); }
    for (let i = -1; i <= 5; i += 1) { PX(cv, x + i, cy + 11, R.wood[3]); PX(cv, x + i, cy + 12, R.wood[2]); }
  },
  seals(cv, x, y) {
    for (const [ox, oy] of [[-4, 0], [2, -1], [5, 2]]) {
      for (let i = 0; i < 4; i += 1) PX(cv, x + ox + i, y + oy, packHex(i === 0 ? '#5d6878' : '#8a95a6'));
      PX(cv, x + ox + 1, y + oy - 1, packHex('#a9b3c2'));
      PX(cv, x + ox, y + oy - 1, packHex('#5d6878'));
    }
  },
  arch(cv, x, y) {
    for (let j = 0; j < 12; j += 1) {
      for (let i = -9; i <= 9; i += 1) {
        const inArch = Math.abs(i) < 5 && j < 8 + Math.sqrt(Math.max(0, 25 - i * i)) * 0.4;
        if (inArch) continue;
        const lit = i < 0;
        PX(cv, x + i, y - j + 4, pick(R.rock, (lit ? 5 : 2.4) - j * 0.08 + (j > 10 ? 1 : 0), x + i, y - j));
      }
    }
    for (let i = -10; i <= 10; i += 2) PX(cv, x + i, y + 5, packHex('#eefcff'));
  },
  watchtower(cv, x, y) {
    shadowEllipse(cv, x + 6, y + 1, 7, 2);
    for (let j = 0; j < 17; j += 1) for (let i = -3; i <= 3; i += 1) PX(cv, x + i, y - j, R.stone[i < -1 ? 6 : i > 1 ? 2 : 4]);
    for (let i = -4; i <= 4; i += 1) { PX(cv, x + i, y - 17, R.stone[5]); if (i % 2 === 0) PX(cv, x + i, y - 18, R.stone[5]); }
    PX(cv, x - 1, y - 12, AMBER[1]); PX(cv, x, y - 12, AMBER[2]);
    PX(cv, x, y - 3, R.wood[0]); PX(cv, x, y - 4, R.wood[0]);
    PX(cv, x + 1, y - 20, packHex('#e25b50')); PX(cv, x + 2, y - 20, packHex('#e25b50')); for (let j = 18; j < 21; j += 1) PX(cv, x, y - j, R.wood[1]);
  },
  caravan(cv, x, y) {
    for (const [ox, c] of [[-6, ['#f0a12e', '#b8741c']], [5, ['#e9dfc6', '#b8ab8e']]]) {
      shadowEllipse(cv, x + ox + 3, y + 1, 5, 1.5, 0.28);
      for (let j = 0; j < 6; j += 1) for (let i = -j; i <= j; i += 1) PX(cv, x + ox + i, y - 6 + j, packHex(i < 0 ? c[0] : c[1]));
      PX(cv, x + ox, y - 1, R.wood[0]);
    }
    const camel = packHex('#c99552');
    for (const cx of [x - 14, x + 12]) {
      for (let i = 0; i < 5; i += 1) PX(cv, cx + i, y - 3, camel);
      PX(cv, cx + 1, y - 4, camel); PX(cv, cx + 3, y - 4, camel); PX(cv, cx + 5, y - 4, camel); PX(cv, cx + 5, y - 5, camel);
      PX(cv, cx, y - 2, packHex('#8a6030')); PX(cv, cx + 4, y - 2, packHex('#8a6030'));
    }
  },
  springs(cv, x, y) {
    for (const [ox, oy, r] of [[-4, 0, 3.4], [4, 2, 2.6], [1, -4, 2.2]]) {
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy += 1) for (let dx = -Math.ceil(r * 1.4); dx <= Math.ceil(r * 1.4); dx += 1) {
        const d = (dx / (r * 1.4)) ** 2 + (dy / r) ** 2;
        if (d > 1) continue;
        PX(cv, x + ox + dx, y + oy + dy, d > 0.7 ? R.stone[dy < 0 ? 5 : 3] : pick(R.lagoon, 3.4 - d * 2, x + dx, y + dy));
      }
    }
  },
  obelisk(cv, x, y) {
    shadowEllipse(cv, x + 6, y + 1, 7, 1.8);
    const L = [packHex('#8f7e63'), packHex('#b3a283'), packHex('#d2c3a2'), packHex('#e9dfc3')];
    for (let j = 0; j < 20; j += 1) { const w = j > 17 ? 0 : 1; for (let i = -w; i <= w + 1; i += 1) PX(cv, x + i, y - j, i < 0 ? L[3] : i === 0 ? L[2] : L[0]); }
    PX(cv, x, y - 20, packHex('#ffd54a')); PX(cv, x + 1, y - 20, packHex('#d9a21f')); PX(cv, x, y - 21, packHex('#fff2a8'));
    for (let j = 3; j < 17; j += 3) PX(cv, x, y - j, packHex('#9a6b12'));
    for (let i = -3; i <= 4; i += 1) PX(cv, x + i, y, L[1]);
  },
  fairyRing(cv, x, y) {
    for (let k = 0; k < 10; k += 1) {
      const a = (k / 10) * Math.PI * 2;
      const mx = Math.round(x + Math.cos(a) * 7);
      const my = Math.round(y + Math.sin(a) * 4);
      PX(cv, mx, my, packHex('#f4ead8'));
      PX(cv, mx - 1, my - 1, packHex('#e25b50')); PX(cv, mx, my - 1, packHex('#e25b50')); PX(cv, mx + 1, my - 1, packHex('#b53e38'));
      PX(cv, mx, my - 1, packHex(k % 3 ? '#e25b50' : '#fff1d6'));
    }
    glow(cv, x, y, 9, [200, 255, 170], 0.18);
  },
  kelp(cv, x, y) {
    for (let k = 0; k < 7; k += 1) {
      const kx = x - 9 + k * 3;
      for (let j = 0; j < 8 + (k % 3) * 2; j += 1) cv.blend(kx + Math.round(Math.sin(j * 0.6 + k) * 1.2), y + 4 - j, [34, 80, 52], 0.5);
    }
  },
  cairn(cv, x, y) {
    shadowEllipse(cv, x + 3, y + 1, 4, 1.4);
    const rows = [[-3, 3], [-2, 2], [-2, 1], [-1, 1], [0, 0]];
    rows.forEach(([a, b], j) => { for (let i = a; i <= b; i += 1) PX(cv, x + i, y - j * 2, R.stone[i < 0 ? 5 : 3]); for (let i = a; i <= b; i += 1) PX(cv, x + i, y - j * 2 - 1, R.stone[i < 0 ? 6 : 4]); });
  },
  bottle(cv, x, y) {
    for (let i = 0; i < 5; i += 1) PX(cv, x - 2 + i, y, packHex(i < 4 ? '#3f8f5a' : '#b98c58'));
    PX(cv, x - 1, y - 1, packHex('#8fd6a5')); PX(cv, x, y, packHex('#f6ead0'));
    for (let i = -4; i <= 5; i += 2) PX(cv, x + i, y + 2, packHex('#d9f5fb'));
  },
  statue(cv, x, y) {
    shadowEllipse(cv, x + 6, y + 1, 9, 2.4);
    for (let dy = -10; dy <= 0; dy += 1) {
      for (let dx = -7; dx <= 7; dx += 1) {
        if ((dx / 7.5) ** 2 + ((dy + 5) / 6.5) ** 2 > 1) continue;
        let c = pick(R.stone, 4.2 - (dx + dy + 5) * 0.12, x + dx, y + dy);
        if ((dy === -6 || dy === -5) && (dx === -3 || dx === 2)) c = R.stone[0];
        if (dy === -2 && dx > -3 && dx < 3) c = R.stone[1];
        if (dy === -4 && dx === 0) c = R.stone[2];
        if (hash2(x + dx, y + dy, 5) > 0.72 && dy < -6) c = R.oak[3];
        PX(cv, x + dx, y + dy, c);
      }
    }
  },
  goats(cv, x, y) {
    for (const [ox, oy] of [[-3, 0], [3, -3]]) {
      const gx = x + ox;
      const gy = y + oy;
      for (let i = 0; i < 4; i += 1) PX(cv, gx + i, gy, packHex('#f4f1ea'));
      PX(cv, gx + 3, gy - 1, packHex('#f4f1ea')); PX(cv, gx + 4, gy - 1, packHex('#d8d2c4'));
      PX(cv, gx + 4, gy - 2, packHex('#6b5a4a')); PX(cv, gx, gy + 1, packHex('#8a8070')); PX(cv, gx + 3, gy + 1, packHex('#8a8070'));
    }
  },
  frozenShip(cv, x, y) {
    for (let i = -8; i <= 8; i += 1) { PX(cv, x + i, y, R.wood[2]); if (Math.abs(i) < 7) PX(cv, x + i, y + 1, R.wood[1]); }
    for (let j = 1; j < 14; j += 1) PX(cv, x - 1 + Math.round(j * 0.15), y - j, R.wood[1]);
    for (let j = 0; j < 5; j += 1) for (let i = 0; i < 4 - (j >> 1); i += 1) PX(cv, x + i, y - 11 + j, packHex('#e9eef5'));
    for (let i = -10; i <= 10; i += 1) if (hash2(i, 0, 3) > 0.4) PX(cv, x + i, y + 2, R.ice[5]);
  },
  iceHut(cv, x, y) {
    shadowEllipse(cv, x + 4, y + 1, 6, 1.8);
    for (let j = 0; j < 6; j += 1) for (let i = -4; i <= 4; i += 1) PX(cv, x + i, y - j, i < 0 ? R.wood[4] : R.wood[2]);
    for (let j = 0; j < 3; j += 1) for (let i = -5 + j; i <= 5 - j; i += 1) PX(cv, x + i, y - 6 - j, R.roof[0][j ? 4 : 3]);
    PX(cv, x - 1, y - 2, AMBER[1]); PX(cv, x - 1, y - 1, AMBER[2]);
    for (let j = 0; j < 3; j += 1) PX(cv, x + 3, y - 9 - j, R.stone[3]);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -2; dx <= 2; dx += 1) PX(cv, x + 8 + dx, y + 1 + dy, Math.abs(dx) + Math.abs(dy) < 2 ? R.deep[2] : R.ice[3]);
  },
  bones(cv, x, y) {
    const bone = [packHex('#f4ecd8'), packHex('#d8ccb0'), packHex('#b8aa8c')];
    for (let k = 0; k < 5; k += 1) {
      const bx = x - 10 + k * 5;
      const h = 9 - Math.abs(k - 2) * 1.5;
      for (let j = 0; j < h; j += 1) {
        const off = Math.round(Math.sin((j / h) * Math.PI * 0.9) * 2);
        PX(cv, bx - off, y - j, bone[0]);
        PX(cv, bx + 3 + off, y - j, bone[1]);
      }
      PX(cv, bx + 1, y - h, bone[0]); PX(cv, bx + 2, y - h, bone[1]);
      for (let i = 0; i < 4; i += 1) cv.blend(bx + i + 1, y + 1, SHADOW, 0.25);
    }
    for (let i = -12; i <= 14; i += 1) PX(cv, x + i, y + 1, bone[2]);
  },
};

export function drawFind(cv, s) {
  const fn = FIND_SPRITES[s.sprite];
  if (fn) fn(cv, Math.round(s.X), Math.round(s.Y));
}
