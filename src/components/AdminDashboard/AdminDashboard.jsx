import React, { useState, useEffect } from 'react';
import { X, Users, BookOpen, MessageCircle, Brain, Trophy, Flame, ChevronDown, ChevronUp, FolderOpen, Layers, BarChart3, MessageSquare, Clock } from 'lucide-react';
import './AdminDashboard.css';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';

const TABS = ['overview', 'growth', 'feedback', 'users'];

const AdminDashboard = ({ onClose }) => {
  const { token } = useAuth();
  const [overviewData, setOverviewData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [feedbackData, setFeedbackData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/api/admin/overview`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${API_URL}/api/admin/analytics`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${API_URL}/api/admin/feedback`, { headers }).then(r => r.ok ? r.json() : null),
    ])
      .then(([ov, an, fb]) => {
        setOverviewData(ov);
        setAnalytics(an);
        setFeedbackData(fb);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const toggleUser = (id) => setExpandedUser(prev => prev === id ? null : id);

  const getAccuracyColor = (acc) => {
    if (acc >= 70) return '#2ECC71';
    if (acc >= 50) return '#F39C12';
    return '#E74C3C';
  };

  const getSkillColor = (score) => {
    if (score >= 70) return '#2ECC71';
    if (score >= 50) return '#F39C12';
    if (score >= 30) return '#E67E22';
    return '#E74C3C';
  };

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-loading">Loading admin data...</div>
      </div>
    );
  }

  if (!overviewData) {
    return (
      <div className="admin-page">
        <div className="admin-loading">Failed to load data. Is the server running?</div>
      </div>
    );
  }

  const h = analytics?.headline || {};
  const eng = analytics?.engagement || {};
  const growth = analytics?.growth || {};
  const feedback = feedbackData?.feedback || [];

  const maxSignups = Math.max(...(growth.signups_per_day || []).map(d => d.count), 1);
  const maxMsgs = Math.max(...(growth.messages_per_day || []).map(d => d.count), 1);

  return (
    <div className="admin-page">
      <button className="admin-close" onClick={onClose}><X size={28} /></button>

      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin Dashboard</h1>
          <p className="admin-subtitle">Coast Platform Overview</p>
        </div>

        {/* Tab Bar */}
        <div className="admin-tab-bar">
          {TABS.map(t => (
            <button
              key={t}
              className={`admin-tab ${activeTab === t ? 'active' : ''}`}
              onClick={() => setActiveTab(t)}
            >
              {t === 'overview' && <BarChart3 size={15} />}
              {t === 'growth' && <Layers size={15} />}
              {t === 'feedback' && <MessageSquare size={15} />}
              {t === 'users' && <Users size={15} />}
              <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
              {t === 'feedback' && feedback.length > 0 && (
                <span className="admin-tab-badge">{feedback.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ────── OVERVIEW TAB ────── */}
        {activeTab === 'overview' && (
          <>
            <div className="admin-summary-grid admin-summary-grid-6">
              <SummaryCard icon={<Users size={22} />} value={h.total_users ?? 0} label="Users" />
              <SummaryCard icon={<MessageCircle size={22} />} value={h.total_messages ?? 0} label="Messages" />
              <SummaryCard icon={<BookOpen size={22} />} value={h.total_notebooks ?? 0} label="Notebooks" />
              <SummaryCard icon={<FolderOpen size={22} />} value={h.total_folders ?? 0} label="Folders" />
              <SummaryCard icon={<Layers size={22} />} value={h.total_lessons_started ?? 0} label="Lessons Started" />
              <SummaryCard icon={<MessageSquare size={22} />} value={h.total_feedback ?? 0} label="Feedback" />
            </div>

            <div className="admin-engagement-row">
              <EngagementStat label="Avg Messages / User" value={eng.avg_messages_per_user ?? 0} />
              <EngagementStat label="Avg Notebooks / User" value={eng.avg_notebooks_per_user ?? 0} />
              <EngagementStat label="Started a Lesson" value={`${eng.pct_started_lesson ?? 0}%`} />
              <EngagementStat label="Completed a Lesson" value={`${eng.pct_completed_lesson ?? 0}%`} />
              <EngagementStat label="Avg Sections / Lesson" value={eng.avg_sections_per_lesson ?? 0} />
            </div>
          </>
        )}

        {/* ────── GROWTH TAB ────── */}
        {activeTab === 'growth' && (
          <div className="admin-growth-section">
            <GrowthChart title="Signups (Last 30 Days)" data={growth.signups_per_day || []} maxVal={maxSignups} color="#FFB503" />
            <GrowthChart title="Messages (Last 30 Days)" data={growth.messages_per_day || []} maxVal={maxMsgs} color="#3498DB" />
          </div>
        )}

        {/* ────── FEEDBACK TAB ────── */}
        {activeTab === 'feedback' && (
          <div className="admin-feedback-section">
            {feedback.length === 0 ? (
              <p className="admin-empty-state">No feedback submitted yet.</p>
            ) : (
              <div className="admin-feedback-list">
                {feedback.map(fb => (
                  <div key={fb.id} className="admin-feedback-card">
                    <div className="admin-fb-top">
                      <span className={`admin-fb-cat admin-fb-cat--${fb.category}`}>{fb.category}</span>
                      <span className="admin-fb-user">{fb.user_name} &middot; {fb.user_email}</span>
                      <span className="admin-fb-date">
                        {fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="admin-fb-msg">{fb.message}</p>
                    {fb.page && <span className="admin-fb-page">Page: {fb.page}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ────── USERS TAB ────── */}
        {activeTab === 'users' && (
          <div className="admin-users-section">
            <h2>All Users ({overviewData.total_users})</h2>
            <div className="admin-user-list">
              {overviewData.users.map(u => (
                <div key={u.id} className={`admin-user-card ${expandedUser === u.id ? 'expanded' : ''}`}>
                  <div className="admin-user-row" onClick={() => toggleUser(u.id)}>
                    <div className="admin-user-identity">
                      <div className="admin-user-avatar">{u.name.charAt(0).toUpperCase()}</div>
                      <div className="admin-user-name-block">
                        <span className="admin-user-name">{u.name}</span>
                        <span className="admin-user-email">{u.email}</span>
                      </div>
                    </div>
                    <div className="admin-user-quick-stats">
                      <div className="admin-quick-stat"><Flame size={14} /><span>{u.streak}</span></div>
                      <div className="admin-quick-stat"><Trophy size={14} /><span>{u.sessions_completed}</span></div>
                      <div className="admin-quick-stat" style={{ color: getAccuracyColor(u.accuracy) }}>
                        <span className="admin-accuracy-pill">{u.accuracy}%</span>
                      </div>
                      <div className="admin-quick-stat"><MessageCircle size={14} /><span>{u.chat_messages}</span></div>
                      <div className="admin-quick-stat"><FolderOpen size={14} /><span>{u.folders_created ?? 0}</span></div>
                      {expandedUser === u.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>

                  {expandedUser === u.id && (
                    <div className="admin-user-expanded">
                      <div className="admin-detail-section">
                        <h4>Profile</h4>
                        <div className="admin-detail-grid">
                          <DetailItem label="Course" value={u.course || 'Not set'} />
                          <DetailItem label="Joined" value={u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'} />
                          <DetailItem label="Last Active" value={u.last_active ? new Date(u.last_active).toLocaleDateString() : '—'} />
                          <DetailItem label="Questions Answered" value={u.total_questions} />
                          <DetailItem label="Correct" value={u.total_correct} />
                          <DetailItem label="Notebooks" value={u.notebooks_generated} />
                          <DetailItem label="Folders" value={u.folders_created ?? 0} />
                          <DetailItem label="Lessons Started" value={u.lessons_started ?? 0} />
                          <DetailItem label="Sections Done" value={u.sections_completed ?? 0} />
                          <DetailItem label="Streak" value={`${u.streak} days`} />
                        </div>
                      </div>

                      <div className="admin-detail-section">
                        <h4><Brain size={16} /> Skill Profile</h4>
                        {Object.keys(u.skill_profile).length > 0 ? (
                          <div className="admin-skill-bars">
                            {Object.entries(u.skill_profile)
                              .sort(([, a], [, b]) => a - b)
                              .map(([topic, score]) => (
                                <div key={topic} className="admin-skill-row">
                                  <span className="admin-skill-topic">{topic}</span>
                                  <div className="admin-skill-bar-bg">
                                    <div className="admin-skill-bar-fill" style={{ width: `${score}%`, background: getSkillColor(score) }} />
                                  </div>
                                  <span className="admin-skill-score" style={{ color: getSkillColor(score) }}>{score}</span>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="admin-empty-state">No skill data yet.</p>
                        )}
                      </div>

                      <div className="admin-detail-section">
                        <h4><MessageCircle size={16} /> Pedro's Memo</h4>
                        {u.tutor_memo ? (
                          <div className="admin-memo-box">
                            <pre className="admin-memo-text">{u.tutor_memo}</pre>
                            {u.memo_updated_at && (
                              <span className="admin-memo-updated">
                                Last updated: {new Date(u.memo_updated_at).toLocaleString()}
                              </span>
                            )}
                          </div>
                        ) : (
                          <p className="admin-empty-state">No memo yet.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryCard = ({ icon, value, label }) => (
  <div className="admin-summary-card">
    {icon}
    <div className="admin-summary-info">
      <span className="admin-summary-value">{value}</span>
      <span className="admin-summary-label">{label}</span>
    </div>
  </div>
);

const EngagementStat = ({ label, value }) => (
  <div className="admin-eng-stat">
    <span className="admin-eng-value">{value}</span>
    <span className="admin-eng-label">{label}</span>
  </div>
);

const DetailItem = ({ label, value }) => (
  <div className="admin-detail-item">
    <span className="admin-detail-label">{label}</span>
    <span className="admin-detail-value">{value}</span>
  </div>
);

const GrowthChart = ({ title, data, maxVal, color }) => (
  <div className="admin-growth-card">
    <h3 className="admin-growth-title">{title}</h3>
    {data.length === 0 ? (
      <p className="admin-empty-state">No data yet.</p>
    ) : (
      <div className="admin-growth-bars">
        {data.map((d, i) => {
          const pct = Math.max((d.count / maxVal) * 100, 2);
          const shortDate = new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          return (
            <div key={i} className="admin-growth-col" title={`${shortDate}: ${d.count}`}>
              <div className="admin-growth-bar-wrap">
                <div className="admin-growth-bar" style={{ height: `${pct}%`, background: color }} />
              </div>
              {i % Math.max(Math.floor(data.length / 8), 1) === 0 && (
                <span className="admin-growth-date">{shortDate}</span>
              )}
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export default AdminDashboard;
