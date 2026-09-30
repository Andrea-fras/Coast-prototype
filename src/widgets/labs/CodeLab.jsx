import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw, Square, CircleCheck, CircleX } from 'lucide-react';
import LabFrame from '../LabFrame';
import { LABS } from '../python/labs';

// One Python worker for the page: Pyodide loads once and every lab reuses it. A run that goes
// past its time limit (an endless loop) terminates the worker; the next run starts a fresh one.
let worker = null;
let runSeq = 0;
function getWorker() {
  if (!worker) worker = new Worker(new URL('../python/pyodideWorker.js', import.meta.url));
  return worker;
}
function killWorker() {
  worker?.terminate();
  worker = null;
}

const storageKey = (lab) => `coast.pythonLab.${lab}`;
const load = (lab) => { try { return localStorage.getItem(storageKey(lab)); } catch { return null; } };
const save = (lab, code) => { try { localStorage.setItem(storageKey(lab), code); } catch { /* private mode */ } };

function resultMessage(lab, code, results, output, error) {
  const passed = results.filter((r) => r.ok).length;
  const lines = [`🧪 Python lab: ${lab.title}`];
  if (results.length) {
    lines.push(`Tests: ${passed} of ${results.length} pass`);
    results.forEach((r) => lines.push(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : `: ${r.message}`}`));
  }
  if (error) lines.push('Error:', error.split('\n').slice(-6).join('\n'));
  const out = output.trim().split('\n').slice(-12).join('\n');
  if (out) lines.push('Output:', out);
  const trimmed = code.length > 3500 ? `${code.slice(0, 3500)}\n# … (cut)` : code;
  lines.push('My code:', '```python', trimmed, '```');
  return lines.join('\n');
}

export default function CodeLab({ params = {}, onResult }) {
  const labId = LABS[params.lab] ? params.lab : null;
  const lab = useMemo(() => (labId ? LABS[labId] : {
    title: 'Python', goal: 'Try some Python.', starter: params.starter || 'print("Hello from Python")\n', tests: [],
  }), [labId, params.starter]);
  const [code, setCode] = useState(() => (labId && load(labId)) || lab.starter);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const timer = useRef(null);
  const listener = useRef(null);

  useEffect(() => () => {
    clearTimeout(timer.current);
    if (listener.current) worker?.removeEventListener('message', listener.current);
  }, []);

  const edit = (value) => {
    setCode(value);
    if (labId) save(labId, value);
  };

  const stop = (reason) => {
    clearTimeout(timer.current);
    if (listener.current) worker?.removeEventListener('message', listener.current);
    listener.current = null;
    killWorker();
    setRunning(false);
    setStatus('');
    if (reason) setError(reason);
  };

  const run = () => {
    if (running) return;
    const id = ++runSeq;
    setRunning(true); setOutput(''); setError(''); setResults(null); setStatus('Starting…');
    const w = getWorker();
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === 'status') setStatus(data.text);
      if (data.type === 'stdout') setOutput((o) => `${o}${data.text}\n`);
      if (data.type === 'stderr') setOutput((o) => `${o}${data.text}\n`);
      if (data.type === 'error') setError(data.text);
      if (data.type === 'done') {
        clearTimeout(timer.current);
        w.removeEventListener('message', onMessage);
        listener.current = null;
        setRunning(false); setStatus('');
        setResults(data.ran ? data.results : []);
      }
    };
    listener.current = onMessage;
    w.addEventListener('message', onMessage);
    const limit = (lab.timeout || 30) * 1000 + 20_000;  // plus time to load Python the first time
    timer.current = setTimeout(() => stop(`Stopped: the code was still running after ${Math.round(limit / 1000)} s. Is there a loop that never ends?`), limit);
    w.postMessage({ id, code, tests: lab.tests });
  };

  const keyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: t } = el;
      edit(`${code.slice(0, s)}    ${code.slice(t)}`);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 4; });
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
  };

  const done = results !== null;
  const passed = results?.filter((r) => r.ok).length ?? 0;
  const message = done || error ? resultMessage(lab, code, results || [], output, error) : null;
  const rows = Math.min(30, Math.max(8, code.split('\n').length + 1));

  return (
    <LabFrame title={`Python lab · ${lab.title}`} hint={lab.goal} result={message} onResult={onResult}>
      <textarea
        className="lab-code" value={code} rows={rows} spellCheck={false} autoCapitalize="off" autoCorrect="off"
        onChange={(e) => edit(e.target.value)} onKeyDown={keyDown} aria-label="Your Python code"
      />
      <div className="lab-row">
        {running ? (
          <button type="button" className="lab-btn" onClick={() => stop('Stopped.')}><Square size={14} aria-hidden="true" /> Stop</button>
        ) : (
          <button type="button" className="lab-btn lab-btn--go" onClick={run}><Play size={14} aria-hidden="true" /> Run</button>
        )}
        {labId && (
          <button type="button" className="lab-btn lab-btn--quiet" disabled={running}
            onClick={() => { if (window.confirm('Put the starter code back? Your changes will be lost.')) edit(lab.starter); }}>
            <RotateCcw size={14} aria-hidden="true" /> Starter code
          </button>
        )}
        <span className="lab-status" role="status">{status || (done && results.length ? `${passed} of ${results.length} tests pass` : '')}</span>
      </div>
      {(output || error) && (
        <pre className={`lab-output${error ? ' lab-output--error' : ''}`}>{output}{error && `${output ? '\n' : ''}${error}`}</pre>
      )}
      {done && results.length > 0 && (
        <ul className="lab-tests">
          {results.map((r) => (
            <li key={r.name} className={r.ok ? 'is-ok' : 'is-bad'}>
              {r.ok ? <CircleCheck size={15} aria-hidden="true" /> : <CircleX size={15} aria-hidden="true" />}
              <span>{r.name}{!r.ok && r.message ? <small>{r.message}</small> : null}</span>
            </li>
          ))}
        </ul>
      )}
    </LabFrame>
  );
}
