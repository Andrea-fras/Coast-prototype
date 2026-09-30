/**
 * neonArt.js — paints Neon Meridian at 8 art pixels per tile, in the same
 * style as the Lumen Reaches (lit relief, dithered hue-shifted ramps, cliff
 * faces, sprites with shadows) but at night: moonlit ground, black water,
 * a street grid, thousands of lit windows, and neon that glows and reflects
 * on wet streets and water.
 */

import { ellipseDist } from './lumenWorld.js';
import { distanceField } from './lumenArt.js';
import { clamp, fbm, hash2, valueNoise } from './mapNoise.js';
import { makeCanvas, packHex, pick } from './lumenPalette.js';
import { drawCanopy, drawMountain } from './lumenProps.js';
import { MOON, N, NEON_PX, NIGHT_SHADOW, WINDOWS } from './neonPalette.js';
import {
  drawBuilding, drawChestNight, drawMaglev, drawMaglevStation, drawNeonFind, drawNeonLandmark, landmarkBase,
  maglevStationBase,
} from './neonProps.js';

const LAND = 1;
const SEA = 0;
const LAKE = 2;
const CANAL = 3;

const AVENUE = 12;
const GRID0 = 6;
const avenueLane = (p) => ((p - GRID0) % AVENUE + AVENUE) % AVENUE;
const ROADS = new Set(['avenue', 'street']);
const HARD = new Set(['avenue', 'street', 'quay', 'plaza', 'yard', 'lot', 'pad', 'canal']);
const LAMP = [[255, 207, 107], [191, 243, 255]];

export function renderNeonPixels(world) {
  const { size, scale: S, terrain } = world;
  const W = size * S;
  const cv = makeCanvas(W, W);
  const { px } = cv;
  const tileAt = (x, y) => terrain[clamp(y, 0, size - 1)][clamp(x, 0, size - 1)];
  const glows = [];

  /* 1 — land, sea, lake and canal pixels (canals are tile-exact) */
  const kind = new Uint8Array(W * W);
  const lake = world.ellipses.lakes[0];
  for (let Y = 0; Y < W; Y += 1) {
    const v = (Y + 0.5) / S;
    for (let X = 0; X < W; X += 1) {
      const u = (X + 0.5) / S;
      const i = Y * W + X;
      const t = terrain[Math.floor(v)][Math.floor(u)];
      if (t.k === 'canal') { kind[i] = CANAL; continue; }
      // Park ponds follow the same noise that placed them, so their shores are organic.
      if (t.b === 'park' && fbm(u * 0.16, v * 0.16, 247) + (valueNoise(u * 1.4, v * 1.4, 249) - 0.5) * 0.04 > 0.74) { kind[i] = LAKE; continue; }
      if (world.landField(u, v) < 0) { kind[i] = LAND; continue; }
      kind[i] = lake && Math.abs(u - lake.x) < lake.rx + 2 && Math.abs(v - lake.y) < lake.ry + 2 && ellipseDist(u, v, lake) < 0.4 ? LAKE : SEA;
    }
  }
  const landMask = new Uint8Array(W * W);
  const waterMask = new Uint8Array(W * W);
  for (let i = 0; i < kind.length; i += 1) {
    landMask[i] = kind[i] === LAND ? 1 : 0;
    waterMask[i] = kind[i] === LAND ? 0 : 1;
  }
  const dWater = distanceField(waterMask, W, W);
  const dLand = distanceField(landMask, W, W);

  /* 2 — terrace level per pixel (only the northern highlands rise) */
  const lvPx = new Int8Array(W * W).fill(-1);
  const tileIdx = new Int32Array(W * W).fill(-1);
  for (let Y = 0; Y < W; Y += 1) {
    const v = (Y + 0.5) / S;
    for (let X = 0; X < W; X += 1) {
      const i = Y * W + X;
      if (kind[i] !== LAND && kind[i] !== CANAL) continue;
      const u = (X + 0.5) / S;
      let tx = Math.floor(u);
      let ty = Math.floor(v);
      const t0 = tileAt(tx, ty);
      // City edges stay crisp; open land blends like paint.
      if (!HARD.has(t0.k) && !t0.built) {
        const wx = (valueNoise(u * 0.9, v * 0.9, 371) - 0.5) * 0.9;
        const wy = (valueNoise(u * 0.9, v * 0.9, 373) - 0.5) * 0.9;
        const t1 = tileAt(Math.floor(u + wx), Math.floor(v + wy));
        if (t1.lv >= 0 && !HARD.has(t1.k)) { tx = Math.floor(u + wx); ty = Math.floor(v + wy); }
      }
      tx = clamp(tx, 0, size - 1);
      ty = clamp(ty, 0, size - 1);
      tileIdx[i] = ty * size + tx;
      lvPx[i] = Math.max(0, terrain[ty][tx].lv);
    }
  }

  const hAt = (u, v) => {
    const x = u - 0.5;
    const y = v - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const h = (xx, yy) => { const t = tileAt(xx, yy); return t.lv < 0 ? 0 : t.h; };
    const a = h(x0, y0);
    const b = h(x0 + 1, y0);
    const c = h(x0, y0 + 1);
    const d = h(x0 + 1, y0 + 1);
    return { gx: (1 - fy) * (b - a) + fy * (d - c), gy: (1 - fx) * (c - a) + fx * (d - b) };
  };

  /* 3 — base colour */
  for (let Y = 0; Y < W; Y += 1) {
    const v = (Y + 0.5) / S;
    for (let X = 0; X < W; X += 1) {
      const i = Y * W + X;
      const u = (X + 0.5) / S;
      const k = kind[i];
      if (k === LAND) px[i] = landColor(terrain[Math.floor(tileIdx[i] / size)][tileIdx[i] % size], X, Y, u, v, i);
      else px[i] = waterColor(k, X, Y, u, v, i);
    }
  }

  function landColor(t, X, Y, u, v, i) {
    const n1 = valueNoise(u * 1.3, v * 1.3, 381) - 0.5;
    const grain = hash2(X, Y, 383);
    const sx = X % S;
    const sy = Y % S;
    const tx = Math.floor(X / S);
    const ty = Math.floor(Y / S);
    const nb = (dx, dy) => tileAt(tx + dx, ty + dy).k;
    const road = (k) => ROADS.has(k) || k === 'canal';
    switch (t.k) {
      case 'avenue':
      case 'street': {
        let c = pick(N.asphalt, (t.k === 'avenue' ? 1.6 : 2.3) + n1 * 0.8, X, Y, 0.6);
        // Sidewalks where the road meets the block.
        if ((sx === 0 && !road(nb(-1, 0))) || (sx === S - 1 && !road(nb(1, 0)))
          || (sy === 0 && !road(nb(0, -1))) || (sy === S - 1 && !road(nb(0, 1)))) {
          return pick(N.sidewalk, 2 + n1, X, Y, 0.5);
        }
        if (t.k === 'avenue') {
          const vx = avenueLane(tx) <= 1;
          const vy = avenueLane(ty) <= 1;
          if (vx && !vy && avenueLane(tx) === 0 && sx === S - 1 && Y % 8 < 4) c = packHex('#c9a13a');
          if (vy && !vx && avenueLane(ty) === 0 && sy === S - 1 && X % 8 < 4) c = packHex('#c9a13a');
          // Crosswalks at the mouths of intersections.
          if (vx && vy) {
            const edgeX = (avenueLane(tx) === 0 && sx < 2) || (avenueLane(tx) === 1 && sx > S - 3);
            const edgeY = (avenueLane(ty) === 0 && sy < 2) || (avenueLane(ty) === 1 && sy > S - 3);
            if ((edgeX && Y % 2 === 0) || (edgeY && X % 2 === 0)) c = N.sidewalk[3];
          }
        }
        if (grain > 0.995) c = N.asphalt[4];
        return c;
      }
      case 'quay': {
        if (dWater[i] <= 1.2) return (X + Y) % 4 < 2 ? packHex('#c9a13a') : N.asphalt[0];
        return pick(N.quay, 2.2 + n1, X, Y, 0.5);
      }
      case 'plaza': {
        const tile = ((X >> 2) + (Y >> 2)) % 2;
        return pick(N.concrete, 3 + tile * 0.8 + n1 * 0.6, X, Y, 0.4);
      }
      case 'yard': {
        if (X % 9 === 0 || Y % 7 === 0) return packHex('#8a7a2e');
        return pick(N.concrete, 2.4 + n1, X, Y, 0.5);
      }
      case 'lot': return pick(N.concrete, 1.8 + n1, X, Y, 0.5);
      case 'pad': {
        const cx = (X / S) - Math.round(X / S / 6) * 6;
        return pick(N.concrete, 3 + n1 * 0.6 + (Math.abs(cx) < 0.1 ? 1 : 0), X, Y, 0.4);
      }
      case 'park': {
        const path = Math.abs(valueNoise(u * 0.8, v * 0.8, 391) - 0.5) < 0.035;
        if (path) return grain > 0.96 ? packHex('#f5e3a0') : pick(N.sidewalk, 1.6, X, Y, 0.4);
        const { gx, gy } = hAt(u, v);
        if (grain > 0.985) return packHex('#4de0b0'); // glow-worms in the grass
        return pick(N.grass, 3 + (gx + gy) * 4 + n1 * 1.8, X, Y);
      }
      case 'solar': {
        const row = Math.floor(Y / 4);
        if (Y % 4 === 3 || X % 16 === 15) return N.asphalt[1]; // service lanes
        const cell = X % 3 === 2 || Y % 4 === 1;
        const sky = ((X - row * 2) % 13 + 13) % 13 < 2 ? 1.8 : 0; // moon glint along the rows
        return pick(N.solar, 2.6 + sky + (cell ? -0.9 : 0) + n1 * 0.5, X, Y, 0.4);
      }
      case 'rust':
      case 'scrap':
      case 'sand': {
        const bend = fbm(u * 0.07, v * 0.07, 393) * 7;
        const s1 = (u * 0.42 + v * 0.2 + bend) % 1;
        const face = s1 < 0 ? s1 + 1 : s1;
        const dune = face < 0.8 ? face * 1.4 : -1.2;
        if (t.k === 'scrap' && grain > 0.93) return grain > 0.985 ? N.metal[5] : N.metal[2];
        return pick(N.rust, 2.4 + dune + n1 * 0.8 + (t.k === 'sand' ? 1 : 0), X, Y, 0.8);
      }
      case 'rock':
      case 'peak':
      case 'pines':
      case 'scrub':
      default: {
        const { gx, gy } = hAt(u, v);
        const light = clamp((gx + gy) * 5.5, -1.6, 1.6);
        if (t.k === 'peak') return pick(N.snow, 3 + light * 2 + n1 * 1.2, X, Y);
        if (t.k === 'rock') return pick(N.rock, 3.6 + light * 2.4 + n1 * 1.4, X, Y);
        if (grain > 0.99) return packHex('#4de0b0');
        return pick(N.grass, 2.8 + light * 2 + n1 * 1.6, X, Y);
      }
    }
  }

  function waterColor(k, X, Y, u, v, i) {
    const n2 = valueNoise(u * 2.1, v * 2.1, 395) - 0.5;
    if (k === CANAL) {
      const edge = dWater[i] === 0 && (kind[i - 1] === LAND || kind[i + 1] === LAND || kind[i - W] === LAND || kind[i + W] === LAND);
      if (edge) return N.quay[3];
      return pick(N.shore, 0.8 + n2, X, Y, 0.6);
    }
    const shore = dLand[i] / S;
    if (dLand[i] <= 1.2) return N.shore[3];
    const wave = valueNoise(u * 0.8 + v * 0.2, v * 3.4, 397) > 0.84 ? 0.8 : 0;
    if (k === LAKE) return pick(N.shore, 2 - Math.min(shore, 2) + n2 + wave * 0.4, X, Y, 0.8);
    return pick(N.sea, 5 - Math.min(4.5, shore * 1.2) + n2 + wave, X, Y, 1);
  }

  /* 4 — cliffs below the northern highlands */
  const face = new Uint8Array(W * W);
  for (let X = 0; X < W; X += 1) {
    let remain = 0;
    let row = 0;
    let len = 0;
    for (let Y = 1; Y < W; Y += 1) {
      const i = Y * W + X;
      const above = lvPx[i - W];
      if (above >= 0 && above > lvPx[i]) {
        len = 6 + Math.round(valueNoise(X * 0.2, Y * 0.05, 399) * 3);
        remain = len;
        row = 0;
        cv.blend(X, Y - 1, MOON, 0.25);
      }
      if (remain > 0) {
        face[i] = 1;
        const striation = valueNoise(X * 0.55, Y * 0.12, 401) - 0.5;
        px[i] = kind[i] === CANAL
          ? (valueNoise(X * 0.9, Y * 0.18, 403) > 0.55 ? packHex('#e4f6ff') : N.shore[2])
          : pick(N.rock, 0.8 + (1 - row / len) * 3 + striation * 2, X, Y, 0.6);
        remain -= 1;
        row += 1;
        if (remain === 0) { cv.blend(X, Y + 1, NIGHT_SHADOW, 0.4); cv.blend(X, Y + 2, NIGHT_SHADOW, 0.22); }
      }
    }
  }

  /* 5 — street lights: sodium lamps line both sides of every avenue, so from
     above the city reads as a glowing grid; traffic leaves light on the lanes */
  const SODIUM = [255, 170, 80];
  for (let ty = 0; ty < size; ty += 1) {
    for (let tx = 0; tx < size; tx += 1) {
      const t = terrain[ty][tx];
      if (!ROADS.has(t.k)) continue;
      const vx = avenueLane(tx) <= 1;
      const vy = avenueLane(ty) <= 1;
      const avenue = t.k === 'avenue';
      if (!avenue && hash2(tx, ty, 405) > 0.3) continue;
      const lamps = [];
      if (avenue && vx && vy && avenueLane(tx) === 0 && avenueLane(ty) === 0) {
        lamps.push([tx * S, ty * S], [tx * S + 2 * S - 1, ty * S], [tx * S, ty * S + 2 * S - 1], [tx * S + 2 * S - 1, ty * S + 2 * S - 1]);
      } else if (avenue && vx && !vy) lamps.push([tx * S + (avenueLane(tx) === 0 ? 1 : S - 2), ty * S + 4]);
      else if (avenue && vy && !vx) lamps.push([tx * S + 4, ty * S + (avenueLane(ty) === 0 ? 1 : S - 2)]);
      else if (!avenue) lamps.push([tx * S + 1, ty * S + 1]);
      for (const [X, Y] of lamps) {
        const cool = hash2(tx, ty, 407) < (avenue ? 0.18 : 0.5);
        cv.put(X, Y, packHex(cool ? '#d8fbff' : '#ffe0a8'));
        glows.push({ x: X, y: Y, r: avenue ? 8 : 6, rgb: cool ? LAMP[1] : SODIUM, a: avenue ? 0.3 : 0.24 });
      }
      // Tail and head lights on the avenue lanes.
      if (avenue && !(vx && vy) && hash2(tx, ty, 409) < 0.45) {
        const along = Math.floor(hash2(tx, ty, 411) * (S - 2)) + 1;
        const lane = hash2(tx, ty, 413) < 0.5;
        const X = vx ? tx * S + (lane ? 3 : 5) : tx * S + along;
        const Y = vx ? ty * S + along : ty * S + (lane ? 3 : 5);
        const red = lane;
        cv.put(X, Y, packHex(red ? '#ff4d5e' : '#fff6d8'));
        cv.put(X + (vx ? 0 : 1), Y + (vx ? 1 : 0), packHex(red ? '#c2263a' : '#ffe9a8'));
        glows.push({ x: X, y: Y, r: 3, rgb: red ? [255, 60, 80] : [255, 240, 200], a: 0.35 });
      }
    }
  }

  /* 6 — sprites, painter-sorted: buildings, landmarks, trees, peaks, finds */
  const sprites = [];
  for (const b of world.buildings) sprites.push({ base: (b.y + b.d) * S, draw: () => drawBuilding(cv, b, S, glows), shadow: () => boxShadow(b.x * S + 1, (b.y + b.d) * S - 1, b.w * S - 2, b.h) });
  for (const e of world.entities) {
    if (e.type === 'find') {
      const X = e.x * S + S / 2;
      const Y = e.y * S + S - 1;
      sprites.push({ base: Y, draw: () => drawNeonFind(cv, X, Y, e.sprite, glows) });
    } else if (e.type === 'treasure_chest') {
      sprites.push({ base: e.y * S + S, draw: () => drawChestNight(cv, e.x * S + S / 2, e.y * S + S * 0.8, glows) });
    } else if (e.type !== 'holowhale') {
      sprites.push({ base: landmarkBase(e, S), draw: () => drawNeonLandmark(cv, e, S, glows) });
    }
  }
  const isleSeen = new Set();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      if (t.b !== 'isle' || t.lv < 0 || t.cd < 1.5) continue;
      const key = `${Math.round(x / 8)},${Math.round(y / 8)}`;
      if (isleSeen.has(key)) continue;
      isleSeen.add(key);
      const X = x * S + S / 2;
      const Y = y * S + S - 1;
      sprites.push({ base: Y, draw: () => {
        for (let yy = 0; yy < 4; yy += 1) for (let xx = -3; xx <= 3; xx += 1) cv.put(X + xx, Y - yy, yy === 3 ? N.roofRust[3] : N.metal[2]);
        cv.put(X - 1, Y - 2, WINDOWS.warm[2]);
        for (let yy = 0; yy < 14; yy += 1) cv.put(X + 5, Y - yy, N.metal[4]);
        cv.put(X + 5, Y - 14, NEON_PX.red);
        glows.push({ x: X + 5, y: Y - 14, r: 4, rgb: [255, 59, 92], a: 0.45 });
        glows.push({ x: X - 1, y: Y - 2, r: 5, rgb: [255, 207, 107], a: 0.3 });
      } });
    }
  }
  const taken = new Uint8Array(size * size);
  const peaks = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      if (t.lv < 0 || t.prop) continue;
      const r = hash2(x, y, 409);
      const X = x * S + S / 2 + (hash2(x, y, 411) - 0.5) * 4;
      const Y = y * S + S / 2 + (hash2(x, y, 413) - 0.5) * 4;
      if (t.hm > 0.24) peaks.push([t.hm + r * 0.08, x, y]);
      else if (t.k === 'pines' && r < 0.75) sprites.push({ base: Y, draw: () => drawCanopy(cv, X, Y - 4, 3.6 + r, N.tree, r, true), shadow: () => drop(X + 2, Y, 4, 2) });
      else if (t.k === 'park' && r < 0.3) sprites.push({ base: Y, draw: () => drawCanopy(cv, X, Y - 4, 3.2 + r * 2, N.tree, r, true), shadow: () => drop(X + 2, Y, 4, 2) });
      else if (t.k === 'scrub' && r < 0.08) sprites.push({ base: Y, draw: () => drawCanopy(cv, X, Y - 1, 2, N.tree, r, false) });
      else if (t.k === 'scrap' && r < 0.25) sprites.push({ base: Y, draw: () => drawCanopy(cv, X, Y - 2, 2.4 + r * 3, N.metal, r, false, 1.6), shadow: () => drop(X + 2, Y, 4, 1.6) });
      else if (t.k === 'street' && r < 0.04) sprites.push({ base: Y, draw: () => car(X, Y, r) });
      else if (t.k === 'rust' && r < 0.012) sprites.push({ base: Y, draw: () => camp(X, Y) });
    }
  }
  peaks.sort((a, b) => b[0] - a[0]);
  for (const [m, x, y] of peaks) {
    if (taken[y * size + x]) continue;
    const r1 = hash2(x, y, 415);
    const w = Math.round(18 + (m - 0.24) * 60 + r1 * 8);
    const hgt = Math.round(w * (0.62 + hash2(x, y, 417) * 0.3));
    const rad = Math.max(1, Math.round((w / S) * 0.5));
    for (let dy = -rad; dy <= rad; dy += 1) for (let dx = -rad; dx <= rad; dx += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) taken[ny * size + nx] = 1;
    }
    const X = x * S + S / 2;
    const Y = y * S + S * 0.9;
    const snowy = m > 0.4;
    sprites.push({ base: Y, draw: () => drawMountain(cv, X, Y, w, hgt, snowy, hash2(x, y, 419), false, { rock: N.rock, snow: N.snow, alpine: N.grass }), shadow: () => drop(X + w * 0.28, Y - 1, w * 0.6, w * 0.2) });
  }

  function drop(cx, cy, rx, ry) {
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy += 1) {
      for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx += 1) {
        const d = (dx / rx) ** 2 + (dy / ry) ** 2;
        if (d <= 1) cv.blend(cx + dx, cy + dy, NIGHT_SHADOW, 0.35 * (1 - d * 0.5));
      }
    }
  }
  function boxShadow(x0, base, w, h) {
    const len = Math.min(6, 2 + h / 12);
    for (let k = 0; k < len; k += 1) for (let x = 0; x < w; x += 1) cv.blend(x0 + x + k, base + 1 + k, NIGHT_SHADOW, 0.34 * (1 - k / len));
  }
  function camp(X, Y) {
    const x0 = Math.round(X);
    const y0 = Math.round(Y);
    for (let k = 0; k < 5; k += 1) for (let j = 0; j <= k; j += 1) { cv.put(x0 - 6 + j, y0 - 5 + k, N.rust[4]); cv.put(x0 - 6 - j, y0 - 5 + k, N.rust[2]); }
    cv.put(x0, y0, packHex('#ffd35d'));
    cv.put(x0 - 1, y0, packHex('#ff7726'));
    cv.put(x0 + 1, y0, packHex('#ff7726'));
    glows.push({ x: x0, y: y0, r: 9, rgb: [255, 140, 60], a: 0.4 });
  }
  function car(X, Y, r) {
    const cols = ['#c23b52', '#3b6fd1', '#d8d8e0', '#e0a53a', '#2aa39a'];
    const c = packHex(cols[Math.floor(r * 1000) % cols.length]);
    const x0 = Math.round(X) - 2;
    const y0 = Math.round(Y) - 1;
    for (let x = 0; x < 4; x += 1) { cv.put(x0 + x, y0, c); cv.put(x0 + x, y0 + 1, c); }
    cv.put(x0 + 1, y0, WINDOWS.cool[0]);
    cv.put(x0 + 3, y0 + 1, NEON_PX.red);
  }

  // The maglev guideway, painter-sorted a tile at a time, and its stations.
  const rail = world.maglev || [];
  const isWater = (X, Y) => X >= 0 && Y >= 0 && X < W && Y < W && kind[Y * W + X] !== LAND;
  for (let i0 = 0; i0 < rail.length; i0 += S) {
    const i1 = Math.min(rail.length, i0 + S);
    let base = 0;
    for (let i = i0; i < i1; i += 1) base = Math.max(base, Math.round(rail[i].y * S) + 1);
    sprites.push({ base, draw: () => drawMaglev(cv, rail, i0, i1, S, glows, isWater) });
  }
  for (const i of world.stations || []) {
    sprites.push({ base: maglevStationBase(rail[i], S), draw: () => drawMaglevStation(cv, rail[i], S, glows) });
  }

  for (const s of sprites) s.shadow?.();
  sprites.sort((a, b) => a.base - b.base);
  for (const s of sprites) s.draw();

  /* 7a — the shoreline mirrors the city: lit pixels above the water line are
     reflected, rippling, into the water just below */
  for (let X = 0; X < W; X += 1) {
    for (let Y = 1; Y < W - 1; Y += 1) {
      const i = Y * W + X;
      if (kind[i] === LAND || kind[i - W] !== LAND) continue;
      for (let k = 1; k <= 16; k += 1) {
        const y = Y + k - 1;
        const src = Y - Math.round(k * 1.4);
        if (y >= W || src < 0 || kind[y * W + X] === LAND) break;
        const c = px[src * W + X];
        const r = c & 255;
        const g = (c >> 8) & 255;
        const b = (c >> 16) & 255;
        if (r + g + b < 260) continue; // only lights reflect
        const wob = Math.round(Math.sin(y * 1.3 + X * 0.2) * 1.2);
        cv.blend(X + wob, y, [r, g, b], 0.34 * (1 - k / 17));
      }
    }
  }

  /* 7 — glow pass: neon light bleeds onto everything, and pools on wet
     streets and water as vertical reflections */
  for (const g of glows) {
    const r = Math.max(2, g.r);
    const R0 = Math.ceil(r);
    const cx = Math.round(g.x);
    const cy = Math.round(g.y);
    for (let dy = -R0; dy <= R0; dy += 1) {
      for (let dx = -R0; dx <= R0; dx += 1) {
        const d = Math.hypot(dx, dy) / r;
        if (d > 1) continue;
        cv.blend(cx + dx, cy + dy, g.rgb, g.a * (1 - d) * (1 - d));
      }
    }
    if (g.reflect) {
      const len = Math.round(r * 1.6);
      for (let k = 2; k < len; k += 1) {
        const y = cy + k;
        if (y < 0 || y >= W) break;
        const a = g.a * 0.7 * (1 - k / len);
        for (const ox of [-1, 0, 1]) {
          const x = cx + ox + Math.round(Math.sin(k * 0.9 + ox) * 0.6);
          const j = y * W + x;
          if (x < 0 || x >= W) continue;
          if (kind[j] !== LAND || ROADS.has(terrain[Math.floor(y / S)][Math.floor(x / S)].k)) cv.blend(x, y, g.rgb, a * (ox === 0 ? 1 : 0.5));
        }
      }
    }
  }

  return { width: W, height: W, data: new Uint8ClampedArray(px.buffer), masks: { kind, W } };
}
