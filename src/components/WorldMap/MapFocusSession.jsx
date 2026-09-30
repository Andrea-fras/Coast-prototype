import React, { useState, useEffect, useRef, useReducer, useCallback } from 'react';
import { ArrowLeft, Maximize2, Minimize2, Pause, Play, RotateCcw } from 'lucide-react';
import './MapFocusSession.css';

import coastLogo from '../../assets/Coastlogo-white.svg';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import { PRESETS, initialTimer, remainingSeconds, restoreTimer, timerReducer } from '../../utils/focusTimer';

const CHIME = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1oa2NgaGhrf4OLjIV8cnh4dXV8hIyMiYB1cXR0c3mBiYuJg3pxcHN0d3+Hi4qFfHNwcnR3fYaKiYR8c3BydHd9houJhHxzcHJ0d32Gi4mEfHNwcnR3fYaLiYR8c3BydHd9houJhA==';

const MODES = {
  focus: { label: 'Focus', accent: '#ffb503' },
  short: { label: 'Short break', accent: '#4ecdc4' },
  long: { label: 'Long break', accent: '#9b8cff' },
};
const CYCLE = 4; // focus blocks before a long break
const IDLE_MS = 2600;

/**
 * Full-screen focus timer over the drifting world map (the camera is driven
 * by WorldMap). Built to look good on camera: the world is the backdrop, the
 * time is big and quiet, and while it runs every control fades away until the
 * pointer moves. Stays mounted while closed so a running timer keeps ticking.
 */
export default function MapFocusSession(props) {
  const { user, token } = useAuth();
  return <FocusTimer key={user?.id || 'guest'} {...props} userId={user?.id} token={token} />;
}

function FocusTimer({ active, onClose, userId, token }) {
  const storageKey = `coast_focus_v1_${userId || 'guest'}`;
  const [timer, dispatch] = useReducer(timerReducer, null, () => {
    try { return restoreTimer(localStorage.getItem(storageKey), Date.now()); }
    catch { return initialTimer(); }
  });
  const [now, setNow] = useState(Date.now);
  const [idle, setIdle] = useState(false);
  const [done, setDone] = useState(null);
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement));
  const audioRef = useRef(null);
  const idleRef = useRef(0);
  const { preset, mode, sessions } = timer;
  const [seenSessions, setSeenSessions] = useState(sessions);
  const running = timer.deadline != null;
  const timeLeft = remainingSeconds(timer, now);
  const totalTime = PRESETS[preset][mode];

  useEffect(() => { audioRef.current = new Audio(CHIME); }, []);
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(timer)); } catch { /* Timer still works without browser storage. */ }
  }, [storageKey, timer]);
  useEffect(() => {
    if (!running) return undefined;
    let sounded = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= timer.deadline && !sounded) {
        sounded = true;
        audioRef.current?.play().catch(() => {});
      }
      dispatch({ type: 'tick', now: current });
    };
    const interval = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [running, timer.deadline]);

  // A finished focus block gets its moment.
  if (sessions !== seenSessions) {
    setSeenSessions(sessions);
    if (sessions > seenSessions) setDone({ n: sessions, next: mode });
  }
  // A finished focus block counts as studying today (keeps the streak alive).
  const doneBlock = done?.n;
  useEffect(() => {
    if (!doneBlock || !token) return;
    fetch(`${API_URL}/api/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feature: 'focus', action: 'complete', duration_ms: PRESETS[preset].focus * 1000 }),
    }).catch(() => {});
  }, [doneBlock, token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!done) return undefined;
    const t = window.setTimeout(() => setDone(null), 5200);
    return () => window.clearTimeout(t);
  }, [done]);

  const toggle = useCallback(() => {
    const current = Date.now();
    setNow(current);
    setDone(null);
    setIdle(false);
    dispatch({ type: 'toggle', now: current });
  }, []);

  // While the timer runs, controls fade after a moment without input.
  const wake = useCallback(() => {
    setIdle(false);
    window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => {
    if (!active || !running) return undefined;
    idleRef.current = window.setTimeout(() => setIdle(true), IDLE_MS);
    return () => window.clearTimeout(idleRef.current);
  }, [active, running]);
  const hideChrome = idle && running;

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
      else if (e.code === 'Space' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        toggle();
      }
      wake();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose, toggle, wake]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Leaving the timer leaves browser full screen too.
  useEffect(() => {
    if (active || !document.fullscreenElement) return;
    document.exitFullscreen?.().catch(() => {});
  }, [active]);

  // App-wide floating buttons (help, dev toggles) step aside while it's open.
  useEffect(() => {
    if (!active) return undefined;
    document.documentElement.dataset.focusTimer = 'on';
    return () => { delete document.documentElement.dataset.focusTimer; };
  }, [active]);

  if (!active) return null;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = totalTime > 0 ? 1 - timeLeft / totalTime : 0;
  const started = running || timeLeft < totalTime;
  const { accent } = MODES[mode];
  const label = running || !started ? MODES[mode].label : 'Paused';
  // Blocks finished in this cycle of four (all four during the long break).
  const filled = mode === 'long' && sessions > 0 && sessions % CYCLE === 0 ? CYCLE : sessions % CYCLE;
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  return (
    <div
      className={`wm-fs${hideChrome ? ' is-idle' : ''}${running ? ' is-running' : ''}`}
      role="dialog"
      aria-label="Focus timer"
      style={{ '--fs-accent': accent }}
      onPointerMove={wake}
      onPointerDown={wake}
    >
      <div className="wm-fs__shade" aria-hidden />

      <button type="button" className="wm-fs__back wm-fs__chrome" onClick={onClose}>
        <ArrowLeft size={17} aria-hidden /> Map
      </button>

      <div className="wm-fs__stage">
        <span className="wm-fs__label">{label}</span>
        <time className="wm-fs__time" aria-live="off" dateTime={`PT${minutes}M${seconds}S`}>
          {String(minutes).padStart(2, '0')}
          <span className="wm-fs__colon">:</span>
          {String(seconds).padStart(2, '0')}
        </time>
        <span className="wm-fs__line" aria-hidden>
          <i style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress))})` }} />
        </span>
        <span className="wm-fs__dots" role="img" aria-label={`${filled} of ${CYCLE} focus blocks done`}>
          {Array.from({ length: CYCLE }, (_, i) => <i key={i} className={i < filled ? 'is-on' : ''} />)}
        </span>

        <div className="wm-fs__controls wm-fs__chrome">
          <button type="button" className="wm-fs__btn" onClick={() => dispatch({ type: 'reset' })} aria-label="Reset timer" title="Reset">
            <RotateCcw size={18} />
          </button>
          <button type="button" className="wm-fs__btn wm-fs__btn--play" onClick={toggle} aria-label={running ? 'Pause' : 'Start'}>
            {running ? <Pause size={24} /> : <Play size={24} className="wm-fs__play-icon" />}
          </button>
          {canFullscreen ? (
            <button
              type="button"
              className="wm-fs__btn"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          ) : <span className="wm-fs__btn-spacer" aria-hidden />}
        </div>

        {!running && (
          <div className="wm-fs__options wm-fs__chrome">
            <div className="wm-fs__seg" role="tablist" aria-label="Timer mode">
              {[['focus', 'Focus'], ['short', 'Break']].map(([key, text]) => {
                const on = key === 'focus' ? mode === 'focus' : mode !== 'focus';
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    className={on ? 'is-on' : ''}
                    onClick={() => dispatch({ type: 'mode', mode: key })}
                  >
                    {text}
                  </button>
                );
              })}
            </div>
            <div className="wm-fs__seg" role="tablist" aria-label="Timer length">
              {Object.entries(PRESETS).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={preset === key}
                  className={preset === key ? 'is-on' : ''}
                  onClick={() => dispatch({ type: 'preset', preset: key })}
                >
                  {val.label}
                </button>
              ))}
            </div>
            {!started && <span className="wm-fs__hint">Press space to start</span>}
          </div>
        )}
      </div>

      {done && (
        <div className="wm-fs__done" key={done.n} role="status">
          <span className="wm-fs__done-ring" aria-hidden />
          <strong>Focus block done</strong>
          <span>{done.next === 'long' ? 'Four in a row. Take a long break.' : 'Nice work. Take a short break.'}</span>
        </div>
      )}

      <div className="wm-fs__mark" aria-hidden>
        <img src={coastLogo} alt="" />
        <span>coast.academy</span>
      </div>
    </div>
  );
}
