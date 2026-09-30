/**
 * The worlds a student charts, and the fog-of-war maths shared by the map,
 * the lesson cards and the backend mirror.
 *
 *   level 1  The Lumen Reaches (lumenWorld.js / lumenArt.js)
 *   level 2  Neon Meridian     (neonWorld.js / neonArt.js), once level 1 is fully charted
 */

import { TERRAIN } from './mapTerrainTypes';
import { generateLumenWorld } from './lumenWorld';
import { renderLumenPixels } from './lumenArt';
import { generateNeonWorld } from './neonWorld';
import { renderNeonPixels } from './neonArt';

export { TERRAIN };

export const WORLDS = {
  1: { level: 1, id: 'lumen', name: 'The Lumen Reaches', short: 'Lumen Reaches', fog: 'clouds', outside: '#8a93bf' },
  2: { level: 2, id: 'neon', name: 'Neon Meridian', short: 'Neon Meridian', fog: 'smog', outside: '#0c0c0d' },
};

const GENERATORS = { 1: generateLumenWorld, 2: generateNeonWorld };
const RENDERERS = { lumen: renderLumenPixels, neon: renderNeonPixels };

const worldCache = new Map();

function isLandTerrain(type) {
  return type >= TERRAIN.BEACH && type <= TERRAIN.PATH;
}

function isShallowWater(type) {
  return type === TERRAIN.SHALLOW_WATER || type === TERRAIN.REEF;
}

function terrainMoveCost(type) {
  if (isLandTerrain(type)) {
    if (type === TERRAIN.MOUNTAIN || type === TERRAIN.PEAK || type === TERRAIN.DEEP_FOREST) {
      return 0.58;
    }
    if (type === TERRAIN.LAVA) return 0.85;
    if (type === TERRAIN.SWAMP) return 0.55;
    return 0.48;
  }
  if (isShallowWater(type)) return 0.72;
  if (type === TERRAIN.OCEAN) return 1.05;
  return 1.35;
}

function movementCostAt(world, x, y) {
  const base = terrainMoveCost(tileAt(world, x, y));
  const jitter = 0.85 + cellDiscoveryHash(x, y) * 0.3;
  return base * jitter;
}

/**
 * @returns the world object for a level (generated once, then cached). Each
 * world owns its geometry (size, origin); the backend mirrors it from the
 * exported terrain files (scripts/export-map-terrain.mjs).
 */
export function getWorldMap(level = 1) {
  const lv = level >= 2 ? 2 : 1;
  if (worldCache.has(lv)) return worldCache.get(lv);
  const mapData = GENERATORS[lv]();
  const world = {
    level: lv,
    id: WORLDS[lv].id,
    name: WORLDS[lv].name,
    fog: WORLDS[lv].fog,
    mapData,
    terrain: mapData.terrain,
    entities: mapData.entities,
    islands: mapData.islands,
    size: mapData.size,
    origin: { ...mapData.origin },
  };
  worldCache.set(lv, world);
  return world;
}

/** Pure pixels for a world's art (no DOM) — used by the map worker and tooling. */
export function renderWorldPixels(world) {
  return RENDERERS[world.id](world.mapData);
}

/**
 * Full-map pixel art on an offscreen canvas at the world's native 8 art pixels
 * per tile. Normally painted in the map worker (mapAsync.js); this synchronous
 * path is the fallback. Readers use canvas.width / world.size as px per tile.
 */
const worldCanvases = new Map();

export function getWorldCanvas(world) {
  const hit = worldCanvases.get(world.level);
  if (hit) return hit;
  const img = renderWorldPixels(world);
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  worldCanvases.set(world.level, canvas);
  return canvas;
}

export function primeWorldCanvas(world, canvas) {
  worldCanvases.set(world.level, canvas);
}

export function tileAt(world, x, y) {
  const size = world.size;
  if (x < 0 || y < 0 || x >= size || y >= size) return TERRAIN.DEEP_OCEAN;
  return world.terrain[y][x].type;
}

/** Name of the region under a tile: its district, else the nearest named place. */
export function getRegionName(tile, world) {
  if (!tile || !world) return 'Unknown Waters';
  const t = world.terrain[tile.y]?.[tile.x];
  const region = t?.r && world.islands.find((i) => i.id === t.r);
  if (region) return region.name;
  let best = null;
  let bestD = Infinity;
  for (const isl of world.islands) {
    const d = Math.hypot(tile.x - isl.cx, tile.y - isl.cy) / (isl.r || 8);
    if (d < bestD) { bestD = d; best = isl; }
  }
  if (best && bestD < 1.6) return best.name;
  return world.level === 2 ? 'The Black Water' : 'The Lumen Sound';
}

export function computeLevel(mapData) {
  if (mapData?.total_xp != null) {
    const totalXp = mapData.total_xp;
    const xpMax = mapData.xp_max || 400;
    const level = mapData.level || Math.max(1, Math.floor(totalXp / xpMax) + 1);
    const xp = mapData.xp != null ? mapData.xp : totalXp % xpMax;
    return { level, xp, xpMax, totalXp };
  }
  const xp = (mapData?.sections_mastered || 0) * 120 + Math.round(mapData?.explored_pct || 0) * 8;
  const level = Math.max(1, Math.floor(xp / 400) + 1);
  return { level, xp: xp % 400, xpMax: 400, totalXp: xp };
}

export function cellDiscoveryHash(x, y) {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) & 0xffff) / 65535;
}

export function countCellsInRadius(cx, cy, radius, size) {
  let count = 0;
  const r = Math.ceil(radius);
  for (let dx = -r; dx <= r; dx += 1) {
    for (let dy = -r; dy <= r; dy += 1) {
      if (dx * dx + dy * dy <= radius * radius) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) count += 1;
      }
    }
  }
  return count;
}

class MinHeap {
  constructor() { this.data = []; }
  push(item) { this.data.push(item); this._up(this.data.length - 1); }
  pop() {
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last !== undefined) {
      this.data[0] = last;
      this._down(0);
    }
    return top;
  }
  get size() { return this.data.length; }
  _up(i) {
    const { data } = this;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (data[p][0] <= data[i][0]) break;
      [data[p], data[i]] = [data[i], data[p]];
      i = p;
    }
  }
  _down(i) {
    const { data } = this;
    const n = data.length;
    while (true) {
      let s = i;
      const l = i * 2 + 1;
      const r = l + 1;
      if (l < n && data[l][0] < data[s][0]) s = l;
      if (r < n && data[r][0] < data[s][0]) s = r;
      if (s === i) break;
      [data[s], data[i]] = [data[i], data[s]];
      i = s;
    }
  }
}

function buildFrontierSet(unlocked, size) {
  const frontier = new Set();
  for (const key of unlocked) {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size || !unlocked.has(`${nx},${ny}`)) {
        frontier.add(key);
        break;
      }
    }
  }
  return frontier;
}

/**
 * Every tile of a world in the order the fog lifts: a Dijkstra flood from the
 * harbour where land is cheap and open sea expensive. Unlocking at a given
 * radius charts the first N tiles of this list (N = cells in a disc of that
 * radius), so it also tells exactly when any tile — or landmark — will appear.
 * @returns {{ keys: string[], rank: Int32Array }} rank[y*size+x] = position
 */
const orderCache = new Map();
export function getDiscoveryOrder(world) {
  if (orderCache.has(world)) return orderCache.get(world);
  const size = world.size;
  const { x: cx, y: cy } = world.origin;
  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  const dist = new Float64Array(size * size).fill(Infinity);
  const rank = new Int32Array(size * size).fill(-1);
  const keys = [];
  dist[cy * size + cx] = 0;
  const heap = new MinHeap();
  heap.push([0, cx, cy]);
  while (heap.size > 0) {
    const [d, x, y] = heap.pop();
    const i = y * size + x;
    if (d > dist[i]) continue;
    if (rank[i] < 0) {
      rank[i] = keys.length;
      keys.push(`${x},${y}`);
    }
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const ni = ny * size + nx;
      const step = dx && dy ? 1.414 : 1;
      const nd = d + step * movementCostAt(world, nx, ny);
      if (nd < dist[ni]) {
        dist[ni] = nd;
        heap.push([nd, nx, ny]);
      }
    }
  }
  const order = { keys, rank };
  orderCache.set(world, order);
  return order;
}

const organicUnlockCache = new Map();

export function getOrganicUnlock(cx, cy, radius, size, world) {
  const key = `${world.level}:${cx},${cy},${radius.toFixed(2)},${size}`;
  const cached = organicUnlockCache.get(key);
  if (cached) return cached;
  const target = countCellsInRadius(cx, cy, radius, size);
  const { keys } = getDiscoveryOrder(world);
  const unlocked = new Set(keys.slice(0, Math.max(0, target)));
  const result = { unlocked, frontier: buildFrontierSet(unlocked, size) };
  organicUnlockCache.set(key, result);
  if (organicUnlockCache.size > 48) {
    organicUnlockCache.delete(organicUnlockCache.keys().next().value);
  }
  return result;
}

/** Every tile of a world — a finished level stays fully charted. */
export function getFullUnlock(world) {
  const key = `${world.level}:full`;
  if (organicUnlockCache.has(key)) return organicUnlockCache.get(key);
  const unlocked = new Set(getDiscoveryOrder(world).keys);
  const result = { unlocked, frontier: new Set() };
  organicUnlockCache.set(key, result);
  return result;
}

export function getTreasureChests(world) {
  if (!world?.entities) return [];
  return world.entities
    .filter((e) => e.type === 'treasure_chest')
    .map((e) => ({
      id: e.id || `${e.x},${e.y}`,
      x: e.x,
      y: e.y,
      name: e.name || 'Treasure Chest',
    }));
}

/** Chests on charted tiles that the student hasn't opened yet. */
export function visibleTreasureChests(world, unlockedSet, openedIds) {
  return getTreasureChests(world).filter((c) => {
    if (openedIds?.has(c.id)) return false;
    return unlockedSet?.has(`${c.x},${c.y}`);
  });
}
