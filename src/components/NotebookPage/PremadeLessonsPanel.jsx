import React, { useMemo, useState } from 'react';
import { isFolderMastered } from '../../utils/lessonProgress';
import trophyIcon from '../../assets/lesson-icons/trophy.svg';
import prismaticCover from '../../assets/premade-covers/prismatic-system.png';
import cookingCover from '../../assets/premade-covers/science-of-cooking.png';
import memoryCover from '../../assets/premade-covers/memory-palace.png';
import firstPrinciplesCover from '../../assets/premade-covers/first-principles-thinking.png';
import polyaCover from '../../assets/premade-covers/polya-method.png';

const COVER_BY_ID = {
  'prismatic-system': prismaticCover,
  'science-of-cooking': cookingCover,
  'memory-palace': memoryCover,
  'first-principles-thinking': firstPrinciplesCover,
  'polya-method': polyaCover,
};

const RECOMMENDED_IDS = [
  'memory-palace',
  'polya-method',
  'first-principles-thinking',
  'science-of-cooking',
];

function truncateAbout(text, max = 145) {
  if (!text || text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function PremadeCard({ lesson, onOpen, mastered }) {
  const isFree = (lesson.cupCost ?? 0) === 0;
  const cover = COVER_BY_ID[lesson.id];

  return (
    <button
      type="button"
      className={`nb-premade-card${mastered ? ' nb-premade-card--mastered' : ''}`}
      onClick={() => onOpen(lesson.folderName)}
    >
      {mastered ? (
        <span className="nb-premade-card-badge nb-premade-card-badge--mastered">
          <img src={trophyIcon} alt="" />
          Mastered
        </span>
      ) : isFree ? (
        <span className="nb-premade-card-badge">Free</span>
      ) : (
        <span className="nb-premade-card-badge nb-premade-card-badge--paid">
          <img src={trophyIcon} alt="" />
          {lesson.cupCost}
        </span>
      )}

      <h3 className="nb-premade-card-title">{lesson.title}</h3>
      <p className="nb-premade-card-course">{lesson.course}</p>

      {cover ? (
        <div className="nb-premade-card-cover-frame">
          <img src={cover} alt="" className="nb-premade-card-cover-img" />
        </div>
      ) : (
        <div className={`nb-premade-card-cover nb-premade-card-cover--${lesson.id}`} aria-hidden="true" />
      )}

      <div className="nb-premade-card-about">
        <span className="nb-premade-card-about-label">About:</span>
        <p>{truncateAbout(lesson.description)}</p>
      </div>
    </button>
  );
}

const PremadeLessonsPanel = ({ lessons, cupCount, folderMeta = {}, onOpenFolder }) => {
  const [genre, setGenre] = useState('all');

  const genres = useMemo(
    () => ['all', ...new Set(lessons.map((l) => l.course).filter(Boolean))],
    [lessons],
  );

  const recommended = useMemo(() => {
    const byId = Object.fromEntries(lessons.map((l) => [l.id, l]));
    return RECOMMENDED_IDS.map((id) => byId[id]).filter(Boolean);
  }, [lessons]);

  const filtered = useMemo(() => {
    if (genre === 'all') return lessons;
    return lessons.filter((l) => l.course === genre);
  }, [lessons, genre]);

  if (lessons.length === 0) {
    return (
      <div className="nb-v2-empty">
        <img src={trophyIcon} alt="" className="nb-v2-empty-icon-img" />
        <h2>Premade lessons coming soon</h2>
        <p>
          Curated courses will be available here. Each mastered lesson earns you
          {' '}<strong>1 cup</strong> to spend on premade deep dives.
        </p>
        <p className="nb-v2-empty-sub">
          You have <strong>{cupCount}</strong> cup{cupCount === 1 ? '' : 's'}.
        </p>
      </div>
    );
  }

  return (
    <div className="nb-v2-premade">
      {recommended.length > 0 && (
        <section className="nb-premade-section">
          <h2 className="nb-premade-section-title">Recommended:</h2>
          <div className="nb-premade-grid">
            {recommended.map((lesson) => (
              <PremadeCard
                key={`rec-${lesson.id}`}
                lesson={lesson}
                onOpen={onOpenFolder}
                mastered={isFolderMastered(folderMeta[lesson.folderName])}
              />
            ))}
          </div>
        </section>
      )}

      <section className="nb-premade-section">
        <h2 className="nb-premade-section-title">Sort by Genre</h2>
        <div className="nb-premade-genres" role="tablist" aria-label="Filter by genre">
          {genres.map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={genre === g}
              className={`nb-premade-genre${genre === g ? ' active' : ''}`}
              onClick={() => setGenre(g)}
            >
              {g === 'all' ? 'All' : g}
            </button>
          ))}
        </div>

        <div className="nb-premade-grid">
          {filtered.map((lesson) => (
            <PremadeCard
              key={lesson.id}
              lesson={lesson}
              onOpen={onOpenFolder}
              mastered={isFolderMastered(folderMeta[lesson.folderName])}
            />
          ))}
        </div>
      </section>
    </div>
  );
};

export default PremadeLessonsPanel;
