import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import mascot from '../../assets/sessioncompletebird.svg';
import './GuidedTour.css';

const PAD = 8;          // space between the element and the spotlight edge
const GAP = 14;         // space between the spotlight and the card
const MARGIN = 16;      // minimum distance from the viewport edge
const FIND_TIMEOUT = 4000;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function waitForTarget(selector, signal) {
  return new Promise((resolve) => {
    if (!selector) { resolve(null); return; }
    const started = Date.now();
    const look = () => {
      if (signal.aborted) { resolve(null); return; }
      const el = document.querySelector(selector);
      const box = el?.getBoundingClientRect();
      if (el && box.width > 0 && box.height > 0) { resolve(el); return; }
      if (Date.now() - started > FIND_TIMEOUT) { resolve(null); return; }
      setTimeout(look, 100);
    };
    look();
  });
}

function placeCard(hole, card, preferred) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (vw < 640) {
    // Phones: a sheet at the bottom, or at the top when the highlight is low on screen.
    return hole && hole.top + hole.height / 2 > vh * 0.55 ? { side: 'sheet-top' } : null;
  }
  if (!hole) return null; // centred card
  const fits = {
    right: hole.left + hole.width + GAP + card.width + MARGIN <= vw,
    left: hole.left - GAP - card.width - MARGIN >= 0,
    bottom: hole.top + hole.height + GAP + card.height + MARGIN <= vh,
    top: hole.top - GAP - card.height - MARGIN >= 0,
  };
  const order = [preferred, 'right', 'bottom', 'left', 'top'].filter(Boolean);
  const side = order.find((s) => fits[s]);
  if (!side) return null;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  if (side === 'right' || side === 'left') {
    return {
      side,
      left: side === 'right' ? hole.left + hole.width + GAP : hole.left - GAP - card.width,
      top: clamp(hole.top + hole.height / 2 - card.height / 2, MARGIN, vh - card.height - MARGIN),
    };
  }
  return {
    side,
    top: side === 'bottom' ? hole.top + hole.height + GAP : hole.top - GAP - card.height,
    left: clamp(hole.left + hole.width / 2 - card.width / 2, MARGIN, vw - card.width - MARGIN),
  };
}

/**
 * Spotlight tour over the live app.
 *
 * steps: [{ target?: CSS selector, title, body, placement?, before?: () => void|Promise }]
 * `before` runs when the step is entered (e.g. open the Lessons screen); steps whose
 * target never appears fall back to a centred card, so the tour cannot get stuck.
 */
export default function GuidedTour({ steps, onFinish, onSkip, finishLabel = 'Done' }) {
  const [index, setIndex] = useState(0);
  // The element found for a step, tagged with that step, so a new step starts "not ready".
  const [found, setFound] = useState({ index: -1, el: null });
  const [hole, setHole] = useState(null);
  const [cardPos, setCardPos] = useState(null);
  const cardRef = useRef(null);
  const step = steps[index];
  const last = index === steps.length - 1;
  const ready = found.index === index;
  const target = ready ? found.el : null;

  // Enter a step: run its navigation, then find its element.
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try { await step.before?.(); } catch { /* navigation is best-effort */ }
      const el = await waitForTarget(step.target, controller.signal);
      if (controller.signal.aborted) return;
      if (el) {
        const box = el.getBoundingClientRect();
        if (box.top < 0 || box.bottom > window.innerHeight) {
          el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
        }
      }
      setFound({ index, el });
    })();
    return () => controller.abort();
  }, [step, index]);

  // Follow the element as the layout moves (lazy screens, resizes, scrolling).
  useLayoutEffect(() => {
    if (!ready) return undefined;
    let frame;
    let previous = '';
    const track = () => {
      const box = target?.getBoundingClientRect();
      const next = box ? {
        top: box.top - PAD, left: box.left - PAD, width: box.width + PAD * 2, height: box.height + PAD * 2,
      } : null;
      const card = cardRef.current?.getBoundingClientRect();
      const key = JSON.stringify([next, card?.width, card?.height, window.innerWidth, window.innerHeight]);
      if (key !== previous) {
        previous = key;
        setHole(next);
        setCardPos(card ? placeCard(next, card, step.placement) : null);
      }
      frame = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(frame);
  }, [ready, target, step]);

  useEffect(() => {
    if (ready) cardRef.current?.focus({ preventScroll: true });
  }, [ready, index]);

  const next = useCallback(() => {
    if (last) onFinish?.();
    else setIndex((i) => i + 1);
  }, [last, onFinish]);
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onSkip?.(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onSkip]);

  const cardStyle = cardPos?.top != null ? { top: cardPos.top, left: cardPos.left } : undefined;

  return createPortal(
    <div className="gt-root" data-reduced-motion={prefersReducedMotion() ? 'true' : undefined}>
      {/* Clicks outside the card are absorbed so the tour can't be broken mid-way. */}
      <div className={`gt-backdrop ${ready && hole ? 'has-hole' : ''}`} aria-hidden="true" />
      {ready && hole && (
        <div
          className="gt-spotlight"
          aria-hidden="true"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height }}
        />
      )}
      <div
        ref={cardRef}
        className={`gt-card ${cardPos ? `gt-card--${cardPos.side}` : 'gt-card--center'} ${ready ? 'is-ready' : ''}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gt-title"
        aria-describedby="gt-body"
        tabIndex={-1}
      >
        <div className="gt-card-head">
          <img src={mascot} alt="" className="gt-mascot" />
          <span className="gt-count" aria-live="polite">{index + 1} of {steps.length}</span>
          <button type="button" className="gt-skip" onClick={onSkip} aria-label="Skip tour">
            <X size={16} />
          </button>
        </div>
        <h2 id="gt-title" className="gt-title">{step.title}</h2>
        <p id="gt-body" className="gt-body">{step.body}</p>
        <div className="gt-foot">
          <div className="gt-dots" aria-hidden="true">
            {steps.map((_, i) => <span key={i} className={i === index ? 'on' : i < index ? 'done' : ''} />)}
          </div>
          <div className="gt-actions">
            {index > 0 && (
              <button type="button" className="gt-btn gt-btn--ghost" onClick={back}>
                <ArrowLeft size={15} /> Back
              </button>
            )}
            <button type="button" className="gt-btn gt-btn--primary" onClick={next}>
              {last ? finishLabel : 'Next'} {!last && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
