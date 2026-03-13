import React, { useState } from 'react';
import { Send, RotateCcw, CheckCircle, XCircle, Loader } from 'lucide-react';
import PedroMessage from '../PedroMessage';
import { API_URL } from '../../config';

export default function ExerciseWidget({ section, token, onClose }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('idle'); // idle, question, answered

  const sectionContent = [
    section.content || '',
    ...(section.subsections || []).map(s =>
      `${s.title || ''}: ${s.content || ''} ${(s.bullets || []).join('. ')}`
    ),
  ].join('\n').slice(0, 3000);

  const generateQuestion = async () => {
    setLoading(true);
    setFeedback('');
    setAnswer('');
    try {
      const res = await fetch(`${API_URL}/api/exercise`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          section_title: section.title || 'Untitled',
          section_content: sectionContent,
          action: 'generate',
        }),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error('[exercise] generate failed:', res.status, errBody);
        throw new Error('Failed');
      }
      const data = await res.json();
      setQuestion(data.question);
      setStage('question');
    } catch (err) {
      console.error('[exercise] generate error:', err);
      setQuestion('Could not generate a question. Try again.');
      setStage('question');
    } finally {
      setLoading(false);
    }
  };

  const submitAnswer = async () => {
    if (!answer.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/exercise`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          section_title: section.title || 'Untitled',
          section_content: sectionContent,
          action: 'evaluate',
          question,
          answer: answer.trim(),
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setFeedback(data.feedback);
      setStage('answered');
    } catch {
      setFeedback('Could not evaluate your answer. Try again.');
      setStage('answered');
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'idle') {
    return (
      <div className="exercise-widget">
        <button className="exercise-start-btn" onClick={generateQuestion} disabled={loading}>
          {loading ? (
            <><Loader size={15} className="exercise-spin" /> Generating...</>
          ) : (
            <>Test your understanding</>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="exercise-widget exercise-active">
      <div className="exercise-header">
        <span className="exercise-label">Practice Question</span>
        <button className="exercise-close" onClick={onClose} title="Close">×</button>
      </div>

      <div className="exercise-question">
        <PedroMessage text={question} />
      </div>

      {stage === 'question' && (
        <div className="exercise-answer-area">
          <textarea
            className="exercise-input"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer..."
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitAnswer();
              }
            }}
          />
          <button
            className="exercise-submit-btn"
            onClick={submitAnswer}
            disabled={loading || !answer.trim()}
          >
            {loading ? <Loader size={15} className="exercise-spin" /> : <Send size={15} />}
            <span>{loading ? 'Checking...' : 'Submit'}</span>
          </button>
        </div>
      )}

      {stage === 'answered' && feedback && (
        <div className="exercise-feedback">
          <PedroMessage text={feedback} />
          <div className="exercise-actions">
            <button className="exercise-retry-btn" onClick={generateQuestion}>
              <RotateCcw size={14} />
              <span>New question</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
