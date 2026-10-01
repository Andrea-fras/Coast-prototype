import TestOutModal from './TestOutModal';
import { lessonChatKey } from '../../utils/studentCache';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft, Loader, Upload, Clock, Sparkles, Play, CheckCircle, RotateCcw, Trash2, FastForward, Hammer,
} from 'lucide-react';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { logContentSource } from '../../utils/logContentRetrieval';
import ArchipelagoRoadmap from './ArchipelagoRoadmap';
import MapCover from '../MapCover/MapCover';
import { BANNER_BY_ID, COVER_BY_ID } from './premadeCovers';
import LessonPrepareProgress from './LessonPrepareProgress';
import AskSources from './AskSources';
import { uploads } from '../../utils/uploads';
import { prepareLesson, fetchOmaIngestProgress, isPrepareMarkedActive, isPrepareInFlight, isOmaIndexing, shouldResumePrepare } from '../../utils/lessonPrepare';
import './FolderView.css';

const FolderView = ({
  folderName,
  isCurated,
  curatedMeta,
  mapData = null,
  tiles = null,
  place = null,
  onClose,
  onSourcesChanged,
  onLessonChanged,
  onStartLesson,
  onOpenDocument,
  isWorkshopFolder = false,
}) => {
  const { token, user } = useAuth();
  const fileInputRef = useRef(null);
  const retryInputRef = useRef(null);
  const retryUploadRef = useRef(null);
  const sourcePollingRef = useRef(true);
  const sourcesRequestRef = useRef(0);
  const lessonRequestRef = useRef(0);
  const viewEpoch = useRef(0);

  const [sources, setSources] = useState([]);
  const [workspaceTab, setWorkspaceTab] = useState('lesson');
  const [askVisited, setAskVisited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lessonState, setLessonState] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [genProgress, setGenProgress] = useState(null);
  const [uploadItems, setUploadItems] = useState([]);
  const [uploadsChecked, setUploadsChecked] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [testOutIndex, setTestOutIndex] = useState(null);
  const [omaSnapshot, setOmaSnapshot] = useState(null);
  const prepareStartedRef = useRef(false);
  const resumeAttemptedRef = useRef(false);
  const prepareAbortRef = useRef(null);

  useEffect(() => {
    const epoch = ++viewEpoch.current;
    return () => { viewEpoch.current = epoch + 1; };
  }, [folderName, token]);

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token]);

  const fetchSources = useCallback(async ({ silent = false } = {}) => {
    const epoch = viewEpoch.current;
    const requestId = ++sourcesRequestRef.current;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        if (viewEpoch.current !== epoch || sourcesRequestRef.current !== requestId) return;
        setSources(data.sources || []);
        sourcePollingRef.current = (data.sources || []).some(s => s.type === 'document'
          && !['COMPLETE', 'READY_FOR_ROADMAP', 'FAILED'].includes(s.oma_ingest_status));
      }
    } catch { /* ignore */ }
    if (viewEpoch.current === epoch && sourcesRequestRef.current === requestId) setLoading(false);
  }, [folderName, headers]);

  useEffect(() => {
    if (isCurated || !token || !user?.id) return undefined;
    let cancelled = false;
    let completed = uploads.get(user.id, folderName).filter(i => i.status === 'complete').map(i => i.source_id).sort().join(',');
    setUploadsChecked(false);
    const unsubscribe = uploads.subscribe(user.id, folderName, items => {
      if (cancelled) return;
      setUploadItems(items);
      const next = items.filter(i => i.status === 'complete').map(i => i.source_id).sort().join(',');
      if (next !== completed) {
        completed = next;
        fetchSources({ silent: true });
      }
    });
    // Poll every few seconds while something is uploading or processing, rarely
    // when the folder is idle, and not at all while the tab is hidden.
    let timer = 0;
    let dueAt = Infinity;
    let failed = false;
    const busy = () => failed || sourcePollingRef.current
      || uploads.get(user.id, folderName).some(i => !['complete', 'cancelled', 'failed'].includes(i.status));
    const schedule = () => {
      window.clearTimeout(timer);
      dueAt = Infinity;
      if (cancelled || document.hidden) return;
      const delay = busy() ? 3000 : 30000;
      dueAt = Date.now() + delay;
      timer = window.setTimeout(refresh, delay);
    };
    const refresh = async () => {
      try {
        await uploads.sync(user.id, folderName, token);
        failed = false;
        if (!cancelled) {
          setUploadsChecked(true); setUploadError(null);
          if (sourcePollingRef.current) fetchSources({ silent: true });
        }
      } catch {
        failed = true;
        if (!cancelled) { setUploadsChecked(false); setUploadError('Could not check upload status. Reconnecting…'); }
      }
      schedule();
    };
    const onVisible = () => { if (!document.hidden) refresh(); };
    // A new upload starts fast polling straight away.
    const unsubscribeBusy = uploads.subscribe(user.id, folderName, () => {
      if (dueAt - Date.now() > 3000 && busy()) schedule();
    });
    refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true; unsubscribe(); unsubscribeBusy(); window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id, folderName, token, isCurated, fetchSources]);

  const fetchLessonState = useCallback(async () => {
    const epoch = viewEpoch.current;
    const requestId = ++lessonRequestRef.current;
    setLessonLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        if (viewEpoch.current === epoch && lessonRequestRef.current === requestId) setLessonState(data);
      }
    } catch { /* ignore */ }
    if (viewEpoch.current === epoch && lessonRequestRef.current === requestId) setLessonLoading(false);
  }, [folderName, headers]);

  useEffect(() => {
    if (!isCurated) fetchSources();
    fetchLessonState();
  }, [isCurated, fetchSources, fetchLessonState]);

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
        setGenerateError(data.error || data.detail || 'Could not open this guided experience.');
        return;
      }
      await fetchLessonState();
    } catch {
      prepareStartedRef.current = false;
      setGenerateError('Could not open this guided experience.');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateOutline = useCallback(async ({ skipEmbed = false } = {}) => {
    if (uploads.hasUnfinished(user?.id, folderName)) {
      setGenerateError('Finish or remove the pending uploads first.');
      return;
    }

    const epoch = viewEpoch.current;
    if (!isPrepareInFlight(folderName)) prepareAbortRef.current?.abort();
    const controller = new AbortController();
    prepareAbortRef.current = controller;

    setGenerating(true);
    setGenerateError(null);
    setGenProgress({
      indeterminate: true,
      stage: 'sources',
      statusLine: skipEmbed ? 'Resuming preparation…' : 'Getting started…',
      tip: '',
      done: false,
    });

    const timeoutId = setTimeout(() => controller.abort(), 12 * 60 * 1000);
    try {
      const { outlineData } = await prepareLesson(folderName, token, {
        signal: controller.signal,
        fetchWithRetry,
        skipEmbed,
        onTick: progress => { if (viewEpoch.current === epoch) setGenProgress(progress); },
      });

      await new Promise((r) => setTimeout(r, 600));

      const src = outlineData.outline_source?.startsWith('oma') ? 'OMA' : outlineData.outline_source === 'rag' ? 'RAG' : 'raw text';
      logContentSource(src === 'raw text' ? 'RAG' : src, {
        outline: true,
        outline_source: outlineData.outline_source,
        ...outlineData,
      });
      if (viewEpoch.current === epoch) await fetchLessonState();
    } catch (err) {
      if (viewEpoch.current !== epoch) return;
      if (err?.name === 'AbortError') {
        setGenerateError('Timed out generating the lesson plan. Try again.');
      } else if (err?.message) {
        setGenerateError(err.message);
      } else {
        setGenerateError('Failed to generate lesson plan.');
      }
    } finally {
      clearTimeout(timeoutId);
      if (prepareAbortRef.current === controller) {
        prepareAbortRef.current = null;
      }
      if (viewEpoch.current === epoch) { setGenerating(false); setGenProgress(null); }
    }
  }, [folderName, token, user?.id, fetchLessonState]);

  const handleResetLesson = async () => {
    if (!window.confirm('Reset this course to section 1? Your mastery trophy and notes are kept.')) {
      return;
    }
    try {
      sessionStorage.removeItem(lessonChatKey(user?.id, folderName));
      await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson/reset`, {
        method: 'POST',
        headers: headers(),
      });
      await fetchLessonState();
      onLessonChanged?.();
    } catch { /* ignore */ }
  };

  const handleUploadToFolder = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !token || isPrepareInFlight(folderName)) return;
    uploads.enqueue(user.id, folderName, token, files);
  };

  const handleRetryUpload = async (item, file) => {
    if (!item.hasFile && !file) {
      retryUploadRef.current = item;
      retryInputRef.current?.click();
      return;
    }
    try { await uploads.retry(user.id, folderName, token, item.upload_id, file); }
    catch (error) { setUploadError(error.message); }
  };

  const handleRemoveUpload = async item => {
    try {
      await uploads.remove(user.id, folderName, token, item.upload_id);
      await fetchSources({ silent: true });
    } catch (error) { setUploadError(error.message); }
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
  const isWorkshop = isWorkshopFolder || curatedMeta?.format === 'workshop' || lessonState?.format === 'workshop';
  const sections = lessonState?.sections || [];
  const sectionProgress = lessonState?.section_progress || [];
  const hasStarted = Boolean(lessonState?.section_started) || !!sessionStorage.getItem(lessonChatKey(user?.id, folderName));
  const isInProgress = hasOutline && !isComplete && (currentSection > 0 || hasStarted);
  const prepareMarked = isPrepareMarkedActive(folderName);
  const omaIndexing = isOmaIndexing(omaSnapshot);
  const showPrepareUi = generating || prepareMarked;
  const pendingUploads = uploadItems.filter(i => i.status !== 'complete' && i.status !== 'cancelled');
  const uploading = pendingUploads.length > 0;
  const generateBlocked = generating || prepareMarked || omaIndexing || uploading || !uploadsChecked;

  const courseTitle = isCurated && curatedMeta?.title ? curatedMeta.title : folderName;
  const curatedCover = isCurated ? (BANNER_BY_ID[curatedMeta?.id] || COVER_BY_ID[curatedMeta?.id]) : null;
  const masteredCount = sections.filter((_, i) => (sectionProgress[i]?.mastery_pct ?? 0) >= 100 || (!everMastered && i < currentSection)).length;
  const coursePct = !hasOutline || !sections.length ? 0
    : isComplete || everMastered ? 100
      : Math.round(sections.reduce((sum, _, i) => sum + (sectionProgress[i]?.mastery_pct ?? (i < currentSection ? 100 : 0)), 0) / sections.length);
  const unit = isWorkshop ? 'milestone' : 'section';
  const bannerMeta = [
    hasOutline && sections.length ? `${sections.length} ${unit}${sections.length === 1 ? '' : 's'}` : null,
    !isCurated ? `${docSources.length} source${docSources.length === 1 ? '' : 's'}` : null,
    hasOutline ? (everMastered ? 'Mastered' : `${masteredCount} mastered`) : null,
    lessonState?.estimated_minutes ? `~${lessonState.estimated_minutes} min in total` : null,
  ].filter(Boolean).join(' · ');
  const DONE_STAGES = ['READY_FOR_ROADMAP', 'COMPLETE'];
  // A file still being read or waiting its turn; one that failed is not "preparing", it needs a retry.
  const isReading = (s) => s.oma_ingest_status && ![...DONE_STAGES, 'CONTENT_INDEXED', 'FAILED'].includes(s.oma_ingest_status);
  const readingCount = docSources.filter(isReading).length;
  const sourcesFailed = docSources.some((s) => s.oma_ingest_status === 'FAILED');
  const sourcesIndexing = docSources.some((s) => s.oma_ingest_status && ![...DONE_STAGES, 'FAILED'].includes(s.oma_ingest_status));
  // Concept linking starts once every file of the course is read, so a finished file says what it waits for.
  const sourceStage = (s) => {
    if (s.oma_ingest_status === 'INGESTING') return 'Reading slides…';
    if (s.oma_ingest_status === 'CONTENT_INDEXED') {
      return readingCount > 0 ? `Waiting for ${readingCount} other file${readingCount === 1 ? '' : 's'}…` : 'Linking concepts…';
    }
    if (s.oma_ingest_status === 'FAILED') return 'Couldn\'t be prepared';
    return 'Waiting to start…';
  };
  const [retryingSources, setRetryingSources] = useState(false);
  const handleRetrySources = async (e) => {
    e?.stopPropagation();
    setRetryingSources(true);
    try {
      await fetch(`${API_URL}/api/oma/folder/${encodeURIComponent(folderName)}/ingest-all`, { method: 'POST', headers: headers() });
      await fetchSources({ silent: true });
    } catch { /* the row keeps its retry button */ }
    setRetryingSources(false);
  };

  const handleIslandClick = (index, state) => {
    const prog = sectionProgress[index] || {};
    const needsReview = prog.mastery_pct != null && prog.mastery_pct < 100;

    if (state === 'locked') {
      if (!isWorkshop) setTestOutIndex(index);  // workshops are built in order: no skipping
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
    try {
      sessionStorage.removeItem(lessonChatKey(user?.id, folderName));
    } catch { /* ignore */ }
    await fetchLessonState();
    onLessonChanged?.();
  }, [folderName, token, onLessonChanged]);

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

  useEffect(() => {
    if (!hasOutline || contentReady) return undefined;
    const poll = window.setInterval(() => fetchLessonState(), 3000);
    return () => window.clearInterval(poll);
  }, [hasOutline, contentReady, folderName, token]);

  // Poll OMA while no outline — disable duplicate Generate + show passive indexing hint.
  useEffect(() => {
    if (isCurated || lessonLoading || hasOutline || !token) return undefined;

    let cancelled = false;
    const poll = async () => {
      const data = await fetchOmaIngestProgress(folderName, token);
      if (!cancelled && data) setOmaSnapshot(data);
    };
    poll();
    const id = window.setInterval(poll, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [isCurated, lessonLoading, hasOutline, folderName, token]);

  useEffect(() => {
    resumeAttemptedRef.current = false;
  }, [folderName]);

  // Resume prepare if user navigated away mid-generation.
  useEffect(() => {
    if (isCurated || lessonLoading || !token || resumeAttemptedRef.current
      || (hasOutline && !isPrepareMarkedActive(folderName))) {
      return undefined;
    }
    if (docSources.length === 0 && !isPrepareMarkedActive(folderName)) {
      return undefined;
    }

    resumeAttemptedRef.current = true;

    let cancelled = false;
    (async () => {
      const marked = isPrepareMarkedActive(folderName);
      const oma = await fetchOmaIngestProgress(folderName, token);
      if (cancelled) return;
      if (oma) setOmaSnapshot(oma);

      if (!marked) return;
      if (!hasOutline && !isPrepareInFlight(folderName) && !shouldResumePrepare(oma, { hasOutline: false })) return;

      await handleGenerateOutline({ skipEmbed: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isCurated,
    lessonLoading,
    hasOutline,
    folderName,
    token,
    docSources.length,
    handleGenerateOutline,
  ]);

  return (
    <div className={`fv-container fv-container--v2 ${workspaceTab === 'sources' ? 'fv-asking-sources' : ''}`}>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".pdf,.pptx"
        multiple
        onChange={handleUploadToFolder}
      />
      <input type="file" ref={retryInputRef} style={{ display: 'none' }} accept=".pdf,.pptx"
        onChange={e => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (file && retryUploadRef.current) handleRetryUpload(retryUploadRef.current, file);
        }} />

      <div className="fv-page">
      <button type="button" className="fv-v2-back" onClick={onClose}>
        <ArrowLeft size={16} className="fv-v2-back-arrow" />
        <span>{isWorkshop ? 'All workshops' : 'All lessons'}</span>
      </button>

      {workspaceTab !== 'sources' && (
        <section className={`fv-banner${everMastered ? ' fv-banner--gold' : ''}`}>
          <div className="fv-banner__art" aria-hidden="true">
            {curatedCover
              ? <img src={curatedCover} alt="" />
              : <MapCover mapData={mapData} tiles={tiles?.all || null} seed={folderName} maxTile={24} />}
          </div>
          <div className="fv-banner__in">
            <div className="fv-banner__text">
              <p className="fv-banner__kicker">{place || curatedMeta?.course || (isWorkshop ? 'Workshop' : 'Still in the fog')}</p>
              <h1>{courseTitle}</h1>
              {bannerMeta && <p className="fv-banner__meta">{bannerMeta}</p>}
            </div>
            {hasOutline && sections.length > 0 && (
              <div className="fv-banner__ring" role="img" aria-label={`${coursePct}% complete`}>
                <svg viewBox="0 0 64 64" aria-hidden="true">
                  <defs>
                    <linearGradient id="fv-ring-amber" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#ffb503" />
                      <stop offset="1" stopColor="#ff7b02" />
                    </linearGradient>
                  </defs>
                  <circle className="fv-banner__ring-track" cx="32" cy="32" r="27" pathLength="100" />
                  <circle className="fv-banner__ring-fill" cx="32" cy="32" r="27" pathLength="100" style={{ strokeDashoffset: 100 - coursePct }} />
                </svg>
                <b>{coursePct}%</b>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="fv-v2-body">
        {isCurated && curatedMeta ? (
          <section className="fv-v2-panel fv-v2-about">
            <h2 className="fv-v2-heading">What you’ll be able to do</h2>
            <div className="fv-v2-about-card">
              <p className="fv-v2-about-tag">{curatedMeta.course}</p>
              {curatedMeta.outcome && <h3 className="fv-workshop-outcome">{curatedMeta.outcome}</h3>}
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
            <div className="fv-v2-panel-head">
              <h2 className="fv-v2-heading">Sources</h2>
              {docSources.length > 0 && (
                <span className={`fv-chip ${sourcesIndexing || uploading || sourcesFailed ? 'fv-chip--amber' : 'fv-chip--mint'}`}>
                  {uploading ? 'Uploading' : sourcesIndexing ? 'Preparing' : sourcesFailed ? 'Needs a retry' : 'All ready'}
                </span>
              )}
            </div>
            <div className="fv-v2-sources-list">
              {loading ? (
                <div className="fv-v2-loading"><Loader size={18} className="spinning" /> Loading…</div>
              ) : docSources.length === 0 && !uploading ? (
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
                    <div className={`fv-v2-source-icon fv-v2-source-icon--${src.source_type === 'pptx' ? 'pptx' : 'pdf'}`}>
                      {src.source_type === 'pptx' ? 'PPTX' : 'PDF'}
                    </div>
                    <div className="fv-v2-source-info">
                      <span className="fv-v2-source-title">{src.title}</span>
                      <span className="fv-v2-source-meta">
                        <i className={`fv-v2-source-dot${src.oma_ingest_status && !['READY_FOR_ROADMAP', 'COMPLETE'].includes(src.oma_ingest_status) ? ' is-busy' : ''}`} aria-hidden="true" />
                        {src.page_count} page{src.page_count === 1 ? '' : 's'}
                        {src.oma_ingest_status && !DONE_STAGES.includes(src.oma_ingest_status) && <> · {sourceStage(src)}</>}
                        {src.oma_ingest_status === 'FAILED' && (
                          <button type="button" className="fv-v2-source-retry" onClick={handleRetrySources} disabled={retryingSources}>
                            {retryingSources ? 'Retrying…' : 'Retry'}
                          </button>
                        )}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="fv-v2-source-delete"
                      disabled={showPrepareUi}
                      onClick={(e) => handleDeleteSource(src, e)}
                      title="Remove"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
              {pendingUploads.map(item => (
                <div key={item.upload_id} className="fv-v2-source-slot fv-v2-upload-pending">
                  <div className="fv-v2-source-icon"><Upload size={16} /></div>
                  <div className="fv-v2-source-info">
                    <span className="fv-v2-source-title">{item.filename}</span>
                    <span className="fv-v2-source-meta" role="status">
                      {item.status === 'registering' ? 'Adding to upload queue…'
                        : item.status === 'sending' ? `Uploading${item.percent != null ? ` · ${item.percent}%` : '…'}`
                          : item.status === 'processing' ? 'File received · Reading slides and diagrams…'
                            : item.status === 'failed' ? (item.error || 'Upload failed. Retry or remove this file.')
                              : 'Waiting to upload…'}
                    </span>
                    {item.status === 'sending' && <progress max="100" value={item.percent || 0} aria-label={`Uploading ${item.filename}`} />}
                    <div className="fv-v2-upload-actions">
                      {item.canRetry && <button type="button" onClick={() => handleRetryUpload(item)}>
                        {item.hasFile ? 'Retry' : 'Select file to retry'}
                      </button>}
                      <button type="button" onClick={() => handleRemoveUpload(item)}>Remove</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {uploading && <p className="fv-v2-hint" role="status">{pendingUploads.length} file{pendingUploads.length === 1 ? '' : 's'} still pending. You can leave this page; uploads continue while this tab stays open.</p>}
            {uploadError && <p className="fv-v2-error" role="alert">{uploadError}</p>}
            <button
              type="button"
              className="fv-v2-upload-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={showPrepareUi}
            >
              {uploading ? <Loader size={16} className="spinning" /> : <Upload size={16} />}
              <span>{uploading ? 'Add more sources' : 'Upload sources'}</span>
            </button>
          </section>
        )}

        {/* RoadMap */}
        <section className="fv-v2-panel fv-v2-roadmap">
          {isCurated ? <h2 className="fv-v2-heading">{isWorkshop ? 'Your milestones' : 'Your learning path'}</h2> : <div className="fv-workspace-tabs" aria-label="Learning mode">
            <button type="button" aria-pressed={workspaceTab === 'lesson'} onClick={() => setWorkspaceTab('lesson')}>{isWorkshop ? 'Guided workshop' : 'Guided lesson'}</button>
            <button type="button" aria-pressed={workspaceTab === 'sources'} onClick={() => { setAskVisited(true); setWorkspaceTab('sources'); }}>Ask sources</button>
          </div>}
          {!isCurated && askVisited && <div className="fv-source-workspace" style={{ display: workspaceTab === 'sources' ? 'flex' : 'none' }}>
            <AskSources folderName={folderName} sourceIds={docSources.map(s => s.source_id).join(',')} pendingUploads={pendingUploads.length} active={workspaceTab === 'sources'} />
          </div>}
          <div className="fv-v2-roadmap-card" style={workspaceTab === 'sources' ? { display: 'none' } : undefined}>

            {lessonLoading ? (
              <div className="fv-v2-loading"><Loader size={20} className="spinning" /> Loading roadmap…</div>
            ) : isCurated && !sharedReady ? (
              <div className="fv-v2-roadmap-empty">
                <Loader size={32} className="spinning" />
                <p>Course material is being prepared on the server. This only happens once. Checking again…</p>
              </div>
            ) : isCurated && !hasOutline ? (
              <div className="fv-v2-loading"><Loader size={20} className="spinning" /> Setting up your roadmap…</div>
            ) : !hasOutline ? (
              <div className="fv-v2-roadmap-empty">
                {showPrepareUi && (genProgress || prepareMarked) ? (
                  <>
                    <LessonPrepareProgress
                      {...genProgress}
                      error={generateError}
                    />
                  </>
                ) : (
                  <>
                    {isWorkshop ? <Hammer size={32} /> : <Sparkles size={32} />}
                    <p>
                      {isWorkshop
                        ? 'Pedro will turn your sources into a hands-on project you build milestone by milestone.'
                        : 'Pedro will build a section-by-section roadmap from your sources.'}
                    </p>
                    <button
                      type="button"
                      className="fv-v2-generate-btn"
                      onClick={() => handleGenerateOutline()}
                      disabled={generateBlocked || sources.length === 0}
                    >
                      <Sparkles size={16} />
                      {isWorkshop ? 'Generate workshop' : 'Generate roadmap'}
                    </button>
                    {uploading && <p className="fv-v2-hint">Waiting for all selected files to finish uploading.</p>}
                    {omaIndexing && !prepareMarked && (
                      <p className="fv-v2-indexing-hint">
                        <Loader size={14} className="spinning" />
                        Preparing your files. You can generate the roadmap once they're ready.
                      </p>
                    )}
                    {generateError && <p className="fv-v2-error">{generateError}</p>}
                    {sources.length === 0 && (
                      <p className="fv-v2-hint">Upload at least one source first.</p>
                    )}
                  </>
                )}
              </div>
            ) : (
              <>
                {generating && genProgress && (
                  <div className="fv-v2-gen-overlay">
                    <LessonPrepareProgress
                      {...genProgress}
                      error={generateError}
                    />
                  </div>
                )}
                <ArchipelagoRoadmap
                  mapData={mapData}
                  sectionTiles={tiles?.sections || null}
                  courseTiles={tiles?.all || null}
                  sections={sections}
                  currentSection={currentSection}
                  isComplete={isComplete}
                  everMastered={everMastered}
                  sectionProgress={sectionProgress}
                  onIslandClick={handleIslandClick}
                  allowTestOut={!isWorkshop}
                />

                <div className="fv-v2-roadmap-actions">
                  {!isComplete && sections[currentSection] && (
                    <div className="fv-v2-next-up">
                      <span className="fv-v2-next-up__kicker">
                        {isInProgress ? 'Up next' : 'Start with'} · {isWorkshop ? 'Milestone' : 'Section'} {currentSection + 1} of {sections.length}
                      </span>
                      <strong className="fv-v2-next-up__title">{sections[currentSection].title}</strong>
                      <span className="fv-v2-next-up__meta">
                        <Clock size={13} aria-hidden /> ~{sections[currentSection].estimated_minutes || 20} min · Stop anytime, Pedro saves your place
                      </span>
                    </div>
                  )}
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
                          : isWorkshop ? 'Start workshop' : 'Start lesson'}
                    </button>
                  )}
                  {hasOutline && !contentReady && (
                    <p className="fv-v2-hint" role="status">
                      {lessonState?.section_preparation?.error
                        || (lessonState?.section_preparation?.total_pages
                          ? `Getting this section ready: ${lessonState.section_preparation.ready_pages} of ${lessonState.section_preparation.total_pages} slides prepared…`
                          : 'Getting this section ready…')}
                    </p>
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
                    {!isWorkshop && !isComplete && contentReady && currentSection < sections.length && (
                      <button
                        type="button"
                        className="fv-v2-link-btn"
                        onClick={() => setTestOutIndex(sections.length)}
                        title="Pedro checks what you already know, one section at a time"
                      >
                        <FastForward size={13} /> Skip what I know
                      </button>
                    )}
                    {!isCurated && (
                      <>
                        <button type="button" className="fv-v2-link-btn" onClick={() => handleGenerateOutline()} disabled={generateBlocked}>
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
      </div>

      {testOutIndex != null && (sections[testOutIndex] || testOutIndex === sections.length) && (
        <TestOutModal
          folderName={folderName}
          targetIndex={testOutIndex}
          targetSection={sections[testOutIndex] || null}
          wholeCourse={testOutIndex === sections.length}
          startIndex={currentSection}
          skippedSections={sections.slice(currentSection, testOutIndex)}
          onClose={() => setTestOutIndex(null)}
          onPassed={handleTestOutPassed}
        />
      )}
    </div>
  );
};

export default FolderView;
