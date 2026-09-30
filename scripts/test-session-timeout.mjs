import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSession } from '../src/utils/loadSession.js';
const pending = signal => new Promise((resolve, reject) => {
  const abort = () => reject(new DOMException('Aborted', 'AbortError'));
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
});
test('hung request times out and can be retried successfully', async () => {
  await assert.rejects(loadSession('/me', 'fixture', { timeoutMs: 15,
    fetchImpl: async (_, { signal }) => pending(signal) }), { name: 'AbortError' });
  assert.deepEqual(await loadSession('/me', 'fixture', {
    fetchImpl: async () => new Response(JSON.stringify({ id: 7 })) }), { id: 7 });
});
test('timeout also covers a stalled response body', async () => {
  await assert.rejects(loadSession('/me', 'fixture', { timeoutMs: 15,
    fetchImpl: async (_, { signal }) => ({ ok: true, status: 200, json: () => pending(signal) }) }), { name: 'AbortError' });
});
test('only unauthorized response invalidates session; outage rejects', async () => {
  assert.equal(await loadSession('/me', 'fixture', {
    fetchImpl: async () => new Response('', { status: 401 }) }), null);
  await assert.rejects(loadSession('/me', 'fixture', {
    fetchImpl: async () => new Response('', { status: 503 }) }), /unavailable/);
});
test('unmount or account change cancels the pending request', async () => {
  const controller = new AbortController();
  const request = loadSession('/me', 'fixture', { signal: controller.signal,
    fetchImpl: async (_, { signal }) => pending(signal) });
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});
