import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import mascot from '../../assets/sessioncompletebird.svg';
import { Sparkles, ArrowRight, ArrowLeft, Map, Gem, ShieldCheck, Star } from 'lucide-react';
import './OnboardingModal.css';

const STEPS = [
  {
    icon: Sparkles,
    title: (name) => `Welcome to Coast, ${name}!`,
    paragraphs: [
      "I'm Pedro, your AI study companion. Let me walk you through how Coast works — it'll only take a minute.",
    ],
  },
  {
    icon: Map,
    title: () => 'Your learning map',
    paragraphs: [
      'The map is a visual representation of everything you\'ve learned. As you complete lessons, new regions unlock and your knowledge landscape grows.',
      'Explore the map to find interactive elements — including rare drops hidden across the terrain.',
    ],
  },
  {
    icon: Gem,
    title: () => 'Discover more, find more',
    paragraphs: [
      'The more lessons you complete, the more of the map you uncover — and the more drops you can find.',
      'Rare drops aren\'t just collectibles. They connect to active recall, helping you strengthen what you\'ve learned by testing your memory at the right moments.',
    ],
  },
  {
    icon: ShieldCheck,
    title: () => 'Master each section with Pedro',
    paragraphs: [
      'Every section you study with Pedro stays open until you\'ve truly mastered it. Pedro will verify your understanding before you can move on.',
      'Once verified, you earn XP and reveal new areas of the map.',
    ],
  },
  {
    icon: Star,
    title: () => 'Complete lessons, collect stars',
    paragraphs: [
      'Finish all sections in a lesson for a big XP bonus and even more map discovery.',
      'Master a full lesson to earn a star. Try to collect as many as you can!',
    ],
  },
];

export default function OnboardingModal() {
  const { token, updateUser, user } = useAuth();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const current = STEPS[step];
  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  const handleFinish = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ preferences: {} }),
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

  const handleNext = async () => {
    if (isLast) {
      await handleFinish();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (!isFirst) setStep((s) => s - 1);
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <img src={mascot} alt="Pedro" className="onboarding-mascot" />
          <div className="onboarding-header-text">
            <span className="onboarding-kicker">Getting started</span>
            <h2>Pedro&apos;s quick tour</h2>
          </div>
        </div>

        <div className="onboarding-progress">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`onboarding-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        <div className="onboarding-step" key={step}>
          <div className="onboarding-step-icon">
            <Icon size={24} />
          </div>
          <h3 className="onboarding-step-title">
            {typeof current.title === 'function' ? current.title(firstName) : current.title}
          </h3>
          <div className="onboarding-step-body">
            {current.paragraphs.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
        </div>

        <div className="onboarding-actions">
          <div className="onboarding-actions-left">
            {!isFirst ? (
              <button className="onboarding-back" onClick={handleBack} disabled={saving}>
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <button className="onboarding-skip" onClick={handleFinish} disabled={saving}>
                Skip for now
              </button>
            )}
          </div>
          <button className="onboarding-next" onClick={handleNext} disabled={saving}>
            {saving ? 'Saving...' : isLast ? (
              <>Start exploring <Sparkles size={16} /></>
            ) : (
              <>Next <ArrowRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
