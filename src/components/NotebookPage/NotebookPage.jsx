import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Loader, Plus } from 'lucide-react';
import './NotebookPage.css';
import './NotebookPage.v2.css';
import curatedLessons from '../../data/curatedLessons.json';
import trophyIcon from '../../assets/lesson-icons/trophy.svg';
import { useAuth } from '../../context/AuthContext';
import FolderView from './FolderView';
import LessonView from './LessonView';
import DocumentViewer from './DocumentViewer';
import CupBadge from './CupBadge';
import PremadeLessonsPanel from './PremadeLessonsPanel';
import { API_URL } from '../../config';
import {
  computeFolderProgress,
  isFolderMastered,
  getCardState,
  countCompletedSections,
  findContinueFolder,
} from '../../utils/lessonProgress';

const NotebookPage = ({ onClose }) => {
  const { token } = useAuth();

  const [sidebarTab, setSidebarTab] = useState('your-lessons');
  const [tabAnimKey, setTabAnimKey] = useState(0);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [activeLessonFolder, setActiveLessonFolder] = useState(null);
  const [initialViewSection, setInitialViewSection] = useState(null);
  const [initialReviewSection, setInitialReviewSection] = useState(null);
  const [folderRefreshKey, setFolderRefreshKey] = useState(0);
  const [activeDocument, setActiveDocument] = useState(null);
  const [folderLessonMeta, setFolderLessonMeta] = useState({});
  const [folderMetaLoading, setFolderMetaLoading] = useState(false);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const visibleCurated = curatedLessons;

  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/notebooks/folders`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.ok ? res.json() : [])
      .then(data => setFolders(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  const userLessonFolders = useMemo(
    () => folders.filter((f) => !visibleCurated.some((cl) => cl.folderName === f)),
    [folders, visibleCurated],
  );

  const userLessonFoldersKey = useMemo(
    () => userLessonFolders.join('\x00'),
    [userLessonFolders],
  );

  useEffect(() => {
    if (!token) return undefined;
    if (folders.length === 0) {
      setFolderLessonMeta({});
      setFolderMetaLoading(false);
      return undefined;
    }

    let cancelled = false;
    if (Object.keys(folderLessonMeta).length === 0) setFolderMetaLoading(true);

    Promise.all(
      folders.map(async (f) => {
        try {
          const res = await fetch(
            `${API_URL}/api/folders/${encodeURIComponent(f)}/lesson`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          return [f, res.ok ? await res.json() : {}];
        } catch {
          return [f, {}];
        }
      }),
    ).then((results) => {
      if (cancelled) return;
      setFolderLessonMeta(Object.fromEntries(results));
      setFolderMetaLoading(false);
    });

    return () => { cancelled = true; };
  }, [token, folders.join('\x00'), folderRefreshKey]);

  const cupCount = useMemo(
    () => folders.filter((f) => isFolderMastered(folderLessonMeta[f])).length,
    [folders, folderLessonMeta],
  );

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/notebooks/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setFolders(prev => [...prev, name]);
        setNewFolderName('');
        setShowNewFolderInput(false);
        setFolderRefreshKey(k => k + 1);
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

  const masteredFolders = useMemo(
    () => sortFoldersByProgress(userLessonFolders.filter(
      (f) => isFolderMastered(folderLessonMeta[f]),
    )),
    [userLessonFolders, folderLessonMeta, sortFoldersByProgress],
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

  const renderNewLessonCard = () => (
    <button
      type="button"
      className="nb-course-card nb-course-card--new"
      onClick={() => setShowNewFolderInput(true)}
    >
      <div className="nb-course-card-body nb-course-card-body--new">
        <Plus size={28} strokeWidth={2} />
        <span>New lesson</span>
      </div>
    </button>
  );

  const renderCourseCard = useCallback((folderName) => {
    const meta = folderLessonMeta[folderName] || {};
    const state = getCardState(meta);
    const progress = state === 'mastered' ? 100 : computeFolderProgress(meta);
    const total = meta.total_sections || 0;
    const completed = countCompletedSections(meta);

    let metaLabel = 'Not started';
    if (state === 'mastered') {
      metaLabel = `${total} section${total === 1 ? '' : 's'} mastered`;
    } else if (state === 'in-progress' && total > 0) {
      metaLabel = `${completed}/${total} sections`;
    } else if (!meta.has_outline) {
      metaLabel = 'Add sources to begin';
    }

    return (
      <button
        key={folderName}
        type="button"
        className={`nb-course-card nb-course-card--${state}`}
        onClick={() => handleOpenFolder(folderName)}
      >
        {state === 'in-progress' && (
          <>
            <div className="nb-course-card-progress-track">
              <div
                className="nb-course-card-progress-fill"
                style={{ width: `${Math.max(progress, 4)}%` }}
              />
            </div>
            <span className="nb-course-card-continue">Continue</span>
          </>
        )}
        <div className="nb-course-card-body">
          <div className="nb-course-card-text">
            <h3 className="nb-course-card-title">{folderName}</h3>
            <p className="nb-course-card-meta">{metaLabel}</p>
          </div>
          {state === 'mastered' && (
            <div className="nb-course-card-icon-wrap">
              <img src={trophyIcon} alt="" className="nb-course-card-icon nb-course-card-icon--trophy" />
            </div>
          )}
        </div>
      </button>
    );
  }, [folderLessonMeta]);

  const inLibrary = !selectedFolder && !activeLessonFolder && !activeDocument;
  const showAmbients = !activeLessonFolder && !activeDocument;

  return (
    <div className="notebook-page notebook-page--v2 dark">
      {showAmbients && (
        <>
          <div className="nb-v2-ambient-light nb-v2-ambient-light--a" aria-hidden="true" />
          <div className="nb-v2-ambient-light nb-v2-ambient-light--b" aria-hidden="true" />
        </>
      )}
      {inLibrary && (
        <>
          <button type="button" className="nb-close-btn" onClick={onClose} aria-label="Close lessons">
            <X size={28} />
          </button>
          <CupBadge count={cupCount} className="nb-v2-cups" />
        </>
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
          curatedMeta={visibleCurated.find(cl => cl.folderName === selectedFolder) || null}
          cupCount={cupCount}
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
        <div className={`nb-v2-shell${sidebarTab === 'lessons' ? ' nb-v2-shell--premade' : ''}`}>
          <header className="nb-v2-topbar">
            <nav className="nb-v2-tabs" aria-label="Lesson library">
              <button
                type="button"
                className={`nb-v2-tab${sidebarTab === 'your-lessons' ? ' active' : ''}`}
                onClick={() => switchTab('your-lessons')}
              >
                Your Lessons
              </button>
              <button
                type="button"
                className={`nb-v2-tab${sidebarTab === 'lessons' ? ' active' : ''}`}
                onClick={() => switchTab('lessons')}
              >
                Premade Lessons
              </button>
            </nav>
          </header>

          <div className="nb-v2-panel" key={`${sidebarTab}-${tabAnimKey}`}>
            {sidebarTab === 'lessons' ? (
              <PremadeLessonsPanel
                lessons={visibleCurated}
                cupCount={cupCount}
                folderMeta={folderLessonMeta}
                onOpenFolder={handleOpenFolder}
              />
            ) : (
              <>
                {showNewFolderInput && (
                  <div className="nb-new-folder-bar nb-v2-new-folder">
                    <input
                      type="text"
                      className="nb-new-folder-input"
                      placeholder="Lesson name..."
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
                )}

                {continueTarget && (
                  <section className="nb-continue-hero">
                    <div className="nb-continue-hero-main">
                      <div className="nb-continue-hero-text">
                        <span className="nb-continue-hero-label">Continue where you left off</span>
                        <h2 className="nb-continue-hero-title">{continueTarget.name}</h2>
                        {(continueTarget.meta.total_sections || 0) > 0 && (
                          <span className="nb-continue-hero-meta">
                            {countCompletedSections(continueTarget.meta)}
                            /{continueTarget.meta.total_sections} sections
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="nb-continue-hero-btn"
                        onClick={() => handleOpenFolder(continueTarget.name)}
                      >
                        Continue
                      </button>
                    </div>
                    <div className="nb-continue-hero-bar">
                      <div
                        className="nb-continue-hero-fill"
                        style={{ width: `${computeFolderProgress(continueTarget.meta)}%` }}
                      />
                    </div>
                  </section>
                )}

                {folderMetaLoading && userLessonFolders.length > 0 && (
                  <div className="nb-lessons-loading">
                    <Loader size={22} className="spinning" />
                    <span>Loading your progress…</span>
                  </div>
                )}

                {masteredFolders.length > 0 && (
                  <section className="nb-v2-section">
                    <h2 className="nb-v2-section-title">Mastered Courses</h2>
                    <div className="nb-v2-card-grid">
                      {masteredFolders.map(renderCourseCard)}
                    </div>
                  </section>
                )}

                <section className="nb-v2-section">
                  <h2 className="nb-v2-section-title">Your lessons</h2>
                  <div className="nb-v2-card-grid">
                    {renderNewLessonCard()}
                    {regularFolders.map(renderCourseCard)}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotebookPage;
