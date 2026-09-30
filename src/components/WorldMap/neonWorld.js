/**
 * neonWorld.js — Level 2 world, "Neon Meridian".
 *
 * A megacity at night around Meridian Bay, painted in the same 8-pixel-per-tile
 * style as the Lumen Reaches (neonArt.js). Game logic still runs on the tile
 * grid; the city adds a street grid, blocks split into building lots, canals,
 * and districts that each build differently.
 *
 *   north   Wind Ridge (turbines, the Great Dam) · Solar Flats · Data Vaults
 *   middle  Verdant Park (the Dome) · Core District (Reactor) · The Spires
 *           (the Arcology) · Canal Quarter · The Foundry
 *   south   Old Town · Lantern Row night market · Neon Heights · Port Nova
 *   sea     Meridian Bay · Launch Isle · the Space Elevator · Oceanlab
 */

import { TERRAIN } from './mapTerrainTypes.js';
import { chamfer, ellipseDist, splineSamples } from './lumenWorld.js';
import { clamp, fbm, hash2, ridged, smin, smoothstep, valueNoise } from './mapNoise.js';

export const NEON_SIZE = 160;
export const NEON_SCALE = 8;
export const NEON_ORIGIN = { x: 72, y: 110 };

const CONTINENT = [
  { x: 82, y: 66, rx: 60, ry: 46, rot: 0 },
  { x: 44, y: 38, rx: 30, ry: 26, rot: 0.3 },
  { x: 118, y: 40, rx: 32, ry: 24, rot: -0.2 },
  { x: 82, y: 20, rx: 54, ry: 15, rot: 0 },
  { x: 72, y: 104, rx: 28, ry: 14, rot: 0 },
  { x: 26, y: 88, rx: 20, ry: 20, rot: 0 },
  { x: 134, y: 76, rx: 17, ry: 18, rot: 0.2 },
];

const CARVES = [
  { x: 108, y: 99, rx: 12, ry: 9, rot: 0.35 }, // Meridian Bay
  { x: 81, y: 120, rx: 5, ry: 4, rot: 0 }, // Port Nova basin
  { x: 151, y: 56, rx: 7, ry: 9, rot: 0 },
  { x: 11, y: 60, rx: 8, ry: 6, rot: 0.3 },
  { x: 48, y: 120, rx: 8, ry: 5, rot: -0.2 },
  { x: 150, y: 28, rx: 6, ry: 5, rot: 0 },
];

const LAKES = [{ id: 'reservoir', x: 58, y: 21, rx: 7, ry: 3.6, rot: 0.1 }];

const ISLES = [
  { id: 'launch', x: 138, y: 131, rx: 7, ry: 6, rot: 0.2, wob: 1.4, biome: 'launch' },
  { id: 'elevator', x: 151, y: 104, rx: 4.6, ry: 4, rot: 0, wob: 1, biome: 'elevator' },
  { x: 30, y: 128, rx: 4, ry: 3, rot: 0.3, wob: 1.4, biome: 'isle' },
  { x: 12, y: 140, rx: 3, ry: 2.5, rot: 0, wob: 1.2, biome: 'isle' },
  { x: 150, y: 150, rx: 3, ry: 2.5, rot: 0, wob: 1.2, biome: 'isle' },
  { x: 110, y: 146, rx: 2.6, ry: 2, rot: 0, wob: 1, biome: 'isle' },
  { x: 60, y: 146, rx: 3, ry: 2.4, rot: 0.4, wob: 1.2, biome: 'isle' },
];

function coarseField(x, y) {
  let f = 1e9;
  for (const b of CONTINENT) f = smin(f, ellipseDist(x, y, b), 7);
  // Engineered coasts: less ragged than the Lumen Reaches.
  f += (fbm(x * 0.045, y * 0.045, 211) - 0.5) * 9 + (fbm(x * 0.13, y * 0.13, 223) - 0.5) * 3.2;
  for (const c of CARVES) f = Math.max(f, -ellipseDist(x, y, c));
  for (const l of LAKES) f = Math.max(f, -ellipseDist(x, y, l) + 0.15);
  for (const isl of ISLES) {
    const d = ellipseDist(x, y, isl) + (fbm(x * 0.21 + isl.x, y * 0.21, 231) - 0.5) * isl.wob;
    f = Math.min(f, d);
  }
  return f;
}

/* ------------------------------ districts ------------------------------ */

// bx/by: block size in tiles (street spacing); 0 = no street grid (open land).
export const NEON_REGIONS = [
  { id: 'port', name: 'Port Nova', cx: 72, cy: 107, r: 9, w: 0.8, biome: 'port', bx: 6, by: 6, urban: true },
  { id: 'market', name: 'Lantern Row', cx: 64, cy: 94, r: 8, w: 0.75, biome: 'market', bx: 4, by: 4, urban: true },
  { id: 'oldtown', name: 'Old Town', cx: 46, cy: 101, r: 8, w: 0.72, biome: 'oldtown', bx: 4, by: 6, urban: true },
  { id: 'downtown', name: 'The Spires', cx: 84, cy: 70, r: 14, w: 1.1, biome: 'downtown', bx: 6, by: 6, urban: true },
  { id: 'heights', name: 'Neon Heights', cx: 104, cy: 89, r: 10, w: 0.85, biome: 'residential', bx: 6, by: 4, urban: true },
  { id: 'canal', name: 'Canal Quarter', cx: 40, cy: 68, r: 12, w: 1, biome: 'canal', bx: 6, by: 6, urban: true },
  { id: 'foundry', name: 'The Foundry', cx: 128, cy: 74, r: 11, w: 1, biome: 'foundry', bx: 12, by: 6, urban: true },
  { id: 'vaults', name: 'The Data Vaults', cx: 122, cy: 42, r: 11, w: 0.95, biome: 'server', bx: 12, by: 6, urban: true },
  { id: 'core', name: 'Core District', cx: 88, cy: 42, r: 9, w: 0.8, biome: 'reactor', bx: 6, by: 6, urban: true },
  { id: 'park', name: 'Verdant Park', cx: 46, cy: 42, r: 11, w: 0.9, biome: 'park' },
  { id: 'ridge', name: 'Wind Ridge', cx: 62, cy: 15, r: 14, w: 1.2, biome: 'ridge' },
  { id: 'solar', name: 'Solar Flats', cx: 104, cy: 17, r: 11, w: 1, biome: 'solar' },
  { id: 'wastes', name: 'Rust Wastes', cx: 22, cy: 92, r: 12, w: 1, biome: 'wastes' },
];

const SEA_REGIONS = [
  { id: 'bay', name: 'Meridian Bay', cx: 109, cy: 101, r: 12, biome: 'bay' },
  { id: 'launch', name: 'Launch Isle', cx: 138, cy: 131, r: 9, biome: 'launch' },
  { id: 'elevator', name: 'Tether Isle', cx: 151, cy: 104, r: 7, biome: 'elevator' },
  { id: 'oceanlab', name: 'Oceanlab', cx: 92, cy: 144, r: 7, biome: 'rig' },
];

function regionAt(x, y) {
  const wx = x + (fbm(x * 0.05, y * 0.05, 261) - 0.5) * 14;
  const wy = y + (fbm(x * 0.05, y * 0.05, 267) - 0.5) * 14;
  let best = NEON_REGIONS[0];
  let bestD = Infinity;
  for (const r of NEON_REGIONS) {
    const d = Math.hypot(wx - r.cx, wy - r.cy) / r.w;
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

const AVENUE = 12;
const GRID0 = 6;
const onLine = (p, B) => B > 0 && ((p - GRID0) % B + B) % B === 0;
const onAvenue = (p) => { const m = ((p - GRID0) % AVENUE + AVENUE) % AVENUE; return m === 0 || m === 1; };

function escarpmentY(x) {
  return 30 + 3 * Math.sin(x * 0.07 + 0.6) + (fbm(x * 0.1, 7.3, 241) - 0.5) * 5;
}

function mountainAt(x, y, region) {
  if (region !== 'ridge') return 0;
  const ridgeY = 14 + 2.5 * Math.sin(x * 0.12);
  const span = smoothstep(22, 34, x) * (1 - smoothstep(88, 100, x));
  const m = span * 0.75 * Math.exp(-(((y - ridgeY) / 5.5) ** 2)) * (0.55 + 0.45 * ridged(x * 0.1, y * 0.1, 5));
  // The valley the dam closes stays open.
  const valley = 1 - 0.95 * Math.exp(-(((x - 58) / 7) ** 2)) * smoothstep(12, 26, y);
  return clamp(m * valley, 0, 1);
}

/* ------------------------------ generation ----------------------------- */

let cached = null;

export function generateNeonWorld() {
  if (cached) return cached;
  const size = NEON_SIZE;
  const N = size + 1;
  const corner = new Float32Array(N * N);
  for (let j = 0; j < N; j += 1) for (let i = 0; i < N; i += 1) corner[j * N + i] = coarseField(i, j);
  const landField = (u, v) => {
    const cu = clamp(u, 0, size - 0.001);
    const cv = clamp(v, 0, size - 0.001);
    const i = Math.floor(cu);
    const j = Math.floor(cv);
    const fx = cu - i;
    const fy = cv - j;
    const a = corner[j * N + i];
    const b = corner[j * N + i + 1];
    const c = corner[(j + 1) * N + i];
    const d = corner[(j + 1) * N + i + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy + (valueNoise(u * 1.7, v * 1.7, 205) - 0.5) * 0.35;
  };

  const isLand = new Uint8Array(size * size);
  const lake = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x + 0.5;
      const v = y + 0.5;
      isLand[y * size + x] = landField(u, v) < 0 ? 1 : 0;
      for (const l of LAKES) if (ellipseDist(u, v, l) < 0.2) lake[y * size + x] = 1;
    }
  }
  const water = new Uint8Array(size * size);
  for (let i = 0; i < water.length; i += 1) water[i] = isLand[i] ? 0 : 1;
  const coastDist = chamfer(size, water);
  const seaDist = chamfer(size, isLand);

  const terrain = new Array(size);
  for (let y = 0; y < size; y += 1) {
    terrain[y] = new Array(size);
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const u = x + 0.5;
      const v = y + 0.5;
      const rand = hash2(x, y, 299);
      if (!isLand[i]) {
        let type = TERRAIN.DEEP_OCEAN;
        if (lake[i] || seaDist[i] <= 2.5) type = TERRAIN.SHALLOW_WATER;
        else if (seaDist[i] <= 6) type = TERRAIN.OCEAN;
        const sea = SEA_REGIONS.find((r) => Math.hypot(u - r.cx, v - r.cy) < r.r);
        terrain[y][x] = {
          type, k: lake[i] ? 'lake' : 'water', b: sea?.biome || 'sea', r: sea?.id || null,
          h: 0, hm: 0, lv: -1, v: rand, sd: seaDist[i],
        };
        continue;
      }
      const isle = ISLES.find((s) => ellipseDist(u, v, s) < s.wob + 1.5);
      const region = isle ? null : regionAt(u, v);
      const biome = isle ? isle.biome : region.biome;
      const hm = region ? mountainAt(u, v, region.id) : 0;
      let lv = 0;
      if (!isle && v < escarpmentY(u) && u > 14 && u < 150) lv = 1;
      const h = clamp(smoothstep(0, 9, coastDist[i]) * 0.12 + (lv ? 0.2 : 0) + hm * 0.55
        + (fbm(u * 0.07, v * 0.07, 251) - 0.5) * 0.08, 0, 1);
      terrain[y][x] = {
        type: TERRAIN.GRASS, k: 'lot', b: biome, r: region?.id || isle?.id || null,
        h, hm, lv, v: rand, cd: coastDist[i], urban: Boolean(region?.urban),
      };
    }
  }

  assignKinds(terrain, size);
  const spillway = carveSpillway(terrain, size);
  const buildings = buildLots(terrain, size);
  const entities = placeEntities(terrain, size, buildings);
  const islands = [
    ...NEON_REGIONS.map((r) => ({ id: r.id, name: r.name, cx: r.cx, cy: r.cy, r: r.r, biome: r.biome })),
    ...SEA_REGIONS.map((r) => ({ id: r.id, name: r.name, cx: r.cx, cy: r.cy, r: r.r, biome: r.biome })),
  ];

  cached = {
    level: 2,
    id: 'neon',
    name: 'Neon Meridian',
    size,
    scale: NEON_SCALE,
    terrain,
    buildings,
    entities,
    islands,
    origin: { ...NEON_ORIGIN },
    landField,
    spillway,
    maglev: MAGLEV,
    stations: MAGLEV_STATIONS,
    ellipses: { lakes: LAKES },
  };
  return cached;
}

/** Streets, avenues, canals, quays, parks and open land. */
function assignKinds(terrain, size) {
  const regionById = Object.fromEntries(NEON_REGIONS.map((r) => [r.id, r]));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      if (t.lv < 0) continue;
      const reg = regionById[t.r];
      const n = fbm(x * 0.16, y * 0.16, 247);
      let k = 'lot';
      if (t.urban && reg) {
        const avenue = onAvenue(x) || onAvenue(y);
        const street = onLine(x, reg.bx) || onLine(y, reg.by);
        // Canals run midway between avenues; streets cross them on bridges.
        const canalLine = ((x - GRID0) % AVENUE + AVENUE) % AVENUE === 6;
        if (t.b === 'canal' && canalLine && !onAvenue(y) && !onLine(y, reg.by)) k = 'canal';
        else if (avenue) k = 'avenue';
        else if (street) k = 'street';
        if (t.cd <= 1.2 && k !== 'canal') k = 'quay';
      } else {
        switch (t.b) {
          case 'park': k = n > 0.74 ? 'pond' : 'park'; break;
          case 'ridge':
            if (t.hm > 0.42) k = 'peak';
            else if (t.hm > 0.2) k = 'rock';
            else k = n < 0.4 ? 'pines' : 'scrub';
            break;
          case 'solar': k = n > 0.78 ? 'scrub' : 'solar'; break;
          case 'wastes': k = n > 0.62 ? 'scrap' : 'rust'; break;
          case 'launch': k = t.cd <= 1.3 ? 'quay' : 'pad'; break;
          case 'elevator': k = t.cd <= 1.2 ? 'quay' : 'plaza'; break;
          default: k = t.cd <= 1.3 ? 'sand' : 'scrub'; break;
        }
        if (t.cd <= 1.2 && ['park', 'solar', 'wastes'].includes(t.b) && k !== 'avenue') k = 'sand';
      }
      t.k = k;
      t.type = kindToTerrain(k, t);
    }
  }
}

function kindToTerrain(k, t) {
  switch (k) {
    case 'canal':
    case 'pond': return TERRAIN.SHALLOW_WATER;
    case 'avenue':
    case 'street':
    case 'quay':
    case 'plaza':
    case 'pad': return TERRAIN.PATH;
    case 'park':
    case 'scrub': return TERRAIN.GRASS;
    case 'pines': return TERRAIN.FOREST;
    case 'rock': return TERRAIN.MOUNTAIN;
    case 'peak': return TERRAIN.PEAK;
    case 'rust':
    case 'scrap':
    case 'sand': return TERRAIN.BEACH;
    case 'solar': return TERRAIN.MEADOW;
    default: return t.urban ? TERRAIN.GRASS : TERRAIN.GRASS;
  }
}

/** The reservoir drains south over the escarpment: the Great Dam's spillway. */
function carveSpillway(terrain, size) {
  const pts = [[58, 25], [58.5, 30], [57, 36], [59, 42], [58, 47]];
  const samples = splineSamples(pts, 0.1);
  for (const p of samples) {
    p.w = 0.8;
    const t = terrain[Math.floor(p.y)]?.[Math.floor(p.x)];
    if (!t || t.lv < 0) continue;
    if (Math.hypot(Math.floor(p.x) + 0.5 - p.x, Math.floor(p.y) + 0.5 - p.y) > 0.75) continue;
    t.river = true;
    t.k = 'canal';
    t.type = TERRAIN.SHALLOW_WATER;
  }
  let falls = null;
  for (const p of samples) {
    const t = terrain[Math.floor(p.y)]?.[Math.floor(p.x)];
    const n = terrain[Math.floor(p.y) - 1]?.[Math.floor(p.x)];
    if (t && n && n.lv > t.lv && !falls) falls = { x: Math.floor(p.x), y: Math.floor(p.y) };
  }
  return { samples, falls, size };
}

/* ------------------------------ buildings ------------------------------ */

/** Height (art px) and look of a building, by district. */
const STYLES = {
  downtown: { min: 22, max: 72, style: 'tower' },
  residential: { min: 10, max: 24, style: 'apartment' },
  market: { min: 5, max: 10, style: 'shop' },
  oldtown: { min: 5, max: 8, style: 'pagoda' },
  port: { min: 6, max: 11, style: 'warehouse' },
  foundry: { min: 8, max: 14, style: 'factory' },
  server: { min: 5, max: 8, style: 'datacenter' },
  reactor: { min: 8, max: 16, style: 'lab' },
  canal: { min: 8, max: 18, style: 'canalhouse' },
};

/**
 * Blocks are the connected lot tiles between streets; each block is cut into
 * lots and most lots get a building. Returns building records in tile units
 * (x, y, w, d) with a facade height h in art pixels.
 */
function buildLots(terrain, size) {
  const seen = new Uint8Array(size * size);
  const buildings = [];
  const isLot = (x, y) => terrain[y]?.[x]?.k === 'lot' && terrain[y][x].urban;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (seen[y * size + x] || !isLot(x, y)) continue;
      // Flood the block.
      const cells = [];
      const stack = [[x, y]];
      seen[y * size + x] = 1;
      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        cells.push([cx, cy]);
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx);
        y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || seen[ny * size + nx] || !isLot(nx, ny)) continue;
          seen[ny * size + nx] = 1;
          stack.push([nx, ny]);
        }
      }
      const inBlock = new Set(cells.map(([cx, cy]) => cy * size + cx));
      const free = (lx, ly, w, d) => {
        for (let yy = ly; yy < ly + d; yy += 1) for (let xx = lx; xx < lx + w; xx += 1) if (!inBlock.has(yy * size + xx)) return false;
        return true;
      };
      const used = new Set();
      const take = (lx, ly, w, d) => {
        for (let yy = ly; yy < ly + d; yy += 1) for (let xx = lx; xx < lx + w; xx += 1) used.add(yy * size + xx);
      };
      const biome = terrain[y][x].b;
      const style = STYLES[biome] || STYLES.residential;
      // Cut the block's bounding box into lots of 1–3 tiles, then fill gaps with 1×1s.
      for (let ly = y0; ly <= y1; ly += 1) {
        for (let lx = x0; lx <= x1; lx += 1) {
          if (used.has(ly * size + lx) || !inBlock.has(ly * size + lx)) continue;
          const r = hash2(lx, ly, 311);
          const want = biome === 'downtown' ? [3, 2, 2] : biome === 'foundry' || biome === 'server' ? [4, 3, 2] : biome === 'market' || biome === 'oldtown' ? [1, 2, 1] : [2, 2, 1];
          let w = want[Math.floor(r * 3)];
          let d = want[Math.floor(hash2(lx, ly, 313) * 3)];
          while ((w > 1 || d > 1) && !(free(lx, ly, w, d) && ![...Array(w * d)].some((_, k) => used.has((ly + Math.floor(k / w)) * size + lx + (k % w))))) {
            if (w >= d && w > 1) w -= 1; else d -= 1;
          }
          take(lx, ly, w, d);
          const t = terrain[ly][lx];
          const hr = hash2(lx, ly, 317);
          // Downtown gets taller towards the Arcology.
          const dist = Math.hypot(lx - 84, ly - 68);
          const lift = biome === 'downtown' ? Math.exp(-(((dist - 11) / 7) ** 2)) : 0;
          // A few tall ones among many mid-rise: skylines are spiky, not flat.
          const tall = biome === 'downtown' ? (hr > 0.7 ? 1 : hr * 0.55) : hr;
          const h = Math.round(style.min + (style.max - style.min) * clamp(tall * 0.8 + lift * 0.45, 0, 1));
          const open = hash2(lx, ly, 319) < (biome === 'downtown' ? 0.06 : 0.1);
          if (open && w * d <= 2) {
            for (let yy = ly; yy < ly + d; yy += 1) for (let xx = lx; xx < lx + w; xx += 1) terrain[yy][xx].k = hash2(xx, yy, 321) < 0.5 ? 'plaza' : 'park';
            continue;
          }
          buildings.push({
            x: lx, y: ly, w, d, h: Math.max(4, h), style: style.style, district: biome,
            seed: hash2(lx, ly, 323), region: t.r,
          });
          for (let yy = ly; yy < ly + d; yy += 1) for (let xx = lx; xx < lx + w; xx += 1) terrain[yy][xx].built = true;
        }
      }
    }
  }
  return buildings;
}

/* ------------------------------ features ------------------------------- */

/**
 * A polyline through `corners` with each interior corner rounded to radius r,
 * sampled every `step` tiles: [{ x, y, tx, ty, s }] (s = distance from start).
 */
function railPath(corners, r = 1.4, step = 1 / 8) {
  const pts = [];
  const line = (ax, ay, bx, by) => {
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 0; k < n; k += 1) pts.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  };
  let [cx, cy] = corners[0];
  for (let i = 1; i < corners.length; i += 1) {
    const [px, py] = corners[i];
    const next = corners[i + 1];
    if (!next) { line(cx, cy, px, py); pts.push([px, py]); break; }
    const l1 = Math.hypot(px - cx, py - cy);
    const l2 = Math.hypot(next[0] - px, next[1] - py);
    const ax = px - ((px - cx) / l1) * r;
    const ay = py - ((py - cy) / l1) * r;
    const bx = px + ((next[0] - px) / l2) * r;
    const by = py + ((next[1] - py) / l2) * r;
    line(cx, cy, ax, ay);
    const n = Math.max(4, Math.round((r * 1.6) / step));
    for (let k = 0; k < n; k += 1) {
      const u = k / n;
      pts.push([(1 - u) ** 2 * ax + 2 * (1 - u) * u * px + u * u * bx, (1 - u) ** 2 * ay + 2 * (1 - u) * u * py + u * u * by]);
    }
    [cx, cy] = [bx, by];
  }
  let s = 0;
  return pts.map(([x, y], i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    if (i > 0) s += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    return { x, y, tx: (b[0] - a[0]) / l, ty: (b[1] - a[1]) / l, s };
  });
}

/**
 * Elevated maglev: from Tether Isle across the open sea on a long bridge, into
 * Port Nova, north up the avenue past the Arcology, east through the Core
 * District and down to the Foundry. It runs above avenue medians (x = 79 and
 * 127, y = 43 and 103 are avenue centre lines), so it never cuts a block.
 */
export const MAGLEV = railPath([[149, 103], [79, 103], [79, 43], [127, 43], [127, 88]]);

/** Stations: Tether Isle, Port Nova, the Spires, Core District, the Foundry. */
export const MAGLEV_STATIONS = [[146, 103], [90, 103], [79, 58], [101, 43], [127, 85]].map(([x, y]) => {
  let best = 0;
  MAGLEV.forEach((p, i) => { if (Math.hypot(p.x - x, p.y - y) < Math.hypot(MAGLEV[best].x - x, MAGLEV[best].y - y)) best = i; });
  return best;
});

function nearest(terrain, size, x, y, ok, maxR = 6) {
  for (let r = 0; r <= maxR; r += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (ok(terrain[ny][nx], nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return null;
}

/** Clear any buildings under a landmark's footprint and mark it. */
function clearArea(terrain, buildings, x0, y0, w, d, kind = 'plaza') {
  for (let i = buildings.length - 1; i >= 0; i -= 1) {
    const b = buildings[i];
    if (b.x < x0 + w && b.x + b.w > x0 && b.y < y0 + d && b.y + b.d > y0) buildings.splice(i, 1);
  }
  for (let y = y0; y < y0 + d; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const t = terrain[y]?.[x];
      if (!t || t.lv < 0) continue;
      t.built = false;
      t.prop = 'landmark';
      if (t.k === 'lot' || t.k === 'street' || t.k === 'park' || t.k === 'scrub' || t.k === 'rust' || t.k === 'solar') t.k = kind;
    }
  }
}

/** Small finds between the big landmarks (placed from the discovery order). */
export const NEON_FINDS = [
  { id: 'noodle-stand', sprite: 'noodles', x: 67, y: 103 },
  { id: 'vending-alley', sprite: 'vending', x: 61, y: 108 },
  { id: 'robot-dog', sprite: 'robodog', x: 80, y: 99 },
  { id: 'koi-pond', sprite: 'koi', x: 52, y: 93 },
  { id: 'graffiti-wall', sprite: 'graffiti', x: 90, y: 92 },
  { id: 'hover-wreck', sprite: 'hovercar', x: 58, y: 84 },
  { id: 'neon-court', sprite: 'court', x: 97, y: 80 },
  { id: 'fortune-bot', sprite: 'fortune', x: 72, y: 76 },
  { id: 'cyber-tree', sprite: 'cybertree', x: 40, y: 50 },
  { id: 'drone-nest', sprite: 'drones', x: 110, y: 64 },
  { id: 'phone-booth', sprite: 'booth', x: 30, y: 74 },
  { id: 'cat-cafe', sprite: 'catcafe', x: 104, y: 98 },
  { id: 'old-satellite', sprite: 'satellite', x: 18, y: 84 },
  { id: 'glitch-board', sprite: 'billboard', x: 96, y: 52 },
  { id: 'skate-bowl', sprite: 'skate', x: 120, y: 90 },
  { id: 'food-truck', sprite: 'foodtruck', x: 136, y: 88 },
  { id: 'bot-shrine', sprite: 'botshrine', x: 74, y: 34 },
  { id: 'crashed-drone', sprite: 'bigdrone', x: 118, y: 22 },
];

function placeEntities(terrain, size, buildings) {
  const entities = [];
  const spot = (x, y, ok, r = 6) => nearest(terrain, size, x, y, ok, r);
  const land = (t) => t.lv >= 0 && t.k !== 'canal' && t.k !== 'pond';
  const add = (type, x, y, extra = {}) => entities.push({ type, x, y, ...extra });

  // Port Nova: arrivals hall, cranes, container stacks, ferries.
  clearArea(terrain, buildings, 69, 107, 6, 3, 'plaza');
  add('terminal', 69, 107, { w: 6 });
  for (const [x, y] of [[78, 104], [82, 104], [78, 108], [60, 104], [62, 110]]) {
    const p = spot(x, y, (t) => t.lv >= 0 && t.urban, 3);
    if (!p) continue;
    clearArea(terrain, buildings, p.x, p.y, 3, 2, 'yard');
    add('containers', p.x, p.y, { seed: hash2(p.x, p.y, 7) });
  }
  for (const [x, y] of [[84, 116], [77, 117]]) add('crane', x, y);
  for (const [x, y, v] of [[80, 123, 0], [74, 124, 1], [88, 121, 2], [67, 121, 1]]) add('ferry', x, y, { v });

  const landmark = (type, x, y, w, d, extra = {}, kind = 'plaza') => {
    clearArea(terrain, buildings, x, y, w, d, kind);
    add(type, x, y, { w, d, ...extra });
  };
  clearArea(terrain, buildings, 79, 62, 11, 9, 'plaza');
  landmark('arcology', 82, 65, 5, 5);
  landmark('arcade', 60, 96, 3, 2);
  landmark('dome', 42, 38, 7, 6, {}, 'park');
  landmark('reactor', 86, 38, 6, 5);
  landmark('foundryStacks', 128, 70, 6, 5, {}, 'yard');
  landmark('vaultCore', 120, 38, 6, 4, {}, 'yard');
  landmark('skyport', 70, 46, 3, 3);
  landmark('pagoda', 45, 99, 3, 3, {}, 'plaza');
  landmark('titan', 16, 94, 9, 5, {}, 'rust');
  landmark('array', 142, 30, 5, 4, {}, 'rock');
  const dam = spot(58, 25, (t) => t.lv >= 0, 3);
  if (dam) add('dam', dam.x, dam.y);
  for (let i = 0; i < 9; i += 1) {
    const p = spot(Math.round(34 + i * 7), Math.round(12 + Math.sin(i * 1.7) * 3), (t) => land(t) && t.b === 'ridge' && !t.river && t.hm < 0.4, 3);
    if (p) { add('turbine', p.x, p.y, { seed: i }); terrain[p.y][p.x].prop = 'turbine'; }
  }
  const pad = spot(139, 131, (t) => t.lv >= 0 && t.b === 'launch', 4);
  if (pad) add('rocket', pad.x, pad.y);
  const tether = spot(151, 104, (t) => t.lv >= 0 && t.b === 'elevator', 3);
  if (tether) add('elevator', tether.x, tether.y);
  add('rig', 92, 144);
  add('holowhale', 109, 97); // swims above open water, north of the maglev bridge

  for (const f of NEON_FINDS) {
    const p = spot(f.x, f.y, (t) => land(t) && !t.built && t.prop !== 'landmark', 4);
    if (!p) continue;
    const t = terrain[p.y][p.x];
    t.prop = 'find';
    if (t.k === 'lot') t.k = 'plaza';
    add('find', p.x, p.y, { id: f.id, sprite: f.sprite });
  }

  const CHESTS = [
    [66, 110], [86, 100], [56, 90], [76, 80], [100, 86], [36, 64], [46, 48], [92, 44],
    [120, 72], [126, 44], [60, 28], [104, 20], [20, 90], [138, 128], [150, 106], [12, 140],
  ];
  for (const [x, y] of CHESTS) {
    const p = spot(x, y, (t) => land(t) && !t.built && !t.prop && t.k !== 'avenue', 6);
    if (!p) continue;
    terrain[p.y][p.x].prop = 'chest';
    entities.push({ type: 'treasure_chest', x: p.x, y: p.y, name: 'Treasure Chest', id: `neon:${p.x},${p.y}` });
  }
  return entities;
}
