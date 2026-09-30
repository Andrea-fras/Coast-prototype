import { ArrowRight } from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { isFolderMastered } from '../../utils/lessonProgress';
import trophyIcon from '../../assets/lesson-icons/trophy.svg';
import { CatalogueCard, CourseCard, NewCard } from './LibraryCards';
import { COVER_BY_ID } from './premadeCovers';

const stagger = (i) => ({ '--i': Math.min(i, 12) });

/**
 * The workshop catalogue: workshops the student built from their own sources
 * (with the land they charted), then the ones made by Coast (with their artwork).
 */
const PremadeLessonsPanel = ({
  lessons,
  folderMeta = {},
  onOpenFolder,
  userWorkshops = [],
  cardProps,
  onCreateWorkshop,
  matches = () => true,
}) => {
  const [genre, setGenre] = useState('all');

  const genres = useMemo(
    () => ['all', ...new Set(lessons.map((l) => l.course).filter(Boolean))],
    [lessons],
  );

  const catalogue = useMemo(() => {
    const byGenre = genre === 'all'
      ? [...lessons].sort((a, b) => Number(b.format === 'workshop') - Number(a.format === 'workshop'))
      : lessons.filter((l) => l.course === genre);
    return byGenre.filter((l) => matches(l.title, l.outcomeTitle, l.course, l.outcome, l.description));
  }, [lessons, genre, matches]);

  const yours = userWorkshops.filter((f) => matches(f));

  return (
    <div className="lib-workshops">
      <div className="lib-intro">
        <p>
          Build something real with Pedro, one step at a time. You do the thinking; he helps you move forward.
        </p>
        <div className="lib-intro__steps" aria-label="How workshops work">
          <span>Choose a goal</span><ArrowRight size={14} aria-hidden="true" />
          <span>Try it with Pedro</span><ArrowRight size={14} aria-hidden="true" />
          <span>Put it to use</span>
        </div>
      </div>

      <section className="lib-section">
        <h2 className="lib-section__title">
          Your workshops
          <small>Made from your own sources</small>
        </h2>
        <div className="lib-grid">
          {yours.map((f, i) => (
            <CourseCard key={f} {...cardProps(f)} style={stagger(i)} />
          ))}
          <NewCard
            title="Create from sources"
            hint="Upload material, then build a project from it with Pedro."
            onClick={onCreateWorkshop}
            compact={yours.length > 0}
          />
        </div>
      </section>

      <section className="lib-section">
        <h2 className="lib-section__title">
          Workshops by Coast
          <small>Hand-made projects to learn by doing</small>
        </h2>
        {genres.length > 2 && (
          <div className="lib-genres" role="group" aria-label="Filter by topic">
            {genres.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={genre === g}
                className="lib-genre"
                onClick={() => setGenre(g)}
              >
                {g === 'all' ? 'All' : g}
              </button>
            ))}
          </div>
        )}
        {lessons.length === 0 ? (
          <div className="lib-empty lib-empty--box">
            <img src={trophyIcon} alt="" />
            <b>Workshops coming soon</b>
            <span>Guided experiences to help you build a skill and put it to use.</span>
          </div>
        ) : catalogue.length === 0 ? (
          <p className="lib-empty">No workshops match your search.</p>
        ) : (
          <div className="lib-grid lib-grid--catalogue">
            {catalogue.map((lesson, i) => (
              <CatalogueCard
                key={lesson.id}
                lesson={lesson}
                cover={COVER_BY_ID[lesson.id]}
                mastered={isFolderMastered(folderMeta[lesson.folderName])}
                onOpen={onOpenFolder}
                style={stagger(i + yours.length)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default PremadeLessonsPanel;
