import React, { useState, useEffect } from 'react';
import {
  Fish, Target, TrendingUp, BookOpen, ChevronRight,
  BarChart3, Sun, Moon, Brain, AlertTriangle, RotateCcw,
  Sparkles, Clock, X, Lightbulb,
} from 'lucide-react';
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
  onStartReview,
}) => {
  const { token, user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showTip, setShowTip] = useState(() => !localStorage.getItem('coast_dash_tip_dismissed'));

  const [streakData, setStreakData] = useState({ streak: 0, week: [] });
  const [stats, setStats] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [notebooks, setNotebooks] = useState([]);

  const [briefing, setBriefing] = useState(null);
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [reviewStats, setReviewStats] = useState(null);
  const [skillProfile, setSkillProfile] = useState(null);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${API_URL}/api/stats`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/api/sessions/history`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/notebooks`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/review/stats`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/api/skill-profile`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([s, sess, nbs, rs, sp]) => {
      if (s) {
        setStats(s);
        setStreakData({ streak: s.streak || 0, week: s.week || [] });
      }
      setSessions(Array.isArray(sess) ? sess : []);
      setNotebooks(Array.isArray(nbs) ? nbs : []);
      if (rs) setReviewStats(rs);
      if (sp) setSkillProfile(sp);
    });

    setBriefingLoading(true);
    fetch(`${API_URL}/api/dashboard/briefing`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setBriefing(data);
          if (data.review_stats) setReviewStats(data.review_stats);
        }
      })
      .catch(() => {})
      .finally(() => setBriefingLoading(false));
  }, [token]);

  const weekData = streakData.week.length > 0 ? streakData.week : [
    { label: 'Mo', status: 'future' }, { label: 'Tu', status: 'future' },
    { label: 'We', status: 'future' }, { label: 'Th', status: 'future' },
    { label: 'Fr', status: 'future' }, { label: 'Sa', status: 'future' },
    { label: 'Su', status: 'future' },
  ];

  const recentSessions = sessions.slice(0, 3);

  const weakTopics = React.useMemo(() => {
    const topics = skillProfile?.topics;
    if (!topics || typeof topics !== 'object') return [];
    return Object.entries(topics).sort((a, b) => a[1] - b[1]).slice(0, 3);
  }, [skillProfile]);

  const dueCount = reviewStats?.due_today || 0;
  const totalCards = reviewStats?.total_cards || 0;
  const masteredCards = reviewStats?.mastered || 0;

  return (
    <div className="main-container">
      <button className="dash-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
        {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      </button>
      {showTip && (
        <div className="pedro-tip-banner">
          <img src={mascot} alt="Pedro" className="pedro-tip-avatar" />
          <div className="pedro-tip-content">
            <strong>Pedro's tips</strong>
            <p>
              Upload a PDF or lecture in <b>Notebooks</b> to generate a comprehensive study guide — then chat with me, create visualizations, and download your notes.
              Create <b>Folders</b> to organize a full course with multiple sources and get a complete interactive lesson.
              Browse <b>Pre-made courses</b> to jump into expert-curated lessons instantly!
            </p>
          </div>
          <button className="pedro-tip-close" onClick={() => { setShowTip(false); localStorage.setItem('coast_dash_tip_dismissed', '1'); }} aria-label="Dismiss tip">
            <X size={16} />
          </button>
        </div>
      )}
      <div className="content-wrapper">

        {/* Left Column */}
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

          {/* Streak + Timer */}
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

        {/* Right Panel — Smart Dashboard */}
        <div className="right-panel-stack">

          {/* Pedro's Daily Briefing */}
          <div className="rp-card rp-briefing">
            <div className="rp-briefing-header">
              <img src={mascot} alt="Pedro" className="rp-briefing-avatar" />
              <div className="rp-briefing-title">
                <span className="rp-briefing-name">Pedro's Briefing</span>
                <span className="rp-briefing-sub">Your daily study plan</span>
              </div>
              <Sparkles size={20} className="rp-briefing-sparkle" />
            </div>
            <div className="rp-briefing-body">
              {briefingLoading ? (
                <div className="rp-briefing-skeleton">
                  <div className="skeleton-line" style={{ width: '90%' }} />
                  <div className="skeleton-line" style={{ width: '75%' }} />
                  <div className="skeleton-line" style={{ width: '60%' }} />
                </div>
              ) : (
                <p className="rp-briefing-text">
                  {briefing?.message || "Welcome! Upload some lecture notes to get started with personalized study plans."}
                </p>
              )}
            </div>
            {dueCount > 0 && (
              <button className="rp-briefing-cta" onClick={onStartReview}>
                <RotateCcw size={16} />
                Start Review ({dueCount} due)
              </button>
            )}
          </div>

          {/* Spaced Repetition Card */}
          <div className="rp-card rp-review">
            <div className="rp-card-head">
              <h3>
                <Brain size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Review Deck
              </h3>
              {dueCount > 0 && (
                <button className="rp-review-btn" onClick={onStartReview}>
                  Review Now
                </button>
              )}
            </div>

            {totalCards > 0 ? (
              <>
                <div className="rp-review-stats">
                  <div className="rp-review-stat">
                    <span className="rp-review-stat-val">{dueCount}</span>
                    <span className="rp-review-stat-lbl">Due now</span>
                  </div>
                  <div className="rp-review-stat">
                    <span className="rp-review-stat-val">{masteredCards}</span>
                    <span className="rp-review-stat-lbl">Mastered</span>
                  </div>
                  <div className="rp-review-stat">
                    <span className="rp-review-stat-val">{totalCards}</span>
                    <span className="rp-review-stat-lbl">Total</span>
                  </div>
                </div>
                <div className="rp-review-progress">
                  <div className="rp-review-progress-track">
                    <div
                      className="rp-review-progress-fill mastered"
                      style={{ width: `${totalCards > 0 ? (masteredCards / totalCards) * 100 : 0}%` }}
                    />
                    <div
                      className="rp-review-progress-fill learning"
                      style={{ width: `${totalCards > 0 ? ((totalCards - masteredCards) / totalCards) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="rp-review-legend">
                    <span className="rp-legend-dot mastered" /> Mastered
                    <span className="rp-legend-dot learning" /> Learning
                  </div>
                </div>
              </>
            ) : (
              <div className="rp-empty" onClick={onOpenNotebook}>
                <Brain size={28} />
                <p>Create a notebook to build your review deck</p>
              </div>
            )}
          </div>

          {/* Weak Spots */}
          {weakTopics.length > 0 && (
            <div className="rp-card rp-weak">
              <h3>
                <AlertTriangle size={18} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                Weak Spots
              </h3>
              <div className="rp-weak-list">
                {weakTopics.map(([topic, score]) => (
                  <div className="rp-weak-item" key={topic}>
                    <div className="rp-weak-info">
                      <span className="rp-weak-topic">{topic}</span>
                      <span className="rp-weak-score">{score}%</span>
                    </div>
                    <div className="rp-weak-bar-track">
                      <div
                        className={`rp-weak-bar-fill ${score < 40 ? 'critical' : score < 70 ? 'moderate' : 'ok'}`}
                        style={{ width: `${score}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Stats */}
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
                {notebooks.slice(0, 2).map((nb, i) => (
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
