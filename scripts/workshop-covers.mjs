// Pixel-art covers for the workshops made by Coast, drawn with the world map's own palette,
// dithering and sprites (src/components/WorldMap) so they sit next to the map covers of
// students' courses. Top-down like the map, lit from the north-west, shadows to the south-east.
//
//   node scripts/workshop-covers.mjs            → src/assets/workshop-covers/<name>.png (card, 160 × 90)
//                                                 and <name>-banner.png (course banner, 336 × 60)
//   node scripts/workshop-covers.mjs --preview  → also a 3× preview sheet (COVER_PREVIEW_DIR or the OS temp folder)
//   node scripts/workshop-covers.mjs --posts DIR → also 4:5 social-post art (1080 × 1350) in DIR
//
// Each scene is drawn in its own world coordinates; a card and a banner are two cameras onto
// it (the banner is wider and keeps the subject on the right, clear of the course title).
// The PNGs are native size; the app scales them with image-rendering: pixelated.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FOAM, R, SHADOW, hexToRgb, makeCanvas, packHex, pick } from '../src/components/WorldMap/lumenPalette.js';
import { drawBoat, drawCanopy, drawSprite, glow } from '../src/components/WorldMap/lumenProps.js';
import { N, NEON, WINDOWS } from '../src/components/WorldMap/neonPalette.js';
import { fbm, hash2, valueNoise } from '../src/components/WorldMap/mapNoise.js';

const OUT = new URL('../src/assets/workshop-covers/', import.meta.url).pathname;
const hex = packHex;
const ramp = (...h) => h.map(packHex);
const rgb = hexToRgb;

/* ------------------------------ camera ----------------------------------- */

/** A w × h canvas looking at the scene from (ox, oy): scenes draw in world coordinates. */
function view(w, h, ox, oy) {
  const base = makeCanvas(w, h);
  return {
    W: w, H: h, ox, oy, px: base.px, x0: ox, y0: oy, x1: ox + w, y1: oy + h,
    put: (x, y, c) => base.put(Math.round(x) - ox, Math.round(y) - oy, c),
    blend: (x, y, c, a) => base.blend(Math.round(x) - ox, Math.round(y) - oy, c, a),
  };
}

/* ------------------------------ helpers ---------------------------------- */

function rect(cv, x0, y0, w, h, c) {
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, y0 + y, c);
}

function shadeRect(cv, x0, y0, w, h, c, a) {
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) cv.blend(x0 + x, y0 + y, c, a);
}

function ellipseShadow(cv, cx, cy, rx, ry, a = 0.3, c = SHADOW) {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy += 1) {
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx += 1) {
      const d = (dx / rx) ** 2 + (dy / ry) ** 2;
      if (d <= 1) cv.blend(cx + dx, cy + dy, c, a * (1 - d * 0.5));
    }
  }
}

/** A tall object's shadow falling to the south-east along the ground. */
function castShadow(cv, x, y, len, width = 3, a = 0.26) {
  for (let k = 0; k < len; k += 1) for (let w = 0; w < width; w += 1) cv.blend(x + 1 + Math.round(k * 0.9) + w, y + Math.round(k * 0.45), SHADOW, a * (1 - k / (len * 1.4)));
}

/** Two-pass chamfer distance from every pixel of the view to the nearest pixel where mask = 1. */
function distanceTo(mask, W, H) {
  const d = new Float32Array(W * H).fill(1e9);
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) d[i] = 0;
  const nbA = [[-1, 0, 1], [0, -1, 1], [-1, -1, 1.414], [1, -1, 1.414]];
  const nbB = [[1, 0, 1], [0, 1, 1], [1, 1, 1.414], [-1, 1, 1.414]];
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const i = y * W + x;
    for (const [dx, dy, c] of nbA) { const X = x + dx; const Y = y + dy; if (X >= 0 && Y >= 0 && X < W) d[i] = Math.min(d[i], d[Y * W + X] + c); }
  }
  for (let y = H - 1; y >= 0; y -= 1) for (let x = W - 1; x >= 0; x -= 1) {
    const i = y * W + x;
    for (const [dx, dy, c] of nbB) { const X = x + dx; const Y = y + dy; if (X >= 0 && X < W && Y < H) d[i] = Math.min(d[i], d[Y * W + X] + c); }
  }
  return d;
}

/**
 * Paint sea and land over the whole view. land(x, y) → true for land (world coordinates).
 * The sea follows the map's own shading (lumenArt / neonArt at 8 px a tile): foam, then
 * shallow, mid, ocean and deep bands by distance from shore, with wave streaks one step
 * lighter. night uses the Neon Meridian ramps. Returns isLand(x, y).
 */
const TILE = 8;
function terrain(cv, land, { night = false, seed = 1, grass = null, beach = true, shore = null } = {}) {
  const { W, H, ox, oy } = cv;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) mask[y * W + x] = land(x + ox, y + oy) ? 1 : 0;
  const toWater = distanceTo(mask.map((v) => 1 - v), W, H);
  const toLand = distanceTo(mask, W, H);
  const GRASS = grass || (night ? N.grass : R.grass);
  const SHORE = shore || (night ? N.shore : R.sand);
  const sea = (X, Y, d) => {
    const u = X / TILE; const v = Y / TILE;
    const n2 = valueNoise(u * 2.1, v * 2.1, seed + 47) - 0.5;
    if (night) {
      if (d <= 1.2) return N.shore[3];
      const wave = valueNoise(u * 0.8 + v * 0.2, v * 3.4, seed + 397) > 0.84 ? 0.8 : 0;
      return pick(N.sea, 5 - Math.min(4.5, (d / TILE) * 1.2) + n2 + wave, X, Y, 1);
    }
    if (d <= 1.1) return hash2(X, Y, 61) > 0.28 ? FOAM : R.surf[1];
    if (d <= 2.2 && valueNoise(u * 5, v * 5, 67) > 0.45) return R.surf[0];
    const n1 = valueNoise(u * 0.6, v * 0.6, seed + 43) - 0.5;
    const depth = Math.min(d / TILE + n1 * 1.4, 7.4 + n1 * 1.2);
    const wave = valueNoise(u * 0.7 + v * 0.2, v * 3.1, seed + 59) > 0.86 ? 0.8 : 0;
    if (depth < 0.7) return pick(R.shallow, 4 - depth * 1.5 + n2, X, Y, 1);
    if (depth < 1.7) return pick(R.shallow, 3 - (depth - 0.7) * 2.6 + n2 + wave * 0.4, X, Y, 1);
    if (depth < 2.9) return pick(R.mid, 2.2 - (depth - 1.7) * 1.8 + n2 + wave * 0.6, X, Y, 1);
    const swell = (fbm(u * 0.05 * TILE / 8, v * 0.05 * TILE / 8, seed + 63) - 0.5) * 2.2;
    if (depth < 5.2) return pick(R.ocean, 3.2 - (depth - 2.9) * 1.35 + n2 + wave + swell * 0.5, X, Y, 1);
    return pick(R.deep, 3.1 - Math.min(2.6, (depth - 5.2) * 0.45) + n2 + wave + swell, X, Y, 1);
  };
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x; const X = x + ox; const Y = y + oy;
      if (!mask[i]) { cv.put(X, Y, sea(X, Y, toLand[i])); continue; }
      const inland = toWater[i];
      const tex = fbm(X * 0.09, Y * 0.09, seed + 3) - 0.5;
      const light = (fbm((X - 1) * 0.05, (Y - 1) * 0.05, seed + 5) - fbm((X + 1) * 0.05, (Y + 1) * 0.05, seed + 5)) * 18;
      if (beach && inland <= 2.2 + tex * 2) {
        cv.put(X, Y, inland <= 1 && !night ? R.wetSand[1] : pick(SHORE, SHORE.length * 0.55 + light + tex * 3, X, Y));
        continue;
      }
      cv.put(X, Y, pick(GRASS, GRASS.length * 0.5 + tex * 4.5 + light, X, Y, 0.9));
    }
  }
  const isLand = (x, y) => {
    const lx = Math.round(x) - ox; const ly = Math.round(y) - oy;
    return lx >= 0 && ly >= 0 && lx < W && ly < H ? mask[ly * W + lx] === 1 : land(x, y);
  };
  isLand.mask = mask;
  return isLand;
}

/**
 * The night map's shoreline mirror (neonArt 7a): lit pixels above the water line are
 * reflected, rippling, into the water just below.
 */
function reflectLights(cv, mask) {
  const { W, H, px, ox, oy } = cv;
  const src = px.slice();
  for (let x = 0; x < W; x += 1) {
    for (let y = 1; y < H - 1; y += 1) {
      if (mask[y * W + x] || !mask[(y - 1) * W + x]) continue;
      for (let k = 1; k <= 16; k += 1) {
        const ty = y + k - 1; const sy = y - Math.round(k * 1.4);
        if (ty >= H || sy < 0 || mask[ty * W + x]) break;
        const c = src[sy * W + x];
        const r = c & 255; const g = (c >> 8) & 255; const b = (c >> 16) & 255;
        if (r + g + b < 260) continue;
        const wob = Math.round(Math.sin(ty * 1.3 + x * 0.2) * 1.2);
        cv.blend(x + ox + wob, ty + oy, [r, g, b], 0.34 * (1 - k / 17));
      }
    }
  }
}

/** Evenly spaced points along a polyline. */
function along(route, step = 1) {
  const out = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    const [ax, ay] = route[i]; const [bx, by] = route[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let s = 0; s < n; s += 1) out.push([ax + (bx - ax) * (s / n), ay + (by - ay) * (s / n)]);
  }
  out.push(route[route.length - 1]);
  return out;
}

/* ------------------------------ PNG -------------------------------------- */

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png({ W, H, px }, scale = 1) {
  const w = W * scale; const h = H * scale;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = px[Math.floor(y / scale) * W + Math.floor(x / scale)];
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = c & 255; raw[o + 1] = (c >> 8) & 255; raw[o + 2] = (c >> 16) & 255;
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/* ------------------------------ shared sprites --------------------------- */

const SMOKE = ramp('#6d6a86', '#8b8aa3', '#aaaabd', '#c8c9d6', '#e2e3eb', '#f4f5f9', '#ffffff');
const FIRE = ramp('#b12e17', '#dd4a1c', '#f97726', '#ffa73a', '#ffd35d', '#fff3a6', '#ffffff');
const HULL = ramp('#8d8a9c', '#b9b2a5', '#d9d2c4', '#f0ebe0', '#fbf8f1');
const RED = ramp('#6e1f1c', '#8f2f2c', '#b53e38', '#e2574c', '#f07b6a');
const GLASS = ramp('#1c3a5c', '#24507a', '#2f6a98', '#3f86b4', '#5aa6cf', '#8cc9e6');
const puff = (cv, x, y, r, seed) => drawCanopy(cv, x, y, r, SMOKE, seed, false, 1.3);

/* ------------------------------ 1. Build a Rocket ------------------------ */

function rocketScene(cv) {
  // A cape reaching out from the west; open sea to the north and east.
  const land = (x, y) => {
    const coast = 58 + Math.sin(y * 0.09) * 6 + (fbm(x * 0.05, y * 0.05, 11) - 0.5) * 16;
    const cape = Math.hypot((x - 104) / 30, (y - 64) / 18) < 1 + (fbm(x * 0.08, y * 0.08, 13) - 0.5) * 0.35;
    return (x < coast + (y - 20) * 0.55 && y > 14 + Math.sin(x * 0.07) * 4 + (x < 0 ? (fbm(x * 0.04, 1, 3) - 0.5) * 18 : 0)) || cape;
  };
  const isLand = terrain(cv, land, { seed: 21 });

  // Road from the mission building to the pad.
  for (let x = cv.x0; x < 102; x += 1) {
    const y = Math.round(66 + Math.sin(x * 0.06) * 2);
    if (!isLand(x, y)) continue;
    for (let k = -1; k <= 1; k += 1) cv.put(x, y + k, pick(R.cobble, 4 - k * 0.6 + valueNoise(x * 0.5, y, 4) * 1.2, x, y + k));
  }
  // Launch pad: a round concrete apron, scorched in the middle.
  const PX = 108; const PY = 66;
  for (let dy = -9; dy <= 9; dy += 1) {
    for (let dx = -15; dx <= 15; dx += 1) {
      const d = Math.hypot(dx / 15, dy / 9);
      if (d > 1) continue;
      let idx = 4.3 - (dx + dy) * 0.07 + valueNoise(dx * 0.6, dy * 0.6, 8) * 0.8;
      if (d > 0.9) idx -= 1.5;
      cv.put(PX + dx, PY + dy, pick(R.cobble, idx, PX + dx, PY + dy));
      if (d < 0.55) cv.blend(PX + dx, PY + dy, [30, 24, 28], 0.35 * (1 - d / 0.55));
    }
  }
  // Mission control: flat roof, glass strip, a dish; and a hangar further inland.
  const building = (bx, by, w, dish) => {
    ellipseShadow(cv, bx + w * 0.6, by + 13, w * 0.5, 3, 0.3);
    rect(cv, bx, by, w, 4, R.stone[5]);
    rect(cv, bx, by + 4, w, 1, R.stone[3]);
    rect(cv, bx, by + 5, w, 7, R.plaster[4]);
    for (let x = 1; x < w - 1; x += 3) rect(cv, bx + x, by + 7, 2, 3, GLASS[x % 2 ? 4 : 3]);
    rect(cv, bx + Math.floor(w / 2) - 1, by + 8, 3, 4, R.wood[1]);
    for (let x = 0; x < w; x += 1) cv.put(bx + x, by + 12, R.plaster[1]);
    if (!dish) return;
    for (let y = 0; y < 3; y += 1) cv.put(bx + 5, by - 1 - y, R.stone[2]);
    for (let dx = -3; dx <= 3; dx += 1) cv.put(bx + 5 + dx, by - 4 - Math.round(Math.abs(dx) * 0.4), HULL[dx < 0 ? 4 : 2]);
    cv.put(bx + 5, by - 6, RED[3]);
  };
  building(18, 56, 26, true);
  building(-60, 50, 30, false);
  building(-104, 58, 20, true);

  // Palms and trees; boats on the sea.
  for (const [x, y, s] of [[10, 78, 0.2], [46, 84, 0.6], [62, 80, 0.4], [6, 42, 0.8], [34, 32, 0.3], [-30, 70, 0.5], [-80, 76, 0.1], [-120, 40, 0.7]]) {
    if (!isLand(x, y)) continue;
    ellipseShadow(cv, x + 3, y + 1, 4, 1.5, 0.25);
    drawSprite(cv, { kind: 'palm', X: x, Y: y, seed: s });
  }
  for (const [x, y, s] of [[50, 46, 0.3], [70, 38, 0.6], [24, 46, 0.8], [-20, 40, 0.4], [-45, 72, 0.2], [-90, 44, 0.9], [-130, 66, 0.35]]) {
    if (isLand(x, y)) drawCanopy(cv, x, y, 3, R.oak, s, true);
  }
  // A drone ship out at sea with a booster that has just landed on it.
  const DX = 138; const DY = 46;
  ellipseShadow(cv, DX + 9, DY + 3, 10, 2, 0.3);
  rect(cv, DX, DY, 18, 4, hex('#3a3d4a'));
  rect(cv, DX, DY, 18, 1, hex('#5d6170'));
  for (let x = 0; x < 18; x += 1) cv.put(DX + x, DY + 4, hex('#23252f'));
  for (const [x, y] of [[0, 0], [17, 0], [0, 3], [17, 3]]) cv.put(DX + x, DY + y, hex('#ffd35d'));
  for (let x = 6; x < 12; x += 1) cv.put(DX + x, DY + 2, hex('#e9e9ef'));   // the landing mark
  for (let y = 1; y <= 12; y += 1) {
    cv.put(DX + 8, DY + 1 - y, HULL[y > 9 ? 2 : 4]); cv.put(DX + 9, DY + 1 - y, HULL[y > 9 ? 1 : 2]);
  }
  cv.put(DX + 8, DY - 3, hex('#2b2a3d')); cv.put(DX + 9, DY - 3, hex('#1b1a28'));
  cv.put(DX + 7, DY + 1, HULL[1]); cv.put(DX + 10, DY + 1, HULL[1]);
  cv.put(DX + 6, DY + 2, HULL[1]); cv.put(DX + 11, DY + 2, HULL[1]);
  glow(cv, DX + 9, DY + 1, 5, [255, 170, 80], 0.25);
  for (let k = 0; k < 6; k += 1) cv.put(DX + 19 + k, DY + 3 + (k % 2), R.surf[0]);
  drawBoat(cv, 140, 80, 1);
  drawBoat(cv, 132, 22, 3);
  for (let k = 0; k < 7; k += 1) cv.put(152 + k, 82 + (k % 2), R.surf[1]);

  // Launch tower: red and white lattice with a service arm and a warning light.
  const TX = 96; const TB = 62;
  castShadow(cv, TX, TB, 30, 2, 0.24);
  for (let y = 0; y < 40; y += 1) {
    const band = Math.floor(y / 3) % 2 === 0;
    cv.put(TX, TB - y, band ? RED[3] : HULL[4]);
    cv.put(TX + 4, TB - y, band ? RED[2] : HULL[2]);
    if (y % 4 === 0) for (let x = 1; x < 4; x += 1) cv.put(TX + x, TB - y, RED[1]);
    if (y % 4 === 2) cv.put(TX + 2, TB - y, RED[1]);
  }
  for (let x = 5; x < 10; x += 1) cv.put(TX + x, TB - 30, RED[2]);
  cv.put(TX + 2, TB - 41, hex('#ff3b5c'));
  glow(cv, TX + 2, TB - 41, 4, [255, 80, 90], 0.4);

  // The rocket, just clear of the pad: a white-hot plume, fire and billowing smoke.
  const RX = 108; const RB = 44;
  for (let y = RB + 3; y <= PY; y += 1) {
    const t = (y - RB - 3) / (PY - RB - 3);   // 0 at the nozzle, 1 on the pad
    const half = 1.3 + t * 3.2;
    for (let x = -Math.ceil(half); x <= Math.ceil(half); x += 1) {
      const edge = Math.abs(x) / (half + 0.5);
      if (edge > 1) continue;
      cv.put(RX + x, y, pick(FIRE, 6.7 - t * 3.4 - edge * 3.6 + (hash2(x, y, 5) - 0.5) * 0.8, RX + x, y, 0.6));
    }
  }
  for (const [dx, dy, r, s] of [[-14, 3, 5, 0.1], [14, 2, 6, 0.3], [-7, 6, 5, 0.5], [7, 7, 6, 0.7], [0, 8, 5, 0.9],
    [-20, 6, 4, 0.2], [21, 6, 4, 0.4], [-11, -1, 4, 0.6], [11, -2, 4, 0.8], [26, 9, 3, 0.15], [-26, 8, 3, 0.45]]) {
    puff(cv, PX + dx, PY + dy - 2, r, s);
  }
  for (const [dx, dy] of [[-6, -1], [6, 0], [0, 3]]) cv.blend(PX + dx, PY + dy - 3, [255, 170, 80], 0.45);
  glow(cv, RX, PY - 3, 20, [255, 170, 80], 0.45);
  glow(cv, RX, RB + 6, 8, [255, 244, 210], 0.75);
  castShadow(cv, RX + 2, PY + 7, 12, 3, 0.18);
  for (let y = 0; y < 24; y += 1) {
    for (let x = -3; x <= 3; x += 1) {
      let c = HULL[x < -1 ? 4 : x < 1 ? 3 : x < 3 ? 2 : 1];
      if (y > 15 && y < 18) c = x < 1 ? hex('#2b2a3d') : hex('#1b1a28');
      if (y === 6 && Math.abs(x) <= 1) c = GLASS[4];
      cv.put(RX + x, RB - y, c);
    }
    cv.blend(RX + 3, RB - y, [255, 170, 80], y < 8 ? 0.35 : 0);  // firelight on the hull
  }
  for (let y = 0; y < 7; y += 1) {
    const half = Math.max(0, 3 - Math.floor(y / 2));
    for (let x = -half; x <= half; x += 1) cv.put(RX + x, RB - 24 - y, RED[x < 0 ? 4 : x === 0 ? 3 : 2]);
  }
  for (let y = 0; y < 5; y += 1) {
    cv.put(RX - 4 - Math.floor(y / 2), RB - 4 + y, RED[3]);
    cv.put(RX + 4 + Math.floor(y / 2), RB - 4 + y, RED[1]);
  }
  rect(cv, RX - 2, RB + 1, 5, 2, hex('#3a384f'));
  for (const [dx, dy] of [[-5, 11], [6, 13], [-3, 16], [4, 18], [-8, 14], [9, 9]]) cv.put(RX + dx, RB + dy, FIRE[5]);
}

/* ------------------------------ 2. Build Your Own LLM -------------------- */

const NIGHT_EDGE = [1, 2, 10];
const mod = (a, n) => ((a % n) + n) % n;

function llmScene(cv) {
  // A city quay at night: the city to the west and south, a bay to the north-east.
  const coast = (x) => 30 + (x - 70) * 0.35 + Math.sin(x * 0.11) * 2;
  const land = (x, y) => y > coast(x) || x < 40 + Math.sin(y * 0.2) * 2;
  const isLand = terrain(cv, land, { night: true, seed: 7, beach: false, grass: N.concrete });
  const TX = 88; const TB = 80; const TW = 22; const TH = 40;
  const CW = 26; const CH = 22;
  const streetX = (x) => mod(x, CW) < 4;
  const streetY = (y) => mod(y, CH) < 3;
  const plaza = (x, y) => x >= 82 && x < 118 && y >= 25 && y < 88;
  // Streets: asphalt with lane marks. The tower stands in a plaza of lit paving.
  for (let y = cv.y0; y < cv.y1; y += 1) for (let x = cv.x0; x < cv.x1; x += 1) {
    if (!isLand(x, y)) continue;
    if (streetX(x) || streetY(y)) {
      cv.put(x, y, pick(N.asphalt, 2.3 + valueNoise(x * 0.3, y * 0.3, 2), x, y));
      if (streetY(y) && !streetX(x) && mod(y, CH) === 1 && x % 4 === 0) cv.put(x, y, N.sidewalk[2]);
      if (streetX(x) && !streetY(y) && mod(x, CW) === 2 && y % 4 === 0) cv.put(x, y, N.sidewalk[2]);
    } else if (plaza(x, y)) {
      cv.put(x, y, N.sidewalk[(x + y) % 6 < 3 ? 1 : 0]);
      if (x % 6 === 0 && y % 5 === 0) cv.put(x, y, WINDOWS.cool[0]);
    }
  }
  // Traffic: headlights one way, tail lights the other.
  for (let k = Math.floor(cv.y0 / CH); k <= Math.ceil(cv.y1 / CH); k += 1) {
    const y = k * CH;
    for (let x = cv.x0; x < cv.x1; x += 1) {
      if (hash2(x, k, 31) < 0.955 || !isLand(x, y) || !isLand(x + 3, y + 2) || streetX(x) || streetX(x + 3)) continue;
      cv.put(x, y, hex('#fff1c9')); cv.put(x + 1, y, N.metal[3]); cv.put(x + 2, y, N.metal[3]); cv.put(x + 3, y, hex('#ff4a5c'));
      cv.blend(x - 1, y, [255, 241, 201], 0.4);
      x += 6;
    }
    for (let x = cv.x0; x < cv.x1; x += 1) {
      if (hash2(x, k, 37) < 0.96 || !isLand(x, y + 2) || !isLand(x + 3, y + 2) || streetX(x) || streetX(x + 3)) continue;
      cv.put(x, y + 2, hex('#ff4a5c')); cv.put(x + 1, y + 2, N.metal[3]); cv.put(x + 2, y + 2, N.metal[3]); cv.put(x + 3, y + 2, hex('#fff1c9'));
      cv.blend(x + 4, y + 2, [255, 241, 201], 0.4);
      x += 6;
    }
  }
  // Quay: a lit railing, and a maglev train gliding along the water's edge.
  const quay = [];
  for (let x = cv.x0; x < cv.x1; x += 1) {
    for (let y = cv.y0 + 1; y < cv.y1; y += 1) if (isLand(x, y) && !isLand(x, y - 1)) { quay.push([x, y]); break; }
  }
  for (const [x, y] of quay) {
    cv.put(x, y, N.quay[3]);
    cv.put(x, y + 2, hex('#1a5f7a'));
    if (x % 5 === 0) { cv.put(x, y - 1, hex(NEON.cyan)); cv.blend(x, y - 2, rgb(NEON.cyan), 0.4); }
  }
  const train = quay.filter(([x]) => x >= 124 && x < 142);
  for (const [x, y] of train) {
    rect(cv, x, y + 1, 1, 3, hex('#d8e6ff'));
    cv.put(x, y + 2, x % 3 === 0 ? N.metal[2] : WINDOWS.cool[2]);
  }
  if (train.length) glow(cv, train[train.length - 1][0] + 1, train[train.length - 1][1] + 2, 6, rgb(NEON.cyan), 0.45);

  const windows = (x0, y0, w, h, kind, seed, lit) => {
    for (let y = 1; y < h - 1; y += 2) for (let x = 1; x < w - 1; x += 2) {
      const on = hash2(x0 + x, y0 + y, seed) < lit;
      cv.put(x0 + x, y0 + y, on ? WINDOWS[kind][hash2(x, y, seed + 1) > 0.6 ? 2 : 1] : WINDOWS.dim);
    }
  };
  /** A block seen from the south: a flat roof on top, a lit facade below, shadow to the east. */
  const block = (b) => {
    const { x0, base, w, h, roofD, facade, roof, kind, seed, lit } = b;
    shadeRect(cv, x0 + w, base - h + 3, 4, h - 2, NIGHT_EDGE, 0.5);
    for (let y = 0; y < roofD; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, base - h - roofD + y, roof[y === 0 ? 5 : x < 2 ? 4 : 3]);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) cv.put(x0 + x, base - h + y, facade[x < 2 ? 4 : x > w - 3 ? 1 : 2]);
    windows(x0, base - h, w, h, kind, seed, lit);
    const top = base - h - roofD;
    if (hash2(x0, base, 17) > 0.5) {  // air-conditioning units on the roof
      const ax = x0 + 2 + Math.floor(hash2(x0, 5, 3) * (w - 5));
      rect(cv, ax, top + 1, 2, 1, N.metal[4]); cv.put(ax + 2, top + 2, N.metal[3]);
    }
    if (hash2(x0, base, seed) > 0.6) {  // a mast with a red light
      const ax = x0 + 2 + Math.floor(hash2(x0, 3, seed) * (w - 4));
      cv.put(ax, top - 1, N.metal[4]); cv.put(ax, top - 2, hex(NEON.red));
    }
    if (b.trim) {  // a neon strip along the roof's front edge
      for (let x = 0; x < w; x += 1) cv.put(x0 + x, base - h - 1, hex(b.trim));
      glow(cv, x0 + w / 2, base - h - 1, w / 2 + 2, rgb(b.trim), 0.18);
    }
    if (b.sign) {  // a vertical neon sign on the facade
      const sx = x0 + w - 3;
      for (let k = 0; k < Math.min(5, h - 3); k += 1) cv.put(sx, base - h + 2 + k, hex(b.sign));
      glow(cv, sx, base - h + 4, 5, rgb(b.sign), 0.35);
    }
  };
  const blocks = [];
  const facades = [N.facade, N.brick, N.glass, N.facade];
  const roofs = [N.roof, N.roofPlum, N.roofTeal, N.roofRust];
  const kinds = ['warm', 'pink', 'cool', 'warm'];
  const neon = [NEON.magenta, NEON.yellow, NEON.cyan, NEON.pink, NEON.green, NEON.violet];
  for (let gy = Math.floor(cv.y0 / CH); gy <= Math.ceil((cv.y1 + 20) / CH); gy += 1) {
    for (let gx = Math.floor(cv.x0 / CW) - 1; gx <= Math.ceil(cv.x1 / CW); gx += 1) {
      const cx0 = gx * CW + 5; const base = gy * CH + CH;
      if (cx0 + CW - 7 > 82 && cx0 < 118 && base > 25 && base <= 88) continue;   // the tower's plaza
      if (hash2(gx, gy, 12) < 0.12 && isLand(cx0, base - 10) && isLand(cx0 + CW - 8, base - 10)) {
        blocks.push({ park: true, x0: cx0 - 1, base, w: CW - 5 });
        continue;
      }
      const parts = hash2(gx, gy, 14) < 0.45 ? [[cx0, 9], [cx0 + 10, 9]] : [[cx0, CW - 7]];
      for (const [x0, w] of parts) {
        const h = 9 + Math.floor(hash2(x0, gy, 5) * 10);
        const roofD = 4 + (h % 3);
        if (!isLand(x0, base - roofD) || !isLand(x0 + w - 1, base - roofD)) continue;
        const v = Math.floor(hash2(x0, gy, 8) * 4);
        blocks.push({
          x0, base, w, h, roofD, facade: facades[v], roof: roofs[v], kind: kinds[v], seed: gx * 7 + gy + x0,
          lit: 0.35 + hash2(gx, gy, 9) * 0.4,
          sign: hash2(x0, base, 21) > 0.62 ? neon[Math.floor(hash2(x0, 4, 3) * neon.length)] : null,
          trim: hash2(x0, base, 23) > 0.8 ? neon[Math.floor(hash2(x0, 6, 5) * neon.length)] : null,
        });
      }
    }
  }
  // Plaza trees and benches of light around the tower.
  for (const [x, y] of [[86, 84], [114, 84], [84, 52], [114, 60], [96, 30]]) {
    if (isLand(x, y)) { drawCanopy(cv, x, y, 2.4, N.tree, x * 0.01, false); cv.blend(x, y + 3, [120, 255, 200], 0.25); }
  }
  // The tower: glass with cyan light lines and an antenna, drawn in depth order with the blocks.
  const tower = () => {
    shadeRect(cv, TX + TW, TB - TH + 6, 7, TH - 4, NIGHT_EDGE, 0.55);
    for (let y = 0; y < 7; y += 1) for (let x = 0; x < TW; x += 1) cv.put(TX + x, TB - TH - 7 + y, N.roof[y === 0 ? 5 : x < 3 ? 4 : 2]);
    for (let y = 0; y < TH; y += 1) {
      for (let x = 0; x < TW; x += 1) {
        let c = N.glass[x < 3 ? 5 : x > TW - 4 ? 1 : 3];
        if (x % 4 === 1 && y % 3 !== 0) c = WINDOWS.cool[(y + x) % 5 === 0 ? 2 : 1];
        if (y % 9 === 8) c = hex('#1f7a93');
        cv.put(TX + x, TB - TH + y, c);
      }
    }
    for (let x = 0; x < TW; x += 1) cv.put(TX + x, TB - TH - 1, hex(NEON.cyan));
    for (let y = 0; y < 5; y += 1) cv.put(TX + 15, TB - TH - 8 - y, N.metal[4]);
    cv.put(TX + 15, TB - TH - 13, hex(NEON.magenta));
    glow(cv, TX + 15, TB - TH - 13, 5, rgb(NEON.magenta), 0.5);
    rect(cv, TX + 8, TB - 5, 6, 5, WINDOWS.cool[2]);
    glow(cv, TX + 11, TB - 1, 10, rgb(NEON.cyan), 0.32);
  };
  const draws = [...blocks.map((b) => ({ base: b.base, b })), { base: TB, tower: true }].sort((a, b) => a.base - b.base);
  for (const d of draws) {
    if (d.tower) { tower(); continue; }
    const { b } = d;
    if (b.park) {  // a pocket park: lawn, a lamp-lit path and trees
      for (let y = b.base - CH + 3; y < b.base; y += 1) for (let x = b.x0; x < b.x0 + b.w; x += 1) {
        if (isLand(x, y)) cv.put(x, y, pick(N.grass, 3.6 + (fbm(x * 0.2, y * 0.2, 9) - 0.5) * 3, x, y));
      }
      for (let x = b.x0; x < b.x0 + b.w; x += 1) cv.put(x, b.base - 9, N.sidewalk[1]);
      for (const [dx, dy, r] of [[4, -15, 2.6], [11, -16, 2.2], [17, -14, 2.6], [5, -4, 2.2], [16, -3, 2.4]]) {
        drawCanopy(cv, b.x0 + dx, b.base + dy, r, N.tree, (b.x0 + dx) * 0.013, false);
      }
      cv.put(b.x0 + 10, b.base - 10, hex('#ffd98a'));
      glow(cv, b.x0 + 10, b.base - 9, 6, [255, 214, 140], 0.3);
      continue;
    }
    block(b);
  }
  // Street lamps at the crossings.
  for (let gy = Math.floor(cv.y0 / CH); gy <= Math.ceil(cv.y1 / CH); gy += 1) {
    for (let gx = Math.floor(cv.x0 / CW); gx <= Math.ceil(cv.x1 / CW); gx += 1) {
      const x = gx * CW + 2; const y = gy * CH + 1;
      if (isLand(x, y) && isLand(x, y - 4)) { cv.put(x, y, hex('#ffd98a')); glow(cv, x, y, 4, [255, 200, 120], 0.3); }
    }
  }
  // Hologram above the antenna: a chat bubble with three dots.
  const BX = TX + 1; const BY = TB - TH - 32;
  glow(cv, BX + 10, BY + 6, 20, rgb(NEON.cyan), 0.3);
  for (let y = 0; y < 13; y += 1) {
    for (let x = 0; x < 21; x += 1) {
      if ((x === 0 || x === 20) && (y === 0 || y === 12)) continue;
      if (x === 0 || x === 20 || y === 0 || y === 12) cv.put(BX + x, BY + y, hex('#8ff6ff'));
      else cv.blend(BX + x, BY + y, [39, 230, 255], 0.26);
    }
  }
  for (let k = 0; k < 3; k += 1) for (let x = 0; x < 3 - k; x += 1) cv.put(BX + 14 - x, BY + 13 + k, hex('#8ff6ff'));
  for (const dx of [5, 9, 13]) rect(cv, BX + dx, BY + 5, 2, 2, hex('#ffffff'));
  for (let y = BY + 16; y < TB - TH - 13; y += 1) cv.blend(TX + 15, y, [143, 246, 255], 0.55);
  // Tokens: glowing packets streaming across the bay into the tower.
  const colors = [NEON.magenta, NEON.yellow, NEON.cyan, NEON.violet, NEON.green];
  const [sx, sy] = [cv.x1 - 2, 26]; const [ex, ey] = [TX + TW + 2, TB - TH - 4];
  const n = Math.max(10, Math.round((sx - ex) / 5));
  for (let k = 0; k < n; k += 1) {
    const t = k / (n - 1);
    const x = Math.round(sx + (ex - sx) * t);
    const y = Math.round(sy + (ey - sy) * t - Math.sin(t * Math.PI) * 9);
    const c = colors[k % colors.length];
    const s = t > 0.85 ? 1 : 2;
    rect(cv, x, y, s + 1, s, hex(c));
    glow(cv, x + 1, y, 4, rgb(c), 0.32);
    if (!isLand(x, y + 12)) cv.blend(x, y + 12, rgb(c), 0.3);
  }
}

/* ------------------------------ 3. Build a Brain ------------------------- */

const MOSS = ramp('#0c262c', '#10313a', '#153d47', '#1b4a54', '#225a62', '#2a6b70');
const PATH = hex('#3cc6d6');
const PATH_EDGE = hex('#2395ab');
const PATH_HI = hex('#b4f6ff');

function brainScene(cv) {
  // An island shaped like a neuron: dendrites branching west, a round cell body, and a long
  // axon causeway east to a terminal island. A neighbouring neuron to the west (only the wide
  // banner sees it) reaches in with its axon to a synapse on a dendrite tip.
  const seg = (px, py, ax, ay, bx, by) => {
    const vx = bx - ax; const vy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    return [Math.hypot(px - ax - vx * t, py - ay - vy * t), t];
  };
  const SOMA = [88, 46];
  const dendrites = [ // [ax, ay, bx, by, width at start, width at end]
    [88, 46, 58, 20, 7, 3], [58, 20, 40, 8, 3, 1.6], [58, 20, 42, 28, 2.4, 1.4], [40, 8, 22, 2, 1.6, 1],
    [88, 46, 52, 44, 7, 3], [52, 44, 28, 36, 3, 1.5], [52, 44, 30, 54, 2.6, 1.4], [28, 36, 8, 30, 1.5, 1],
    [88, 46, 60, 74, 7, 3], [60, 74, 40, 84, 3, 1.5], [60, 74, 66, 90, 2.4, 1.4], [40, 84, 20, 88, 1.5, 1],
    [88, 46, 84, 14, 5, 2.2], [84, 14, 76, 2, 2.2, 1.2], [88, 46, 96, 78, 5, 2.4],
  ];
  const AXON = [[100, 48], [146, 50]];
  const TERM = [[150, 50], [158, 40], [161, 60], [146, 60]];
  const FAR = [-62, 36];
  const farDendrites = [[-62, 36, -94, 16, 5, 2], [-62, 36, -98, 44, 5, 2], [-62, 36, -86, 70, 4, 1.6],
    [-94, 16, -110, 6, 2, 1], [-98, 44, -124, 50, 2, 1], [-62, 36, -64, 6, 4, 1.6], [-62, 36, -46, 66, 4, 1.6]];
  const farAxon = [[-52, 35], [1, 30]];
  const land = (x, y) => {
    let inside = Math.hypot(x - SOMA[0], y - SOMA[1]) < 13 + (fbm(x * 0.2, y * 0.2, 4) - 0.5) * 3;
    if (Math.hypot(x - FAR[0], y - FAR[1]) < 9 + (fbm(x * 0.2, y * 0.2, 5) - 0.5) * 3) inside = true;
    for (const [ax, ay, bx, by, w0, w1] of [...dendrites, ...farDendrites]) {
      const [d, t] = seg(x, y, ax, ay, bx, by);
      if (d < w0 + (w1 - w0) * t + (fbm(x * 0.25, y * 0.25, 6) - 0.5) * 1.6) inside = true;
    }
    if (seg(x, y, ...AXON[0], ...AXON[1])[0] < 1.6) inside = true;
    if (seg(x, y, ...farAxon[0], ...farAxon[1])[0] < 1.4) inside = true;
    if (Math.hypot(x - 1, y - 30) < 2.6) inside = true;
    if (Math.hypot(x - 150, y - 50) < 8) inside = true;
    for (const [bx, by] of TERM.slice(1)) if (seg(x, y, 150, 50, bx, by)[0] < 2.2) inside = true;
    return inside;
  };
  const isLand = terrain(cv, land, { night: true, seed: 17, grass: MOSS });
  // Glowing pathways down each dendrite, with bioluminescent plants along the edges.
  const flow = (list, cx, cy, r) => {
    for (const [ax, ay, bx, by, w0] of list) {
      const len = Math.hypot(bx - ax, by - ay);
      for (let s = 0; s <= len; s += 1) {
        const x = Math.round(ax + (bx - ax) * (s / len)); const y = Math.round(ay + (by - ay) * (s / len));
        if (Math.hypot(x - cx, y - cy) < r) continue;
        if (w0 > 4) { cv.put(x + 1, y, PATH_EDGE); cv.put(x, y + 1, PATH_EDGE); }
        cv.put(x, y, s % 3 === 0 ? PATH_HI : PATH);
        if (w0 > 2 && s % 4 === 1) {
          for (const side of [-1, 1]) {
            const tx = x + Math.round(side * (w0 * 0.6) * (by - ay) / len); const ty = y - Math.round(side * (w0 * 0.6) * (bx - ax) / len);
            if (!isLand(tx, ty)) continue;
            const c = ['#7cf0ff', '#b69cff', '#ff8fd6', '#8dffc4'][Math.floor(hash2(tx, ty, 4) * 4)];
            cv.put(tx, ty, hex(c)); cv.blend(tx, ty - 1, rgb(c), 0.35);
          }
        }
      }
    }
  };
  flow(dendrites, SOMA[0], SOMA[1], 14);
  flow(farDendrites, FAR[0], FAR[1], 10);
  // Axons: causeways with lamp posts at their nodes.
  const causeway = ([ax, ay], [bx, by], lamp) => {
    for (let x = ax; x <= bx; x += 1) {
      const y = Math.round(ay + (x - ax) * ((by - ay) / (bx - ax)));
      cv.put(x, y - 1, N.quay[3]); cv.put(x, y, N.quay[1]); cv.put(x, y + 1, N.quay[0]);
      if ((x - ax) % 8 === 4) { cv.put(x, y - 2, hex(lamp)); glow(cv, x, y - 2, 3, rgb(lamp), 0.35); }
    }
  };
  causeway(AXON[0], AXON[1], NEON.cyan);
  causeway(farAxon[0], farAxon[1], NEON.violet);
  // The synapse: a gap between the axon terminal and the dendrite tip, sparking across.
  glow(cv, 5, 30, 8, rgb(NEON.violet), 0.55);
  for (const [x, y] of [[3, 29], [5, 31], [6, 29], [4, 30]]) cv.put(x, y, hex('#e7dcff'));
  // Signals: bright pulses racing along the dendrites towards the cell body.
  const pulses = [[58, 20, 88, 46, 0.6, NEON.cyan], [52, 44, 88, 46, 0.5, NEON.violet], [60, 74, 88, 46, 0.62, NEON.pink],
    [40, 8, 58, 20, 0.45, NEON.cyan], [28, 36, 52, 44, 0.5, NEON.green], [84, 14, 88, 46, 0.4, NEON.yellow],
    [30, 54, 52, 44, 0.3, NEON.cyan], [40, 84, 60, 74, 0.5, NEON.violet], [8, 30, 28, 36, 0.55, NEON.violet],
    [-94, 16, -62, 36, 0.5, NEON.pink], [-98, 44, -62, 36, 0.6, NEON.cyan]];
  for (const [ax, ay, bx, by, t, c] of pulses) {
    for (let k = 1; k < 8; k += 1) {
      const tt = t - k * 0.035;
      cv.blend(ax + (bx - ax) * tt, ay + (by - ay) * tt, rgb(c), 0.9 - k * 0.11);
    }
    const x = Math.round(ax + (bx - ax) * t); const y = Math.round(ay + (by - ay) * t);
    glow(cv, x, y, 8, rgb(c), 0.55);
    rect(cv, x - 1, y - 1, 3, 3, hex(c));
    cv.put(x, y, hex('#ffffff'));
  }
  // Action potentials racing down both axons.
  for (const [x, y, c, a] of [[130, 49, NEON.yellow, [255, 225, 77]], [-18, 32, NEON.pink, [255, 122, 209]]]) {
    for (let k = 0; k < 12; k += 1) cv.blend(x - 1 - k, y, a, 1 - k * 0.08);
    glow(cv, x, y, 10, rgb(c), 0.6);
    rect(cv, x - 1, y - 1, 3, 2, hex('#fff6c2'));
    cv.put(x, y - 1, hex('#ffffff'));
  }
  // Terminal island: lit buildings where the signal arrives.
  for (const [x, y, c] of [[145, 46, 'cool'], [151, 43, 'pink'], [149, 52, 'warm'], [155, 49, 'cool']]) {
    rect(cv, x, y, 4, 2, N.roof[4]);
    rect(cv, x, y + 2, 4, 3, N.facade[3]);
    cv.put(x + 1, y + 3, WINDOWS[c][2]); cv.put(x + 3, y + 3, WINDOWS[c][1]);
  }
  glow(cv, 151, 49, 13, rgb(NEON.violet), 0.3);
  // Cell bodies: glass domes lit from inside, ringed by a plaza of lights.
  const dome = ([cx, cy], r, core) => {
    for (let a = 0; a < 16; a += 1) {
      cv.put(cx + Math.round(Math.cos(a / 16 * Math.PI * 2) * (r + 1)), cy + 2 + Math.round(Math.sin(a / 16 * Math.PI * 2) * (r * 0.7)), hex('#7cf0ff'));
    }
    ellipseShadow(cv, cx + 3, cy + 6, r, 3, 0.45, NIGHT_EDGE);
    const DOME = ramp('#123a5c', '#1b5a82', '#2a86ad', '#4fc2dc', '#9af1ff');
    for (let dy = 0; dy <= r; dy += 1) {
      const half = Math.round(Math.sqrt(1 - (dy / (r + 0.5)) ** 2) * r);
      for (let x = -half; x <= half; x += 1) {
        const l = (-x - dy * 0.7) / (r * 0.8);
        cv.put(cx + x, cy + 4 - dy, pick(DOME, 2 + l * 1.6, cx + x, cy - dy));
      }
    }
    for (let dy = 1; dy < r; dy += 1) cv.blend(cx + 2, cy + 4 - dy, [230, 250, 255], 0.35);
    glow(cv, cx, cy - 1, r * 1.8, [90, 220, 255], 0.35);
    rect(cv, cx - 2, cy + 1, 4, 4, hex(core));
    glow(cv, cx, cy + 3, 6, rgb(core), 0.55);
  };
  dome(SOMA, 11, '#ffe9a8');
  dome(FAR, 8, '#ffc2ea');
  // Plankton glowing in the water near the shore.
  for (let k = 0; k < 60; k += 1) {
    const x = Math.floor(cv.x0 + hash2(k, 3, 9) * cv.W); const y = Math.floor(cv.y0 + hash2(k, 7, 9) * cv.H);
    if (isLand(x, y)) continue;
    let near = false;
    for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-4, -4], [4, 4], [4, -4], [-4, 4]]) if (isLand(x + dx, y + dy)) near = true;
    if (near) { cv.put(x, y, hex('#b8f3ff')); cv.blend(x + 1, y, [184, 243, 255], 0.4); }
  }
}

/* ------------------------------ 4. Memory Palace -------------------------- */

const LIME = ramp('#6e5f4a', '#8f7e63', '#b3a283', '#d2c3a2', '#e9dfc3', '#fbf5e3');
const GOLD = ramp('#9a6b12', '#d9a21f', '#ffd54a', '#fff2a8');

function palaceScene(cv) {
  const land = (x, y) => {
    const main = Math.hypot((x - 92) / 80, (y - 50) / 34) < 1 + (fbm(x * 0.06, y * 0.06, 31) - 0.5) * 0.5;
    const islet = Math.hypot((x + 44) / 26, (y - 34) / 14) < 1 + (fbm(x * 0.08, y * 0.08, 32) - 0.5) * 0.5;
    return main || islet;
  };
  const isLand = terrain(cv, land, { seed: 33, grass: R.meadow });
  // The route: from the pier, past five memory stops, up to the palace steps.
  const stops = [[26, 50], [48, 55], [70, 49], [90, 54], [108, 47]];
  const points = along([[-4, 54], [10, 54], ...stops, [120, 44], [130, 42]]);
  for (const [x, y] of points) {
    const X0 = Math.round(x); const Y0 = Math.round(y);
    if (!isLand(X0, Y0)) {  // the pier
      for (let dy = -1; dy <= 2; dy += 1) cv.put(X0, Y0 + dy, dy === 2 ? R.wood[1] : R.wood[X0 % 3 === 0 ? 2 : 4]);
      continue;
    }
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const X = X0 + dx; const Y = Y0 + dy;
      cv.put(X, Y, pick(R.cobble, 4.2 - (dx + dy) * 0.4 + valueNoise(X * 0.6, Y * 0.6, 2) * 1.1, X, Y));
    }
  }
  drawBoat(cv, -10, 62, 2);
  drawBoat(cv, -70, 52, 1);
  drawBoat(cv, 176, 30, 3);
  for (const [x, y, rmp, s, r] of [[40, 34, R.blossom, 0.2, 4], [60, 28, R.oak, 0.5, 4], [84, 32, R.oak, 0.3, 3.5],
    [98, 68, R.oak, 0.7, 3.5], [58, 70, R.blossom, 0.4, 4], [122, 64, R.blossom, 0.6, 4], [150, 58, R.oak, 0.9, 3.5],
    [30, 64, R.oak, 0.8, 3], [78, 76, R.blossom, 0.1, 3.5], [140, 72, R.oak, 0.35, 3], [20, 42, R.oak, 0.55, 3],
    [-44, 30, R.blossom, 0.6, 3.5], [-32, 36, R.oak, 0.1, 3]]) {
    if (!isLand(x, y)) continue;
    ellipseShadow(cv, x + r * 0.6, y + r * 1.3, r, r * 0.5, 0.25);
    drawCanopy(cv, x, y, r, rmp, s, true);
  }
  // The palace: a limestone temple with columns and a golden pediment, seen from the south.
  const PX = 136; const PB = 40;
  ellipseShadow(cv, PX + 8, PB + 2, 24, 4, 0.3);
  for (let y = 0; y < 4; y += 1) for (let x = -22 + y; x <= 22 - y; x += 1) cv.put(PX + x, PB - y, LIME[y === 3 ? 5 : x > 18 - y ? 1 : 3]);
  for (let y = 4; y < 17; y += 1) {
    for (let x = -18; x <= 18; x += 1) {
      const col = (x + 18) % 6;
      const c = col === 0 ? LIME[5] : col === 1 ? LIME[3] : y < 7 ? hex('#4d372e') : hex('#2a1d1a');
      cv.put(PX + x, PB - y, c);
    }
  }
  for (let x = -20; x <= 20; x += 1) { cv.put(PX + x, PB - 17, LIME[4]); cv.put(PX + x, PB - 18, LIME[2]); }
  for (let y = 0; y < 8; y += 1) {
    const half = 21 - Math.round(y * 2.6);
    for (let x = -half; x <= half; x += 1) cv.put(PX + x, PB - 19 - y, y === 0 ? GOLD[1] : x < -half + 2 ? LIME[5] : x > half - 2 ? LIME[1] : LIME[3 + (y > 5 ? 1 : 0)]);
  }
  for (let x = -6; x <= 6; x += 1) cv.put(PX + x, PB - 22, GOLD[2]);
  cv.put(PX, PB - 27, GOLD[3]);
  // Dusk over everything, deeper to the east, so the lights glow.
  for (let y = cv.y0; y < cv.y1; y += 1) for (let x = cv.x0; x < cv.x1; x += 1) {
    cv.blend(x, y, [52, 26, 84], 0.14 + Math.max(0, Math.min(1, (x + 40) / 240)) * 0.08);
  }
  // Warm light inside, between the columns, and two braziers at the steps.
  for (let y = 5; y < 16; y += 1) for (let x = -16; x <= 16; x += 1) if ((x + 18) % 6 > 1) cv.blend(PX + x, PB - y, [255, 200, 120], 0.3 + (y < 8 ? 0.25 : 0));
  glow(cv, PX, PB - 9, 24, [255, 206, 120], 0.3);
  for (const bx of [PX - 24, PX + 24]) {
    cv.put(bx, PB, R.stone[1]); cv.put(bx, PB - 1, R.stone[2]);
    cv.put(bx, PB - 2, FIRE[4]); cv.put(bx, PB - 3, FIRE[5]);
    glow(cv, bx, PB - 3, 6, [255, 170, 80], 0.5);
  }
  // Five memory lanterns, each its own colour, strung together with a garland of light.
  const colors = ['#ffcc4d', '#4dffd2', '#ff7ad1', '#9b8cff', '#7ce0ff'];
  const orbs = stops.map(([x, y]) => [x, y - 9]);
  orbs.forEach(([x, y], i) => {
    if (i === 0) return;
    const [px, py] = orbs[i - 1];
    const a = rgb(colors[i - 1]); const b = rgb(colors[i]);
    const len = Math.round(Math.hypot(x - px, y - py));
    for (let s = 0; s <= len; s += 1) {
      const t = s / len;
      const c = a.map((v, k) => Math.round(v + (b[k] - v) * t));
      const gx = px + (x - px) * t; const gy = py + (y - py) * t + Math.sin(t * Math.PI) * 3;
      cv.blend(gx, gy, c, 0.85);
      if (s % 4 === 2) { cv.put(gx, gy, hex('#fff7e0')); glow(cv, gx, gy, 2.5, c, 0.4); }
    }
  });
  stops.forEach(([x, y], i) => {
    const c = colors[i];
    ellipseShadow(cv, x, y + 1, 6, 2.5, 0.28, rgb(c));
    for (let k = 1; k < 8; k += 1) cv.put(x, y - k, R.stone[k < 3 ? 1 : 2]);
    cv.put(x - 1, y - 1, R.stone[1]); cv.put(x + 1, y - 1, R.stone[1]);
    glow(cv, x, y - 9, 12, rgb(c), 0.6);
    rect(cv, x - 1, y - 10, 3, 3, hex(c));
    cv.put(x, y - 9, hex('#ffffff'));
  });
}

/* ------------------------------ output ------------------------------------ */

// Cameras (top-left corner in world coordinates): the card frames the whole scene; the banner
// is a wide strip with the subject right of centre, clear of the course title on the left and
// the progress ring in the bottom-right corner.
const SCENES = {
  rocket: { draw: rocketScene, card: [0, -2], banner: [-127, 8], post: [48, -10] },
  llm: { draw: llmScene, card: [0, -4], banner: [-136, 5], post: [39, -8] },
  brain: { draw: brainScene, card: [0, 0], banner: [-147, 18], post: [40, -12] },
  'memory-palace': { draw: palaceScene, card: [14, -10], banner: [-101, 4], post: [40, -18] },
};
const CARD = [160, 90];
const BANNER = [336, 60];
const POST = [120, 150];   // a 4:5 social post, written at 9× (1080 × 1350) with --posts DIR

mkdirSync(OUT, { recursive: true });
const rendered = [];
for (const [name, s] of Object.entries(SCENES)) {
  const card = view(...CARD, ...s.card);
  s.draw(card);
  writeFileSync(join(OUT, `${name}.png`), png(card));
  const banner = view(...BANNER, ...s.banner);
  s.draw(banner);
  writeFileSync(join(OUT, `${name}-banner.png`), png(banner));
  rendered.push([name, card, banner]);
}
const postDir = process.argv.includes('--posts') ? process.argv[process.argv.indexOf('--posts') + 1] : null;
if (postDir) {
  mkdirSync(postDir, { recursive: true });
  for (const [name, s] of Object.entries(SCENES)) {
    const post = view(...POST, ...s.post);
    s.draw(post);
    writeFileSync(join(postDir, `${name}-post-art.png`), png(post, 9));
  }
  console.log('posts', postDir);
}
console.log('wrote', rendered.map(([n]) => `${n}.png, ${n}-banner.png`).join('; '));

if (process.argv.includes('--preview')) {
  const scale = 3; const gap = 4;
  const sheetW = Math.max(CARD[0] * 2, BANNER[0]) + gap * 2;
  const sheetH = (CARD[1] + BANNER[1] + gap * 2) * rendered.length + gap;
  const sheet = makeCanvas(sheetW, sheetH);
  sheet.px.fill(packHex('#18181a'));
  const paste = (cv, ox, oy) => { for (let y = 0; y < cv.H; y += 1) for (let x = 0; x < cv.W; x += 1) sheet.put(ox + x, oy + y, cv.px[y * cv.W + x]); };
  rendered.forEach(([, card, banner], i) => {
    const oy = gap + i * (CARD[1] + BANNER[1] + gap * 2);
    paste(card, gap, oy);
    paste(banner, gap, oy + CARD[1] + gap);
  });
  const file = join(process.env.COVER_PREVIEW_DIR || tmpdir(), 'workshop-covers-preview.png');
  writeFileSync(file, png({ W: sheetW, H: sheetH, px: sheet.px }, scale));
  console.log('preview', file);
}
