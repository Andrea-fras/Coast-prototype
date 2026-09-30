/** Tile unlock copy for section/map reward toasts and cards. */
export function getTilesUnlockedDelta(map) {
  if (!map) return 0;
  const delta = map.tiles_unlocked_delta;
  if (typeof delta === 'number' && delta > 0) return delta;
  return 0;
}

export function formatTilesUnlockedLine(map, { verb = 'unlocked' } = {}) {
  const n = getTilesUnlockedDelta(map);
  if (n <= 0) return null;
  const label = n === 1 ? 'tile' : 'tiles';
  return `+${n.toLocaleString()} ${label} ${verb}`;
}

export function formatTotalTilesCharted(map) {
  const total = map?.tiles_unlocked;
  if (typeof total !== 'number' || total <= 0) return null;
  const label = total === 1 ? 'tile' : 'tiles';
  return `${total.toLocaleString()} ${label} charted on the map`;
}
