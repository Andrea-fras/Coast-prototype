import { useEffect, useState } from 'react';
import { API_URL } from '../config';

// One copy of the compact map payload, shared by the map and the lesson library
// so course covers can show the land each course charted without a second fetch.
let cached = null;
let inflight = null;
const listeners = new Set();

function publish(data) {
  cached = data;
  listeners.forEach((listener) => listener(data));
}

export function primeMapData(data) {
  if (data) publish(data);
}

export function loadMapData(token, { force = false } = {}) {
  if (!token) return Promise.resolve(cached);
  if (cached && !force) return Promise.resolve(cached);
  if (inflight) return inflight;
  inflight = fetch(`${API_URL}/api/map?compact=true`, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data) publish(data);
      return data || cached;
    })
    .catch(() => cached)
    .finally(() => { inflight = null; });
  return inflight;
}

export function useMapData(token) {
  const [data, setData] = useState(cached);
  useEffect(() => {
    listeners.add(setData);
    loadMapData(token);
    const refresh = () => loadMapData(token, { force: true });
    window.addEventListener('coast-map-progress', refresh);
    return () => {
      listeners.delete(setData);
      window.removeEventListener('coast-map-progress', refresh);
    };
  }, [token]);
  return data;
}

// A different account must never see the previous student's world.
if (typeof window !== 'undefined') {
  window.addEventListener('coast-account-changed', () => {
    cached = null;
    listeners.forEach((listener) => listener(null));
  });
}
