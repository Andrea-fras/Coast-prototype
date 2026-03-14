import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import mascot from '../../assets/sessioncompletebird.svg';
import { Sparkles, ArrowRight, BookOpen, Brain, Eye, Target } from 'lucide-react';
import './OnboardingModal.css';

const QUESTIONS = [
  {
    key: 'learning_style',
    icon: <BookOpen size={24} />,
    title: 'How do you prefer to learn new concepts?',
    options: [
      { id: 'theory-first', label: 'Explain the theory first, then give examples', emoji: '📖' },
      { id: 'example-first', label: 'Show me examples and I\'ll figure out the pattern', emoji: '🔍' },
      { id: 'balanced', label: 'Mix of both depending on the topic', emoji: '⚖️' },
    ],
  },
  {
    key: 'when_stuck',
    icon: <Brain size={24} />,
    title: 'When you\'re stuck on a concept, what helps most?',
    options: [
      { id: 'step-by-step', label: 'Break it down step by step', emoji: '🪜' },
      { id: 'analogies', label: 'Give me an analogy or real-world comparison', emoji: '🌍' },
      { id: 'visual', label: 'Show me a visual diagram or chart', emoji: '📊' },
    ],
  },
  {
    key: 'detail_level',
    icon: <Eye size={24} />,
    title: 'How much detail do you want in explanations?',
    options: [
      { id: 'concise', label: 'Give me the big picture, I\'ll dig deeper if needed', emoji: '🎯' },
      { id: 'detailed', label: 'Thorough and detailed, don\'t leave anything out', emoji: '📝' },
      { id: 'adaptive', label: 'Depends on the topic', emoji: '🔄' },
    ],
  },
  {
    key: 'study_goal',
    icon: <Target size={24} />,
    title: 'What\'s your main study goal right now?',
    options: [
      { id: 'exam-prep', label: 'Preparing for exams', emoji: '📋' },
      { id: 'deep-understanding', label: 'Understanding concepts deeply', emoji: '💡' },
      { id: 'catch-up', label: 'Catching up on missed lectures', emoji: '⏩' },
      { id: 'review', label: 'General review and practice', emoji: '🔁' },
    ],
  },
];

export default function OnboardingModal() {
  const { token, updateUser, user } = useAuth();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);

  const current = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const selectedId = answers[current.key] || null;

  const handleSelect = (optionId) => {
    setAnswers(prev => ({ ...prev, [current.key]: optionId }));
  };

  const handleNext = async () => {
    if (isLast) {
      await handleFinish();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleSkip = async () => {
    await handleFinish();
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ preferences: answers }),
      });
      if (res.ok) {
        const data = await res.json();
        updateUser({ onboarding_completed: true, ...data });
      } else {
        updateUser({ onboarding_completed: true });
      }
    } catch {
      updateUser({ onboarding_completed: true });
    }
    setSaving(false);
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        {/* Header */}
        <div className="onboarding-header">
          <img src={mascot} alt="Pedro" className="onboarding-mascot" />
          <div className="onboarding-header-text">
            <h2>Hey {user?.name?.split(' ')[0] || 'there'}! I'm Pedro.</h2>
            <p>Let me learn how you study best so I can help you more effectively.</p>
          </div>
        </div>

        {/* Progress */}
        <div className="onboarding-progress">
          {QUESTIONS.map((_, i) => (
            <div
              key={i}
              className={`onboarding-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        {/* Question */}
        <div className="onboarding-question" key={step}>
          <div className="onboarding-q-icon">{current.icon}</div>
          <h3 className="onboarding-q-title">{current.title}</h3>

          <div className="onboarding-options">
            {current.options.map(opt => (
              <button
                key={opt.id}
                className={`onboarding-option ${selectedId === opt.id ? 'selected' : ''}`}
                onClick={() => handleSelect(opt.id)}
              >
                <span className="onboarding-option-emoji">{opt.emoji}</span>
                <span className="onboarding-option-label">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="onboarding-actions">
          <button className="onboarding-skip" onClick={handleSkip} disabled={saving}>
            Skip for now
          </button>
          <button
            className="onboarding-next"
            onClick={handleNext}
            disabled={!selectedId || saving}
          >
            {saving ? 'Saving...' : isLast ? (
              <>Finish <Sparkles size={16} /></>
            ) : (
              <>Next <ArrowRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
