import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Loader, FileText, Upload, Clock, Sparkles, Play,
  CheckCircle, RotateCcw, File, Trash2, Presentation,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import CupBadge from './CupBadge';
import ArchipelagoRoadmap from './ArchipelagoRoadmap';
import TestOutModal from './TestOutModal';
import './FolderView.css';
import './FolderView.v2.css';

const FolderView = ({
  folderName,
  isCurated,
  curatedMeta,
  cupCount = 0,
  onClose,
  onSourcesChanged,
  onLessonChanged,
  onStartLesson,
  onOpenDocument,
}) => {
  const { token } = useAuth();
  const fileInputRef = useRef(null);

  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lessonState, setLessonState] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingPhase, setGeneratingPhase] = useState(null);
  const [generateError, setGenerateError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [testOutIndex, setTestOutIndex] = useState(null);
  const prepareStartedRef = useRef(false);

  useEffect(() => {
    if (!isCurated) fetchSources();
    fetchLessonState();
  }, [folderName, token, isCurated]);

  // Ensure Content OMA indexes PDFs (no-op if already indexed).
  useEffect(() => {
    if (!token || !folderName) return;
    fetch(
      `${API_URL}/api/oma/folder/${encodeURIComponent(folderName)}/ingest-all`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
    ).catch(() => {});
  }, [folderName, token]);

  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  const fetchLessonState = async () => {
    setLessonLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson`, { headers: headers() });
      if (res.ok) setLessonState(await res.json());
    } catch { /* ignore */ }
    setLessonLoading(false);
  };

  const handlePrepareCurated = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/prepare-curated`,
        { method: 'POST', headers: headers() },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        prepareStartedRef.current = false;
        setGenerateError(data.error || data.detail || 'Could not enroll in premade lesson.');
        return;
      }
      await fetchLessonState();
    } catch {
      prepareStartedRef.current = false;
      setGenerateError('Could not enroll in premade lesson.');
    } finally {
      setGenerating(false);
      setGeneratingPhase(null);
    }
  };

  const handleGenerateOutline = async () => {
    setGenerating(true);
    setGenerateError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12 * 60 * 1000);
    try {
      setGeneratingPhase('embed');
      await fetchWithRetry(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/embed`, {
        method: 'POST',
        headers: headers(),
        signal: controller.signal,
      });
      setGeneratingPhase('oma');
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/outline`,
        { method: 'POST', headers: headers(), signal: controller.signal },
        { retries: 1 },
      );
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error) {
          setGenerateError(data.error);
          return;
        }
        await fetchLessonState();
      } else {
        const data = await res.json().catch(() => ({}));
        setGenerateError(data.error || 'Failed to generate lesson plan.');
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setGenerateError('Timed out waiting for Content OMA. Try again in a few minutes.');
      } else {
        setGenerateError('Failed to generate lesson plan.');
      }
    } finally {
      clearTimeout(timeoutId);
      setGenerating(false);
      setGeneratingPhase(null);
    }
  };

  const handleResetLesson = async () => {
    if (!window.confirm('Reset this course to section 1? Your mastery trophy and notes are kept.')) {
      return;
    }
    try {
      sessionStorage.removeItem(`coast_lesson_chat_${folderName}`);
      await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson/reset`, {
        method: 'POST',
        headers: headers(),
      });
      await fetchLessonState();
      onLessonChanged?.();
    } catch { /* ignore */ }
  };

  const handleUploadToFolder = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !token) return;
    setUploading(true);
    setUploadProgress(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
    let succeeded = 0;
    let failed = 0;

    await Promise.all(files.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (res.ok) succeeded++;
        else failed++;
      } catch {
        failed++;
      }
      setUploadProgress(`Uploaded ${succeeded + failed}/${files.length}...`);
    }));

    if (failed > 0) alert(`${succeeded} uploaded, ${failed} failed.`);
    await fetchSources();
    onSourcesChanged?.();
    setUploading(false);
    setUploadProgress('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteSource = async (src, e) => {
    e.stopPropagation();
    if (!confirm(`Remove "${src.title}" from this folder?`)) return;
    try {
      await fetch(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources/${encodeURIComponent(src.source_id)}`,
        { method: 'DELETE', headers: headers() },
      );
      await fetchSources();
      onSourcesChanged?.();
    } catch { /* ignore */ }
  };

  const docSources = sources.filter(s => s.type === 'document');
  const hasOutline = lessonState?.has_outline;
  const contentReady = lessonState?.content_ready !== false;
  const sharedReady = lessonState?.shared_content_ready !== false;
  const isComplete = lessonState?.is_complete;
  const everMastered = lessonState?.ever_mastered;
  const currentSection = lessonState?.current_section || 0;
  const totalSections = lessonState?.total_sections || 0;
  const sections = lessonState?.sections || [];
  const sectionProgress = lessonState?.section_progress || [];
  const hasStarted = !!sessionStorage.getItem(`coast_lesson_chat_${folderName}`);
  const isInProgress = hasOutline && !isComplete && (currentSection > 0 || hasStarted);

  const handleIslandClick = (index, state) => {
    const prog = sectionProgress[index] || {};
    const needsReview = prog.mastery_pct != null && prog.mastery_pct < 100;

    if (state === 'locked') {
      setTestOutIndex(index);
      return;
    }
    if (needsReview && (prog.attempted || state === 'complete' || state === 'current')) {
      onStartLesson?.(folderName, index, { review: true });
      return;
    }
    if (state === 'complete') {
      onStartLesson?.(folderName, index, { view: true });
      return;
    }
    if (state === 'current') {
      onStartLesson?.(folderName);
    }
  };

  const handleTestOutPassed = useCallback(async () => {
    await fetchLessonState();
  }, [folderName, token]);

  useEffect(() => {
    if (!isCurated || lessonLoading) return undefined;
    if (sharedReady && hasOutline) return undefined;

    if (sharedReady && !hasOutline && !prepareStartedRef.current) {
      prepareStartedRef.current = true;
      handlePrepareCurated();
      return undefined;
    }

    if (!sharedReady) {
      const poll = window.setInterval(() => fetchLessonState(), 4000);
      return () => window.clearInterval(poll);
    }

    return undefined;
  }, [isCurated, lessonLoading, sharedReady, hasOutline]);

  return (
    <div className="fv-container fv-container--v2">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.pptx"
        multiple
        onChange={handleUploadToFolder}
      />

      <button type="button" className="fv-v2-back" onClick={onClose}>
        <ArrowLeft size={20} className="fv-v2-back-arrow" />
        <span>Back to library</span>
      </button>

      <CupBadge count={cupCount} className="nb-v2-cups" />

      <div className="fv-v2-body">
        {isCurated && curatedMeta ? (
          <section className="fv-v2-panel fv-v2-about">
            <h2 className="fv-v2-heading">About this course</h2>
            <div className="fv-v2-about-card">
              <p className="fv-v2-about-tag">{curatedMeta.course}</p>
              <p className="fv-v2-about-desc">{curatedMeta.description}</p>
              {curatedMeta.studyNote && (
                <p className="fv-v2-about-study">{curatedMeta.studyNote}</p>
              )}
              {curatedMeta.highlights?.length > 0 && (
                <ul className="fv-v2-about-highlights">
                  {curatedMeta.highlights.map((item) => (
                    <li key={item.label}>
                      <span className="fv-v2-about-highlight-label">{item.label}</span>
                      <span className="fv-v2-about-highlight-desc">{item.desc}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ) : (
          <section className="fv-v2-panel fv-v2-sources">
            <h2 className="fv-v2-heading">Sources</h2>
            <div className="fv-v2-sources-list">
              {loading ? (
                <div className="fv-v2-loading"><Loader size={18} className="spinning" /> Loading…</div>
              ) : docSources.length === 0 ? (
                <div className="fv-v2-source-slot fv-v2-source-empty">
                  <p>No sources yet</p>
                </div>
              ) : (
                docSources.map(src => (
                  <div
                    key={src.source_id || src.notebook_id}
                    className="fv-v2-source-slot"
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenDocument?.(src)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onOpenDocument?.(src); }}
                  >
                    <div className="fv-v2-source-icon">
                      {src.source_type === 'pptx' ? <Presentation size={18} /> : <File size={18} />}
                    </div>
                    <div className="fv-v2-source-info">
                      <span className="fv-v2-source-title">{src.title}</span>
                      <span className="fv-v2-source-meta">
                        {src.source_type?.toUpperCase()} · {src.page_count} pg
                      </span>
                    </div>
                    <button
                      type="button"
                      className="fv-v2-source-delete"
                      onClick={(e) => handleDeleteSource(src, e)}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <button
              type="button"
              className="fv-v2-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? <Loader size={16} className="spinning" /> : <Upload size={16} />}
              <span>{uploading ? (uploadProgress || 'Uploading…') : 'Upload sources'}</span>
            </button>
          </section>
        )}

        {/* RoadMap */}
        <section className="fv-v2-panel fv-v2-roadmap">
          <h2 className="fv-v2-heading">RoadMap</h2>
          <div className="fv-v2-roadmap-card">
            <p className="fv-v2-roadmap-course">{isCurated && curatedMeta?.title ? curatedMeta.title : folderName}</p>

            {lessonLoading ? (
              <div className="fv-v2-loading"><Loader size={20} className="spinning" /> Loading roadmap…</div>
            ) : isCurated && !sharedReady ? (
              <div className="fv-v2-roadmap-empty">
                <Loader size={32} className="spinning" />
                <p>Course material is being prepared on the server — this only happens once. Checking again…</p>
              </div>
            ) : isCurated && !hasOutline ? (
              <div className="fv-v2-loading"><Loader size={20} className="spinning" /> Setting up your roadmap…</div>
            ) : !hasOutline ? (
              <div className="fv-v2-roadmap-empty">
                <Sparkles size={32} />
                <p>Pedro will build a section-by-section roadmap from your sources.</p>
                <button
                  type="button"
                  className="fv-v2-generate-btn"
                  onClick={handleGenerateOutline}
                  disabled={generating || sources.length === 0}
                >
                  {generating ? (
                    <>
                      <Loader size={16} className="spinning" />
                      {generatingPhase === 'oma' ? 'Building Content OMA…' : 'Preparing sources…'}
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      Generate roadmap
                    </>
                  )}
                </button>
                {generateError && <p className="fv-v2-error">{generateError}</p>}
                {sources.length === 0 && (
                  <p className="fv-v2-hint">Upload at least one source first.</p>
                )}
              </div>
            ) : (
              <>
                <ArchipelagoRoadmap
                  sections={sections}
                  currentSection={currentSection}
                  isComplete={isComplete}
                  everMastered={everMastered}
                  sectionProgress={sectionProgress}
                  onIslandClick={handleIslandClick}
                />

                <div className="fv-v2-roadmap-actions">
                  {!isComplete && (
                    <button
                      type="button"
                      className="fv-v2-start-btn"
                      onClick={() => onStartLesson?.(folderName)}
                      disabled={!contentReady}
                    >
                      <Play size={18} />
                      {everMastered
                        ? 'Replay lesson'
                        : isInProgress
                          ? 'Continue lesson'
                          : 'Start lesson'}
                    </button>
                  )}
                  {hasOutline && !contentReady && (
                    <p className="fv-v2-hint">Content OMA is still indexing — wait a moment or tap Prepare lesson again.</p>
                  )}
                  {isComplete && (
                    <div className="fv-v2-complete-msg">
                      <CheckCircle size={20} />
                      <span>Lesson complete — review sections below 100% on the map.</span>
                    </div>
                  )}
                  {everMastered && !isComplete && (
                    <div className="fv-v2-complete-msg fv-v2-complete-msg--mastered">
                      <CheckCircle size={20} />
                      <span>Course mastered — replaying from section 1. Your trophy stays.</span>
                    </div>
                  )}
                  <div className="fv-v2-roadmap-meta">
                    <span><Clock size={13} /> ~{lessonState?.estimated_minutes || 0} min</span>
                    {!isCurated && (
                      <>
                        <button type="button" className="fv-v2-link-btn" onClick={handleGenerateOutline} disabled={generating}>
                          Regenerate
                        </button>
                        {(isComplete || everMastered) && (
                          <button type="button" className="fv-v2-link-btn" onClick={handleResetLesson}>
                            <RotateCcw size={13} /> Reset
                          </button>
                        )}
                      </>
                    )}
                    {isCurated && everMastered && (
                      <button type="button" className="fv-v2-link-btn" onClick={handleResetLesson}>
                        <RotateCcw size={13} /> Reset
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      {testOutIndex != null && sections[testOutIndex] && (
        <TestOutModal
          folderName={folderName}
          targetIndex={testOutIndex}
          targetSection={sections[testOutIndex]}
          skippedSections={sections.slice(currentSection, testOutIndex)}
          onClose={() => setTestOutIndex(null)}
          onPassed={handleTestOutPassed}
        />
      )}
    </div>
  );
};

export default FolderView;
