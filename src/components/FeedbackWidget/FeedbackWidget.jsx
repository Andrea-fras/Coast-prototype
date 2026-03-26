import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import './FeedbackWidget.css';

const CATEGORIES = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

const FeedbackWidget = () => {
  const { token } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('suggestion');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    try {
      const page = window.location.pathname || '/';
      await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ category, message, page }),
      });
      setSent(true);
      setTimeout(() => {
        setOpen(false);
        setSent(false);
        setMessage('');
        setCategory('suggestion');
      }, 1600);
    } catch {
      /* silently ignore */
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        className="fb-fab"
        onClick={() => setOpen(true)}
        title="Send Feedback"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {open && createPortal(
        <div className="fb-overlay" onClick={() => setOpen(false)}>
          <div className="fb-modal" onClick={e => e.stopPropagation()}>
            {sent ? (
              <div className="fb-success">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2ECC71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Thanks for your feedback!</span>
              </div>
            ) : (
              <>
                <h3 className="fb-title">Send Feedback</h3>
                <p className="fb-desc">Help us improve Coast. Report a bug or suggest a feature.</p>

                <div className="fb-categories">
                  {CATEGORIES.map(c => (
                    <button
                      key={c.value}
                      className={`fb-cat-btn ${category === c.value ? 'active' : ''}`}
                      onClick={() => setCategory(c.value)}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                <textarea
                  className="fb-textarea"
                  placeholder="Describe the issue or your idea..."
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={4}
                />

                <div className="fb-actions">
                  <button className="fb-cancel" onClick={() => setOpen(false)}>Cancel</button>
                  <button
                    className="fb-submit"
                    onClick={handleSubmit}
                    disabled={!message.trim() || sending}
                  >
                    {sending ? 'Sending...' : 'Submit'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};

export default FeedbackWidget;
