import React, { useEffect, useRef, useState } from 'react';
import { Check, EyeOff, Pencil, Timer, X } from 'lucide-react';
import LabFrame from '../LabFrame';
import { scoreRecall } from '../sim/recall';

const KEY = 'coast.memoryPalace.route';
const HISTORY = 'coast.memoryPalace.attempts';
const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
const blank = (n) => Array.from({ length: n }, () => ({ place: '', item: '' }));

function ago(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'less than a minute';
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'}`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

export default function RecallLab({ params = {}, onResult }) {
  const size = Math.min(10, Math.max(3, Number(params.stops) || 5));
  const saved = read(KEY, null);
  const [route, setRoute] = useState(saved?.stops?.length ? saved.stops : blank(size));
  const [savedAt, setSavedAt] = useState(saved?.savedAt || null);
  const [phase, setPhase] = useState(saved?.stops?.length ? 'ready' : 'setup');  // setup → ready → testing → scored
  const [answers, setAnswers] = useState([]);
  const [score, setScore] = useState(null);
  const started = useRef(0);
  const [attempts, setAttempts] = useState(() => read(HISTORY, []));
  const [openedAt] = useState(() => Date.now());
  useEffect(() => { if (phase === 'testing') started.current = Date.now(); }, [phase]);

  const complete = route.every((s) => s.place.trim() && s.item.trim());
  const saveRoute = () => {
    const at = Date.now();
    write(KEY, { stops: route, savedAt: at });
    write(HISTORY, []);
    setAttempts([]);
    setSavedAt(at);
    setPhase('ready');
  };
  const submit = () => {
    const s = scoreRecall(route, answers);
    const now = Date.now();
    const seconds = Math.round((now - started.current) / 1000);
    const attempt = { at: Date.now(), inPlace: s.inPlace, total: s.total, seconds };
    const next = [...attempts, attempt];
    write(HISTORY, next);
    setAttempts(next);
    setScore({ ...s, seconds, number: next.length, sinceSetup: savedAt ? now - savedAt : null });
  };

  const message = score ? [
    `🧪 Recall test · attempt ${score.number}${score.sinceSetup !== null ? `, ${ago(score.sinceSetup)} after I set up the route` : ''}`,
    `Recalled in the right place: ${score.inPlace} of ${score.total} (${score.recalled} of ${score.total} items came back at all), in ${score.seconds} s`,
    ...score.perPlace.map((p, i) => `${i + 1}. ${p.place}: ${p.correct ? '✓' : `✗ I wrote "${p.answer || '(nothing)'}", it was "${p.item}"`}`),
    attempts.length > 1 ? `Earlier attempts: ${attempts.slice(0, -1).map((a) => `${a.inPlace}/${a.total}`).join(', ')}` : '',
    'The items were hidden in the lab while I recalled (I could still have looked elsewhere).',
  ].filter(Boolean).join('\n') : null;

  return (
    <LabFrame title="Recall test" hint="Your route, then a real test." result={message} onResult={onResult}>
      {phase === 'setup' && (
        <>
          <p className="lab-caption">Enter the places on your route in walking order, and the item you placed at each one. They stay on this device.</p>
          <ol className="lab-route">
            {route.map((s, i) => (
              <li key={i}>
                <input placeholder={`Place ${i + 1}`} value={s.place} aria-label={`Place ${i + 1}`}
                  onChange={(e) => setRoute((r) => r.map((x, j) => (j === i ? { ...x, place: e.target.value } : x)))} />
                <input placeholder="Item you put there" value={s.item} aria-label={`Item at place ${i + 1}`}
                  onChange={(e) => setRoute((r) => r.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))} />
              </li>
            ))}
          </ol>
          <div className="lab-row">
            <button type="button" className="lab-btn lab-btn--go" disabled={!complete} onClick={saveRoute}><Check size={14} aria-hidden="true" /> Save my route</button>
            {route.length < 10 && <button type="button" className="lab-btn lab-btn--quiet" onClick={() => setRoute((r) => [...r, { place: '', item: '' }])}>Add a stop</button>}
          </div>
        </>
      )}
      {phase === 'ready' && (
        <>
          <p className="lab-caption">Route saved{savedAt ? ` ${ago(Math.max(0, openedAt - savedAt))} ago` : ''}: {route.length} stops. When you start, the items are hidden and you walk the route from memory.</p>
          <div className="lab-row">
            <button type="button" className="lab-btn lab-btn--go" onClick={() => { setAnswers(route.map(() => '')); setScore(null); setPhase('testing'); }}>
              <EyeOff size={14} aria-hidden="true" /> Start the test
            </button>
            <button type="button" className="lab-btn lab-btn--quiet" onClick={() => setPhase('setup')}><Pencil size={14} aria-hidden="true" /> Edit route</button>
          </div>
          {attempts.length > 0 && <p className="lab-status">Attempts so far: {attempts.map((a) => `${a.inPlace}/${a.total}`).join(' · ')}</p>}
        </>
      )}
      {phase === 'testing' && !score && (
        <>
          <p className="lab-caption"><Timer size={13} aria-hidden="true" /> Walk your route. What did you place at each stop?</p>
          <ol className="lab-route">
            {route.map((s, i) => (
              <li key={i}>
                <span className="lab-route__place">{s.place}</span>
                <input autoComplete="off" value={answers[i] || ''} aria-label={`What was at ${s.place}?`} autoFocus={i === 0}
                  onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))} />
              </li>
            ))}
          </ol>
          <div className="lab-row">
            <button type="button" className="lab-btn lab-btn--go" onClick={submit}><Check size={14} aria-hidden="true" /> Check my recall</button>
          </div>
        </>
      )}
      {score && (
        <>
          <p className={`lab-verdict ${score.inPlace === score.total ? 'is-ok' : ''}`}>{score.inPlace} of {score.total} in the right place, in {score.seconds} s.</p>
          <ol className="lab-route lab-route--scored">
            {score.perPlace.map((p, i) => (
              <li key={i} className={p.correct ? 'is-ok' : 'is-bad'}>
                {p.correct ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                <span className="lab-route__place">{p.place}</span>
                <span>{p.correct ? p.item : <>you wrote “{p.answer || '…'}”, it was <b>{p.item}</b></>}</span>
              </li>
            ))}
          </ol>
          <div className="lab-row">
            <button type="button" className="lab-btn lab-btn--quiet" onClick={() => { setScore(null); setPhase('ready'); }}>Try again later</button>
          </div>
        </>
      )}
    </LabFrame>
  );
}
