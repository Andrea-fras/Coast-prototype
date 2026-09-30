import { API_URL } from '../config';

/** Rotating one-liners while the lesson prepares. */
export const PEDRO_TIPS = [
  'Pedro says: explaining it out loud beats re-reading every time.',
  'Tip: the first pass is for structure. Details come in the sections.',
  'Spaced repetition works best when you sleep on what you learned.',
  'If a diagram looks dense, Pedro will walk you through it piece by piece.',
  'Mastery is not speed. It is knowing when you can teach it back.',
  'Your slides are the map; Pedro helps you navigate, not memorize.',
  'Short sessions beat marathon cramming for long-term recall.',
  'Ask Pedro "why?" once more than you think you need to.',
  'Confusion at the start usually means the topic is worth learning.',
  'The roadmap orders ideas so each section builds on the last.',
];

export function createPrepareSession(folderName) {
  return {
    folder: folderName,
    startedAt: Date.now(),
    events: [],
    polls: [],
  };
}

export function logPrepareEvent(session, name, detail = '', raw = null) {
  const entry = {
    name,
    detail,
    at_ms: Date.now() - session.startedAt,
    raw,
  };
  session.events.push(entry);
  console.log(
    `[Coast prepare] ${name} (+${entry.at_ms}ms)`,
    detail || '',
    raw ?? '',
  );
  return entry;
}

/** Print a inspectable timing table to the browser console. */
export function logPrepareSummary(session) {
  const totalMs = Date.now() - session.startedAt;
  console.group(`[Coast] Lesson prepare — ${session.folder}`);

  const rows = session.events.map((e, i) => {
    const prev = i > 0 ? session.events[i - 1].at_ms : 0;
    return {
      step: e.name,
      duration_ms: e.at_ms - prev,
      cumulative_ms: e.at_ms,
      detail: e.detail || (e.raw ? JSON.stringify(e.raw) : ''),
    };
  });
  console.table(rows);

  const byStep = Object.fromEntries(
    rows.filter((r) => r.duration_ms > 0).map((r) => [r.step, r.duration_ms]),
  );
  const omaMs = (byStep.oma_ready ?? 0) || (rows.find((r) => r.step === 'oma_ready')?.cumulative_ms ?? 0) - (rows.find((r) => r.step === 'oma_wait_start')?.cumulative_ms ?? 0);
  const outlineMs = byStep.outline_done ?? 0;
  console.log('Step totals:', {
    embed_ms: byStep.embed_done ?? 0,
    oma_index_ms: omaMs,
    outline_ms: outlineMs,
    total_ms: totalMs,
  });

  const lastPoll = session.polls[session.polls.length - 1];
  if (lastPoll?.pages_expected && lastPoll.pages > lastPoll.pages_expected * 1.15) {
    console.warn(
      `[Coast prepare] Possible duplicate ingest: ${lastPoll.pages} pages indexed `
      + `but only ~${lastPoll.pages_expected} expected. Use a fresh folder or check backend timings.`,
    );
  }

  if (session.polls.length > 0) {
    console.log(`OMA polls: ${session.polls.length} snapshots`);
    console.log('Last poll:', session.polls[session.polls.length - 1]);
  }
  if (session.backendTimings?.length) {
    console.table(
      session.backendTimings.map((t, i, arr) => {
        const prev = i > 0 ? arr[i - 1].elapsed_ms : 0;
        return {
          phase: t.phase,
          duration_ms: t.elapsed_ms - prev,
          elapsed_ms: t.elapsed_ms,
          tier: t.tier ?? '',
          pdf: t.pdf ?? '',
          mentions: t.mentions ?? '',
          concepts_new: t.concepts_new ?? '',
        };
      }),
    );
  }
  console.log(`Total wall time: ${totalMs}ms (${(totalMs / 1000).toFixed(1)}s)`);
  console.groupEnd();

  if (typeof window !== 'undefined') {
    window.__coastLastPrepare = { ...session, totalMs, stepTotals: { embed_ms: byStep.embed_done, oma_index_ms: omaMs, outline_ms: outlineMs } };
  }
}

function pickRotating(list, elapsedMs, intervalMs) {
  if (!list.length) return '';
  return list[Math.floor(elapsedMs / intervalMs) % list.length];
}

export async function fetchOmaIngestProgress(folderName, token, signal) {
  const res = await fetch(
    `${API_URL}/api/folders/${encodeURIComponent(folderName)}/oma-ingest`,
    { headers: { Authorization: `Bearer ${token}` }, signal },
  );
  if (!res.ok) return null;
  return res.json();
}

const PREPARE_STORAGE_PREFIX = 'coast_prepare_active_';
const inFlightPrepare = new Map();
function accountKey(folderName) {
  let id = 'signed-out';
  try { id = JSON.parse(localStorage.getItem('coast_user'))?.id || id; } catch { /* no account */ }
  return `${id}:${encodeURIComponent(folderName)}`;
}
window.addEventListener('coast-account-changed', () => inFlightPrepare.clear());

export function isPrepareInFlight(folderName) {
  return inFlightPrepare.has(accountKey(folderName));
}

export function prepareStorageKey(folderName) {
  return `${PREPARE_STORAGE_PREFIX}${accountKey(folderName)}`;
}

export function markPrepareActive(folderName) {
  try {
    sessionStorage.setItem(prepareStorageKey(folderName), String(Date.now()));
  } catch { /* ignore */ }
}

export function isPrepareMarkedActive(folderName) {
  try {
    return !!sessionStorage.getItem(prepareStorageKey(folderName));
  } catch {
    return false;
  }
}

/** True when OMA is mid-index and not roadmap-ready yet. */
export function isOmaIndexing(omaData) {
  if (!omaData?.oma_enabled || omaData.ready_for_roadmap) return false;
  if ((omaData.ingest_threads_active || 0) > 0) return true;
  if ((omaData.pages_indexed || 0) > 0) return true;
  return (omaData.sources || []).some((s) => {
    const st = (s.status || '').toUpperCase();
    return st && !['PENDING', 'FAILED'].includes(st);
  });
}

/** Resume a prepare the user started earlier (navigated away mid-flow). */
export function shouldResumePrepare(omaData, { hasOutline = false } = {}) {
  if (hasOutline || !omaData?.oma_enabled) return false;
  if (omaData.ready_for_roadmap) return true;
  return isOmaIndexing(omaData);
}

/** Share the request and its latest stage when a page is remounted. */
export async function prepareLesson(folderName, token, options = {}) {
  const key = accountKey(folderName);
  const storageKey = prepareStorageKey(folderName);
  let entry = inFlightPrepare.get(key);
  if (!entry) {
    entry = { listeners: new Set(), latest: null, promise: null };
    inFlightPrepare.set(key, entry);
    markPrepareActive(folderName);
    entry.promise = runPrepareLesson(folderName, token, { ...options, onTick: state => {
      entry.latest = state;
      for (const listener of entry.listeners) listener(state);
    } }).finally(() => {
      if (inFlightPrepare.get(key) === entry) inFlightPrepare.delete(key);
      sessionStorage.removeItem(storageKey);
    });
  }
  if (options.onTick) {
    entry.listeners.add(options.onTick);
    if (entry.latest) options.onTick(entry.latest);
  }
  try { return await entry.promise; }
  finally { entry.listeners.delete(options.onTick); }
}

async function runPrepareLesson(folderName, token, {
  intervalMs = 1000, timeoutMs = 12 * 60 * 1000,
  signal, onTick, fetchWithRetry, skipEmbed = false,
} = {}) {
  const session = createPrepareSession(folderName);
  logPrepareEvent(session, 'start');
  let current = { stage: 'sources', indeterminate: true, percent: null, done: false,
    statusLine: 'Checking all selected sources…' };
  const tick = update => {
    current = { ...current, ...update };
    const elapsedMs = Date.now() - session.startedAt;
    onTick?.({ ...current, elapsedMs, tip: pickRotating(PEDRO_TIPS, elapsedMs, 7000) });
  };
  const pulse = setInterval(() => tick({}), 1000);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const prefix = `${API_URL}/api/folders/${encodeURIComponent(folderName)}`;
  const checkTime = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() - session.startedAt >= timeoutMs) throw new Error('Preparation is taking longer than expected. Your sources are saved. Try again shortly.');
  };
  const request = async (suffix, options = {}) => {
    checkTime();
    const res = await fetchWithRetry(prefix + suffix, { headers, signal, ...options }, { retries: 0 });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) throw new Error(typeof body.detail === 'string' ? body.detail : body.error || 'Could not prepare the lesson. Please try again.');
    return body;
  };
  try {
    tick({});
    const uploads = (await request('/uploads')).uploads || [];
    if (uploads.some(u => !['complete', 'cancelled'].includes(u.status))) {
      throw new Error('Finish or remove the pending uploads before generating your roadmap.');
    }
    const sources = (await request('/sources')).sources || [];
    const sourceIds = sources.filter(s => s.type === 'document').map(s => s.source_id).filter(Boolean);
    let outlineData = null;
    // A page reload must not automatically issue a second model request.
    if (skipEmbed) {
      tick({ stage: 'roadmap', statusLine: 'Reconnecting to your roadmap…' });
      while (!outlineData) {
        checkTime();
        const existing = await request('/lesson');
        if (existing.has_outline) outlineData = existing;
        else await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
    } else {
      logPrepareEvent(session, 'embed_start');
      await request('/embed', { method: 'POST' });
      logPrepareEvent(session, 'embed_done');
      logPrepareEvent(session, 'oma_wait_start');
      while (true) {
        checkTime();
        const data = await request('/oma-ingest');
        session.polls.push({ at_ms: Date.now() - session.startedAt, phase: data.phase,
          pages: data.pages_indexed, pages_expected: data.pages_expected, ready: data.ready_for_roadmap });
        if (!data.oma_enabled || data.ready_for_roadmap) { logPrepareEvent(session, 'oma_ready'); break; }
        tick({ statusLine: 'Reading the overview of your sources…' });
        await new Promise(resolve => setTimeout(resolve, intervalMs));
      }
      tick({ stage: 'roadmap', percent: null, indeterminate: true,
        statusLine: 'Designing your section-by-section roadmap…' });
      logPrepareEvent(session, 'outline_start');
      outlineData = await request('/outline', { method: 'POST', body: JSON.stringify({ source_ids: sourceIds }) });
      logPrepareEvent(session, 'outline_done', '', { sections: outlineData.total_sections, source: outlineData.outline_source });
    }
    tick({ stage: 'section', percent: null, indeterminate: true, statusLine: 'Preparing your first section…' });
    while (true) {
      checkTime();
      const lesson = await request('/lesson');
      if (lesson.has_outline && lesson.content_ready !== false) break;
      const prep = lesson.section_preparation;
      tick({ percent: prep?.total_pages ? Math.min(100, 100 * prep.ready_pages / prep.total_pages) : null,
        indeterminate: !prep?.total_pages,
        statusLine: prep?.total_pages ? `Preparing the first section · ${prep.ready_pages} of ${prep.total_pages} source pages ready`
          : 'Preparing your first section…' });
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    tick({ stage: 'done', percent: 100, indeterminate: false, done: true, statusLine: 'Your first section is ready. Let’s begin!' });
    logPrepareEvent(session, 'section_ready');
    logPrepareSummary(session);
    return { session, outlineData };
  } finally { clearInterval(pulse); }
}
