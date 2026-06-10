/** Adapter — Coast world map + lesson fog / XP helpers for WorldMap.jsx */

import {
  generateWorldMap as generateCoastMap,
  renderMapToCanvas,
  getIslandAt,
  HQ,
  MAP_SIZE,
  TERRAIN,
  ISLAND_DEFS,
} from './coastWorldMap';

export { MAP_SIZE, HQ, TERRAIN, ISLAND_DEFS };

export const TILE = {
  DEEP: TERRAIN.DEEP_OCEAN,
  OCEAN: TERRAIN.OCEAN,
  SHALLOW: TERRAIN.SHALLOW_WATER,
  BEACH: TERRAIN.BEACH,
  GRASS: TERRAIN.GRASS,
  FOREST: TERRAIN.FOREST,
  PORT: TERRAIN.PATH,
};

let cachedWorld = null;

function isLandTerrain(type) {
  return type >= TERRAIN.BEACH && type <= TERRAIN.PATH;
}

function isShallowWater(type) {
  return type === TERRAIN.SHALLOW_WATER || type === TERRAIN.REEF;
}

export function terrainMoveCost(type) {
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

function buildLegacyTiles(terrain, size) {
  const tiles = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      tiles[y * size + x] = terrain[y][x].type;
    }
  }
  return tiles;
}

/**
 * @returns world object consumed by WorldMap + organic unlock.
 * The world's geometry is owned by the generator (MAP_SIZE, HQ) — the
 * backend grid may differ; callers translate backend coords to this grid.
 */
export function getWorldMap() {
  if (!cachedWorld) {
    const mapData = generateCoastMap(MAP_SIZE);
    const ports = ISLAND_DEFS.map((isl) => ({
      x: isl.cx,
      y: isl.cy,
      name: isl.name,
      ancient: isl.biome === 'ruins',
      level: isl.level,
    }));
    cachedWorld = {
      mapData,
      terrain: mapData.terrain,
      entities: mapData.entities,
      islands: mapData.islands,
      tiles: buildLegacyTiles(mapData.terrain, MAP_SIZE),
      ports,
      size: MAP_SIZE,
      origin: { x: HQ.x, y: HQ.y },
    };
  }
  return cachedWorld;
}

/**
 * Full-map pixel-art render, cached on an offscreen canvas.
 * WorldMap blits the visible region from this each frame.
 */
let cachedWorldCanvas = null;
let cachedWorldCanvasTile = 0;

export function getWorldCanvas(world, tilePx = 16) {
  if (!cachedWorldCanvas || cachedWorldCanvasTile !== tilePx) {
    const canvas = document.createElement('canvas');
    renderMapToCanvas(canvas, world.mapData, { tileSize: tilePx });
    cachedWorldCanvas = canvas;
    cachedWorldCanvasTile = tilePx;
  }
  return cachedWorldCanvas;
}

export function tileAt(world, x, y) {
  const size = world?.size || MAP_SIZE;
  if (x < 0 || y < 0 || x >= size || y >= size) return TERRAIN.DEEP_OCEAN;
  if (world?.terrain) return world.terrain[y][x].type;
  return world.tiles[y * size + x];
}

export function getRegionName(player, originOrWorld) {
  if (!player) return 'Unknown Waters';
  const world = originOrWorld?.mapData ? originOrWorld : cachedWorld;
  if (world?.mapData) {
    const isl = getIslandAt(world.mapData, player.x, player.y);
    if (isl) return isl.name;
  }
  const origin = originOrWorld?.x != null
    ? originOrWorld
    : (world?.origin || { x: HQ.x, y: HQ.y });
  const dist = Math.hypot(player.x - origin.x, player.y - origin.y);
  if (dist < 8) return 'Harbor Home';
  if (dist < 25) return 'Inner Archipelago';
  if (dist < 45) return 'Coastal Reach';
  if (dist < 70) return 'Open Straits';
  if (dist < 100) return 'Far Shoals';
  return 'The Deep Unknown';
}

export function buildObjectives(mapData, world) {
  if (!mapData || !world) return [];
  const quests = [];
  const size = world.size || MAP_SIZE;
  const totalTiles = size * size;
  const origin = world.origin || { x: HQ.x, y: HQ.y };
  const unlocked = getOrganicUnlock(
    origin.x, origin.y, mapData.reveal_radius || 4, size, world,
  ).unlocked;
  const tilesCharted = unlocked.size;

  const islandLocked = (isl) => !unlocked.has(`${isl.cx},${isl.cy}`);
  const lockedIslands = (world.islands || ISLAND_DEFS).filter(islandLocked);

  if (lockedIslands.length > 0) {
    const target = lockedIslands.find((i) => i.level >= 5) || lockedIslands[0];
    quests.push({
      id: 'island',
      label: `Discover ${target.name}`,
      done: false,
      reward: '+120 XP',
      bonusReward: '+1 chest',
    });
  }

  quests.push({
    id: 'explore',
    label: 'Chart the surrounding waters',
    done: tilesCharted >= totalTiles * 0.95,
    progress: tilesCharted,
    progressMax: totalTiles,
    reward: '+40 XP',
  });

  const sectionsMastered = mapData.sections_mastered || 0;
  quests.push({
    id: 'master',
    label: 'Master a lesson section to 100%',
    done: sectionsMastered > 0,
    reward: '+80 XP',
    bonusReward: 'Map expansion',
  });

  return quests.slice(0, 3);
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

function countCellsInRadius(cx, cy, radius, size) {
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
 * Fog opacity feather: tiles just outside the charted area get partial
 * fog so the map dissolves into fog-of-war instead of hitting a hard edge.
 * Returns Map of "x,y" -> alpha for the 3 rings beyond the frontier.
 */
export function buildFogFeather(unlocked, frontier, size) {
  const ringAlphas = [0.45, 0.72, 0.9];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  const feather = new Map();
  const seen = new Set();
  let ring = frontier;

  for (let r = 0; r < ringAlphas.length; r += 1) {
    const next = new Set();
    for (const key of ring) {
      const [xs, ys] = key.split(',');
      const x = Number(xs);
      const y = Number(ys);
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const nk = `${nx},${ny}`;
        if (unlocked.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        next.add(nk);
        feather.set(nk, ringAlphas[r]);
      }
    }
    ring = next;
  }
  return feather;
}

const organicUnlockCache = new Map();

export function getOrganicUnlock(cx, cy, radius, size, world = null) {
  const key = `${cx},${cy},${radius.toFixed(2)},${size}`;
  const cached = organicUnlockCache.get(key);
  if (cached) return cached;

  const target = countCellsInRadius(cx, cy, radius, size);
  const unlocked = new Set();
  if (target <= 0) {
    const empty = { unlocked, frontier: new Set() };
    organicUnlockCache.set(key, empty);
    return empty;
  }

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  const dist = new Map();
  dist.set(`${cx},${cy}`, 0);
  const heap = new MinHeap();
  heap.push([0, cx, cy]);

  const w = world || cachedWorld;
  const costAt = (x, y) => movementCostAt(w, x, y);

  while (heap.size > 0 && unlocked.size < target) {
    const [d, x, y] = heap.pop();
    const cellKey = `${x},${y}`;
    if (d > (dist.get(cellKey) ?? Infinity)) continue;
    if (x < 0 || y < 0 || x >= size || y >= size) continue;
    unlocked.add(cellKey);

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const nk = `${nx},${ny}`;
      const step = dx && dy ? 1.414 : 1;
      const nd = d + step * costAt(nx, ny);
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        heap.push([nd, nx, ny]);
      }
    }
  }

  const result = { unlocked, frontier: buildFrontierSet(unlocked, size) };
  organicUnlockCache.set(key, result);
  if (organicUnlockCache.size > 48) {
    organicUnlockCache.delete(organicUnlockCache.keys().next().value);
  }
  return result;
}

/** Filter entities to tiles the player has charted (lesson fog). */
export function getTreasureChests(world) {
  if (!world?.entities) return [];
  return world.entities
    .filter((e) => e.type === 'treasure_chest')
    .map((e) => ({
      id: `${e.x},${e.y}`,
      x: e.x,
      y: e.y,
      name: e.name || 'Treasure Chest',
    }));
}

export function visibleTreasureChests(world, unlockedSet, openedIds) {
  return getTreasureChests(world).filter((c) => {
    if (openedIds?.has(c.id)) return false;
    return unlockedSet?.has(`${c.x},${c.y}`);
  });
}

export function visibleEntities(world, unlockedSet) {
  if (!world?.entities || !unlockedSet) return world?.entities || [];
  return world.entities.filter((e) => {
    const key = `${e.x},${e.y}`;
    if (unlockedSet.has(key)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (unlockedSet.has(`${e.x + dx},${e.y + dy}`)) return true;
    }
    return false;
  });
}
