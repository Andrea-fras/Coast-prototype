import React from 'react';
import mascot from '../../assets/sessioncompletebird.svg';
import IslandPixelArt from './IslandPixelArt';
import './ArchipelagoRoadmap.css';

function islandVariant(state) {
  if (state === 'complete') return 'complete';
  if (state === 'locked') return 'locked';
  return 'current';
}

function getIslandState(index, { currentSection, isComplete, everMastered, sectionProgress }) {
  const prog = sectionProgress[index] || {};
  if (everMastered && !isComplete) {
    if (index === currentSection) return 'current';
    return 'complete';
  }
  if (isComplete || everMastered) return 'complete';
  if (index < currentSection || prog.mastery_pct >= 100) return 'complete';
  if (index === currentSection) return 'current';
  return 'locked';
}

const ArchipelagoRoadmap = ({
  sections,
  currentSection = 0,
  isComplete = false,
  everMastered = false,
  sectionProgress = [],
  onIslandClick,
}) => {
  if (!sections?.length) return null;

  return (
    <div className="archipelago" role="list" aria-label="Course sections">
      {sections.map((sec, i) => {
        const state = getIslandState(i, { currentSection, isComplete, everMastered, sectionProgress });
        const prog = sectionProgress[i] || {};
        const needsReview = prog.mastery_pct != null && prog.mastery_pct < 100;
        const clickable = state === 'locked' || state === 'complete' || state === 'current'
          || (needsReview && (prog.attempted || state === 'complete'));

        return (
          <div key={i} className="archipelago-row" role="listitem">
            {i > 0 && (
              <div className={`archipelago-bridge archipelago-bridge--${state === 'locked' ? 'locked' : 'open'}`} aria-hidden />
            )}
            <button
              type="button"
              className={`archipelago-node archipelago-node--${state}${clickable ? ' archipelago-node--clickable' : ''}`}
              onClick={() => clickable && onIslandClick?.(i, state)}
              disabled={!clickable}
              title={
                state === 'locked'
                  ? `Test out to unlock: ${sec.title}`
                  : state === 'current'
                    ? `Current section: ${sec.title}`
                    : sec.title
              }
            >
              <span className="archipelago-island-wrap" aria-hidden>
                <IslandPixelArt variant={islandVariant(state)} size={40} />
                {state === 'current' && (
                  <img src={mascot} alt="" className="archipelago-pedro" />
                )}
              </span>
              <span className="archipelago-label">
                <span className="archipelago-index">Section {i + 1}</span>
                <span className="archipelago-title">{sec.title}</span>
              </span>
              {state === 'locked' && (
                <span className="archipelago-badge">Test out</span>
              )}
              {state === 'current' && !isComplete && (
                <span className="archipelago-badge archipelago-badge--current">Now</span>
              )}
              {prog.mastery_pct != null && state !== 'locked' && (
                <span className={`archipelago-mastery${prog.mastery_pct >= 100 ? ' mastered' : ''}`}>
                  {prog.mastery_pct}%
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ArchipelagoRoadmap;
