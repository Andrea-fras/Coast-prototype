import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ArrowRight, ChevronRight } from 'lucide-react';
import './TutorialTour.css';

const TOUR_STEPS = [
  {
    target: '[data-tour="briefing"]',
    title: "Pedro's Briefing",
    description: "This is Pedro, your AI tutor. He tracks your progress and gives you daily study recommendations tailored just for you.",
    position: 'left',
  },
  {
    target: '[data-tour="review-deck"]',
    title: 'Review Deck',
    description: "Your review deck uses spaced repetition. Pedro creates flashcards from your study guides so you remember what matters most.",
    position: 'left',
  },
  {
    target: '[data-tour="notebooks"]',
    title: 'Your Notebooks',
    description: "Upload a single PDF or lecture and Pedro generates a comprehensive study guide. From notebooks you can chat with Pedro, generate visualizations, mind maps, edit, and download.",
    position: 'left',
  },
  {
    target: '[data-tour="notebook-nav"]',
    title: 'Folders & Sources',
    description: "Create folders to organize a full course. Upload as many sources as you want \u2014 PDFs, slides, videos \u2014 and Pedro generates a complete interactive lesson with questions straight from your materials.",
    position: 'bottom',
  },
  {
    target: '[data-tour="courses"]',
    title: 'Pre-made Courses',
    description: "Browse curated courses made by experts. Jump into any lesson to get started instantly \u2014 no uploads needed.",
    position: 'right',
  },
  {
    target: '[data-tour="ask-pedro"]',
    title: 'Ask Pedro Anything',
    description: "Ask Pedro anything, anytime. He remembers your learning style and adapts to what works best for you.",
    position: 'left',
  },
];

const STORAGE_KEY = 'coast_tour_done';

export default function TutorialTour() {
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState(null);
  const [visible, setVisible] = useState(true);
  const popoverRef = useRef(null);

  const current = TOUR_STEPS[step];

  const measureTarget = useCallback(() => {
    if (!current) return;
    const el = document.querySelector(current.target);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({
        top: r.top - 6,
        left: r.left - 6,
        width: r.width + 12,
        height: r.height + 12,
      });
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
      setRect(null);
    }
  }, [current]);

  useEffect(() => {
    measureTarget();
    window.addEventListener('resize', measureTarget);
    window.addEventListener('scroll', measureTarget, true);
    return () => {
      window.removeEventListener('resize', measureTarget);
      window.removeEventListener('scroll', measureTarget, true);
    };
  }, [measureTarget]);

  const handleNext = () => {
    if (step < TOUR_STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      finish();
    }
  };

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setVisible(false);
  };

  if (!visible || !rect) return null;

  const popoverStyle = getPopoverPosition(rect, current.position);

  return (
    <div className="tour-overlay">
      {/* Spotlight cutout via box-shadow */}
      <div
        className="tour-spotlight"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
      />

      {/* Popover */}
      <div className="tour-popover" style={popoverStyle} ref={popoverRef} key={step}>
        <div className="tour-popover-arrow" data-position={current.position} />
        <button className="tour-close" onClick={finish} aria-label="Close tour">
          <X size={16} />
        </button>
        <h4 className="tour-title">{current.title}</h4>
        <p className="tour-desc">{current.description}</p>
        <div className="tour-footer">
          <span className="tour-counter">{step + 1} / {TOUR_STEPS.length}</span>
          <button className="tour-next-btn" onClick={handleNext}>
            {step < TOUR_STEPS.length - 1 ? (
              <>Next <ChevronRight size={16} /></>
            ) : (
              <>Got it! <ArrowRight size={16} /></>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function getPopoverPosition(rect, position) {
  const GAP = 16;
  const POPOVER_W = 320;

  switch (position) {
    case 'right':
      return {
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width + GAP,
        transform: 'translateY(-50%)',
      };
    case 'left':
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - POPOVER_W - GAP,
        transform: 'translateY(-50%)',
      };
    case 'bottom':
      return {
        top: rect.top + rect.height + GAP,
        left: rect.left + rect.width / 2,
        transform: 'translateX(-50%)',
      };
    case 'top':
      return {
        top: rect.top - GAP,
        left: rect.left + rect.width / 2,
        transform: 'translate(-50%, -100%)',
      };
    default:
      return {
        top: rect.top + rect.height + GAP,
        left: rect.left,
      };
  }
}

TutorialTour.STORAGE_KEY = STORAGE_KEY;
