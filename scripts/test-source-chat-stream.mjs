import test from 'node:test';
import assert from 'node:assert/strict';
import { readSourceChatStream } from '../src/utils/sourceChatStream.js';
const response = text => new Response(new ReadableStream({ start(c) { for (const b of new TextEncoder().encode(text)) c.enqueue(new Uint8Array([b])); c.close(); } }));
test('SSE tolerates byte boundaries and Unicode', async () => {
 const events=[]; await readSourceChatStream(response('data: {"token":"café ∑"}\r\n\r\ndata: {"done":true,"reply":"ok"}\r\n\r\n'), e=>events.push(e));
 assert.equal(events[0].token,'café ∑'); assert.equal(events.length,2);
});
test('truncated streams are failures', async () => { await assert.rejects(readSourceChatStream(response('data: {"token":"partial"}\n\n'),()=>{}), /connection ended/); });
test('provider error never masquerades as success', async () => { await assert.rejects(readSourceChatStream(response('data: {"error":"Retry later"}\n\n'),()=>{}), /Retry later/); });
