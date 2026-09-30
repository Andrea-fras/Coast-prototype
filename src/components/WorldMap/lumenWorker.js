/**
 * Paints world art and fog off the main thread (they take a few hundred
 * milliseconds each), so opening the map never freezes the page. Fog states
 * are always a prefix of the discovery order, so only the number of charted
 * tiles needs to cross the thread boundary.
 *
 * In production builds finished layers are also kept in IndexedDB, tagged
 * with this worker's content-hashed URL (the bundle contains all the art
 * code), so the next visit shows the map without painting it again.
 */
import { getDiscoveryOrder, getWorldMap, renderWorldPixels } from './mapTerrain';
import { paintFogPixels } from './mapFog';

const NS = import.meta.env?.DEV ? null : self.location.href;
let dbPromise = null;

function openDb() {
  if (!NS || typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open('coast-map', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('layers');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}

async function loadLayer(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction('layers').objectStore('layers').get(key);
      req.onsuccess = () => resolve(req.result?.ns === NS ? req.result : null);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
}

/** Store a layer. put() copies it synchronously, so its buffers can be transferred afterwards. */
async function saveLayer(key, value) {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction('layers', 'readwrite').objectStore('layers').put({ ...value, ns: NS }, key);
  } catch { /* the cache is optional */ }
}

self.onmessage = async ({ data }) => {
  const { id, type, level = 1, count = 0, keep = true } = data;
  try {
    if (type === 'art') {
      const key = `art|${level}`;
      let art = await loadLayer(key);
      if (!art) {
        const img = renderWorldPixels(getWorldMap(level));
        art = { width: img.width, height: img.height, buffer: img.data.buffer };
        await saveLayer(key, art);
      }
      self.postMessage({ id, width: art.width, height: art.height, buffer: art.buffer }, [art.buffer]);
    } else if (type === 'fog') {
      // One fog state per world: the one the student saw last (a reveal's
      // "before" layer is not kept).
      const key = `fog|${level}`;
      let fog = await loadLayer(key);
      if (!fog || fog.count !== count) {
        const world = getWorldMap(level);
        const unlocked = new Set(getDiscoveryOrder(world).keys.slice(0, count));
        const painted = paintFogPixels(world, unlocked);
        fog = { count, W: painted.W, P: painted.P, buffer: painted.data.buffer, dist: painted.dist.buffer };
        if (keep) await saveLayer(key, fog);
      }
      self.postMessage({ id, W: fog.W, P: fog.P, buffer: fog.buffer, dist: fog.dist }, [fog.buffer, fog.dist]);
    }
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
