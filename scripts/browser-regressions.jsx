import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useLessonNotes } from '../src/utils/useLessonNotes';
import { sanitizeNotes } from '../src/utils/sanitizeNotes';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const id = 999993;
const root = createRoot(document.getElementById('fixture'));
const records = new Map();
const writes = [];
let current;
let failNext = false;
let conflictNext = false;
const originalFetch = window.fetch;
window.fetch = async (url, options = {}) => {
  const folder = decodeURIComponent(String(url).match(/folders\/([^/]+)\/lesson-notes/)[1]);
  if (!records.has(folder)) records.set(folder, { content_html: '', revision: 'empty' });
  if (options.method === 'PUT') {
    if (failNext) { failNext = false; return new Response('{}', { status: 503 }); }
    if (conflictNext) { conflictNext = false; return new Response('{}', { status: 409 }); }
    const body = JSON.parse(options.body);
    writes.push({ folder, ...body });
    records.set(folder, { content_html: body.content_html, revision: 'saved-' + writes.length });
  }
  return new Response(JSON.stringify(records.get(folder)), { status: 200 });
};
export function Fixture({ folder }) {
  current = useLessonNotes(id, folder, 'fixture-token');
  return <p>{folder}: {current.loaded ? current.html : 'Loading'} {current.error}</p>;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const check = (condition, text) => {
  if (!condition) throw new Error(text);
  document.getElementById('results').textContent += 'PASS ' + text + '\n';
};
const mount = async folder => act(async () => { root.render(<Fixture folder={folder} />); await tick(); });
try {
  for (const key of Object.keys(localStorage)) if (key.startsWith(`coast_note_draft_${id}:`)) localStorage.removeItem(key);
  await mount('Alpha');
  await act(async () => { await tick(); });
  check(current.loaded, 'Notes load before editing');
  await act(async () => current.change('<p>Alpha draft</p>'));
  await mount('Beta');
  await act(async () => { await tick(); });
  check(writes.some(w => w.folder === 'Alpha' && w.content_html.includes('Alpha draft')), 'Switching notes before debounce saves the correct lesson');
  check(current.html === '', 'Alpha content never flashes into Beta');
  await act(async () => current.change('<p>Beta draft</p>'));
  failNext = true;
  await act(async () => { await current.retry(); });
  check(current.dirty && current.error, 'Failed save stays dirty and displays an error');
  check(localStorage.getItem(`coast_note_draft_${id}:Beta`).includes('Beta draft'), 'Failed save retains a recoverable local draft');
  await act(async () => { await current.retry(); });
  check(!current.dirty && records.get('Beta').content_html.includes('Beta draft'), 'Retry saves the preserved draft');
  await act(async () => current.change('<p>Conflicting edit</p>'));
  conflictNext = true;
  await act(async () => { await current.retry(); });
  check(current.error.includes('newer copy') && current.dirty, 'Conflicting writes preserve the draft without overwriting another copy');
  const html = sanitizeNotes('<img src="http://localhost:8000/api/source-images/3?access=secret" onerror="evil()"><a href="javascript:evil()">link</a>');
  check(!html.includes('secret') && !html.includes('onerror') && !html.includes('javascript:'), 'Stored notes strip executable attributes and temporary image access');
  document.getElementById('status').textContent = 'All 8 browser checks passed';
} catch (error) {
  document.getElementById('status').textContent = 'FAILED: ' + error.message;
  console.error(error);
} finally {
  await act(async () => root.unmount());
  window.dispatchEvent(new Event('coast-account-changed'));
  window.fetch = originalFetch;
  for (const key of Object.keys(localStorage)) if (key.startsWith(`coast_note_draft_${id}:`)) localStorage.removeItem(key);
}
