/**
 * mapDiscovery.js — what the student has found, and what is coming next.
 *
 * The fog lifts in a fixed order (getDiscoveryOrder), so for every landmark,
 * find and treasure chest we know exactly how much more progress uncovers it.
 * That turns "keep studying" into a concrete promise: "Smoke rises far out to
 * sea — about 2 sections away".
 */

import { countCellsInRadius, getDiscoveryOrder } from './mapTerrain';
import { getLandmarks } from './mapLandmarks';

/** Unlock points a mastered section usually earns (35 bonus + ≥25 minutes). */
export const POINTS_PER_SECTION = 60;

/**
 * How reveal grows with points, per world. The backend sends the live values
 * in the map payload (reveal_pacing); these are the defaults it uses.
 *  area:   charted tiles grow linearly with points (every section uncovers
 *          about the same amount of land)
 *  radius: radius grows linearly with points (kept for older payloads)
 */
const DEFAULT_PACING = {
  1: { mode: 'area', clear: 9, full: 139, points: 4200 },
  2: { mode: 'area', clear: 9, full: 143, points: 4800 },
};

export function pacingFor(world, data) {
  const p = data?.reveal_pacing;
  const base = DEFAULT_PACING[world.level || 1];
  if (!p || (p.level && p.level !== (world.level || 1))) return base;
  return { ...base, ...p };
}

/** Tiles charted at a given reveal radius. */
export function chartedCount(world, radius) {
  return countCellsInRadius(world.origin.x, world.origin.y, radius, world.size);
}

/** Points (into this level) at which the tile with this rank is charted. */
function pointsForRank(world, pacing, rank) {
  const total = world.size * world.size;
  const c0 = chartedCount(world, pacing.clear);
  if (rank < c0) return 0;
  if (pacing.mode === 'area') {
    return Math.min(pacing.points, ((rank + 1 - c0) / Math.max(1, total - c0)) * pacing.points);
  }
  // Radius pacing: smallest radius whose disc covers rank + 1 tiles.
  let lo = pacing.clear;
  let hi = pacing.full + 2;
  for (let k = 0; k < 24; k += 1) {
    const mid = (lo + hi) / 2;
    if (chartedCount(world, mid) > rank) hi = mid;
    else lo = mid;
  }
  return Math.min(pacing.points, ((hi - pacing.clear) / (pacing.full - pacing.clear)) * pacing.points);
}

/** Points the student has banked in this level, from the payload or the radius. */
function currentPoints(world, pacing, radius, data) {
  if (typeof data?.level_points === 'number') return data.level_points;
  if (pacing.mode === 'area') {
    const total = world.size * world.size;
    const c0 = chartedCount(world, pacing.clear);
    return ((chartedCount(world, radius) - c0) / Math.max(1, total - c0)) * pacing.points;
  }
  return ((radius - pacing.clear) / (pacing.full - pacing.clear)) * pacing.points;
}

function sectionsFor(points) {
  return Math.max(1, Math.ceil(points / POINTS_PER_SECTION - 0.05));
}

/**
 * Every discoverable thing in the world with its status.
 * @param complete  the whole world is charted (a finished level)
 */
export function discoveryStatus(world, data, { complete = false } = {}) {
  if (!world) return { items: [], next: null, charted: 0 };
  const { rank } = getDiscoveryOrder(world);
  const pacing = pacingFor(world, data);
  const radius = data?.reveal_radius || pacing.clear;
  const charted = complete ? world.size * world.size : chartedCount(world, radius);
  const have = currentPoints(world, pacing, radius, data);
  const items = [];
  for (const l of getLandmarks(world)) {
    items.push({ ...l, kind: l.minor ? 'find' : 'landmark', rank: rank[l.y * world.size + l.x] });
  }
  for (const e of world.entities || []) {
    if (e.type !== 'treasure_chest') continue;
    items.push({
      id: e.id || `${e.x},${e.y}`, kind: 'chest', name: 'Treasure chest', x: e.x, y: e.y,
      beacon: 'glint', teaser: 'Something glints in the fog.', rank: rank[e.y * world.size + e.x],
    });
  }
  for (const it of items) {
    it.discovered = complete || it.start || it.rank < charted;
    if (!it.discovered) {
      const need = pointsForRank(world, pacing, it.rank);
      it.pointsAway = Math.max(0, need - have);
      it.sectionsAway = sectionsFor(it.pointsAway);
      it.tilesAway = it.rank + 1 - charted;
    }
  }
  items.sort((a, b) => a.rank - b.rank);
  const upcoming = items.filter((i) => !i.discovered);
  const next = upcoming[0] || null;
  if (next) {
    // Progress since the previous discovery, for a bar that fills as you study.
    const prev = [...items].reverse().find((i) => i.discovered && i.rank < next.rank);
    const from = prev ? prev.rank : 0;
    next.progress = Math.max(0, Math.min(1, (charted - from) / Math.max(1, next.rank + 1 - from)));
  }
  return { items, next, upcoming, charted, pacing };
}

/** Items whose rank falls in [fromCount, toCount): what a reveal just uncovered. */
export function newlyDiscovered(items, fromCount, toCount) {
  return items.filter((i) => !i.start && i.rank >= fromCount && i.rank < toCount);
}
