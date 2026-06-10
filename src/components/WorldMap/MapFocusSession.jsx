import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, RotateCcw, Brain, Coffee, X } from 'lucide-react';
import './MapFocusSession.css';

const PRESETS = {
  classic: { focus: 25 * 60, short: 5 * 60, long: 15 * 60, label: '25 / 5' },
  deep: { focus: 50 * 60, short: 10 * 60, long: 20 * 60, label: '50 / 10' },
  sprint: { focus: 15 * 60, short: 3 * 60, long: 10 * 60, label: '15 / 3' },
};

const CHIME = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1oa2NgaGhrf4OLjIV8cnh4dXV8hIyMiYB1cXR0c3mBiYuJg3pxcHN0d3+Hi4qFfHNwcnR3fYaKiYR8c3BydHd9houJhHxzcHJ0d32Gi4mEfHNwcnR3fYaLiYR8c3BydHd9houJhA==';

/**
 * Full-screen relaxing focus page. The world map cinematically drifts
 * behind it (camera driven by WorldMap); this overlay holds the timer.
 * Stays mounted while closed so a running timer keeps ticking.
 */
export default function MapFocusSession({ active, onClose }) {
  const [preset, setPreset] = useState('classic');
  const [mode, setMode] = useState('focus');
  const [timeLeft, setTimeLeft] = useState(PRESETS.classic.focus);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef(null);
  const audioRef = useRef(null);

  const durations = PRESETS[preset];
  const totalTime = durations[mode];

  useEffect(() => {
    audioRef.current = new Audio(CHIME);
  }, []);

  const switchMode = useCallback((newMode) => {
    setMode(newMode);
    setTimeLeft(PRESETS[preset][newMode]);
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [preset]);

  useEffect(() => {
    setTimeLeft(PRESETS[preset][mode]);
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  useEffect(() => {
    if (!running) return undefined;
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          audioRef.current?.play().catch(() => {});

          if (mode === 'focus') {
            const newSessions = sessions + 1;
            setSessions(newSessions);
            if (newSessions % 4 === 0) switchMode('long');
            else switchMode('short');
          } else {
            switchMode('focus');
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode, sessions, switchMode]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClose]);

  if (!active) return null;

  const resetTimer = () => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeLeft(durations[mode]);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = totalTime > 0 ? 1 - (timeLeft / totalTime) : 0;
  const circumference = 2 * Math.PI * 110;
  const strokeDashoffset = circumference * (1 - progress);
  const modeLabel = mode === 'focus' ? 'Focus Time' : mode === 'short' ? 'Short Break' : 'Long Break';
  const modeColor = mode === 'focus' ? '#FFB503' : mode === 'short' ? '#4ECDC4' : '#7C6CFF';

  return (
    <div className="wm-fs-overlay" role="dialog" aria-label="Focus session">
      <button
        type="button"
        className="wm-fs-close"
        onClick={onClose}
        aria-label="Leave focus session"
      >
        <X size={20} />
        <span>Back to map</span>
      </button>

      <div className="wm-fs-center">
        <div className="wm-fs-tabs">
          <button
            type="button"
            className={`wm-fs-tab ${mode === 'focus' ? 'active' : ''}`}
            onClick={() => switchMode('focus')}
          >
            <Brain size={16} /> Focus
          </button>
          <button
            type="button"
            className={`wm-fs-tab ${mode !== 'focus' ? 'active' : ''}`}
            onClick={() => switchMode('short')}
          >
            <Coffee size={16} /> Break
          </button>
        </div>

        <div className="wm-fs-ring-wrap">
          <svg className="wm-fs-ring" viewBox="0 0 240 240">
            <circle cx="120" cy="120" r="110" className="wm-fs-ring-bg" />
            <circle
              cx="120"
              cy="120"
              r="110"
              className="wm-fs-ring-progress"
              style={{
                strokeDasharray: circumference,
                strokeDashoffset,
                stroke: modeColor,
              }}
            />
          </svg>
          <div className="wm-fs-time-display">
            <span className="wm-fs-time">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
            <span className="wm-fs-mode-label" style={{ color: modeColor }}>
              {modeLabel}
            </span>
          </div>
        </div>

        <div className="wm-fs-controls">
          <button
            type="button"
            className="wm-fs-ctrl secondary"
            onClick={resetTimer}
            aria-label="Reset timer"
          >
            <RotateCcw size={20} />
          </button>
          <button
            type="button"
            className="wm-fs-ctrl primary"
            onClick={() => setRunning(r => !r)}
            style={{ background: modeColor }}
            aria-label={running ? 'Pause' : 'Start'}
          >
            {running ? <Pause size={26} /> : <Play size={26} style={{ marginLeft: 3 }} />}
          </button>
          <div className="wm-fs-sessions">
            <span>{sessions}</span>
            <small>sessions</small>
          </div>
        </div>

        <div className="wm-fs-presets">
          {Object.entries(PRESETS).map(([key, val]) => (
            <button
              key={key}
              type="button"
              className={`wm-fs-preset ${preset === key ? 'active' : ''}`}
              onClick={() => setPreset(key)}
            >
              {val.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
