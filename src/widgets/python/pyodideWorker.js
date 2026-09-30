/* Runs students' Python in the browser with Pyodide, off the main thread. Classic worker so
 * importScripts can load Pyodide from the CDN the first time a lab runs (the browser caches it).
 * Messages in: { id, code, tests: [{ name, code }] }. Messages out: status, stdout, stderr,
 * error, and done { results: [{ name, ok, message }] }. */
/* global importScripts, loadPyodide */
const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v0.28.3/full/';
let booting = null;

function boot() {
  if (!booting) {
    booting = (async () => {
      importScripts(`${PYODIDE_URL}pyodide.js`);
      return loadPyodide({ indexURL: PYODIDE_URL });
    })();
  }
  return booting;
}

// Pyodide's tracebacks start inside its own runtime; the student only needs their own lines.
function tidy(message = '') {
  const lines = String(message).split('\n');
  const start = lines.findIndex((l) => l.includes('File "<exec>"'));
  const kept = start >= 0 ? lines.slice(start) : lines;
  return kept.join('\n').replace(/File "<exec>"/g, 'Your code').trim();
}

const lastLine = (message = '') => String(message).trim().split('\n').filter(Boolean).pop() || 'failed';

self.onmessage = async ({ data }) => {
  const { id, code, tests = [] } = data;
  const post = (type, extra = {}) => self.postMessage({ id, type, ...extra });
  let namespace = null;
  try {
    post('status', { text: 'Starting Python (the first run takes a few seconds)…' });
    const py = await boot();
    py.setStdout({ batched: (text) => post('stdout', { text }) });
    py.setStderr({ batched: (text) => post('stderr', { text }) });
    post('status', { text: 'Loading the packages your code imports…' });
    await py.loadPackagesFromImports([code, ...tests.map((t) => t.code)].join('\n'), { messageCallback: () => {} });
    namespace = py.globals.get('dict')();
    post('status', { text: 'Running…' });
    try {
      await py.runPythonAsync(code, { globals: namespace });
    } catch (err) {
      post('error', { text: tidy(err.message) });
      post('done', { ran: false, results: [] });
      return;
    }
    const results = [];
    for (const t of tests) {
      try {
        await py.runPythonAsync(t.code, { globals: namespace });
        results.push({ name: t.name, ok: true });
      } catch (err) {
        results.push({ name: t.name, ok: false, message: lastLine(err.message).replace(/^AssertionError:?\s*/, '') });
      }
    }
    post('done', { ran: true, results });
  } catch (err) {
    post('error', { text: `Python couldn't start: ${err.message || err}` });
    post('done', { ran: false, results: [] });
  } finally {
    namespace?.destroy?.();
  }
};
