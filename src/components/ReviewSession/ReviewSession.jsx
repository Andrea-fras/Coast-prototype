import React, { useState, useEffect, useRef } from 'react';
import { X, RotateCcw, ChevronRight, CheckCircle, Brain, Frown, Meh, Smile, ThumbsUp } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import PedroMessage from '../PedroMessage';
import mascot from '../../assets/sessioncompletebird.svg';
import './ReviewSession.css';

const QUALITY_BUTTONS = [
  { quality: 1, label: 'Forgot', icon: Frown, color: '#EF5350' },
  { quality: 3, label: 'Hard', icon: Meh, color: '#FFA726' },
  { quality: 4, label: 'Good', icon: Smile, color: '#66BB6A' },
  { quality: 5, label: 'Easy', icon: ThumbsUp, color: '#43A047' },
];

export default function ReviewSession({ onClose }) {
  const { token } = useAuth();
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState('loading'); // loading, answering, rating, complete
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/review/due`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : { cards: [] })
      .then(data => {
        const fetched = data.cards || [];
        setCards(fetched);
        setPhase(fetched.length > 0 ? 'answering' : 'complete');
      })
      .catch(() => setPhase('complete'));
  }, [token]);

  useEffect(() => {
    if (phase === 'answering' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase, currentIndex]);

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0 ? ((currentIndex) / cards.length) * 100 : 0;

  const handleSubmitAnswer = async () => {
    if (!answer.trim() || !currentCard) return;
    setFeedbackLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: `I'm reviewing the concept "${currentCard.concept}" from the section "${currentCard.section_title}". The correct summary is: "${currentCard.concept_summary}". My answer was: "${answer}". Give me brief feedback (2-3 sentences) on my understanding — what I got right, what I missed. Be encouraging.`,
          conversation_id: `review_${Date.now()}`,
          context_type: 'global',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setFeedback(data.reply || 'Great effort! Keep reviewing.');
      } else {
        setFeedback("Couldn't get feedback right now, but that's okay — rate how you felt about your answer below.");
      }
    } catch {
      setFeedback("Couldn't get feedback right now, but that's okay — rate how you felt about your answer below.");
    }

    setFeedbackLoading(false);
    setPhase('rating');
  };

  const handleRate = async (quality) => {
    if (!currentCard) return;

    try {
      await fetch(`${API_URL}/api/review/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ card_id: currentCard.id, quality }),
      });
    } catch { /* non-critical */ }

    setResults(prev => [...prev, {
      concept: currentCard.concept,
      quality,
      section: currentCard.section_title,
    }]);

    const nextIdx = currentIndex + 1;
    if (nextIdx >= cards.length) {
      setPhase('complete');
    } else {
      setCurrentIndex(nextIdx);
      setAnswer('');
      setFeedback('');
      setPhase('answering');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitAnswer();
    }
  };

  const avgQuality = results.length > 0
    ? (results.reduce((sum, r) => sum + r.quality, 0) / results.length).toFixed(1)
    : 0;

  return (
    <div className="review-overlay">
      <div className="review-modal">
        <button className="review-close" onClick={onClose}>
          <X size={20} />
        </button>

        {/* Progress bar */}
        {phase !== 'complete' && cards.length > 0 && (
          <div className="review-progress-bar">
            <div className="review-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}

        {/* Loading */}
        {phase === 'loading' && (
          <div className="review-center">
            <RotateCcw size={32} className="review-spinner" />
            <p>Loading your review cards...</p>
          </div>
        )}

        {/* Answering */}
        {phase === 'answering' && currentCard && (
          <div className="review-content">
            <div className="review-card-counter">
              {currentIndex + 1} / {cards.length}
            </div>

            <div className="review-question-card">
              <div className="review-section-badge">{currentCard.section_title}</div>
              <h2 className="review-concept-title">{currentCard.concept}</h2>
              <p className="review-prompt">Can you explain this concept? What is it and why does it matter?</p>
            </div>

            <div className="review-answer-area">
              <textarea
                ref={inputRef}
                className="review-textarea"
                placeholder="Type your answer here..."
                value={answer}
                onChange={e => setAnswer(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={4}
              />
              <button
                className="review-submit-btn"
                onClick={handleSubmitAnswer}
                disabled={!answer.trim()}
              >
                Check Answer <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Rating */}
        {phase === 'rating' && currentCard && (
          <div className="review-content">
            <div className="review-card-counter">
              {currentIndex + 1} / {cards.length}
            </div>

            <div className="review-question-card compact">
              <div className="review-section-badge">{currentCard.section_title}</div>
              <h2 className="review-concept-title">{currentCard.concept}</h2>
            </div>

            <div className="review-your-answer">
              <span className="review-answer-label">Your answer</span>
              <p>{answer}</p>
            </div>

            <div className="review-feedback">
              <img src={mascot} alt="Pedro" className="review-pedro-avatar" />
              <div className="review-feedback-bubble">
                {feedbackLoading ? (
                  <div className="review-feedback-loading">
                    <span /><span /><span />
                  </div>
                ) : (
                  <PedroMessage text={feedback} />
                )}
              </div>
            </div>

            <div className="review-correct-answer">
              <span className="review-answer-label">Key point</span>
              <p>{currentCard.concept_summary}</p>
            </div>

            <div className="review-rating-section">
              <p className="review-rating-prompt">How well did you know this?</p>
              <div className="review-rating-buttons">
                {QUALITY_BUTTONS.map(({ quality, label, icon: Icon, color }) => (
                  <button
                    key={quality}
                    className="review-rate-btn"
                    onClick={() => handleRate(quality)}
                    style={{ '--rate-color': color }}
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Complete */}
        {phase === 'complete' && (
          <div className="review-complete">
            <img src={mascot} alt="Pedro" className="review-complete-mascot" />
            {results.length > 0 ? (
              <>
                <h2>Review Complete!</h2>
                <p className="review-complete-sub">
                  You reviewed {results.length} concept{results.length !== 1 ? 's' : ''}
                </p>
                <div className="review-complete-stats">
                  <div className="review-complete-stat">
                    <span className="review-complete-stat-val">{results.length}</span>
                    <span className="review-complete-stat-lbl">Reviewed</span>
                  </div>
                  <div className="review-complete-stat">
                    <span className="review-complete-stat-val">{avgQuality}</span>
                    <span className="review-complete-stat-lbl">Avg Score</span>
                  </div>
                  <div className="review-complete-stat">
                    <span className="review-complete-stat-val">
                      {results.filter(r => r.quality >= 4).length}
                    </span>
                    <span className="review-complete-stat-lbl">Mastered</span>
                  </div>
                </div>
                <div className="review-complete-list">
                  {results.map((r, i) => (
                    <div className="review-complete-item" key={i}>
                      <span className="review-complete-concept">{r.concept}</span>
                      <span className={`review-complete-badge q${r.quality}`}>
                        {QUALITY_BUTTONS.find(b => b.quality === r.quality)?.label || `Q${r.quality}`}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h2>All caught up!</h2>
                <p className="review-complete-sub">No concepts due for review right now. Check back later!</p>
              </>
            )}
            <button className="review-done-btn" onClick={onClose}>
              <CheckCircle size={18} />
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
