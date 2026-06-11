import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ChevronRight, CheckCircle, Loader, Send, List, Clock,
  ArrowLeft, RefreshCw, WifiOff, StickyNote, RotateCcw,
  ChevronLeft, AlertTriangle, Lightbulb, TrendingUp,
  Calculator as CalculatorIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { logContentRetrieval } from '../../utils/logContentRetrieval';
import PedroMessage from '../PedroMessage';
import Calculator from '../Calculator/Calculator';
import mascot from '../../assets/sessioncompletebird.svg';
import './LessonView.css';
import './LessonView.fullscreen.css';

const CHAT_STORAGE_PREFIX = 'coast_lesson_chat_';

const PEDRO_UI_TAGS = ['[SECTION_COMPLETE]', '[ANSWER_WRONG]', '[ANSWER_CORRECT]'];

function stripPedroTags(text) {
  let out = text || '';
  for (const tag of PEDRO_UI_TAGS) out = out.replaceAll(tag, '');
  return out.trim();
}

const LessonView = ({ folderName, onClose, initialViewSection, initialReviewSection }) => {
  const { token } = useAuth();

  const [showCalculator, setShowCalculator] = useState(false);

  const [lessonState, setLessonState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sectionComplete, setSectionComplete] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState(false);
  const [advanceBlocked, setAdvanceBlocked] = useState('');
  const [progressReward, setProgressReward] = useState(null);

  const [retryPayload, setRetryPayload] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  const [sectionFeedback, setSectionFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const [viewingSection, setViewingSection] = useState(null);
  const [viewingChat, setViewingChat] = useState([]);
  const [viewingFeedback, setViewingFeedback] = useState(null);
  const [viewingLoading, setViewingLoading] = useState(false);

  const [notesOpen, setNotesOpen] = useState(false);
  const [notesContent, setNotesContent] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesLoaded, setNotesLoaded] = useState(false);

  const [reviewStreaming, setReviewStreaming] = useState(false);

  const [reviewSectionIdx, setReviewSectionIdx] = useState(
    initialReviewSection != null ? initialReviewSection : null,
  );
  const isReviewMode = reviewSectionIdx !== null;

  const chatAreaRef = useRef(null);
  const inputRef = useRef(null);
  const currentSectionRef = useRef(0);
  const conversationIdRef = useRef(null);
  const notesTimerRef = useRef(null);
  const notesRef = useRef(null);
  const rewardClaimedRef = useRef(null);

  const storageKey = CHAT_STORAGE_PREFIX + folderName;
  const hdrs = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  const emitMapProgress = useCallback((reward) => {
    if (!reward?.xp_gained) return;
    try {
      sessionStorage.setItem('coast_map_progress', JSON.stringify(reward));
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('coast-map-progress', { detail: reward }));
  }, []);

  const isViewingPast = viewingSection !== null;

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  useEffect(() => { fetchLessonState(); }, [folderName, token]);

  useEffect(() => {
    if (!lessonState?.has_outline || initialReviewSection != null) return;
    if (initialViewSection != null && initialViewSection < (lessonState.current_section || 0)) {
      handleViewPastSection(initialViewSection);
    }
  }, [lessonState]);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading, viewingChat]);

  // Claim section reward once the section is complete.
  useEffect(() => {
    if (!sectionComplete || isReviewMode || isViewingPast) return;
    const secIdx = currentSectionRef.current;
    const claimKey = `${folderName}:${secIdx}`;
    if (rewardClaimedRef.current === claimKey) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithRetry(
          `${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson/section-reward`,
          {
            method: 'POST',
            headers: hdrs(),
            body: JSON.stringify({ section_index: secIdx }),
          },
        );
        if (cancelled) return;
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        rewardClaimedRef.current = claimKey;
        setProgressReward(data);
        if (!data.already_claimed) emitMapProgress(data);
      } catch { /* non-blocking */ }
    })();
    return () => { cancelled = true; };
  }, [sectionComplete, folderName, isReviewMode, isViewingPast, emitMapProgress]);

  useEffect(() => {
    if (!progressReward) return undefined;
    const t = window.setTimeout(() => setProgressReward(null), 6000);
    return () => window.clearTimeout(t);
  }, [progressReward]);

  useEffect(() => {
    if (!sectionComplete || feedbackLoading || sectionFeedback) return;
    generateFeedback();
  }, [sectionComplete]);

  useEffect(() => {
    if (chatMessages.length === 0) return;
    const hasContent = chatMessages.some(m => m.content && m.content.length > 0);
    if (!hasContent) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        sectionIdx: currentSectionRef.current,
        messages: chatMessages,
        conversationId: conversationIdRef.current,
        sectionComplete,
      }));
    } catch {}
  }, [chatMessages, sectionComplete, storageKey]);

  useEffect(() => {
    if (!notesOpen) return;
    if (!notesLoaded) {
      loadNotes();
    } else if (notesRef.current && notesContent) {
      notesRef.current.innerHTML = notesContent;
    }
  }, [notesOpen]);

  const loadNotes = async () => {
    try {
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson-notes`,
        { headers: hdrs() },
      );
      if (res.ok) {
        const data = await res.json();
        setNotesContent(data.content_html || '');
        if (notesRef.current) notesRef.current.innerHTML = data.content_html || '';
      }
    } catch {}
    setNotesLoaded(true);
  };

  const saveNotes = async (html) => {
    setNotesSaving(true);
    try {
      await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson-notes`,
        {
          method: 'PUT',
          headers: hdrs(),
          body: JSON.stringify({ content_html: html }),
        },
      );
    } catch {}
    setNotesSaving(false);
  };

  const handleNotesInput = () => {
    if (!notesRef.current) return;
    const html = notesRef.current.innerHTML;
    setNotesContent(html);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => saveNotes(html), 1500);
  };

  const generateFeedback = async () => {
    setFeedbackLoading(true);
    const sections = lessonState?.sections || [];
    const section = sections[currentSectionRef.current];
    try {
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/section-feedback`,
        {
          method: 'POST',
          headers: hdrs(),
          body: JSON.stringify({
            section_index: currentSectionRef.current,
            section_title: section?.title || '',
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setSectionFeedback(data.feedback);
      }
    } catch {}
    setFeedbackLoading(false);
  };

  const fetchSectionVerified = async (sectionIdx) => {
    try {
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson`,
        { headers: hdrs() },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.current_section === sectionIdx) {
        setSectionComplete(Boolean(data.section_verified));
      }
    } catch { /* non-blocking */ }
  };

  const fetchLessonState = async () => {
    setLoading(true);
    setLoadError(false);
    let data = null;
    try {
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson`,
        { headers: hdrs() },
      );
      if (!res.ok) {
        setLoadError(true);
        setLoading(false);
        return;
      }
      data = await res.json();
      setLessonState(data);
      if (data.section_verified) setSectionComplete(true);
    } catch {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoading(false);

    if (data?.has_outline) {
      if (initialReviewSection != null) {
        startReviewSection(initialReviewSection, data.sections, data.section_progress);
      } else if (!data.is_complete) {
        startSectionChat(data.current_section, data.sections);
      }
    }
  };

  const startReviewSection = (sectionIdx, sections, sectionProgress) => {
    setSectionComplete(false);
    setSectionFeedback(null);
    setProgressReward(null);
    setConversationId(null);
    conversationIdRef.current = null;
    setRetryPayload(null);
    setViewingSection(null);
    setViewingChat([]);
    setViewingFeedback(null);
    setReviewSectionIdx(sectionIdx);
    currentSectionRef.current = sectionIdx;
    const section = sections?.[sectionIdx];
    if (!section) return;

    const prog = sectionProgress?.[sectionIdx] || {};
    const mastery = prog.mastery_pct;
    const masteryNote = mastery != null ? ` (currently ${mastery}% mastery)` : '';

    setChatMessages([]);
    setChatLoading(true);

    sendToApi(
      `I'd like to reach 100% mastery on "${section.title}"${masteryNote}. Please test me, fill gaps, and teach me until I've fully mastered this section.`,
      null,
      sectionIdx,
    );
  };

  const startSectionChat = (sectionIdx, sections) => {
    setSectionComplete(false);
    setSectionFeedback(null);
    setProgressReward(null);
    setConversationId(null);
    conversationIdRef.current = null;
    setRetryPayload(null);
    setViewingSection(null);
    setViewingChat([]);
    setViewingFeedback(null);
    currentSectionRef.current = sectionIdx;
    const section = sections?.[sectionIdx];
    if (!section) return;

    try {
      const stored = JSON.parse(sessionStorage.getItem(storageKey));
      if (stored?.sectionIdx === sectionIdx && stored.messages?.length > 0) {
        setChatMessages(stored.messages);
        if (stored.conversationId) {
          setConversationId(stored.conversationId);
          conversationIdRef.current = stored.conversationId;
        }
        if (stored.sectionComplete) setSectionComplete(true);
        fetchSectionVerified(sectionIdx);
        return;
      }
    } catch {}

    setChatMessages([]);
    setChatLoading(true);

    sendToApi(
      `I'm ready to learn about "${section.title}". Please teach me this section.`,
      null,
      sectionIdx,
    );
  };

  const sendToApi = async (message, convId, sectionIdx) => {
    const secIdx = sectionIdx !== undefined ? sectionIdx : currentSectionRef.current;
    setChatLoading(true);
    setRetryPayload(null);
    setChatMessages(prev => [...prev, { role: 'pedro', content: '' }]);

    const updateLastPedro = (content) => {
      setChatMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'pedro', content };
        return updated;
      });
    };

    let res;
    try {
      res = await fetchWithRetry(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: hdrs(),
        body: JSON.stringify({
          message,
          context_type: 'lesson',
          context_id: folderName,
          conversation_id: convId,
          section_index: secIdx,
        }),
      });
    } catch {
      updateLastPedro('');
      setRetryPayload({ message, convId });
      setChatLoading(false);
      return;
    }

    if (!res.ok) {
      updateLastPedro('Sorry, something went wrong. Try again!');
      setRetryPayload({ message, convId });
      setChatLoading(false);
      return;
    }

    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.token) {
              fullText += evt.token;
              updateLastPedro(stripPedroTags(fullText));
            }
            if (evt.done) {
              logContentRetrieval(evt);
              if (evt.conversation_id) {
                setConversationId(evt.conversation_id);
                conversationIdRef.current = evt.conversation_id;
              }
              if (typeof evt.section_verified === 'boolean') {
                setSectionComplete((prev) => evt.section_verified || prev);
              }
            }
          } catch {}
        }
      }

      if (!fullText) {
        updateLastPedro('Sorry, something went wrong. Try again!');
        setRetryPayload({ message, convId });
      } else {
        setRetryPayload(null);
      }
    } catch {
      setRetryPayload({ message, convId });
    }
    setChatLoading(false);
  };

  const handleRetry = useCallback(() => {
    if (!retryPayload) return;
    setChatMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'pedro' && !last.content) return prev.slice(0, -1);
      return prev;
    });
    const { message, convId } = retryPayload;
    sendToApi(message, convId);
  }, [retryPayload]);

  const handleSend = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setRetryPayload(null);
    setAdvanceBlocked('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    await sendToApi(msg, conversationId);
  };

  const handleAdvanceSection = async () => {
    setAdvancing(true);
    setAdvanceError(false);
    setAdvanceBlocked('');
    setSectionFeedback(null);
    try {
      sessionStorage.removeItem(storageKey);
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson/advance`,
        { method: 'POST', headers: hdrs() },
      );
      if (res.ok) {
        const data = await res.json();
        setProgressReward(null);
        rewardClaimedRef.current = null;
        const newState = {
          ...lessonState,
          current_section: data.current_section,
          is_complete: data.is_complete,
          progress_percent: Math.round((data.current_section / (lessonState?.total_sections || 1)) * 100),
        };
        setLessonState(newState);

        if (data.is_complete) {
          setChatMessages(prev => [...prev, {
            role: 'pedro',
            content: "Congratulations! You've completed the entire course! You've done an amazing job working through all the material. Take a moment to be proud of what you've accomplished."
          }]);
          setSectionComplete(false);
        } else if (data.next_section) {
          setReviewSectionIdx(null);
          startSectionChat(data.current_section, lessonState?.sections);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err.detail || err.error || '';
        if (msg.includes('verify') || msg.includes('Pedro')) {
          setAdvanceBlocked(msg);
          fetchSectionVerified(currentSectionRef.current);
        } else {
          setAdvanceError(true);
        }
      }
    } catch {
      setAdvanceError(true);
    }
    setAdvancing(false);
  };

  const handleViewPastSection = async (sectionIdx) => {
    setViewingLoading(true);
    setViewingSection(sectionIdx);
    setViewingFeedback(null);
    setViewingChat([]);
    setSidebarOpen(false);

    try {
      const [chatRes, fbRes] = await Promise.all([
        fetchWithRetry(
          `${API_URL}/api/folders/${encodeURIComponent(folderName)}/section-chat/${sectionIdx}`,
          { headers: hdrs() },
        ),
        fetchWithRetry(
          `${API_URL}/api/folders/${encodeURIComponent(folderName)}/all-feedback`,
          { headers: hdrs() },
        ),
      ]);

      if (chatRes.ok) {
        const chatData = await chatRes.json();
        setViewingChat(chatData.messages || []);
      }

      if (fbRes.ok) {
        const fbData = await fbRes.json();
        const match = fbData.sections?.find(s => s.section_index === sectionIdx);
        if (match) setViewingFeedback(match.feedback);
      }
    } catch {}
    setViewingLoading(false);
  };

  const handleBackToCurrent = () => {
    setViewingSection(null);
    setViewingChat([]);
    setViewingFeedback(null);
  };

  const handleRequestReview = async () => {
    if (reviewStreaming || chatLoading) return;
    setReviewStreaming(true);

    const reviewIdx = currentSectionRef.current;
    setChatMessages(prev => [...prev,
      { role: 'user', content: 'Can you give me a review of everything we\'ve covered so far?' },
      { role: 'pedro', content: '' },
    ]);

    try {
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/review`,
        {
          method: 'POST',
          headers: hdrs(),
          body: JSON.stringify({ up_to_section: reviewIdx }),
        },
      );

      if (res.ok) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.token) {
                fullText += evt.token;
                setChatMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1] = { role: 'pedro', content: fullText };
                  return updated;
                });
              }
            } catch {}
          }
        }
      }
    } catch {}
    setReviewStreaming(false);
  };

  if (loading) {
    return (
      <div className="lv-container lv-container--fullscreen">
        <div className="lv-loading">
          <Loader size={28} className="spinning" />
          <span>Loading lesson...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="lv-container lv-container--fullscreen">
        <div className="lv-loading">
          <WifiOff size={28} />
          <span>Couldn't load the lesson — check your connection</span>
          <button className="lv-retry-btn" onClick={fetchLessonState}>
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!lessonState?.has_outline) {
    return (
      <div className="lv-container lv-container--fullscreen">
        <div className="lv-loading">
          <span>No lesson found. Go back and generate one first.</span>
          <button className="lv-back-link" onClick={onClose}>Back to folder</button>
        </div>
      </div>
    );
  }

  const sections = lessonState.sections || [];
  const currentIdx = lessonState.current_section || 0;
  const totalSections = lessonState.total_sections || 0;
  const isComplete = lessonState.is_complete;
  const sectionProgress = lessonState.section_progress || [];
  const progressPercent = isComplete ? 100 : Math.round((currentIdx / Math.max(totalSections, 1)) * 100);

  const activeIdx = isReviewMode ? reviewSectionIdx : currentIdx;
  const displaySection = isViewingPast ? sections[viewingSection] : sections[activeIdx];
  const displayIdx = isViewingPast ? viewingSection : activeIdx;
  const displayMessages = isViewingPast ? viewingChat : chatMessages;
  const activeMastery = sectionProgress[displayIdx]?.mastery_pct;

  return (
    <div className="lv-container lv-container--fullscreen">
      {progressReward && createPortal(
        <div
          className="lv-reward-overlay"
          role="dialog"
          aria-live="polite"
          onClick={() => setProgressReward(null)}
        >
          <div className="lv-reward-card" onClick={(e) => e.stopPropagation()}>
            <div className="lv-reward-glow" aria-hidden />
            <p className="lv-reward-kicker">
              {progressReward.lesson_complete ? 'Lesson complete!' : 'Section complete!'}
            </p>
            <p className="lv-reward-xp">+{progressReward.xp_gained} XP</p>
            {progressReward.map?.explored_delta_pct > 0 && (
              <p className="lv-reward-map">
                Map uncovered +{progressReward.map.explored_delta_pct}%
              </p>
            )}
            {progressReward.map?.explored_pct > 0 && (
              <p className="lv-reward-explored">
                {progressReward.map.explored_pct}% of the world revealed
              </p>
            )}
            {progressReward.lesson_complete && (
              <p className="lv-reward-bonus">Major expansion unlocked</p>
            )}
          </div>
        </div>,
        document.body,
      )}
      {isOffline && (
        <div className="lv-offline-bar">
          <WifiOff size={14} />
          <span>You're offline — reconnect to continue</span>
        </div>
      )}

      {/* Header */}
      <div className="lv-header lv-header--fullscreen">
        <button type="button" className="lv-close-btn" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>

        <div className="lv-header-center">
          {displaySection && (
            <>
              <span className="lv-header-section-tag">
                Section {displayIdx + 1} / {totalSections}
              </span>
              <span className="lv-header-title">{displaySection.title}</span>
            </>
          )}
        </div>

        <div className="lv-header-actions">
          <button
            type="button"
            className={`lv-calc-toggle ${showCalculator ? 'active' : ''}`}
            onClick={() => setShowCalculator(v => !v)}
            title={showCalculator ? 'Hide calculator' : 'Scientific calculator'}
            aria-pressed={showCalculator}
          >
            <CalculatorIcon size={18} />
          </button>
          <button
            type="button"
            className={`lv-notes-toggle ${notesOpen ? 'active' : ''}`}
            onClick={() => setNotesOpen(prev => !prev)}
            title="My Notes"
          >
            <StickyNote size={18} />
          </button>
          <button
            type="button"
            className="lv-sidebar-toggle"
            onClick={() => setSidebarOpen(prev => !prev)}
            title="Sections"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      <div className="lv-body">
        {/* Section Sidebar */}
        <div className={`lv-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <h3 className="lv-sidebar-title">Sections</h3>
          <div className="lv-sidebar-list">
            {sections.map((sec, i) => {
              const done = i < currentIdx;
              const current = i === currentIdx && !isComplete;
              const viewing = isViewingPast && viewingSection === i;
              const reviewing = isReviewMode && reviewSectionIdx === i;
              const prog = sectionProgress[i] || {};
              const canReview = prog.mastery_pct != null && prog.mastery_pct < 100 && (done || prog.attempted);
              return (
                <button
                  key={i}
                  className={`lv-sidebar-item ${done ? 'done' : current ? 'current' : 'locked'} ${viewing ? 'viewing' : ''} ${reviewing ? 'reviewing' : ''}`}
                  disabled={!done && !current && !canReview}
                  onClick={() => {
                    if (canReview) {
                      startReviewSection(i, sections, sectionProgress);
                    } else if (done) {
                      handleViewPastSection(i);
                    } else if (current && isViewingPast) {
                      handleBackToCurrent();
                    }
                    setSidebarOpen(false);
                  }}
                >
                  <span className="lv-sidebar-item-marker">
                    {done ? <CheckCircle size={14} /> : <span>{i + 1}</span>}
                  </span>
                  <span className="lv-sidebar-item-name">{sec.title}</span>
                  <span className="lv-sidebar-item-time">
                    <Clock size={11} />
                    {sec.estimated_minutes || 20}m
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Chat */}
        <div className="lv-main">
          {/* Mastery review banner */}
          {isReviewMode && !isViewingPast && (
            <div className="lv-viewing-banner lv-review-banner">
              <button className="lv-back-current-btn" onClick={() => {
                setReviewSectionIdx(null);
                if (!isComplete) startSectionChat(currentIdx, sections);
              }}>
                <ChevronLeft size={16} />
                Back to lesson
              </button>
              <span className="lv-viewing-label">
                Mastery review — Section {displayIdx + 1}
                {activeMastery != null && ` · ${activeMastery}%`}
              </span>
            </div>
          )}

          {/* Viewing past section banner */}
          {isViewingPast && !isReviewMode && (
            <div className="lv-viewing-banner">
              <button className="lv-back-current-btn" onClick={handleBackToCurrent}>
                <ChevronLeft size={16} />
                Back to current section
              </button>
              <span className="lv-viewing-label">Reviewing Section {viewingSection + 1}</span>
            </div>
          )}

          {/* Section objectives — compact in fullscreen mode */}
          {displaySection && (!isComplete || isReviewMode) && !isViewingPast && displaySection.learning_objectives?.length > 0 && (
            <div className="lv-section-banner lv-section-banner--compact">
              <div className="lv-section-objectives">
                {displaySection.learning_objectives.map((obj, i) => (
                  <span key={i} className="lv-section-objective">{obj}</span>
                ))}
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div className="lv-chat-area" ref={chatAreaRef}>
            <div className="lv-chat-scroll-inner">
              {viewingLoading ? (
                <div className="lv-loading" style={{ padding: '2rem' }}>
                  <Loader size={22} className="spinning" />
                  <span>Loading section history...</span>
                </div>
              ) : (
                <>
                  {displayMessages.map((msg, i) => {
                    if (msg.role === 'pedro' && !msg.content?.trim()) return null;
                    return (
                    <div key={i} className={`lv-chat-msg ${msg.role}`}>
                      {msg.role === 'pedro' && (
                        <img src={mascot} alt="" className="lv-msg-avatar" />
                      )}
                      <div className="lv-msg-bubble">
                        {msg.role === 'pedro' ? (
                          <PedroMessage text={msg.content} />
                        ) : (
                          <div className="lv-msg-user-text">{msg.content}</div>
                        )}
                      </div>
                    </div>
                    );
                  })}

                  {/* Viewing past feedback */}
                  {isViewingPast && viewingFeedback && (
                    <FeedbackCard feedback={viewingFeedback} />
                  )}

                  {isViewingPast && viewingChat.length === 0 && !viewingLoading && (
                    <div className="lv-empty-history">
                      <span>No chat history saved for this section.</span>
                    </div>
                  )}
                </>
              )}

              {!isViewingPast && chatLoading && !reviewStreaming && (
                <div className="lv-chat-msg pedro">
                  <img src={mascot} alt="" className="lv-msg-avatar" />
                  <div className="lv-msg-bubble">
                    <div className="lv-typing">
                      <span></span><span></span><span></span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Retry bar */}
          {!isViewingPast && retryPayload && !chatLoading && (
            <div className="lv-retry-bar">
              <WifiOff size={14} />
              <span>Connection lost — your progress is saved</span>
              <button className="lv-retry-btn" onClick={handleRetry}>
                <RefreshCw size={14} />
                Retry
              </button>
            </div>
          )}

          {/* Section feedback card */}
          {!isViewingPast && sectionComplete && !isComplete && !isReviewMode && (
            <>
              {feedbackLoading && (
                <div className="lv-exam-loading">
                  <Loader size={18} className="spinning" />
                  <span>Analyzing your performance...</span>
                </div>
              )}
              {sectionFeedback && <FeedbackCard feedback={sectionFeedback} />}
            </>
          )}

          {/* Section Complete: Next Section */}
          {!isViewingPast && sectionComplete && !isComplete && !isReviewMode && (
            <div className="lv-next-section-bar">
              {advanceBlocked && (
                <span className="lv-advance-error">{advanceBlocked}</span>
              )}
              {advanceError && !advanceBlocked && (
                <span className="lv-advance-error">Connection error — tap to retry</span>
              )}
              <button
                className="lv-next-section-btn"
                onClick={handleAdvanceSection}
                disabled={advancing}
              >
                {advancing ? (
                  <Loader size={18} className="spinning" />
                ) : advanceError ? (
                  <RefreshCw size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
                <span>{advancing ? 'Loading next section...' : advanceError ? 'Retry' : 'Next Section'}</span>
              </button>
            </div>
          )}

          {!isViewingPast && sectionComplete && isReviewMode && (
            <div className="lv-next-section-bar">
              <button
                className="lv-next-section-btn"
                onClick={async () => {
                  setSectionComplete(false);
                  setReviewSectionIdx(null);
                  await fetchLessonState();
                  onClose();
                }}
              >
                <CheckCircle size={18} />
                <span>Back to lesson overview</span>
              </button>
            </div>
          )}

          {/* Completed state */}
          {isComplete && !isViewingPast && !isReviewMode && (
            <div className="lv-complete-bar">
              <CheckCircle size={20} />
              <span>You've completed the entire lesson! Great job.</span>
            </div>
          )}

          {/* Input */}
          {(!isComplete || isReviewMode) && !isViewingPast && (
            <div className="lv-composer">
              <div className="lv-input-shell">
                <textarea
                  ref={inputRef}
                  className="lv-input"
                  placeholder={reviewStreaming ? 'Generating review...' : 'Write a message...'}
                  value={chatInput}
                  onChange={e => {
                    setChatInput(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  disabled={chatLoading || reviewStreaming}
                  rows={1}
                />
                <div className="lv-composer-actions">
                  <button
                    type="button"
                    className="lv-send-btn"
                    onClick={handleSend}
                    disabled={chatLoading || reviewStreaming || !chatInput.trim()}
                    aria-label="Send message"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Notes Panel */}
        {notesOpen && (
          <div className="lv-notes-panel">
            <div className="lv-notes-header">
              <h3 className="lv-notes-title">My Notes</h3>
              <div className="lv-notes-header-right">
                {notesSaving && <span className="lv-notes-saving">Saving...</span>}
                <button className="lv-notes-close" onClick={() => setNotesOpen(false)}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div
              ref={notesRef}
              className="lv-notes-editor"
              contentEditable
              suppressContentEditableWarning
              onInput={handleNotesInput}
              onPaste={(e) => {
                e.preventDefault();
                const html = e.clipboardData.getData('text/html');
                const text = e.clipboardData.getData('text/plain');
                document.execCommand('insertHTML', false, html || text);
                handleNotesInput();
              }}
              data-placeholder="Start typing your notes here... You can paste text and images from the lesson."
            />
          </div>
        )}
      </div>

      {showCalculator && (
        <Calculator onClose={() => setShowCalculator(false)} />
      )}
    </div>
  );
};


const FeedbackCard = ({ feedback }) => {
  if (!feedback) return null;
  const { strengths = [], weaknesses = [], tips = [] } = feedback;
  if (!strengths.length && !weaknesses.length && !tips.length) return null;

  return (
    <div className="lv-feedback-card">
      <h4 className="lv-feedback-heading">Section Review</h4>
      {strengths.length > 0 && (
        <div className="lv-feedback-group lv-feedback-strengths">
          <div className="lv-feedback-group-header">
            <TrendingUp size={14} />
            <span>Strengths</span>
          </div>
          <ul>
            {strengths.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {weaknesses.length > 0 && (
        <div className="lv-feedback-group lv-feedback-weaknesses">
          <div className="lv-feedback-group-header">
            <AlertTriangle size={14} />
            <span>Areas to Improve</span>
          </div>
          <ul>
            {weaknesses.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {tips.length > 0 && (
        <div className="lv-feedback-group lv-feedback-tips">
          <div className="lv-feedback-group-header">
            <Lightbulb size={14} />
            <span>Tips</span>
          </div>
          <ul>
            {tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
};


export default LessonView;
