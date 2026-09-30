import { getFullUnlock, getOrganicUnlock, getRegionName, getWorldMap } from '../WorldMap/mapTerrain';

/** Origin of a level's backend grid (legacy payloads only carry the current level's). */
function backendOrigin(mapData, level, world) {
  return mapData.origins?.[level]
    || ((mapData.map_level || 1) === level ? mapData.origin : null)
    || world.origin;
}

/**
 * Tiles each course charted, from the map's provenance (MapTileProvenance on the
 * server): { [folder]: { all: [{x, y, level}], sections: { [index]: [...] }, level } }.
 * Level 1 keys are "x,y"; later worlds are prefixed ("2:x,y"). The server keys
 * tiles on its own grid; they are moved onto the generated world here.
 */
export function tilesByFolder(mapData) {
  const result = {};
  if (!mapData?.tile_sections) return result;
  for (const [rawKey, ref] of Object.entries(mapData.tile_sections)) {
    const section = typeof ref === 'number' ? mapData.section_catalog?.[ref] : ref;
    if (!section?.folder || section.folder === '__harbor__') continue;
    const colon = rawKey.indexOf(':');
    const level = colon > 0 ? Number(rawKey.slice(0, colon)) || 1 : 1;
    const key = colon > 0 ? rawKey.slice(colon + 1) : rawKey;
    const world = getWorldMap(level);
    const bo = backendOrigin(mapData, level, world);
    const [bx, by] = key.split(',').map(Number);
    const tile = { x: bx - bo.x + world.origin.x, y: by - bo.y + world.origin.y, level };
    const entry = result[section.folder] || (result[section.folder] = { all: [], sections: {} });
    entry.all.push(tile);
    const idx = section.section_index ?? 0;
    (entry.sections[idx] || (entry.sections[idx] = [])).push(tile);
  }
  // A course that spans two worlds is pictured in the newer one.
  for (const entry of Object.values(result)) {
    entry.level = Math.max(...entry.all.map((t) => t.level));
    entry.all = entry.all.filter((t) => t.level === entry.level);
    for (const [i, list] of Object.entries(entry.sections)) {
      const same = list.filter((t) => t.level === entry.level);
      entry.sections[i] = same.length ? same : list;
    }
  }
  return result;
}

/** The region ("Canal Quarter", "Lantern Harbor"…) a set of tiles mostly sits in. */
export function describeTiles(tiles) {
  if (!tiles?.length) return null;
  const world = getWorldMap(tiles[0].level || 1);
  const counts = new Map();
  for (const t of tiles) {
    const name = getRegionName(t, world);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  let best = null;
  counts.forEach((n, name) => { if (!best || n > counts.get(best)) best = name; });
  return best;
}

/** Charted tiles of a world for this payload: finished worlds are fully charted. */
export function chartedArea(mapData, world = getWorldMap(mapData?.map_level || 1)) {
  if ((world.level || 1) < (mapData?.map_level || 1)) return getFullUnlock(world);
  const radius = mapData?.reveal_radius || 4;
  return getOrganicUnlock(world.origin.x, world.origin.y, radius, world.size, world);
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Where a course with no charted land yet will start: a spot on the current coastline. */
export function frontierSpot(mapData, seed) {
  const world = getWorldMap(mapData?.map_level || 1);
  const frontier = [...chartedArea(mapData, world).frontier];
  if (!frontier.length) return { ...world.origin, level: world.level };
  const [x, y] = frontier[hash(seed || 'coast') % frontier.length].split(',').map(Number);
  return { x, y, level: world.level };
}
