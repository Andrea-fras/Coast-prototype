import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader, Plus, Search, X } from 'lucide-react';
import './NotebookPage.css';
import './Library.css';
import curatedLessons from '../../data/curatedLessons.json';
import trophyIcon from '../../assets/lesson-icons/trophy.svg';
import { useAuth } from '../../context/authState';
import FolderView from './FolderView';
import LessonView from './LessonView';
import DocumentViewer from './DocumentViewer';
import CupBadge from './CupBadge';
import NotesWorkspace from './NotesWorkspace';
import PremadeLessonsPanel from './PremadeLessonsPanel';
import AppTopBar from '../AppNav/AppTopBar';
import { CourseCard, NewCard, ResumeCard, TrophyCard } from './LibraryCards';
import { describeTiles, tilesByFolder } from '../MapCover/mapCoverData';
import { useMapData } from '../../utils/mapData';
import { API_URL } from '../../config';
import {
  computeFolderProgress,
  isFolderMastered,
  findContinueFolder,
} from '../../utils/lessonProgress';

const TABS = [
  { id: 'your-lessons', label: 'Lessons', title: 'Your lessons', search: 'Search lessons' },
  { id: 'lessons', label: 'Workshops', title: 'Workshops', search: 'Search workshops' },
  { id: 'notes', label: 'Notes', title: 'Notes', search: 'Search notes' },
];

// Cards rise in one after another; capped so long libraries don't wait on the last card.
const stagger = (i) => ({ '--i': Math.min(i, 12) });

const NotebookPage = ({ onNavigate, initialLessonFolder = null, initialCourseFolder = null }) => {
  const { token } = useAuth();
  const mapData = useMapData(token);

  const [sidebarTab, setSidebarTab] = useState('your-lessons');
  const [tabAnimKey, setTabAnimKey] = useState(0);
  const [folders, setFolders] = useState([]);
  const [folderKinds, setFolderKinds] = useState({});
  const [selectedFolder, setSelectedFolder] = useState(initialCourseFolder);
  const [activeLessonFolder, setActiveLessonFolder] = useState(initialLessonFolder);
  const [initialViewSection, setInitialViewSection] = useState(null);
  const [initialReviewSection, setInitialReviewSection] = useState(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);
  const [activeDocument, setActiveDocument] = useState(null);
  const [folderLessonMeta, setFolderLessonMeta] = useState({});
  const [folderMetaLoading, setFolderMetaLoading] = useState(true);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderKind, setNewFolderKind] = useState('lesson');
  const [query, setQuery] = useState('');

  const visibleCurated = curatedLessons;

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/notebooks/folders?detail=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        const rows = Array.isArray(data) ? data : [];
        // Older servers return plain names; treat those as lessons.
        setFolders(rows.map(r => (typeof r === 'string' ? r : r.name)));
        setFolderKinds(Object.fromEntries(rows.map(r => (typeof r === 'string' ? [r, 'lesson'] : [r.name, r.kind]))));
      })
      .catch(() => {});
  }, [token]);

  const userLessonFolders = useMemo(
    () => folders.filter((f) => !visibleCurated.some((cl) => cl.folderName === f) && folderKinds[f] !== 'workshop'),
    [folders, folderKinds, visibleCurated],
  );
  const userWorkshopFolders = useMemo(
    () => folders.filter((f) => !visibleCurated.some((cl) => cl.folderName === f) && folderKinds[f] === 'workshop'),
    [folders, folderKinds, visibleCurated],
  );

  useEffect(() => {
    if (!token) return undefined;
    if (folders.length === 0) {
      return undefined;
    }

    let cancelled = false;

    fetch(`${API_URL}/api/lessons/summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => { if (!res.ok) throw new Error('Could not load lesson summaries'); return res.json(); })
      .then((results) => { if (!cancelled) setFolderLessonMeta(results); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFolderMetaLoading(false); });

    return () => { cancelled = true; };
  }, [token, folders.join('\x00'), folderRefreshKey]);

  const cupCount = useMemo(
    () => folders.filter((f) => isFolderMastered(folderLessonMeta[f])).length,
    [folders, folderLessonMeta],
  );

  // The land each course charted, and the island it sits on ("Harbor Home · meadow island").
  const folderTiles = useMemo(() => (mapData ? tilesByFolder(mapData) : {}), [mapData]);
  const placeByFolder = useMemo(
    () => Object.fromEntries(Object.entries(folderTiles).map(([f, t]) => [f, describeTiles(t.all)])),
    [folderTiles],
  );
  const needle = query.trim().toLowerCase();
  const matches = useCallback((...fields) => !needle || fields.some((f) => f?.toLowerCase().includes(needle)), [needle]);

  const openNewFolderInput = (kind) => {
    setNewFolderKind(kind);
    setNewFolderName('');
    setShowNewFolderInput(true);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !token) return;
    const kind = newFolderKind;
    try {
      const res = await fetch(`${API_URL}/api/notebooks/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, kind }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setFolders(prev => (prev.includes(name) ? prev : [...prev, name]));
        setFolderKinds(prev => ({ ...prev, [name]: data.kind || kind }));
        setNewFolderName('');
        setShowNewFolderInput(false);
        setFolderRefreshKey(k => k + 1);
        // A new workshop opens straight away so the student can add its sources.
        if ((data.kind || kind) === 'workshop') setSelectedFolder(name);
      }
    } catch { /* ignore */ }
  };

  const handleOpenFolder = async (folderName) => {
    setSelectedFolder(folderName);
    if (token && !folders.includes(folderName)) {
      try {
        await fetch(`${API_URL}/api/notebooks/folders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ name: folderName }),
        });
        setFolders(prev => prev.includes(folderName) ? prev : [...prev, folderName]);
      } catch { /* ignore */ }
    }
  };

  const switchTab = (tab) => {
    if (tab === sidebarTab) return;
    setSidebarTab(tab);
    setTabAnimKey(k => k + 1);
    setSelectedFolder(null);
    setShowNewFolderInput(false);
    setQuery('');
  };

  const startLesson = (folderName) => {
    setInitialViewSection(null);
    setInitialReviewSection(null);
    setActiveLessonFolder(folderName);
  };

  // "Lessons" in the nav from inside a course brings you back to the library.
  const handleNavigate = (target, folder) => {
    if (target === 'lessons') {
      setSelectedFolder(null);
      setActiveDocument(null);
      setFolderRefreshKey(k => k + 1);
      return;
    }
    onNavigate?.(target, folder);
  };

  const sortFoldersByProgress = useCallback((folderList) => {
    return [...folderList].sort((a, b) => {
      const metaA = folderLessonMeta[a] || {};
      const metaB = folderLessonMeta[b] || {};
      const progA = isFolderMastered(metaA) ? 100 : computeFolderProgress(metaA);
      const progB = isFolderMastered(metaB) ? 100 : computeFolderProgress(metaB);
      if (progB !== progA) return progB - progA;
      return a.localeCompare(b);
    });
  }, [folderLessonMeta]);

  // Trophies are numbered in the order they joined the collection (oldest first), so a
  // course keeps its number as new ones are added.
  const masteredFolders = useMemo(
    () => userLessonFolders
      .filter((f) => isFolderMastered(folderLessonMeta[f]))
      .sort((a, b) => {
        const ta = Date.parse(folderLessonMeta[a]?.last_studied_at || '') || 0;
        const tb = Date.parse(folderLessonMeta[b]?.last_studied_at || '') || 0;
        return ta - tb || a.localeCompare(b);
      }),
    [userLessonFolders, folderLessonMeta],
  );

  const regularFolders = useMemo(
    () => sortFoldersByProgress(userLessonFolders.filter(
      (f) => !isFolderMastered(folderLessonMeta[f]),
    )),
    [userLessonFolders, folderLessonMeta, sortFoldersByProgress],
  );

  const continueTarget = useMemo(
    () => findContinueFolder(userLessonFolders, folderLessonMeta),
    [userLessonFolders, folderLessonMeta],
  );

  const cardProps = (folderName) => ({
    name: folderName,
    meta: folderLessonMeta[folderName] || {},
    mapData,
    tiles: folderTiles[folderName]?.all || null,
    place: placeByFolder[folderName] || null,
    onOpen: handleOpenFolder,
  });

  const shownMastered = masteredFolders.filter((f) => matches(f));
  const shownRegular = regularFolders.filter((f) => matches(f, folderLessonMeta[f]?.current_section_title));
  const masteredSections = masteredFolders.reduce(
    (sum, f) => sum + (folderLessonMeta[f]?.total_sections || folderLessonMeta[f]?.section_progress?.length || 0),
    0,
  );

  const newFolderBar = showNewFolderInput && (
    <div className="nb-new-folder-bar nb-v2-new-folder lib-newbar">
      <input
        type="text"
        className="nb-new-folder-input"
        placeholder={newFolderKind === 'workshop' ? 'What will you build? e.g. "A tiny language model"' : 'Lesson name...'}
        aria-label={newFolderKind === 'workshop' ? 'Workshop name' : 'Lesson name'}
        value={newFolderName}
        onChange={(e) => setNewFolderName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleCreateFolder();
          if (e.key === 'Escape') setShowNewFolderInput(false);
        }}
        autoFocus
      />
      <button type="button" className="nb-new-folder-create" onClick={handleCreateFolder}>
        Create
      </button>
      <button type="button" className="nb-new-folder-cancel" onClick={() => setShowNewFolderInput(false)}>
        Cancel
      </button>
    </div>
  );

  const showAmbients = !activeLessonFolder && !activeDocument;
  const tab = TABS.find((t) => t.id === sidebarTab) || TABS[0];
  const tabCounts = {
    'your-lessons': userLessonFolders.length,
    lessons: userWorkshopFolders.length + visibleCurated.length,
  };

  return (
    <div className="notebook-page notebook-page--v2">
      {showAmbients && (
        <>
          <div className="nb-v2-ambient-light nb-v2-ambient-light--a" aria-hidden="true" />
          <div className="nb-v2-ambient-light nb-v2-ambient-light--b" aria-hidden="true" />
        </>
      )}
      {showAmbients && (
        <AppTopBar
          current="lessons"
          onNavigate={handleNavigate}
          right={<CupBadge count={cupCount} className="lib-cups" />}
        />
      )}

      {activeLessonFolder ? (
        <LessonView
          folderName={activeLessonFolder}
          initialViewSection={initialViewSection}
          initialReviewSection={initialReviewSection}
          onClose={() => {
            setActiveLessonFolder(null);
            setInitialViewSection(null);
            setInitialReviewSection(null);
            setFolderRefreshKey(k => k + 1);
          }}
        />
      ) : activeDocument ? (
        <DocumentViewer
          folderName={activeDocument.folderName}
          source={activeDocument.source}
          onClose={() => setActiveDocument(null)}
        />
      ) : selectedFolder ? (
        <FolderView
          key={`${selectedFolder}-${folderRefreshKey}`}
          folderName={selectedFolder}
          isCurated={visibleCurated.some(cl => cl.folderName === selectedFolder)}
          isWorkshopFolder={folderKinds[selectedFolder] === 'workshop'}
          curatedMeta={visibleCurated.find(cl => cl.folderName === selectedFolder) || null}
          mapData={mapData}
          tiles={folderTiles[selectedFolder] || null}
          place={placeByFolder[selectedFolder] || null}
          onClose={() => {
            setSelectedFolder(null);
            setFolderRefreshKey(k => k + 1);
          }}
          onSourcesChanged={() => setFolderRefreshKey(k => k + 1)}
          onLessonChanged={() => setFolderRefreshKey(k => k + 1)}
          onStartLesson={(folder, sectionIdx, opts) => {
            if (opts?.review) {
              setInitialReviewSection(sectionIdx ?? null);
              setInitialViewSection(null);
            } else {
              setInitialViewSection(sectionIdx ?? null);
              setInitialReviewSection(null);
            }
            setActiveLessonFolder(folder);
          }}
          onOpenDocument={(src) => setActiveDocument({ folderName: selectedFolder, source: src })}
        />
      ) : (
        <div className="lib">
          <div className="lib__fade" aria-hidden="true" />
          <div className={`lib__in${sidebarTab === 'notes' ? ' lib__in--notes' : ''}`}>
            <header className="lib-head">
              <div className="lib-head__title">
                <p className="lib-kicker">Library</p>
                <h1>{tab.title}</h1>
              </div>
              <div className="lib-head__tools">
                <nav className="lib-seg" aria-label="Lesson library" data-tour="lesson-tabs">
                  {TABS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-tab={t.id}
                      aria-current={sidebarTab === t.id ? 'page' : undefined}
                      onClick={() => switchTab(t.id)}
                    >
                      {t.label}
                      {tabCounts[t.id] > 0 && <small>{tabCounts[t.id]}</small>}
                    </button>
                  ))}
                </nav>
                <label className="lib-search">
                  <Search size={16} aria-hidden="true" />
                  <span className="lib-sr">{tab.search}</span>
                  <input
                    type="search"
                    value={query}
                    placeholder="Search"
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                  />
                  {query && (
                    <button type="button" className="lib-search__clear" onClick={() => setQuery('')} aria-label="Clear search">
                      <X size={14} />
                    </button>
                  )}
                </label>
                {sidebarTab !== 'notes' && (
                  <button
                    type="button"
                    className="lib-btn lib-btn--primary"
                    onClick={() => openNewFolderInput(sidebarTab === 'lessons' ? 'workshop' : 'lesson')}
                  >
                    <Plus size={17} aria-hidden="true" />
                    {sidebarTab === 'lessons' ? 'New workshop' : 'New lesson'}
                  </button>
                )}
              </div>
            </header>

            {sidebarTab !== 'notes' && newFolderBar}

            <div className={`lib-panel${sidebarTab === 'notes' ? ' lib-panel--notes' : ''}`} key={`${sidebarTab}-${tabAnimKey}`}>
              {sidebarTab === 'notes' ? (
                <NotesWorkspace folders={folders} query={needle} />
              ) : sidebarTab === 'lessons' ? (
                <PremadeLessonsPanel
                  lessons={visibleCurated}
                  folderMeta={folderLessonMeta}
                  onOpenFolder={handleOpenFolder}
                  userWorkshops={userWorkshopFolders}
                  cardProps={cardProps}
                  onCreateWorkshop={() => openNewFolderInput('workshop')}
                  matches={matches}
                />
              ) : (
                <>
                  {!needle && continueTarget && (
                    <ResumeCard
                      {...cardProps(continueTarget.name)}
                      onContinue={() => startLesson(continueTarget.name)}
                      onRoadmap={() => handleOpenFolder(continueTarget.name)}
                    />
                  )}

                  {folderMetaLoading && userLessonFolders.length > 0 && (
                    <div className="nb-lessons-loading lib-loading">
                      <Loader size={20} className="spinning" />
                      <span>Loading your progress…</span>
                    </div>
                  )}

                  {shownMastered.length > 0 && (
                    <section className="lib-section lib-shelf">
                      <h2 className="lib-section__title">
                        <img src={trophyIcon} alt="" className="lib-shelf__icon" />
                        Trophy shelf
                        <small>
                          {masteredFolders.length} mastered · {masteredSections} section{masteredSections === 1 ? '' : 's'} charted
                        </small>
                      </h2>
                      <div className="lib-grid lib-grid--trophies">
                        {shownMastered.map((f, i) => (
                          <TrophyCard key={f} {...cardProps(f)} number={masteredFolders.indexOf(f) + 1} style={stagger(i)} />
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="lib-section">
                    <h2 className="lib-section__title">
                      {masteredFolders.length > 0 ? 'Still to master' : 'All lessons'}
                      <small>Each course charts its own part of your map</small>
                    </h2>
                    <div className="lib-grid">
                      {shownRegular.map((f, i) => (
                        <CourseCard key={f} {...cardProps(f)} style={stagger(i + shownMastered.length)} />
                      ))}
                      <NewCard
                        title="New lesson"
                        hint="Drop in lecture slides or PDFs. Pedro turns them into a guided lesson."
                        onClick={() => openNewFolderInput('lesson')}
                        tour="new-lesson"
                      />
                    </div>
                    {needle && shownRegular.length + shownMastered.length === 0 && (
                      <p className="lib-empty">No lessons match “{query.trim()}”.</p>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebookPage;
