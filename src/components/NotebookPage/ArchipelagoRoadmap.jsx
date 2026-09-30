import React from 'react';
import { Check } from 'lucide-react';
import IslandPixelArt from './IslandPixelArt';
import MapCover from '../MapCover/MapCover';
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

/**
 * The course roadmap: one row per section, each with a thumbnail of the land that
 * section charted on the student's map (still fog while it's locked).
 */
const ArchipelagoRoadmap = ({
  sections,
  currentSection = 0,
  isComplete = false,
  everMastered = false,
  sectionProgress = [],
  onIslandClick,
  allowTestOut = true,
  mapData = null,
  sectionTiles = null,
  courseTiles = null,
}) => {
  if (!sections?.length) return null;

  return (
    <ol className="archipelago" aria-label="Course sections">
      {sections.map((sec, i) => {
        const state = getIslandState(i, { currentSection, isComplete, everMastered, sectionProgress });
        const prog = sectionProgress[i] || {};
        const title = sec.workshop?.title || sec.title;
        const unit = sec.workshop ? 'Milestone' : 'Section';
        const needsReview = prog.mastery_pct != null && prog.mastery_pct < 100;
        const clickable = (state === 'locked' && allowTestOut) || state === 'complete' || state === 'current'
          || (needsReview && (prog.attempted || state === 'complete'));
        const pct = prog.mastery_pct;

        let detail;
        if (state === 'complete') detail = pct != null && pct < 100 ? `Done · ${pct}% mastery · worth a review` : 'Mastered · 100%';
        else if (state === 'current') detail = pct ? `In progress · ${pct}% mastery` : 'Up next';
        else detail = allowTestOut ? 'In the fog · already know it? Test out' : 'Unlocks after the previous milestone';

        let chip = null;
        if (state === 'complete') chip = <span className="archipelago-chip archipelago-chip--mint">{needsReview ? 'Review' : 'Revisit'}</span>;
        else if (state === 'current' && !isComplete) chip = <span className="archipelago-chip archipelago-chip--amber">Continue</span>;
        else if (state === 'locked' && allowTestOut) chip = <span className="archipelago-chip archipelago-chip--line">Test out</span>;

        return (
          <li key={i} className="archipelago-row">
            <button
              type="button"
              className={`archipelago-node archipelago-node--${state}${clickable ? ' archipelago-node--clickable' : ''}`}
              onClick={() => clickable && onIslandClick?.(i, state)}
              disabled={!clickable}
              aria-current={state === 'current' ? 'step' : undefined}
              title={
                state === 'locked'
                  ? (allowTestOut ? `Test out to unlock: ${title}` : `Unlocks after the previous milestone: ${title}`)
                  : state === 'current'
                    ? `Current section: ${title}`
                    : title
              }
            >
              <span className="archipelago-isle" aria-hidden="true">
                {mapData && sectionTiles?.[i]?.length ? (
                  <MapCover mapData={mapData} tiles={sectionTiles[i]} maxTile={10} />
                ) : state === 'complete' && mapData && courseTiles?.length ? (
                  <MapCover mapData={mapData} tiles={courseTiles} highlight={false} maxTile={10} />
                ) : state === 'complete' || !mapData ? (
                  <span className="archipelago-art"><IslandPixelArt variant={islandVariant(state)} size={40} /></span>
                ) : (
                  // Not charted yet: this section's land is still under the fog.
                  <span className="archipelago-fog" />
                )}
                <span className="archipelago-dot">
                  {state === 'complete' ? <Check size={12} strokeWidth={3.5} /> : i + 1}
                </span>
              </span>
              <span className="archipelago-label">
                <span className="archipelago-index">
                  {unit} {i + 1}{state === 'current' && !isComplete ? ' · now' : ''}
                </span>
                <span className="archipelago-title">{title}</span>
                <span className="archipelago-detail">{detail}</span>
              </span>
              {chip}
            </button>
          </li>
        );
      })}
    </ol>
  );
};

export default ArchipelagoRoadmap;
