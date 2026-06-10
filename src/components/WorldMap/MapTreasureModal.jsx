import React, { useCallback, useEffect, useState } from 'react';
import { Loader, Send, X } from 'lucide-react';
import { API_URL } from '../../config';
import './MapTreasureModal.css';

export default function MapTreasureModal({ chest, token, onClose, onComplete }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [feedback, setFeedback] = useState('');

  const loadQuiz = useCallback(async () => {
    if (!chest?.id || !token) return;
    setLoading(true);
    setError('');
    setFeedback('');
    try {
      const res = await fetch(
        `${API_URL}/api/map/treasures/${encodeURIComponent(chest.id)}/quiz`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json();
      if (data.already_opened) {
        setError('This chest has already been opened.');
        return;
      }
      if (!res.ok) {
        setError(data.message || data.detail || data.error || 'Could not load challenge.');
        return;
      }
      setQuiz(data);
      setAnswer('');
    } catch {
      setError('Network error — try again.');
    } finally {
      setLoading(false);
    }
  }, [chest?.id, token]);

  useEffect(() => { loadQuiz(); }, [loadQuiz]);

  const submit = async () => {
    if (!quiz || submitting) return;
    const trimmed = answer.trim();
    if (trimmed.length < 8) {
      setFeedback('Write at least a sentence or two.');
      return;
    }
    setSubmitting(true);
    setError('');
    setFeedback('');
    try {
      const res = await fetch(
        `${API_URL}/api/map/treasures/${encodeURIComponent(chest.id)}/complete`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ answer: trimmed }),
        },
      );
      const data = await res.json();
      if (data.already_opened) {
        setError('This chest was already opened.');
        return;
      }
      if (!data.ok) {
        setFeedback(data.feedback || data.message || 'Not quite — try again.');
        return;
      }
      setOutcome(data);
      onComplete?.(data);
    } catch {
      setError('Could not check your answer — try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wm-treasure-overlay" role="dialog" aria-modal="true" data-theme="dark">
      <div className="wm-treasure-panel">
        <div className="wm-treasure-header">
          <h2 className="wm-treasure-title">🧳 {chest?.name || 'Treasure Chest'}</h2>
          <button type="button" className="wm-treasure-close-btn" onClick={onClose} aria-label="Close">
            <X size={22} />
          </button>
        </div>

        {loading && (
          <div className="wm-treasure-loading">
            <Loader size={28} className="spinning" />
            <span>Drawing a concept from your lessons…</span>
          </div>
        )}

        {!loading && error && !quiz && (
          <div className="wm-treasure-error">
            <p>{error}</p>
            <button type="button" className="wm-treasure-retry" onClick={loadQuiz}>Retry</button>
          </div>
        )}

        {outcome && (
          <div className="wm-treasure-success">
            <p className="wm-treasure-success-title">Chest opened!</p>
            <p className="wm-treasure-success-xp">+{outcome.xp_gained} XP</p>
            <p className="wm-treasure-success-sub">
              You nailed “{outcome.concept_name}”
            </p>
            {outcome.feedback && (
              <p className="wm-treasure-success-feedback">{outcome.feedback}</p>
            )}
            <button type="button" className="wm-treasure-done" onClick={onClose}>Done</button>
          </div>
        )}

        {!loading && quiz && !outcome && (
          <>
            <p className="wm-treasure-hint">
              Explain the concept below to earn {quiz.xp_reward} XP
            </p>

            <div className="wm-treasure-concept-badge">
              <span className="wm-treasure-concept-label">Concept</span>
              <span className="wm-treasure-concept-name">{quiz.concept_name}</span>
              <span className="wm-treasure-concept-meta">
                {quiz.folder} · {quiz.section}
              </span>
            </div>

            <div className="wm-treasure-question">
              <span className="wm-treasure-q-label">Question</span>
              <p>{quiz.question}</p>
            </div>

            <label className="wm-treasure-answer-label" htmlFor="treasure-answer">
              Your answer
            </label>
            <textarea
              id="treasure-answer"
              className="wm-treasure-answer-input"
              rows={5}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your explanation here…"
              disabled={submitting}
            />

            <button
              type="button"
              className="wm-treasure-claim wm-treasure-submit"
              onClick={submit}
              disabled={submitting || answer.trim().length < 8}
            >
              {submitting ? (
                <>Checking…</>
              ) : (
                <>
                  <Send size={18} />
                  Open chest
                </>
              )}
            </button>

            {(feedback || error) && (
              <p className="wm-treasure-inline-error">{feedback || error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
