import { useEffect, useState, useCallback } from 'react';
import { API_URL } from '../config';
import { sanitizeNotes } from './sanitizeNotes';

// Shared by the lesson sidebar and library; writes for different notes never
// cancel one another, and writes for the same note are serialized.
const entries = new Map();
const empty = { html: '', loaded: false, saving: false, error: '', dirty: false };
const draftKey = (key) => `coast_note_draft_${key}`;
function notify(e) { for (const fn of e.listeners) fn({ ...e.state }); }
function remember(e) {
  try { localStorage.setItem(draftKey(e.key), JSON.stringify({ html: e.state.html, revision: e.revision })); }
  catch { e.state.error = 'Draft could not be stored on this device. Keep this page open until saved.'; }
}
function getEntry(userId, folder, token) {
  const key = `${userId}:${encodeURIComponent(folder)}`;
  if (!entries.has(key)) entries.set(key, {
    key, token, folder, state: { ...empty }, listeners: new Set(), revision: null,
    timer: null, loading: null, pending: null, conflict: false, disposed: false,
  });
  const e = entries.get(key);
  e.token = token;
  return e;
}
function url(e) { return `${API_URL}/api/folders/${encodeURIComponent(e.folder)}/lesson-notes`; }
function headers(e) { return { Authorization: `Bearer ${e.token}`, 'Content-Type': 'application/json' }; }
async function load(e) {
  if (e.state.loaded || e.loading || e.disposed) return e.loading;
  e.loading = (async () => {
    try {
      const res = await fetch(url(e), { headers: headers(e) });
      if (!res.ok) throw new Error('Could not load notes. Retry before editing.');
      const data = await res.json();
      if (e.disposed) return;
      e.revision = data.revision;
      e.state = { ...empty, html: sanitizeNotes(data.content_html), loaded: true };
      let draft;
      try { draft = JSON.parse(localStorage.getItem(draftKey(e.key))); } catch { /* no valid draft */ }
      if (draft && sanitizeNotes(draft.html) !== e.state.html) {
        e.state.html = sanitizeNotes(draft.html);
        e.state.dirty = true;
        e.conflict = draft.revision !== e.revision;
        e.state.error = e.conflict
          ? 'A newer copy was saved elsewhere. Your draft is preserved; copy or export it before reloading.'
          : 'Recovered an unsaved draft. Retrying save…';
        if (!e.conflict) e.timer = setTimeout(() => save(e), 0);
      } else {
        try { localStorage.removeItem(draftKey(e.key)); } catch { /* optional cache */ }
      }
    } catch (err) {
      e.state.error = err instanceof TypeError ? 'No connection. Your notes are safe; retry when you’re back online.' : err.message;
    }
    finally { e.loading = null; notify(e); }
  })();
  return e.loading;
}
async function save(e) {
  clearTimeout(e.timer);
  if (e.disposed || !e.state.loaded || !e.state.dirty || e.conflict) return;
  if (e.pending) return e.pending;
  const html = e.state.html;
  e.state.saving = true;
  e.state.error = '';
  notify(e);
  let succeeded = false;
  e.pending = (async () => {
    try {
      const res = await fetch(url(e), {
        method: 'PUT', headers: headers(e), keepalive: html.length < 40000,
        body: JSON.stringify({ content_html: html, revision: e.revision }),
      });
      if (res.status === 409) {
        e.conflict = true;
        throw new Error('A newer copy was saved elsewhere. Your draft is preserved; copy or export it before reloading.');
      }
      if (!res.ok) throw new Error('Notes have not saved. Your draft is kept on this device. Retry save.');
      const data = await res.json();
      e.revision = data.revision;
      e.state.dirty = e.state.html !== html;
      succeeded = true;
      if (e.state.dirty) remember(e);
      else { try { localStorage.removeItem(draftKey(e.key)); } catch { /* optional cache */ } }
    } catch (err) {
      e.state.error = err instanceof TypeError
        ? 'You’re offline. Notes not saved yet; your draft is kept on this device. Retry save.'
        : err.message || 'Could not save notes. Retry save.';
    }
    finally {
      e.pending = null;
      e.state.saving = false;
      notify(e);
      if (succeeded && e.state.dirty && !e.disposed) e.timer = setTimeout(() => save(e), 0);
    }
  })();
  return e.pending;
}
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { for (const e of entries.values()) save(e); });
  // Back online: save anything that is waiting, without the student having to press Retry.
  window.addEventListener('online', () => {
    for (const e of entries.values()) {
      if (!e.state.loaded) { if (e.state.error && e.listeners.size) load(e); }
      else if (e.state.dirty) save(e);
    }
  });
  window.addEventListener('coast-account-changed', () => {
    for (const e of entries.values()) { clearTimeout(e.timer); e.disposed = true; }
    entries.clear();
  });
}
export function useLessonNotes(userId, folder, token) {
  const [snapshot, setSnapshot] = useState({ key: null, ...empty });
  const key = userId && folder ? `${userId}:${encodeURIComponent(folder)}` : null;
  useEffect(() => {
    if (!userId || !folder || !token) return undefined;
    const e = getEntry(userId, folder, token);
    const listener = (state) => setSnapshot({ key: e.key, ...state });
    e.listeners.add(listener);
    listener(e.state);
    load(e);
    return () => { e.listeners.delete(listener); save(e); };
  }, [userId, folder, token]);
  const change = useCallback((html) => {
    if (!userId || !folder || !token) return;
    const e = getEntry(userId, folder, token);
    if (!e.state.loaded) return;
    e.state.html = sanitizeNotes(html);
    e.state.dirty = true;
    remember(e);
    notify(e);
    clearTimeout(e.timer);
    e.timer = setTimeout(() => save(e), 1000);
  }, [userId, folder, token]);
  const retry = useCallback(() => {
    if (!userId || !folder || !token) return;
    const e = getEntry(userId, folder, token);
    return e.state.loaded ? save(e) : load(e);
  }, [userId, folder, token]);
  return { ...(snapshot.key === key ? snapshot : empty), change, retry };
}
