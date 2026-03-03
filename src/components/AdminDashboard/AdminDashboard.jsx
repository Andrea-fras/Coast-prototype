import React, { useState, useEffect } from 'react';
import { X, Users, BookOpen, MessageCircle, Brain, Trophy, Flame, ChevronDown, ChevronUp } from 'lucide-react';
import './AdminDashboard.css';
import { useAuth } from '../../context/AuthContext';

const API_URL = 'http://localhost:8000';

const AdminDashboard = ({ onClose }) => {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedUser, setExpandedUser] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/api/admin/overview`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : null)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const toggleUser = (id) => {
    setExpandedUser(prev => prev === id ? null : id);
  };

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

  if (!data) {
    return (
      <div className="admin-page">
        <div className="admin-loading">Failed to load data. Is the server running?</div>
      </div>
    );
  }

  // Aggregate stats
  const totalSessions = data.users.reduce((s, u) => s + u.sessions_completed, 0);
  const totalMessages = data.users.reduce((s, u) => s + u.chat_messages, 0);
  const totalNotebooks = data.users.reduce((s, u) => s + u.notebooks_generated, 0);

  return (
    <div className="admin-page">
      <button className="admin-close" onClick={onClose}>
        <X size={28} />
      </button>

      <div className="admin-container">
        <div className="admin-header">
          <h1>Admin Dashboard</h1>
          <p className="admin-subtitle">Coast Platform Overview</p>
        </div>

        {/* Summary Cards */}
        <div className="admin-summary-grid">
          <div className="admin-summary-card">
            <Users size={24} />
            <div className="admin-summary-info">
              <span className="admin-summary-value">{data.total_users}</span>
              <span className="admin-summary-label">Registered Users</span>
            </div>
          </div>
          <div className="admin-summary-card">
            <Trophy size={24} />
            <div className="admin-summary-info">
              <span className="admin-summary-value">{totalSessions}</span>
              <span className="admin-summary-label">Sessions Completed</span>
            </div>
          </div>
          <div className="admin-summary-card">
            <MessageCircle size={24} />
            <div className="admin-summary-info">
              <span className="admin-summary-value">{totalMessages}</span>
              <span className="admin-summary-label">Chat Messages</span>
            </div>
          </div>
          <div className="admin-summary-card">
            <BookOpen size={24} />
            <div className="admin-summary-info">
              <span className="admin-summary-value">{totalNotebooks}</span>
              <span className="admin-summary-label">Notebooks Generated</span>
            </div>
          </div>
        </div>

        {/* User List */}
        <div className="admin-users-section">
          <h2>All Users</h2>
          <div className="admin-user-list">
            {data.users.map(u => (
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
                    <div className="admin-quick-stat">
                      <Flame size={14} />
                      <span>{u.streak}</span>
                    </div>
                    <div className="admin-quick-stat">
                      <Trophy size={14} />
                      <span>{u.sessions_completed}</span>
                    </div>
                    <div className="admin-quick-stat" style={{ color: getAccuracyColor(u.accuracy) }}>
                      <span className="admin-accuracy-pill">{u.accuracy}%</span>
                    </div>
                    <div className="admin-quick-stat">
                      <MessageCircle size={14} />
                      <span>{u.chat_messages}</span>
                    </div>
                    {expandedUser === u.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                {expandedUser === u.id && (
                  <div className="admin-user-expanded">
                    {/* Basic Info */}
                    <div className="admin-detail-section">
                      <h4>Profile</h4>
                      <div className="admin-detail-grid">
                        <div className="admin-detail-item">
                          <span className="admin-detail-label">Course</span>
                          <span className="admin-detail-value">{u.course || 'Not set'}</span>
                        </div>
                        <div className="admin-detail-item">
                          <span className="admin-detail-label">Joined</span>
                          <span className="admin-detail-value">
                            {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                          </span>
                        </div>
                        <div className="admin-detail-item">
                          <span className="admin-detail-label">Questions Answered</span>
                          <span className="admin-detail-value">{u.total_questions}</span>
                        </div>
                        <div className="admin-detail-item">
                          <span className="admin-detail-label">Correct</span>
                          <span className="admin-detail-value">{u.total_correct}</span>
                        </div>
                        <div className="admin-detail-item">
                          <span className="admin-detail-label">Notebooks Generated</span>
                          <span className="admin-detail-value">{u.notebooks_generated}</span>
                        </div>
                        <div className="admin-detail-item">
                          <span className="admin-detail-label">Streak</span>
                          <span className="admin-detail-value">{u.streak} days</span>
                        </div>
                      </div>
                    </div>

                    {/* Skill Profile */}
                    <div className="admin-detail-section">
                      <h4><Brain size={16} /> Skill Profile (what Pedro sees)</h4>
                      {Object.keys(u.skill_profile).length > 0 ? (
                        <div className="admin-skill-bars">
                          {Object.entries(u.skill_profile)
                            .sort(([, a], [, b]) => a - b)
                            .map(([topic, score]) => (
                              <div key={topic} className="admin-skill-row">
                                <span className="admin-skill-topic">{topic}</span>
                                <div className="admin-skill-bar-bg">
                                  <div
                                    className="admin-skill-bar-fill"
                                    style={{ width: `${score}%`, background: getSkillColor(score) }}
                                  />
                                </div>
                                <span className="admin-skill-score" style={{ color: getSkillColor(score) }}>
                                  {score}
                                </span>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <p className="admin-empty-state">No skill data yet. Student needs to complete quiz sessions.</p>
                      )}
                    </div>

                    {/* Tutor Memo */}
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
                        <p className="admin-empty-state">
                          No memo yet. Pedro builds this after ~5 messages with the student.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
