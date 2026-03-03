import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Play, Pause, RotateCcw, Coffee, Brain, Settings } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import './PomodoroPage.css';

const PRESETS = {
  classic:  { focus: 25 * 60, short: 5 * 60, long: 15 * 60, label: '25 / 5' },
  deep:     { focus: 50 * 60, short: 10 * 60, long: 20 * 60, label: '50 / 10' },
  sprint:   { focus: 15 * 60, short: 3 * 60, long: 10 * 60, label: '15 / 3' },
};

const PomodoroPage = ({ onClose }) => {
  const { theme } = useTheme();
  const [preset, setPreset] = useState('classic');
  const [mode, setMode] = useState('focus');  // focus | short | long
  const [timeLeft, setTimeLeft] = useState(PRESETS.classic.focus);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);
  const intervalRef = useRef(null);
  const audioRef = useRef(null);

  const durations = PRESETS[preset];
  const totalTime = durations[mode];

  useEffect(() => {
    audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1oa2NgaGhrf4OLjIV8cnh4dXV8hIyMiYB1cXR0c3mBiYuJg3pxcHN0d3+Hi4qFfHNwcnR3fYaKiYR8c3BydHd9houJhHxzcHJ0d32Gi4mEfHNwcnR3fYaLiYR8c3BydHd9houJhA==');
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
  }, [preset]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            setRunning(false);
            audioRef.current?.play().catch(() => {});

            if (mode === 'focus') {
              const newSessions = sessions + 1;
              setSessions(newSessions);
              if (newSessions % 4 === 0) {
                switchMode('long');
              } else {
                switchMode('short');
              }
            } else {
              switchMode('focus');
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode, sessions, switchMode]);

  const toggleTimer = () => setRunning(r => !r);

  const resetTimer = () => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    setTimeLeft(durations[mode]);
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const progress = 1 - (timeLeft / totalTime);
  const circumference = 2 * Math.PI * 140;
  const strokeDashoffset = circumference * (1 - progress);

  const modeLabel = mode === 'focus' ? 'Focus Time' : mode === 'short' ? 'Short Break' : 'Long Break';
  const modeColor = mode === 'focus' ? '#FFB503' : mode === 'short' ? '#4ECDC4' : '#7C6CFF';

  return (
    <div className={`pomo-page ${theme === 'dark' ? 'dark' : ''}`}>
      <button className="pomo-close" onClick={onClose}><X size={24} /></button>

      <div className="pomo-container">
        {/* Mode Tabs */}
        <div className="pomo-tabs">
          <button className={`pomo-tab ${mode === 'focus' ? 'active focus' : ''}`} onClick={() => switchMode('focus')}>
            <Brain size={18} /> Focus
          </button>
          <button className={`pomo-tab ${mode === 'short' ? 'active short' : ''}`} onClick={() => switchMode('short')}>
            <Coffee size={18} /> Short Break
          </button>
          <button className={`pomo-tab ${mode === 'long' ? 'active long' : ''}`} onClick={() => switchMode('long')}>
            <Coffee size={18} /> Long Break
          </button>
        </div>

        {/* Timer Ring */}
        <div className="pomo-timer-panel">
          <div className="pomo-ring-wrap">
            <svg className="pomo-ring" viewBox="0 0 300 300">
              <circle cx="150" cy="150" r="140" className="pomo-ring-bg" />
              <circle
                cx="150" cy="150" r="140"
                className="pomo-ring-progress"
                style={{
                  strokeDasharray: circumference,
                  strokeDashoffset,
                  stroke: modeColor,
                }}
              />
            </svg>
            <div className="pomo-time-display">
              <span className="pomo-time">{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
              <span className="pomo-mode-label" style={{ color: modeColor }}>{modeLabel}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="pomo-controls">
            <button className="pomo-ctrl-btn secondary" onClick={resetTimer} title="Reset">
              <RotateCcw size={22} />
            </button>
            <button className="pomo-ctrl-btn primary" onClick={toggleTimer} style={{ background: modeColor }}>
              {running ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: 3 }} />}
            </button>
            <div className="pomo-session-count" title="Completed focus sessions">
              <span>{sessions}</span>
              <small>sessions</small>
            </div>
          </div>
        </div>

        {/* Preset Selector */}
        <div className="pomo-presets">
          <Settings size={16} className="pomo-presets-icon" />
          {Object.entries(PRESETS).map(([key, val]) => (
            <button
              key={key}
              className={`pomo-preset-btn ${preset === key ? 'active' : ''}`}
              onClick={() => setPreset(key)}
            >
              {val.label}
            </button>
          ))}
        </div>

        {/* Tips */}
        <div className="pomo-tips">
          <p>
            {mode === 'focus'
              ? 'Stay focused — silence notifications and dive deep into your study material.'
              : 'Take a real break — stretch, hydrate, look away from the screen.'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default PomodoroPage;
