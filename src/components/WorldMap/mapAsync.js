/**
 * mapAsync.js — world art and fog, built in workers and cached.
 *
 * Art and fog each get their own worker so they paint in parallel. peek*()
 * return the finished canvas/layer or null (and start building it); load*()
 * return a promise. If workers are unavailable everything falls back to the
 * main thread.
 */
import { getWorldCanvas, primeWorldCanvas } from './mapTerrain';
import { getFogLayer, peekCachedFogLayer, primeFogLayer } from './mapFog';

const workers = { art: null, fog: null };
let seq = 0;
const pending = new Map();

function getWorker(kind) {
  if (workers[kind] !== null) return workers[kind];
  try {
    const worker = new Worker(new URL('./lumenWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      if (data.error) p.reject(new Error(data.error));
      else p.resolve(data);
    };
    worker.onerror = () => {
      workers[kind] = false;
      pending.forEach((p, id) => {
        if (p.kind !== kind) return;
        pending.delete(id);
        p.reject(new Error('map worker failed'));
      });
    };
    workers[kind] = worker;
  } catch {
    workers[kind] = false;
  }
  return workers[kind];
}

function call(message) {
  const w = getWorker(message.type);
  if (!w) return Promise.reject(new Error('no worker'));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, kind: message.type });
    w.postMessage({ ...message, id });
  });
}

function toCanvas(buffer, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(buffer), width, height), 0, 0);
  return canvas;
}

const artPromises = new Map();
const artReady = new Map();

export function loadWorldCanvas(world) {
  const level = world.level || 1;
  if (!artPromises.has(level)) {
    const p = call({ type: 'art', level })
      .then(({ buffer, width, height }) => {
        const canvas = toCanvas(buffer, width, height);
        primeWorldCanvas(world, canvas);
        return canvas;
      })
      .catch(() => getWorldCanvas(world))
      .then((canvas) => {
        artReady.set(level, canvas);
        return canvas;
      });
    artPromises.set(level, p);
  }
  return artPromises.get(level);
}

export function peekWorldCanvas(world) {
  const level = world.level || 1;
  if (artReady.has(level)) return artReady.get(level);
  loadWorldCanvas(world);
  return null;
}

const fogPromises = new Map();

/** `keep: false` for a passing state (a reveal's "before" fog) not worth caching across visits. */
export function loadFogLayer(world, unlocked, { keep = true } = {}) {
  const level = world.level || 1;
  const hit = peekCachedFogLayer(world, unlocked);
  if (hit) return Promise.resolve(hit);
  const key = `${level}:${unlocked.size}`;
  if (!fogPromises.has(key)) {
    const p = call({ type: 'fog', level, count: unlocked.size, keep })
      .then(({ buffer, W, P, dist }) => primeFogLayer(world, unlocked, {
        canvas: toCanvas(buffer, W, W), scale: P, dist: new Float32Array(dist),
      }))
      .catch(() => getFogLayer(world, unlocked))
      .finally(() => fogPromises.delete(key));
    fogPromises.set(key, p);
  }
  return fogPromises.get(key);
}

export function peekFogLayer(world, unlocked, options) {
  const hit = peekCachedFogLayer(world, unlocked);
  if (hit) return hit;
  loadFogLayer(world, unlocked, options);
  return null;
}
