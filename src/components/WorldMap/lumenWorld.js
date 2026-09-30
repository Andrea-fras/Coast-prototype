/**
 * lumenWorld.js — Level 2 world, "The Lumen Reaches".
 *
 * The first world every student charts.
 * Game logic still works on a tile grid (TERRAIN types, organic unlock), but
 * the world is described at sub-tile precision: coastlines, rivers, roads and
 * cliffs are continuous shapes that lumenArt.js paints at 8 art pixels per
 * tile — twice the detail of level 1.
 *
 * Geography (tiles, y grows south):
 *   north   Frostfang Fjords · Prism Peaks (Starfall Observatory, Prism Caverns)
 *   middle  Eldergrove (Elder Tree) · Blossomwood · Amber Dunes (Sun Temple)
 *           — split from the lowlands by the Lumen Escarpment and Lumen Falls
 *   south   Sunpetal Vale windmills · Mistfen · Emberwood · Lantern Harbor
 *   sea     Emberforge volcano · Coral Crown · Drowned Library · Skyhaven
 */

import { TERRAIN } from './mapTerrainTypes.js';
import { clamp, fbm, hash2, ridged, smin, smoothstep, valueNoise } from './mapNoise.js';

export const LUMEN_SIZE = 160;
export const LUMEN_SCALE = 8;
export const LUMEN_ORIGIN = { x: 75, y: 107 };

/* ------------------------------ shape ---------------------------------- */

const CONTINENT = [
  { x: 80, y: 64, rx: 50, ry: 34, rot: 0 },
  { x: 46, y: 46, rx: 28, ry: 24, rot: 0.3 },
  { x: 114, y: 52, rx: 30, ry: 25, rot: -0.2 },
  { x: 82, y: 26, rx: 46, ry: 15, rot: 0.05 },
  { x: 33, y: 24, rx: 21, ry: 14, rot: 0.4 },
  { x: 78, y: 97, rx: 25, ry: 14, rot: 0 },
  { x: 121, y: 84, rx: 17, ry: 12, rot: 0.5 },
  { x: 43, y: 79, rx: 17, ry: 14, rot: -0.3 },
  { x: 92, y: 108, rx: 8, ry: 5, rot: 0.5 },
  { x: 64, y: 106, rx: 10, ry: 6, rot: -0.2 },
];

/** Water cut back into the land after the coast wobble: bays and fjords. */
const CARVES = [
  { x: 84.5, y: 113.4, rx: 4.4, ry: 3.3, rot: 0.1 }, // Lantern Harbor basin
  { x: 17, y: 70, rx: 7, ry: 5, rot: 0.2 },
  { x: 21, y: 89, rx: 5, ry: 4, rot: 0 },
  { x: 55, y: 102, rx: 5, ry: 3.5, rot: 0.2 },
  { x: 14, y: 45, rx: 6, ry: 3.5, rot: 0.3 },
  { x: 60, y: 5, rx: 7, ry: 3.5, rot: 0 },
  { x: 112, y: 7, rx: 8, ry: 4, rot: -0.1 },
  { x: 153, y: 37, rx: 6, ry: 5, rot: 0 },
  { x: 141, y: 97, rx: 6, ry: 4.5, rot: 0.3 },
  { x: 29, y: 101, rx: 8, ry: 5, rot: -0.4 },
  { x: 24, y: 9, rx: 2.4, ry: 10, rot: 0.3 }, // fjords
  { x: 37, y: 7, rx: 2, ry: 9, rot: -0.2 },
  { x: 12, y: 30, rx: 9, ry: 2.4, rot: 0.35 },
  { x: 20, y: 60, rx: 9, ry: 7, rot: 0 },
  { x: 150, y: 58, rx: 9, ry: 12, rot: 0 },
  { x: 102, y: 104, rx: 7, ry: 5, rot: 0.4 },
];

const LAKES = [
  { id: 'mirror', x: 93, y: 34, rx: 3.6, ry: 2.6, rot: 0.2 },
  { id: 'oasis', x: 119, y: 45, rx: 2.1, ry: 1.7, rot: 0 },
];

/** Separate islands: { wob } is how ragged the coast is. */
const ISLES = [
  { id: 'emberforge', x: 142, y: 76, rx: 9.5, ry: 8.5, rot: 0.3, wob: 3, biome: 'volcano' },
  { x: 148, y: 70, rx: 4, ry: 3.5, rot: 0, wob: 2, biome: 'volcano' },
  { x: 54, y: 128, rx: 2.6, ry: 2.1, rot: 0, wob: 1.2, biome: 'isle' },
  { x: 62, y: 145, rx: 3.2, ry: 2.6, rot: 0.2, wob: 1.6, biome: 'isle' },
  { x: 150, y: 108, rx: 3.4, ry: 2.8, rot: 0.6, wob: 1.8, biome: 'isle' },
  { x: 12, y: 138, rx: 3.6, ry: 3, rot: 0, wob: 1.8, biome: 'isle' },
  { x: 151, y: 148, rx: 2.8, ry: 2.4, rot: 0, wob: 1.4, biome: 'isle' },
  { x: 8, y: 90, rx: 2.8, ry: 2.2, rot: 0.3, wob: 1.2, biome: 'isle' },
  { x: 150, y: 17, rx: 3, ry: 2.4, rot: 0.2, wob: 1.4, biome: 'rock' },
  { x: 156, y: 30, rx: 2.2, ry: 1.8, rot: 0, wob: 1, biome: 'rock' },
  { x: 142, y: 124, rx: 2.4, ry: 2, rot: 0, wob: 1.2, biome: 'isle' },
  { x: 96, y: 128, rx: 1.4, ry: 1.2, rot: 0, wob: 0.6, biome: 'rock' },
  { x: 104, y: 144, rx: 1.6, ry: 1.2, rot: 0, wob: 0.6, biome: 'rock' },
];

const ATOLL = { x: 126, y: 134, rx: 11, ry: 9, rot: -0.2, ring: 1.4 };
/** Shallow sea shelves: the Drowned Library and the wreck reef. */
const SHELVES = [
  { id: 'drowned', x: 49, y: 132, rx: 9, ry: 7, rot: 0.2 },
  { id: 'wreck', x: 101, y: 145, rx: 7, ry: 4, rot: 0.1 },
];

export function ellipseDist(x, y, b) {
  const dx = x - b.x;
  const dy = y - b.y;
  const c = Math.cos(b.rot || 0);
  const s = Math.sin(b.rot || 0);
  const u = (dx * c + dy * s) / b.rx;
  const v = (-dx * s + dy * c) / b.ry;
  return (Math.sqrt(u * u + v * v) - 1) * Math.min(b.rx, b.ry);
}

/** Roughly signed distance in tiles; negative on land. */
function coarseField(x, y) {
  let f = 1e9;
  for (const b of CONTINENT) f = smin(f, ellipseDist(x, y, b), 7);
  f += (fbm(x * 0.045, y * 0.045, 11) - 0.5) * 12 + (fbm(x * 0.13, y * 0.13, 23) - 0.5) * 6.5;
  for (const c of CARVES) f = Math.max(f, -ellipseDist(x, y, c));
  for (const l of LAKES) f = Math.max(f, -ellipseDist(x, y, l) + 0.15);
  for (const isl of ISLES) {
    const d = ellipseDist(x, y, isl) + (fbm(x * 0.21 + isl.x, y * 0.21, 31) - 0.5) * isl.wob;
    f = Math.min(f, d);
  }
  const atoll = Math.abs(ellipseDist(x, y, ATOLL)) - ATOLL.ring + (fbm(x * 0.3, y * 0.3, 37) - 0.5) * 1.6;
  return Math.min(f, atoll);
}

/* ------------------------------ regions -------------------------------- */

export const LUMEN_REGIONS = [
  { id: 'harbor', name: 'Lantern Harbor', cx: 77, cy: 108, r: 9, w: 0.8, biome: 'harbor' },
  { id: 'vale', name: 'Sunpetal Vale', cx: 88, cy: 84, r: 13, w: 1.1, biome: 'vale' },
  { id: 'mistfen', name: 'Mistfen', cx: 42, cy: 84, r: 11, w: 0.95, biome: 'marsh' },
  { id: 'blossom', name: 'Blossomwood', cx: 58, cy: 64, r: 12, w: 1.05, biome: 'blossom' },
  { id: 'eldergrove', name: 'Eldergrove', cx: 38, cy: 44, r: 12, w: 1, biome: 'elder' },
  { id: 'frostfang', name: 'Frostfang Fjords', cx: 28, cy: 20, r: 12, w: 1, biome: 'fjord' },
  { id: 'peaks', name: 'The Prism Peaks', cx: 78, cy: 24, r: 16, w: 1.15, biome: 'peaks' },
  { id: 'crystal', name: 'Prism Caverns', cx: 110, cy: 26, r: 9, w: 0.75, biome: 'crystal' },
  { id: 'dunes', name: 'Amber Dunes', cx: 122, cy: 50, r: 16, w: 1.2, biome: 'dunes' },
  { id: 'plains', name: 'Windward Plains', cx: 104, cy: 74, r: 10, w: 0.85, biome: 'plains' },
  { id: 'emberwood', name: 'Emberwood', cx: 122, cy: 88, r: 10, w: 0.95, biome: 'autumn' },
];

const SEA_REGIONS = [
  { id: 'emberforge', name: 'Emberforge', cx: 143, cy: 75, r: 11, biome: 'volcano' },
  { id: 'coral', name: 'Coral Crown', cx: 126, cy: 134, r: 12, biome: 'atoll' },
  { id: 'drowned', name: 'The Drowned Library', cx: 48, cy: 132, r: 11, biome: 'shelf' },
  { id: 'skyhaven', name: 'Skyhaven', cx: 26, cy: 112, r: 9, biome: 'sky' },
  { id: 'wreck', name: 'Wanderer Reef', cx: 101, cy: 145, r: 7, biome: 'reef' },
];

function regionAt(x, y) {
  const wx = x + (fbm(x * 0.05, y * 0.05, 61) - 0.5) * 18;
  const wy = y + (fbm(x * 0.05, y * 0.05, 67) - 0.5) * 18;
  let best = LUMEN_REGIONS[0];
  let bestD = Infinity;
  for (const r of LUMEN_REGIONS) {
    const d = Math.hypot(wx - r.cx, wy - r.cy) / r.w;
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/* ------------------------------ features -------------------------------- */

/** River from Mirror Lake over Lumen Falls to Lantern Bay (tile coords). */
export const LUMEN_RIVER = [
  [93, 37], [91, 41], [89.5, 45], [88.2, 49.5], [87.2, 54], [88.5, 59], [86.5, 64],
  [83, 69], [84.2, 75], [81.5, 81], [82.5, 88], [80, 95], [81.5, 101], [82.2, 106], [83.6, 111.5],
];

const MESAS = [
  { x: 108, y: 40, r: 4.2 },
  { x: 131, y: 40, r: 3.4 },
  { x: 112, y: 61, r: 3.2 },
  { x: 136, y: 54, r: 2.6 },
];

function escarpmentY(x) {
  return 50 + 3.5 * Math.sin(x * 0.08 + 1) + (fbm(x * 0.1, 3.7, 41) - 0.5) * 6;
}

/** Mountain intensity (0 = none): the Prism Peaks ridge, Starfall summit and the fjord highs. */
function mountainAt(x, y) {
  const ridgeY = 21 + 3 * Math.sin(x * 0.11);
  const span = smoothstep(44, 56, x) * (1 - smoothstep(118, 132, x));
  let m = span * 0.7 * Math.exp(-(((y - ridgeY) / 6.8) ** 2)) * (0.5 + 0.5 * ridged(x * 0.09, y * 0.09, 3));
  m += 0.42 * Math.exp(-(((x - 70) ** 2 + (y - 16) ** 2) / 20)); // Starfall summit
  if (x < 46 && y < 32) m += 0.42 * smoothstep(0.4, 0.72, fbm(x * 0.12, y * 0.12, 9)) * (1 - smoothstep(26, 34, y));
  return clamp(m, 0, 1);
}

function isHighland(x, y) {
  return y < escarpmentY(x) && x > 12 && x < 148;
}

function isMesa(x, y) {
  for (const m of MESAS) {
    const d = Math.hypot(x - m.x, y - m.y) + (fbm(x * 0.35, y * 0.35, 77) - 0.5) * 2.2;
    if (d < m.r) return true;
  }
  return false;
}

/** Continuous height for relief shading; terrace levels are set explicitly. */
function heightAt(x, y, coastDist, biome, hm) {
  let h = smoothstep(0, 9, coastDist) * 0.16 + (fbm(x * 0.07, y * 0.07, 51) - 0.5) * 0.12;
  if (biome === 'volcano') {
    const d = Math.hypot(x - 142, y - 75);
    return clamp(0.12 + (1 - d / 9) * 0.9, 0, 1);
  }
  if (biome === 'isle' || biome === 'rock' || biome === 'atoll') return h * 0.6;
  if (isHighland(x, y)) h += 0.2;
  h += hm * 0.55;
  h += 0.09 * Math.exp(-(((x - 87) ** 2 + (y - 83) ** 2) / 22)); // windmill hill
  return clamp(h, 0, 1);
}

/* ------------------------------ helpers -------------------------------- */

const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

/** Chamfer distance (in tiles) from every cell to the nearest cell where src is true. */
export function chamfer(size, src) {
  const INF = 1e9;
  const d = new Float32Array(size * size);
  for (let i = 0; i < d.length; i += 1) d[i] = src[i] ? 0 : INF;
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

/** Catmull-Rom through control points → dense samples with tangent + progress. */
export function splineSamples(points, step = 0.12) {
  const out = [];
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [p0, p1, p2, p3] = [P(i - 1), P(i), P(i + 1), P(i + 2)];
    const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const n = Math.max(2, Math.ceil(len / step));
    for (let k = 0; k < n; k += 1) {
      const t = k / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push({ x, y });
    }
  }
  const last = points[points.length - 1];
  out.push({ x: last[0], y: last[1] });
  let total = 0;
  for (let i = 0; i < out.length; i += 1) {
    const a = out[Math.max(0, i - 1)];
    const b = out[Math.min(out.length - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    out[i].tx = (b.x - a.x) / l;
    out[i].ty = (b.y - a.y) / l;
    if (i > 0) total += Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y);
    out[i].s = total;
  }
  for (const p of out) p.t = p.s / (total || 1);
  return out;
}

class Heap {
  constructor() { this.a = []; }
  push(v) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

/* ------------------------------ generation ----------------------------- */

let cached = null;

export function generateLumenWorld() {
  if (cached) return cached;
  const size = LUMEN_SIZE;
  const N = size + 1;

  // Coast field on tile corners; land/water anywhere is its bilinear blend plus
  // a little per-pixel roughness (landField), so tiles and pixels agree at centres.
  const corner = new Float32Array(N * N);
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) corner[j * N + i] = coarseField(i, j);
  }
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
    const base = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    return base + (valueNoise(u * 1.7, v * 1.7, 5) - 0.5) * 0.5;
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
  const coastDist = chamfer(size, water); // land → nearest water
  const seaDist = chamfer(size, isLand); // water → nearest land

  // Terrain per tile.
  const terrain = new Array(size);
  for (let y = 0; y < size; y += 1) {
    terrain[y] = new Array(size);
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const u = x + 0.5;
      const v = y + 0.5;
      const rand = hash2(x, y, 99);
      if (!isLand[i]) {
        const shelf = SHELVES.find((s) => ellipseDist(u, v, s) < 0);
        const lagoon = ellipseDist(u, v, ATOLL) < -ATOLL.ring;
        let type = TERRAIN.DEEP_OCEAN;
        if (lake[i] || lagoon || seaDist[i] <= 2.5 || shelf) type = TERRAIN.SHALLOW_WATER;
        else if (seaDist[i] <= 6) type = TERRAIN.OCEAN;
        if (shelf?.id === 'wreck' && rand < 0.45) type = TERRAIN.REEF;
        if (!lagoon && Math.abs(ellipseDist(u, v, ATOLL)) < ATOLL.ring + 1.4) type = TERRAIN.REEF;
        const sea = SEA_REGIONS.find((r) => Math.hypot(u - r.cx, v - r.cy) < r.r);
        terrain[y][x] = {
          type,
          k: lake[i] ? 'lake' : lagoon ? 'lagoon' : 'water',
          b: sea?.biome || 'sea',
          r: sea?.id || null,
          h: 0,
          lv: -1,
          v: rand,
          sd: seaDist[i],
        };
        continue;
      }
      const isle = ISLES.find((s) => ellipseDist(u, v, s) < s.wob + 1.5);
      const atollDist = Math.abs(ellipseDist(u, v, ATOLL));
      const region = isle || atollDist < ATOLL.ring + 2 ? null : regionAt(u, v);
      const biome = isle ? isle.biome : atollDist < ATOLL.ring + 2 ? 'atoll' : region.biome;
      const onContinent = !isle && biome !== 'atoll';
      const hm = onContinent ? mountainAt(u, v) : 0;
      const h = heightAt(u, v, coastDist[i], biome, hm);
      let lv = 0;
      if (onContinent && isHighland(u, v)) lv = 1;
      if (onContinent && isMesa(u, v)) lv = 2;
      terrain[y][x] = {
        type: TERRAIN.GRASS,
        k: 'grass',
        b: biome,
        r: region?.id || isle?.id || (biome === 'atoll' ? 'coral' : null),
        h,
        hm,
        lv,
        v: rand,
        cd: coastDist[i],
      };
    }
  }

  despeckleLevels(terrain, size);
  assignKinds(terrain, size);

  const river = carveRiver(terrain, size);
  const town = stampTown(terrain);
  const roads = buildRoads(terrain, size, town);
  const entities = placeEntities(terrain, size, town);

  const islands = [
    ...LUMEN_REGIONS.map((r) => ({ id: r.id, name: r.name, cx: r.cx, cy: r.cy, r: r.r, biome: r.biome })),
    ...SEA_REGIONS.map((r) => ({ id: r.id, name: r.name, cx: r.cx, cy: r.cy, r: r.r, biome: r.biome })),
  ];

  cached = {
    level: 2,
    id: 'lumen',
    name: 'The Lumen Reaches',
    size,
    scale: LUMEN_SCALE,
    terrain,
    entities,
    islands,
    origin: { ...LUMEN_ORIGIN },
    river,
    roads,
    town,
    landField,
    ellipses: { lakes: LAKES, shelves: SHELVES, atoll: ATOLL },
  };
  return cached;
}

/** Remove tiny level islands (single raised tiles make ugly cliff "pimples"). */
function despeckleLevels(terrain, size) {
  const seen = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      if (t.lv < 0 || seen[y * size + x]) continue;
      const comp = [];
      const stack = [[x, y]];
      seen[y * size + x] = 1;
      const border = new Map();
      while (stack.length) {
        const [cx, cy] = stack.pop();
        comp.push([cx, cy]);
        for (const [dx, dy] of DIRS8.slice(0, 4)) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
          const n = terrain[ny][nx];
          if (n.lv === t.lv) {
            if (!seen[ny * size + nx]) { seen[ny * size + nx] = 1; stack.push([nx, ny]); }
          } else if (n.lv >= 0) {
            border.set(n.lv, (border.get(n.lv) || 0) + 1);
          }
        }
      }
      if (comp.length >= 7 || border.size === 0) continue;
      let lv = t.lv;
      let most = -1;
      border.forEach((count, l) => { if (count > most) { most = count; lv = l; } });
      for (const [cx, cy] of comp) terrain[cy][cx].lv = lv;
    }
  }
}

function assignKinds(terrain, size) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = terrain[y][x];
      if (t.lv < 0) continue;
      const n = fbm(x * 0.16, y * 0.16, 47);
      const beachy = t.cd <= 1.5 && t.lv === 0;
      let k = 'grass';
      switch (t.b) {
        case 'harbor': k = n > 0.62 ? 'meadow' : 'grass'; break;
        case 'vale': k = n < 0.36 ? 'grass' : n > 0.74 ? 'meadow' : 'field'; break;
        case 'plains': k = n > 0.66 ? 'meadow' : n < 0.26 ? 'forest' : 'grass'; break;
        case 'blossom': k = n > 0.66 ? 'meadow' : n < 0.24 ? 'forest' : 'blossom'; break;
        case 'elder': k = n > 0.72 ? 'grass' : 'deep'; break;
        case 'autumn': k = n > 0.7 ? 'grass' : 'autumn'; break;
        case 'marsh': k = 'marsh'; break;
        case 'fjord': k = t.hm > 0.3 ? 'rock' : n < 0.36 ? 'pine' : n > 0.66 ? 'tundra' : 'snow'; break;
        case 'peaks':
        case 'crystal':
          if (t.hm > 0.42) k = 'peak';
          else if (t.hm > 0.2) k = 'rock';
          else k = n < 0.42 ? 'pine' : 'alpine';
          break;
        case 'dunes': k = t.lv >= 2 ? 'mesa' : n > 0.8 ? 'scrub' : 'desert'; break;
        case 'volcano': k = t.h > 0.62 ? 'ash' : t.h > 0.42 ? 'scree' : 'grass'; break;
        case 'atoll': k = 'sand'; break;
        case 'isle': k = n > 0.5 ? 'forest' : 'grass'; break;
        case 'rock': k = 'rock'; break;
        default: break;
      }
      if (beachy && !['fjord', 'marsh', 'volcano', 'rock'].includes(t.b)) k = 'sand';
      if (t.b === 'fjord' && t.cd <= 1.2) k = 'ice';
      t.k = k;
      t.type = kindToTerrain(k);
    }
  }
}

export function kindToTerrain(k) {
  switch (k) {
    case 'sand':
    case 'desert':
    case 'scrub': return TERRAIN.BEACH;
    case 'meadow':
    case 'field': return TERRAIN.MEADOW;
    case 'forest':
    case 'blossom':
    case 'autumn':
    case 'pine': return TERRAIN.FOREST;
    case 'deep': return TERRAIN.DEEP_FOREST;
    case 'marsh': return TERRAIN.SWAMP;
    case 'rock':
    case 'mesa':
    case 'ash':
    case 'scree': return TERRAIN.MOUNTAIN;
    case 'peak': return TERRAIN.PEAK;
    case 'snow':
    case 'ice': return TERRAIN.SNOW;
    case 'lava': return TERRAIN.LAVA;
    case 'road':
    case 'plaza': return TERRAIN.PATH;
    default: return TERRAIN.GRASS;
  }
}

function carveRiver(terrain, size) {
  const samples = splineSamples(LUMEN_RIVER, 0.1);
  let falls = null;
  let prevLv = null;
  for (const p of samples) {
    const t = terrain[Math.floor(p.y)]?.[Math.floor(p.x)];
    if (!t || t.lv < 0) continue;
    if (prevLv === 1 && t.lv === 0 && !falls) falls = { x: Math.floor(p.x), y: Math.floor(p.y) };
    prevLv = t.lv;
  }
  for (const p of samples) {
    // Width in tiles: a stream under the lake, a proper river by the bay.
    p.w = 0.55 + p.t * 0.95 + Math.sin(p.s * 0.9) * 0.08;
  }
  for (const p of samples) {
    const x = Math.floor(p.x);
    const y = Math.floor(p.y);
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    const t = terrain[y][x];
    if (t.lv < 0) continue;
    const cx = x + 0.5 - p.x;
    const cy = y + 0.5 - p.y;
    if (Math.hypot(cx, cy) > p.w * 0.5 + 0.35) continue;
    t.river = true;
    t.type = TERRAIN.SHALLOW_WATER;
  }
  return { samples, falls };
}

/* ------------------------------ town ----------------------------------- */

/**
 * Lantern Harbor, laid out by hand: a paved square with a fountain, streets
 * off each side, a quay on the water, a bridge to the east quarter and a
 * lighthouse on the point. Anything that lands on water is skipped.
 */
const TOWN = {
  plaza: [72, 104, 78, 109],
  streets: [
    [[75, 96], [75, 103]],
    [[79, 107], [86, 107]],
    [[63, 106], [71, 106]],
    [[74, 110], [76, 110]],
    [[70, 98], [74, 98]],
    [[84, 100], [84, 106]],
  ],
  quay: [67, 110, 81, 113],
  buildings: [
    { type: 'hall', x: 72, y: 101, w: 3 },
    { type: 'house', x: 70, y: 101 }, { type: 'house', x: 77, y: 101 },
    { type: 'house', x: 69, y: 104 }, { type: 'house', x: 69, y: 107 },
    { type: 'house', x: 66, y: 103 }, { type: 'house', x: 66, y: 107 },
    { type: 'house', x: 63, y: 103 }, { type: 'house', x: 71, y: 96 },
    { type: 'house', x: 77, y: 97 }, { type: 'house', x: 67, y: 99 },
    { type: 'house', x: 64, y: 108 }, { type: 'house', x: 79, y: 104 },
    { type: 'house', x: 85, y: 101 }, { type: 'house', x: 88, y: 102 },
    { type: 'house', x: 85, y: 104 }, { type: 'house', x: 88, y: 105 },
    { type: 'warehouse', x: 86, y: 108, w: 3 },
    { type: 'house', x: 81, y: 98 },
  ],
  lighthouse: [92, 110],
  piers: [[77, 113, 3], [72, 113, 3], [83, 110, 2]],
};

function stampTown(terrain) {
  const o = LUMEN_ORIGIN;
  const okLand = (x, y) => {
    const t = terrain[y]?.[x];
    return t && t.lv === 0 && !t.river;
  };
  const pave = (x, y, k) => {
    if (!okLand(x, y)) return;
    const t = terrain[y][x];
    if (t.built) return;
    t.k = k;
    t.type = TERRAIN.PATH;
    t.town = true;
  };
  const [px0, py0, px1, py1] = TOWN.plaza;
  for (let y = py0; y <= py1; y += 1) for (let x = px0; x <= px1; x += 1) pave(x, y, 'plaza');
  const streets = [];
  for (const [[ax, ay], [bx, by]] of TOWN.streets) {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y += 1) {
      for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x += 1) {
        if (terrain[y]?.[x]?.river) {
          terrain[y][x].bridge = true;
          streets.push([x, y]);
          continue;
        }
        pave(x, y, 'street');
        if (okLand(x, y)) streets.push([x, y]);
      }
    }
  }
  // Quay: land tiles on the waterfront.
  const [qx0, qy0, qx1, qy1] = TOWN.quay;
  for (let y = qy0; y <= qy1; y += 1) {
    for (let x = qx0; x <= qx1; x += 1) {
      if (!okLand(x, y)) continue;
      let wet = false;
      for (const [dx, dy] of DIRS8) {
        const n = terrain[y + dy]?.[x + dx];
        if (n && n.lv < 0) wet = true;
      }
      if (wet || terrain[y][x].k === 'sand') pave(x, y, 'quay');
    }
  }
  const buildings = [];
  for (const b of TOWN.buildings) {
    const w = b.w || 2;
    let ok = true;
    for (let y = b.y; y <= b.y + 1 && ok; y += 1) {
      for (let x = b.x; x < b.x + w && ok; x += 1) {
        const t = terrain[y]?.[x];
        if (!okLand(x, y) || t.built || t.k === 'plaza' || t.k === 'street' || t.k === 'quay') ok = false;
      }
    }
    if (!ok) continue;
    for (let y = b.y; y <= b.y + 1; y += 1) {
      for (let x = b.x; x < b.x + w; x += 1) {
        terrain[y][x].built = true;
        terrain[y][x].town = true;
      }
    }
    buildings.push({ ...b, w, v: buildings.length });
  }
  // Gardens between buildings stay green but never sprout forest.
  for (let y = o.y - 12; y <= o.y + 6; y += 1) {
    for (let x = o.x - 13; x <= o.x + 18; x += 1) {
      const t = terrain[y]?.[x];
      if (t && t.lv >= 0 && !t.town && Math.hypot(x - o.x, (y - o.y) * 1.2) < 12) {
        t.town = true;
        if (t.k !== 'sand') t.k = t.k === 'field' ? 'meadow' : t.k;
      }
    }
  }
  const piers = TOWN.piers.map(([x, y, len]) => ({ x, y, len }));
  return { plaza: TOWN.plaza, streets, buildings, piers, lighthouse: { x: TOWN.lighthouse[0], y: TOWN.lighthouse[1] }, center: { ...o } };
}

/* ------------------------------ roads ---------------------------------- */

const ROAD_TARGETS = [
  [87, 80], // windmill hill
  [85, 55], // falls lookout
  [58, 63], // blossom shrine
  [40, 43], // elder tree
  [33, 27], // frostfang camp
  [70, 19], // observatory
  [106, 28], // crystal caverns
  [125, 58], // sun temple
  [121, 86], // emberwood lodge
  [45, 84], // mistfen boardwalk
];

function buildRoads(terrain, size, town) {
  const road = new Uint8Array(size * size);
  for (const [x, y] of town.streets) road[y * size + x] = 1;
  const paths = [];
  const start = [75, 96];
  for (const target of ROAD_TARGETS) {
    const path = astar(terrain, size, road, start, target);
    if (!path) continue;
    paths.push(path);
    for (const [x, y] of path) road[y * size + x] = 1;
  }
  // Road tiles become PATH for logic (bridges keep the river's water).
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!road[y * size + x]) continue;
      const t = terrain[y][x];
      if (t.town) continue;
      t.road = true;
      if (!t.river) t.type = TERRAIN.PATH;
    }
  }
  return { paths, mask: road };
}

function astar(terrain, size, road, [sx, sy], [tx, ty]) {
  const key = (x, y) => y * size + x;
  const g = new Float32Array(size * size).fill(Infinity);
  const from = new Int32Array(size * size).fill(-1);
  const heap = new Heap();
  g[key(sx, sy)] = 0;
  heap.push([Math.hypot(tx - sx, ty - sy), sx, sy]);
  while (heap.size) {
    const [, x, y] = heap.pop();
    if (x === tx && y === ty) break;
    const cur = terrain[y][x];
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= size - 1 || ny >= size - 1) continue;
      const t = terrain[ny][nx];
      if (t.lv < 0 || t.built || (t.town && !road[key(nx, ny)] && t.k !== 'street')) continue;
      let c = dx && dy ? 1.414 : 1;
      if (road[key(nx, ny)]) c *= 0.3;
      else {
        if (t.k === 'deep' || t.k === 'marsh') c += 0.8;
        if (t.k === 'rock' || t.k === 'peak' || t.k === 'mesa') c += 1.2;
        if (t.cd < 1.5) c += 0.6;
      }
      if (t.river) c += 5;
      const dl = Math.abs(t.lv - cur.lv);
      if (dl) c += dx && dy ? 40 : 10 * dl; // climb straight up a cliff, never diagonally
      const ng = g[key(x, y)] + c;
      if (ng < g[key(nx, ny)]) {
        g[key(nx, ny)] = ng;
        from[key(nx, ny)] = key(x, y);
        heap.push([ng + Math.hypot(tx - nx, ty - ny) * 0.9, nx, ny]);
      }
    }
  }
  if (!Number.isFinite(g[key(tx, ty)])) return null;
  const path = [];
  let k = key(tx, ty);
  while (k !== -1) {
    path.push([k % size, Math.floor(k / size)]);
    k = from[k];
  }
  return path.reverse();
}

/* ------------------------------ entities ------------------------------- */

/**
 * Small finds between the big landmarks, placed so something new turns up
 * every section or two (positions picked from the discovery order).
 */
export const LUMEN_FINDS = [
  { id: 'fishers-cove', sprite: 'fisherHut', x: 65, y: 113 },
  { id: 'standing-stones', sprite: 'stones', x: 61, y: 100 },
  { id: 'scarecrow', sprite: 'scarecrow', x: 89, y: 94 },
  { id: 'honey-grove', sprite: 'hives', x: 70, y: 75 },
  { id: 'wishing-well', sprite: 'well', x: 103, y: 89 },
  { id: 'balloon-meadow', sprite: 'balloon', x: 97, y: 72 },
  { id: 'seal-rocks', sprite: 'seals', x: 96, y: 128 },
  { id: 'sea-arch', sprite: 'arch', x: 41, y: 106 },
  { id: 'escarpment-watch', sprite: 'watchtower', x: 78, y: 53 },
  { id: 'salt-caravan', sprite: 'caravan', x: 119, y: 72 },
  { id: 'cloudfoot-springs', sprite: 'springs', x: 76, y: 47 },
  { id: 'amber-obelisk', sprite: 'obelisk', x: 110, y: 59 },
  { id: 'fairy-ring', sprite: 'fairyRing', x: 35, y: 60 },
  { id: 'kelp-forest', sprite: 'kelp', x: 24, y: 86 },
  { id: 'trail-cairn', sprite: 'cairn', x: 92, y: 45 },
  { id: 'bottle-l2', sprite: 'bottle', x: 85, y: 134 },
  { id: 'sleeping-giant', sprite: 'statue', x: 51, y: 43 },
  { id: 'goat-ledge', sprite: 'goats', x: 82, y: 28 },
  { id: 'windcutter-pass', sprite: 'cairn', x: 59, y: 28 },
  { id: 'old-leviathan', sprite: 'bones', x: 130, y: 45 },
  { id: 'frozen-ship', sprite: 'frozenShip', x: 54, y: 21 },
  { id: 'ice-hut', sprite: 'iceHut', x: 47, y: 15 },
];

/** Snap to the nearest tile that passes `ok`, spiralling out from (x, y). */
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

const plainLand = (t) => t.lv >= 0 && !t.river && !t.road && !t.built && !t.town;

function placeEntities(terrain, size, town) {
  const entities = [];
  const add = (type, x, y, extra = {}) => {
    entities.push({ type, x, y, ...extra });
    const t = terrain[y]?.[x];
    if (t && t.lv >= 0 && type !== 'treasure_chest') t.prop = type;
  };

  for (const b of town.buildings) entities.push({ type: b.type, x: b.x, y: b.y, w: b.w, v: b.v });
  for (const p of town.piers) entities.push({ type: 'pier', x: p.x, y: p.y, len: p.len });
  entities.push({ type: 'lighthouse', x: town.lighthouse.x, y: town.lighthouse.y });
  entities.push({ type: 'fountain', x: 75, y: 106.5 });
  for (const [x, y, v] of [[72.2, 104.2, 0], [77.4, 104.2, 1], [72.2, 108.4, 2], [77.4, 108.4, 3]]) entities.push({ type: 'stall', x, y, v });
  for (const [x, y] of [[71.6, 103.6], [78.6, 103.6], [71.6, 109.6], [78.6, 109.6], [75.6, 99], [80.2, 106.4], [83.4, 106.4]]) entities.push({ type: 'lamp', x, y });
  for (const [x, y, v] of [[79.5, 114.2, 0], [74.2, 115.4, 1], [85.6, 112.2, 2], [69.5, 116.5, 3], [89, 117.6, 0]]) entities.push({ type: 'boat', x, y, v });
  entities.push({ type: 'ship', x: 94.5, y: 118.5 });

  const spot = (x, y, ok = plainLand, r = 6) => nearest(terrain, size, x, y, ok, r);
  const CLEAR = { elderTree: 3.6, temple: 3.4, observatory: 3.2, crystalCave: 2.2, shrine: 2.2, lodge: 1.6, stiltHouse: 1.5, camp: 1.6, igloo: 1.2, forge: 1.5, windmill: 1.3 };
  const clearAround = (type, px, py) => {
    const r = CLEAR[type];
    if (!r) return;
    for (let yy = Math.floor(py - r); yy <= Math.ceil(py + r); yy += 1) {
      for (let xx = Math.floor(px - r); xx <= Math.ceil(px + r); xx += 1) {
        const t = terrain[yy]?.[xx];
        if (!t || t.lv < 0 || Math.hypot(xx - px, yy - py) > r) continue;
        t.clear = true;
        if (type === 'elderTree') t.k = 'glade';
        if (type === 'observatory') { t.hm = Math.min(t.hm, 0.2); t.k = 'rock'; }
      }
    }
  };
  const landmark = (type, x, y, extra = {}, ok = plainLand, r = 6) => {
    const p = spot(x, y, ok, r);
    if (p) {
      add(type, p.x, p.y, extra);
      clearAround(type, p.x, p.y);
    }
    return p;
  };

  for (const [x, y] of [[86, 81], [89.5, 83.5], [85, 85.5]]) {
    const p = spot(Math.round(x), Math.round(y));
    if (p) {
      add('windmill', p.x, p.y, { seed: entities.length });
      clearAround('windmill', p.x, p.y);
    }
  }
  landmark('elderTree', 40, 42);
  landmark('shrine', 58, 63);
  landmark('temple', 126, 57);
  landmark('observatory', 70, 16, {}, (t) => t.lv >= 0 && !t.river && !t.built);
  landmark('crystalCave', 106, 28, {}, (t) => t.lv >= 0 && !t.river && !t.built);
  for (let i = 0; i < 14; i += 1) {
    const x = Math.round(98 + hash2(i, 1, 501) * 20);
    const y = Math.round(18 + hash2(i, 2, 503) * 14);
    const p = spot(x, y, (t) => t.lv >= 0 && (t.b === 'crystal' || t.b === 'peaks') && t.hm > 0.12 && !t.road, 3);
    if (p) add('crystal', p.x, p.y, { seed: hash2(i, 3, 505), big: i < 4 });
  }
  landmark('volcano', 142, 75, {}, (t) => t.lv >= 0);
  landmark('forge', 137, 80, {}, (t) => t.lv >= 0 && t.b === 'volcano' && t.h < 0.5);
  landmark('lodge', 121, 86);
  landmark('stiltHouse', 45, 84, {}, (t) => t.lv >= 0 && !t.road && !t.river);
  landmark('camp', 33, 27);
  landmark('igloo', 22, 22, {}, (t) => t.lv >= 0 && (t.k === 'snow' || t.k === 'tundra'));
  for (const [x, y] of [[123, 131], [129, 128], [131, 138]]) landmark('hut', x, y, {}, (t) => t.lv >= 0 && t.b === 'atoll', 3);
  for (const f of LUMEN_FINDS) {
    entities.push({ type: 'find', ...f });
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const t = terrain[f.y + dy]?.[f.x + dx];
        if (t && t.lv >= 0) t.clear = true;
      }
    }
    const t = terrain[f.y]?.[f.x];
    if (t && t.lv >= 0) t.prop = 'find';
  }
  entities.push({ type: 'library', x: 47, y: 133 });
  entities.push({ type: 'wreck', x: 100, y: 145 });
  entities.push({ type: 'skyhaven', x: 26, y: 112 });
  for (let i = 0; i < 16; i += 1) {
    const x = 6 + hash2(i, 5, 507) * 40;
    const y = 4 + hash2(i, 6, 509) * 30;
    const tx = Math.round(x);
    const ty = Math.round(y);
    const t = terrain[ty]?.[tx];
    if (t && t.lv < 0 && t.sd > 1.5 && t.sd < 7) entities.push({ type: 'iceberg', x, y, seed: hash2(i, 7, 511) });
  }

  // Treasure: one near most landmarks, a few hidden in quiet corners.
  const CHESTS = [
    [70, 112], [88, 86], [86, 56], [44, 45], [61, 60], [121, 47], [110, 29], [67, 19], [30, 26],
    [138, 83], [127, 132], [55, 128], [121, 88], [43, 88], [150, 108], [12, 138],
  ];
  for (const [x, y] of CHESTS) {
    const p = spot(x, y, (t) => t.lv >= 0 && !t.river && !t.road && !t.built && !t.prop && t.k !== 'plaza' && t.k !== 'street' && t.k !== 'quay', 5);
    if (p) entities.push({ type: 'treasure_chest', x: p.x, y: p.y, name: 'Treasure Chest', id: `lumen:${p.x},${p.y}` });
  }
  return entities;
}
