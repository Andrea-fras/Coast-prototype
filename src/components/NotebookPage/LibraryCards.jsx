import React, { useRef } from 'react';
import { ArrowUpRight, MapPin, Play, Plus, Sparkles } from 'lucide-react';
import MapCover from '../MapCover/MapCover';
import mascot from '../../assets/sessioncompletebird.svg';
import trophyIcon from '../../assets/lesson-icons/trophy.svg';
import { computeFolderProgress, countCompletedSections, getCardState } from '../../utils/lessonProgress';
import { relativeDay } from '../../utils/relativeDay';

function sectionTotal(meta) {
  return meta?.total_sections || meta?.section_progress?.length || 0;
}

/** One pill per section: mint when done, amber for the current one. */
export function SectionSegments({ meta, className = '' }) {
  const total = sectionTotal(meta);
  if (!total) return null;
  const current = meta.current_section || 0;
  return (
    <span className={`lib-segs ${className}`.trim()} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => {
        const p = meta.section_progress?.[i];
        const done = p?.mastered || (p?.mastery_pct ?? 0) >= 100 || i < current;
        return <i key={i} className={done ? 'done' : i === current ? 'now' : ''} />;
      })}
    </span>
  );
}

function Place({ place, className = 'lib-place' }) {
  return (
    <span className={className}>
      <MapPin size={12} aria-hidden="true" />
      <span className="lib-place__text">{place}</span>
    </span>
  );
}

export function ResumeCard({ name, meta, mapData, tiles, place, onContinue, onRoadmap }) {
  const total = sectionTotal(meta);
  const current = Math.min((meta.current_section || 0) + 1, Math.max(total, 1));
  const when = relativeDay(meta.last_studied_at);
  return (
    <article className="lib-resume">
      <div className="lib-resume__cover">
        <MapCover mapData={mapData} tiles={tiles} seed={name} />
        {place && <Place place={place} />}
      </div>
      <div className="lib-resume__body">
        <p className="lib-kicker">Continue where you left off</p>
        <h2>{name}</h2>
        <p className="lib-resume__where">
          Section {current} of {total}
          {meta.current_section_title && <> · <b>{meta.current_section_title}</b></>}
        </p>
        <SectionSegments meta={meta} className="lib-resume__segs" />
        <div className="lib-resume__row">
          <button type="button" className="lib-btn lib-btn--primary" onClick={onContinue}>
            <Play size={16} aria-hidden="true" />
            Continue lesson
          </button>
          <button type="button" className="lib-btn lib-btn--ghost" onClick={onRoadmap}>
            Roadmap
          </button>
          {when && (
            <span className="lib-resume__when">
              Last studied {when === 'Today' || when === 'Yesterday' ? when.toLowerCase() : when}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/** A course in the library: the land it charted on the student's own map, and where it's up to. */
export function CourseCard({ name, meta = {}, mapData, tiles, place, onOpen, style }) {
  const state = getCardState(meta);
  const total = sectionTotal(meta);
  const completed = countCompletedSections(meta);
  const progress = computeFolderProgress(meta);
  const when = relativeDay(meta.last_studied_at);

  return (
    <button
      type="button"
      className={`lib-card lib-card--${state}`}
      data-folder={name}
      onClick={() => onOpen(name)}
      style={style}
    >
      <span className="lib-card__cover">
        <MapCover mapData={mapData} tiles={tiles} seed={name} />
        <Place place={place || (tiles?.length ? 'Charted land' : 'Still in the fog')} />
      </span>
      <span className="lib-card__body">
        <span className="lib-card__title">{name}</span>
        {meta.has_outline ? (
          <>
            <span className="lib-card__meta">
              <span><b>{completed}</b> of {total} sections</span>
              <span>{when || 'Not started'}</span>
            </span>
            <span className="lib-bar" aria-hidden="true">
              <i style={{ width: `${completed || progress ? Math.max(progress, 4) : 0}%` }} />
            </span>
            <span className="lib-card__tags">
              {state === 'in-progress' && meta.current_section_title && (
                <span className="lib-chip lib-chip--amber" title={meta.current_section_title}>Next: {meta.current_section_title}</span>
              )}
              {state === 'not-started' && <span className="lib-chip lib-chip--line">Ready to start</span>}
            </span>
          </>
        ) : (
          <>
            <span className="lib-card__meta"><span>No roadmap yet</span></span>
            <span className="lib-card__tags">
              <span className="lib-chip lib-chip--line">Add sources to begin</span>
            </span>
          </>
        )}
      </span>
    </button>
  );
}

/**
 * A mastered course: a golden collectible card. Numbered in the order it joined
 * the student's collection, tilts toward the pointer, and catches the light.
 */
export function TrophyCard({ name, meta = {}, mapData, tiles, place, number, onOpen, style }) {
  const ref = useRef(null);
  const total = sectionTotal(meta);

  const tilt = (e) => {
    const el = ref.current;
    if (!el || e.pointerType === 'touch') return;
    const box = el.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width;
    const y = (e.clientY - box.top) / box.height;
    el.style.setProperty('--rx', `${((0.5 - y) * 9).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${((x - 0.5) * 11).toFixed(2)}deg`);
    el.style.setProperty('--mx', `${Math.round(x * 100)}%`);
    el.style.setProperty('--my', `${Math.round(y * 100)}%`);
  };
  const settle = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  };

  return (
    <button
      ref={ref}
      type="button"
      className="lib-trophy"
      data-folder={name}
      onClick={() => onOpen(name)}
      onPointerMove={tilt}
      onPointerLeave={settle}
      style={style}
    >
      <span className="lib-trophy__card">
        <span className="lib-trophy__cover">
          <MapCover mapData={mapData} tiles={tiles} seed={name} />
          <span className="lib-trophy__no">No. {String(number).padStart(2, '0')}</span>
          <span className="lib-trophy__medal" aria-hidden="true">
            <img src={trophyIcon} alt="" />
          </span>
        </span>
        <span className="lib-trophy__body">
          <span className="lib-trophy__kicker">
            <Sparkles size={12} aria-hidden="true" />
            Mastered
          </span>
          <span className="lib-trophy__title">{name}</span>
          <Place place={place || 'Charted land'} className="lib-trophy__place" />
          <span className="lib-trophy__stats">
            <span><b>{total}</b> section{total === 1 ? '' : 's'}</span>
            <span><b>100%</b> mastery</span>
          </span>
        </span>
        <span className="lib-trophy__glare" aria-hidden="true" />
        <span className="lib-trophy__sweep" aria-hidden="true" />
      </span>
    </button>
  );
}

export function NewCard({ title, hint, onClick, tour, compact = false }) {
  return (
    <button
      type="button"
      className={`lib-new${compact ? ' lib-new--compact' : ''}`}
      data-tour={tour}
      onClick={onClick}
    >
      <img src={mascot} alt="" className="lib-new__pedro" />
      <span className="lib-new__title">
        <Plus size={16} aria-hidden="true" />
        {title}
      </span>
      {hint && <span className="lib-new__hint">{hint}</span>}
    </button>
  );
}

/** A workshop from the Coast catalogue: its artwork in place of a map. */
export function CatalogueCard({ lesson, cover, mastered, onOpen, style }) {
  const isFree = (lesson.cupCost ?? 0) === 0;
  const format = lesson.format === 'workshop' ? 'Hands-on workshop' : 'Guided course';
  return (
    <button
      type="button"
      className={`lib-card lib-card--catalogue${mastered ? ' is-gold' : ''}`}
      data-folder={lesson.folderName}
      onClick={() => onOpen(lesson.folderName)}
      style={style}
    >
      <span className="lib-card__cover lib-card__cover--art">
        {cover
          ? <img src={cover} alt="" loading="lazy" />
          : <span className={`nb-premade-card-cover nb-premade-card-cover--${lesson.id}`} />}
        {lesson.course && <span className="lib-place">{lesson.course}</span>}
        {mastered ? (
          <span className="lib-card__badge lib-card__badge--gold">
            <img src={trophyIcon} alt="" />
            Mastered
          </span>
        ) : isFree ? (
          <span className="lib-card__badge">Free</span>
        ) : (
          <span className="lib-card__badge">
            <img src={trophyIcon} alt="" />
            {lesson.cupCost}
          </span>
        )}
      </span>
      <span className="lib-card__body">
        <span className="lib-card__title">{lesson.outcomeTitle || lesson.title}</span>
        <span className="lib-card__sub">{lesson.title}</span>
        <span className="lib-card__desc">{lesson.outcome || lesson.description}</span>
        <span className="lib-card__foot">
          <span>{format}{lesson.estimatedMinutes ? ` · ~${lesson.estimatedMinutes} min` : ''}</span>
          <ArrowUpRight size={17} aria-hidden="true" />
        </span>
      </span>
    </button>
  );
}
