import React, { useState, useEffect } from 'react';
import { Fish, Target, TrendingUp, BookOpen, ChevronRight, BarChart3, Sun, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import mascot from '../../assets/sessioncompletebird.svg';
import bookCover from '../../assets/bookcover.svg';
import './Dashboard.css';

import { API_URL } from '../../config';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const Dashboard = ({
  papers,
  selectedPaperIndex,
  setSelectedPaperIndex,
  onStartQuestions,
  onOpenNotebook,
  onOpenPedro,
  onOpenPomodoro,
}) => {
  const { token } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [streakData, setStreakData] = useState({ streak: 0, week: [] });
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [notebooks, setNotebooks] = useState([]);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/api/stats`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/api/sessions/history`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/notebooks`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([s, sess, nbs]) => {
      if (s) {
        setStats(s);
        setStreakData({ streak: s.streak || 0, week: s.week || [] });
      }
      setSessions(Array.isArray(sess) ? sess : []);
      setNotebooks(Array.isArray(nbs) ? nbs : []);
    });
  }, [token]);

  const weekData = streakData.week.length > 0 ? streakData.week : [
    { label: 'Mo', status: 'future' }, { label: 'Tu', status: 'future' },
    { label: 'We', status: 'future' }, { label: 'Th', status: 'future' },
    { label: 'Fr', status: 'future' }, { label: 'Sa', status: 'future' },
    { label: 'Su', status: 'future' },
  ];

  const recentSessions = sessions.slice(0, 4);

  return (
    <div className="main-container">
      <button className="dash-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      <div className="content-wrapper">

        {/* ── Left Column (original layout) ── */}
        <div className="left-column">
          {/* Daily Quest */}
          <div className="card top-card daily-quest">
            <h3>Daily quest</h3>
            <p className="quest-sub">Complete 10 questions</p>
            <div className="quest-progress-row">
              <div className="progress-container">
                <div className="progress-bar" style={{ width: '30%' }} />
                <span className="progress-text">3/10</span>
              </div>
              <button className="claim-btn" onClick={onStartQuestions}>Claim</button>
            </div>
          </div>

          {/* Streak + Customization */}
          <div className="middle-row">
            <div className="card streak-card">
              <h3>Streak</h3>
              <div className="streak-stat">
                <span className="streak-num">{streakData.streak}</span>
                <span className="streak-label">{streakData.streak === 1 ? 'day alive' : 'days alive'}</span>
              </div>
              <div className="week-row">
                {weekData.map((day, i) => (
                  <div className="day-col" key={i}>
                    <Fish
                      size={20}
                      className={`fish-icon ${
                        day.status === 'active' ? 'filled' :
                        day.status === 'missed' ? 'bone' : 'faint'
                      }`}
                    />
                    <span>{day.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card customization-card" onClick={onOpenPomodoro} style={{ cursor: 'pointer' }}>
              <h3>Study Timer</h3>
              <span className="coming-soon-badge">Pomodoro</span>
            </div>
          </div>

          {/* Continue Course */}
          <div className="card bottom-card continue-course">
            <h3>Continue course</h3>
            <div className="courses-grid">
              {papers.map((paper, index) => (
                <div
                  key={paper.id}
                  className={`course-item ${selectedPaperIndex === index ? 'active' : ''}`}
                  onClick={() => setSelectedPaperIndex(index)}
                >
                  <img
                    src={bookCover}
                    alt={paper.name}
                    className={`book-cover-img ${selectedPaperIndex === index ? 'active-book' : ''}`}
                  />
                  <span>{paper.name}</span>
                </div>
              ))}
            </div>
            <div className="jump-btn-container">
              <button className="jump-btn" onClick={onStartQuestions}>JUMP BACK IN &gt;</button>
            </div>
          </div>
        </div>

        {/* ── Right Panel (new stacked cards) ── */}
        <div className="right-panel-stack">

          {/* Quick Stats 2x2 */}
          <div className="rp-card rp-stats">
            <h3>Quick Stats</h3>
            <div className="rp-stats-grid">
              {[
                { icon: <Target size={20} />, value: stats?.total_questions || 0, label: 'Questions' },
                { icon: <TrendingUp size={20} />, value: `${stats?.average_score || 0}%`, label: 'Accuracy' },
                { icon: <BarChart3 size={20} />, value: stats?.total_sessions || 0, label: 'Sessions' },
                { icon: <BookOpen size={20} />, value: notebooks.length, label: 'Notebooks' },
              ].map((s, i) => (
                <div className="rp-stat-chip" key={i}>
                  <div className="rp-stat-icon">{s.icon}</div>
                  <div className="rp-stat-text">
                    <span className="rp-stat-val">{s.value}</span>
                    <span className="rp-stat-lbl">{s.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="rp-card rp-sessions">
            <h3>Recent Sessions</h3>
            {recentSessions.length > 0 ? (
              <div className="rp-sess-list">
                {recentSessions.map((s, i) => (
                  <div className="rp-sess-item" key={s.id || i}>
                    <div className="rp-sess-info">
                      <span className="rp-sess-name">{s.paper_title || 'Practice'}</span>
                      <span className="rp-sess-time">{timeAgo(s.completed_at || s.started_at)}</span>
                    </div>
                    <span className={`rp-sess-score ${s.total > 0 && (s.score / s.total) >= 0.7 ? 'good' : 'weak'}`}>
                      {s.score}/{s.total}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rp-empty">
                <BarChart3 size={28} />
                <p>Complete a quiz to see results</p>
              </div>
            )}
          </div>

          {/* Your Notebooks */}
          <div className="rp-card rp-notebooks">
            <div className="rp-card-head">
              <h3>Your Notebooks</h3>
              <button className="rp-see-all" onClick={onOpenNotebook}>
                Library <ChevronRight size={14} />
              </button>
            </div>
            {notebooks.length > 0 ? (
              <div className="rp-nb-list">
                {notebooks.slice(0, 3).map((nb, i) => (
                  <div className="rp-nb-item" key={nb._saved_id || `nb${i}`} onClick={onOpenNotebook}>
                    <img src={bookCover} alt="" className="rp-nb-cover" />
                    <div className="rp-nb-info">
                      <span className="rp-nb-title">{nb.title || 'Untitled'}</span>
                      <span className="rp-nb-course">{nb.course || 'General'}</span>
                    </div>
                    <ChevronRight size={16} className="rp-chevron" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rp-empty" onClick={onOpenNotebook}>
                <BookOpen size={28} />
                <p>Upload your first notebook</p>
              </div>
            )}
          </div>

          {/* Ask Pedro */}
          <div className="rp-card rp-pedro" onClick={onOpenPedro}>
            <img src={mascot} alt="Pedro" className="rp-pedro-img" />
            <div className="rp-pedro-text">
              <span className="rp-pedro-name">Ask Pedro</span>
              <p>Your AI study buddy is ready to help</p>
            </div>
            <ChevronRight size={18} className="rp-chevron" />
          </div>

        </div>
      </div>
    </div>
  );
};

export default Dashboard;
