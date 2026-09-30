import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSourceUploadQueue } from '../src/utils/sourceUploadQueue.js';

const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const turn = () => new Promise(resolve => setImmediate(resolve));
const storage = () => { const data = new Map(); return {
  getItem: key => data.get(key) || null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key),
}; };
const files = n => Array.from({ length: n }, (_, i) => new File(['lecture content'], `Lecture ${i + 1}.pdf`));
function harness(saved = storage()) {
  const rows = new Map(), requests = [], xs = [];
  let registrationGate, syncGate;
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, ...options });
    if (options.method === 'POST') {
      await registrationGate;
      const registered = JSON.parse(options.body).files.map(file => {
        const old = rows.get(file.upload_id);
        const row = ['complete', 'processing'].includes(old?.status) ? old : { ...file, status: 'queued' };
        rows.set(row.upload_id, row); return row;
      });
      return response({ uploads: registered });
    }
    if (options.method === 'DELETE') {
      const row = rows.get(url.split('/').at(-1));
      if (!row) return response({ detail: 'Upload not found.' }, 404);
      if (row.status === 'complete') return response({ detail: 'Remove it from Sources instead.' }, 409);
      row.status = 'cancelled'; return response({ status: 'cancelled' });
    }
    const snapshot = structuredClone([...rows.values()]);
    await syncGate;
    return response({ uploads: snapshot });
  };
  class Xhr {
    upload = {};
    open() {} setRequestHeader() {}
    send(data) { this.id = data.get('upload_id'); rows.get(this.id).status = 'processing'; xs.push(this); }
    abort() { this.onabort(); }
    progress() { this.upload.onprogress({ lengthComputable: true, loaded: 100, total: 100 }); }
    complete({ loseResponse = false } = {}) {
      Object.assign(rows.get(this.id), { status: 'complete', source_id: `src_${this.id}` });
      if (loseResponse) return this.onerror();
      this.status = 200; this.responseText = JSON.stringify({ source_id: `src_${this.id}` }); this.onload();
    }
    fail() { rows.get(this.id).status = 'failed'; this.status = 500; this.responseText = '{}'; this.onload(); }
  }
  const queue = createSourceUploadQueue({ baseUrl: '/test', fetchImpl, xhrFactory: () => new Xhr(), storage: saved });
  return { queue, rows, xs, requests, saved, delayRegistration: promise => { registrationGate = promise; },
    delaySync: promise => { syncGate = promise; } };
}

test('five selected files remain visible after leaving/returning; only three transfers at once', async () => {
  const { queue: q, xs } = harness();
  const selected = q.enqueue(11, 'Lectures', 'test-token', files(5));
  assert.equal(q.get(11, 'Lectures').length, 5);
  await selected;
  assert.equal(xs.length, 3);
  let snapshot;
  const leave = q.subscribe(11, 'Lectures', value => { snapshot = value; });
  xs[0].progress();
  assert.equal(snapshot[0].status, 'processing');
  assert.equal(q.hasUnfinished(11, 'Lectures'), true);
  leave();
  for (let i = 0; i < 4; i++) { xs[i].complete(); await turn(); }
  q.subscribe(11, 'Lectures', value => { snapshot = value; });
  assert.equal(snapshot.length, 5);
  assert.equal(snapshot.filter(v => v.status === 'complete').length, 4);
  assert.equal(q.hasUnfinished(11, 'Lectures'), true);
  xs[4].complete(); await turn();
  assert.equal(q.hasUnfinished(11, 'Lectures'), false);
  assert.equal(xs.length, 5);
});

test('server commit followed by connection loss reconciles without a duplicate transfer', async () => {
  const { queue: q, xs } = harness();
  await q.enqueue(11, 'Lectures', 'token', files(1));
  xs[0].complete({ loseResponse: true }); await turn();
  const row = q.get(11, 'Lectures')[0];
  assert.equal(row.status, 'complete');
  assert.equal(row.hasFile, false);
  assert.equal(xs.length, 1);
});

test('failed transfer retries the same upload ID', async () => {
  const { queue: q, xs } = harness();
  await q.enqueue(11, 'Lectures', 'token', files(1));
  xs[0].fail(); await turn();
  const row = q.get(11, 'Lectures')[0];
  assert.equal(row.status, 'failed');
  assert.equal(row.canRetry, true);
  await q.retry(11, 'Lectures', 'token', row.upload_id);
  assert.equal(xs.length, 2);
  assert.equal(xs[1].id, xs[0].id);
  xs[1].complete(); await turn();
  assert.equal(q.hasUnfinished(11, 'Lectures'), false);
});

test('a slow status poll cannot turn a completed upload back into processing', async () => {
  const h = harness(); let release;
  await h.queue.enqueue(11, 'Lectures', 'token', files(1));
  h.delaySync(new Promise(resolve => { release = resolve; }));
  const stale = h.queue.sync(11, 'Lectures', 'token');
  h.xs[0].complete(); await turn();
  release(); await stale;
  assert.equal(h.queue.get(11, 'Lectures')[0].status, 'complete');
  assert.equal(h.queue.hasUnfinished(11, 'Lectures'), false);
});

test('removing a file during batch registration never sends its bytes', async () => {
  const h = harness(); let release;
  h.delayRegistration(new Promise(resolve => { release = resolve; }));
  const pending = h.queue.enqueue(11, 'Lectures', 'token', files(1));
  const id = h.queue.get(11, 'Lectures')[0].upload_id;
  const remove = h.queue.remove(11, 'Lectures', 'token', id);
  release(); await pending; await remove;
  assert.equal(h.xs.length, 0);
  assert.equal(h.queue.hasUnfinished(11, 'Lectures'), false);
});

test('reload keeps pending metadata scoped to the account/folder and asks for original file bytes', async () => {
  const first = harness();
  await first.queue.enqueue(11, 'Lectures', 'token', files(1));
  const second = harness(first.saved);
  assert.equal(second.queue.get(12, 'Lectures').length, 0);
  assert.equal(second.queue.get(11, 'Different').length, 0);
  const row = second.queue.get(11, 'Lectures')[0];
  assert.equal(row.status, 'failed'); assert.equal(row.hasFile, false);
  await assert.rejects(second.queue.retry(11, 'Lectures', 'token', row.upload_id), /Select .* again/);
  await assert.rejects(second.queue.retry(11, 'Lectures', 'token', row.upload_id, new File(['x'], 'Other.pdf')), /original/);
  await second.queue.retry(11, 'Lectures', 'token', row.upload_id, files(1)[0]);
  assert.equal(second.xs.length, 1);
});

// Load the browser module with only its Vite URL import replaced; run the real prepare orchestration.
const { readFile } = await import('node:fs/promises');
globalThis.localStorage = storage(); globalThis.sessionStorage = storage();
globalThis.window = new EventTarget();
const source = (await readFile(new URL('../src/utils/lessonPrepare.js', import.meta.url), 'utf8'))
  .replace("import { API_URL } from '../config';", "const API_URL = 'http://fixture.invalid';");
const { prepareLesson } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('roadmap progress stays indeterminate, reattaches on return, and completes only when section ready', async () => {
  let release, ready = false, posts = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const ticks = [], joinedTicks = [];
  const fetchWithRetry = async (url, options = {}, config = {}) => {
    assert.equal(config.retries, 0);
    if (url.endsWith('/uploads')) return response({ uploads: [] });
    if (url.endsWith('/sources')) return response({ sources: [{ type: 'document', source_id: 'source-1' }] });
    if (url.endsWith('/embed')) return response({});
    if (url.endsWith('/oma-ingest')) return response({ oma_enabled: true, ready_for_roadmap: true });
    if (url.endsWith('/outline')) {
      posts++;
      assert.deepEqual(JSON.parse(options.body), { source_ids: ['source-1'] });
      await gate;
      return response({ sections: [{ title: 'Stacks' }], total_sections: 1 });
    }
    if (url.endsWith('/lesson')) return response({ has_outline: true, content_ready: ready,
      section_preparation: { ready_pages: 2, total_pages: 8 } });
    throw Error(url);
  };
  const run = prepareLesson('Progress', 'token', { fetchWithRetry, intervalMs: 5, onTick: t => ticks.push(t) });
  await turn();
  assert.equal(ticks.at(-1).stage, 'roadmap');
  assert.equal(ticks.at(-1).indeterminate, true);
  assert.equal(ticks.at(-1).percent, null);
  const joined = prepareLesson('Progress', 'token', { fetchWithRetry, onTick: t => joinedTicks.push(t) });
  assert.equal(joinedTicks.at(-1).stage, 'roadmap');
  release(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(ticks.at(-1).stage, 'section'); assert.equal(ticks.at(-1).percent, 25);
  assert.equal(ticks.some(t => t.done), false);
  ready = true; await Promise.all([run, joined]);
  assert.equal(posts, 1); assert.equal(ticks.at(-1).done, true); assert.equal(joinedTicks.at(-1).percent, 100);
});

test('prepare refuses pending uploads before any expensive call', async () => {
  let calls = 0;
  await assert.rejects(prepareLesson('Pending', 'token', { fetchWithRetry: async url => {
    calls++; assert.ok(url.endsWith('/uploads')); return response({ uploads: [{ status: 'processing' }] });
  } }), /pending uploads/);
  assert.equal(calls, 1);
});

test('reload resume polls existing work and never submits another roadmap', async () => {
  let polls = 0;
  const { outlineData } = await prepareLesson('Reload', 'token', { skipEmbed: true, intervalMs: 1,
    fetchWithRetry: async (url, options = {}) => {
      assert.notEqual(options.method, 'POST');
      if (url.endsWith('/uploads')) return response({ uploads: [] });
      if (url.endsWith('/sources')) return response({ sources: [] });
      if (url.endsWith('/lesson')) return response({ has_outline: ++polls > 1, content_ready: true });
      throw Error(url);
    } });
  assert.equal(outlineData.has_outline, true); assert.equal(polls, 3);
});
