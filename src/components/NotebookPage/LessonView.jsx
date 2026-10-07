import { useLessonNotes } from '../../utils/useLessonNotes';
import { lessonChatKey } from '../../utils/studentCache';
import React, { useState, useEffect, useRef, useCallback, useEffectEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  X, ChevronRight, CheckCircle, Loader, Send, List, Clock,
  ArrowLeft, RefreshCw, WifiOff, StickyNote,
  ChevronLeft, Lightbulb, Square, Shuffle, PenLine,
  Calculator as CalculatorIcon,
} from 'lucide-react';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { logContentRetrieval } from '../../utils/logContentRetrieval';
import { useSmartScroll } from '../../utils/useSmartScroll';
import { useStreamBuffer } from '../../utils/useStreamBuffer';
import { beginChatStream, isActiveStream, endChatStream, cancelChatStream } from '../../utils/chatStreamGuard';
import { resizeChatTextarea } from '../../utils/chatTextarea';
import { useUnsendWindow } from '../../utils/useUnsendWindow';
import { formatTilesUnlockedLine, formatTotalTilesCharted } from '../../utils/mapRewardText';
import PedroMessage from '../PedroMessage';
import Calculator from '../Calculator/Calculator';
import RichNotesEditor from './RichNotesEditor';
import SourceCitationViewer from './SourceCitationViewer';
import {
  readStoredNotesWidth,
  storeNotesWidth,
  NOTES_PANEL_MIN,
} from '../../utils/notesEditor';
import './RichNotesEditor.css';
import mascot from '../../assets/sessioncompletebird.svg';
import './LessonView.css';
import './LessonView.fullscreen.css';
import { stripPedroTags } from '../../utils/pedroTags';



const LessonView = ({ folderName, onClose, initialViewSection, initialReviewSection }) => {
  const { token, user } = useAuth();

  const [showCalculator, setShowCalculator] = useState(false);
  const [sourceCitation, setSourceCitation] = useState(null);

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


  const [viewingSection, setViewingSection] = useState(null);
  const [viewingChat, setViewingChat] = useState([]);
  const [viewingLoading, setViewingLoading] = useState(false);

  const [notesOpen, setNotesOpen] = useState(false);
  const note = useLessonNotes(user?.id, notesOpen ? folderName : null, token);
  const [notesPanelWidth, setNotesPanelWidth] = useState(readStoredNotesWidth);


  const [reviewSectionIdx, setReviewSectionIdx] = useState(
    initialReviewSection != null ? initialReviewSection : null,
  );
  const isReviewMode = reviewSectionIdx !== null;

  const { streamingText, tokenIdle, appendToken, resetStream, finalizeStream } = useStreamBuffer();
  const scrollResetKey = `${folderName}:${viewingSection ?? 'cur'}:${isReviewMode ? reviewSectionIdx : (lessonState?.current_section ?? 0)}`;
  const { scrollRef: chatAreaRef, handleScroll: onChatScroll, hasNewMessage, jumpToLatest } = useSmartScroll(
    'lesson',
    [scrollResetKey],
    streamingText.length,
  );
  const inputRef = useRef(null);
  const currentSectionRef = useRef(0);
  const conversationIdRef = useRef(null);
  const bodyRef = useRef(null);
  const notesWidthRef = useRef(notesPanelWidth);
  const rewardClaimedRef = useRef(null);
  const streamAbortRef = useRef(null);
  const streamGenerationRef = useRef(0);
  const pendingUserMessageRef = useRef(null);
  const { canUnsend, startUnsendWindow, clearUnsendWindow } = useUnsendWindow();
  const sectionStartInflightRef = useRef(null);
  const lastAutoStartRef = useRef('');
  const streamHandledRef = useRef(false);
  const retryContextRef = useRef({ message: '', convId: null });

  const storageKey = lessonChatKey(user?.id, folderName);
  const hdrs = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  const emitMapProgress = useCallback((reward) => {
    if (!reward?.xp_gained) return;
    try {
      sessionStorage.setItem('coast_map_progress', JSON.stringify(reward));
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('coast-map-progress', { detail: reward }));
  }, []);

  const isViewingPast = viewingSection !== null;

  const applyStreamMeta = useCallback((evt) => {
    if (!evt) return;
    logContentRetrieval(evt);
    if (evt.conversation_id) {
      setConversationId(evt.conversation_id);
      conversationIdRef.current = evt.conversation_id;
    }
    if (typeof evt.section_verified === 'boolean') {
      setSectionComplete((prev) => evt.section_verified || prev);
    }
  }, []);

  const completeChatStreamResponse = useCallback(({ metadataOnly = false, evt } = {}) => {
    if (metadataOnly) {
      applyStreamMeta(evt);
      return;
    }
    if (streamHandledRef.current) {
      applyStreamMeta(evt);
      return;
    }
    streamHandledRef.current = true;
    // The reply as saved: the server repairs what streamed (a question boxed, a callout quoted).
    const streamed = finalizeStream();
    const fullText = stripPedroTags(evt?.reply || streamed);
    setChatLoading(false);
    pendingUserMessageRef.current = null;
    clearUnsendWindow();
    applyStreamMeta(evt);
    const { message, convId } = retryContextRef.current;
    if (!fullText) {
      setRetryPayload({ message, convId });
    } else {
      setChatMessages(prev => [...prev, { role: 'pedro', content: fullText }]);
      setRetryPayload(null);
    }
  }, [applyStreamMeta, finalizeStream, clearUnsendWindow]);

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
    if (inputRef.current) resizeChatTextarea(inputRef.current);
  }, [loading, lessonState?.is_complete, isViewingPast, isReviewMode]);

  useEffect(() => {
    if (inputRef.current) resizeChatTextarea(inputRef.current);
  }, [chatInput]);

  useEffect(() => {
    if (!lessonState?.has_outline || initialReviewSection != null) return;
    if (initialViewSection != null && initialViewSection < (lessonState.current_section || 0)) {
      handleViewPastSection(initialViewSection);
    }
  }, [lessonState]);

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
        if (!data.already_claimed) {
          setProgressReward(data);
          emitMapProgress(data);
        }
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
    } catch { /* Server conversation remains the durable copy if cache is unavailable. */ }
  }, [chatMessages, sectionComplete, storageKey]);

  useEffect(() => {
    notesWidthRef.current = notesPanelWidth;
  }, [notesPanelWidth]);

  const getNotesMaxWidth = useCallback(() => {
    if (!bodyRef.current) return 900;
    const bodyW = bodyRef.current.getBoundingClientRect().width;
    const sidebarW = sidebarOpen ? 280 : 0;
    return Math.max(NOTES_PANEL_MIN, bodyW - sidebarW);
  }, [sidebarOpen]);

  useEffect(() => {
    if (!notesOpen) return;
    const clamp = () => {
      const maxW = getNotesMaxWidth();
      setNotesPanelWidth((w) => Math.min(w, maxW));
    };
    clamp();
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [notesOpen, sidebarOpen, getNotesMaxWidth]);

  const startNotesResize = useCallback((e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = notesWidthRef.current;

    const onMove = (ev) => {
      const maxW = getNotesMaxWidth();
      const delta = startX - ev.clientX;
      const next = Math.min(maxW, Math.max(NOTES_PANEL_MIN, startW + delta));
      setNotesPanelWidth(next);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      storeNotesWidth(notesWidthRef.current);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [getNotesMaxWidth]);

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

  const loadSectionHistory = async (sectionIdx) => {
    try {
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/section-chat/${sectionIdx}?resume=true`,
        { headers: hdrs() },
      );
      if (res.ok) {
        const chatData = await res.json();
        return { messages: chatData.messages || [], conversationId: chatData.conversation_id };
      }
    } catch { /* ignore */ }
    return null;
  };

  const fetchLessonState = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
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
    } catch {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setLoading(false);

    if (data?.has_outline) {
      if (initialReviewSection != null) {
        startReviewSection(initialReviewSection, data.sections, data.section_progress);
      } else if (!data.is_complete && data.content_ready !== false) {
        const autoKey = `${folderName}:${data.current_section}`;
        if (lastAutoStartRef.current !== autoKey) {
          lastAutoStartRef.current = autoKey;
          try {
            await startSectionChat(data.current_section, data.sections, {
              alreadyVerified: Boolean(data.section_verified),
            });
          } catch {
            setLoadError(true);
          }
        }
      }
    }
  };

  const pollPreparation = useEffectEvent(() => fetchLessonState({ quiet: true }));
  useEffect(() => {
    if (!lessonState?.has_outline || lessonState.content_ready !== false || lessonState.section_preparation?.error) return;
    const timer = setInterval(() => pollPreparation(), 2500);
    return () => clearInterval(timer);
  }, [lessonState?.has_outline, lessonState?.content_ready, lessonState?.section_preparation?.error]);

  const startReviewSection = (sectionIdx, sections, sectionProgress) => {
    setSourceCitation(null);
    setSectionComplete(false);
    setProgressReward(null);
    setConversationId(null);
    conversationIdRef.current = null;
    setRetryPayload(null);
    setViewingSection(null);
    setViewingChat([]);
    setReviewSectionIdx(sectionIdx);
    currentSectionRef.current = sectionIdx;
    const section = sections?.[sectionIdx];
    if (!section) return;

    const prog = sectionProgress?.[sectionIdx] || {};
    const mastery = prog.mastery_pct;
    const masteryNote = mastery != null ? ` (currently ${mastery}% mastery)` : '';

    setChatMessages([]);
    resetStream();
    setChatLoading(true);

    sendToApi(
      `I'd like to reach 100% mastery on "${section.title}"${masteryNote}. Please test me, fill gaps, and teach me until I've fully mastered this section.`,
      null,
      sectionIdx,
    );
  };

  const startSectionChat = async (sectionIdx, sections, { fresh = false, alreadyVerified = false, force = false } = {}) => {
    setSourceCitation(null);
    setProgressReward(null);
    setConversationId(null);
    conversationIdRef.current = null;
    setRetryPayload(null);
    setViewingSection(null);
    setViewingChat([]);
    setReviewSectionIdx(null);
    currentSectionRef.current = sectionIdx;

    const section = sections?.[sectionIdx];
    if (!section) {
      setChatLoading(false);
      throw new Error(`Section ${sectionIdx + 1} not found in lesson outline`);
    }

    if (!fresh) {
      setChatLoading(true);
      const history = await loadSectionHistory(sectionIdx);
      if (history?.messages.length) {
        resetStream();
        setChatMessages(history.messages);
        setSectionComplete(Boolean(alreadyVerified));
        setConversationId(history.conversationId);
        conversationIdRef.current = history.conversationId;
        setChatLoading(false);
        return;
      }
      if (history === null) {
        // Offline fallback is scoped to this student. Never start a replacement
        // conversation merely because the server history could not be loaded.
        try {
          const stored = JSON.parse(sessionStorage.getItem(storageKey));
          if (stored?.sectionIdx === sectionIdx && stored.messages?.length) {
            resetStream();
            setChatMessages(stored.messages);
            setSectionComplete(Boolean(stored.sectionComplete || alreadyVerified));
            setConversationId(stored.conversationId);
            conversationIdRef.current = stored.conversationId;
            setChatLoading(false);
            return;
          }
        } catch { /* No usable local fallback. */ }
        setChatLoading(false);
        throw new Error('Could not restore your saved conversation');
      }
    }
    setSectionComplete(Boolean(alreadyVerified));
    setChatMessages([]);
    resetStream();
    if (alreadyVerified) {
      setChatLoading(false);
      return;
    }

    const startKey = `section:${sectionIdx}`;
    if (!force && sectionStartInflightRef.current === startKey) return;
    if (force) sectionStartInflightRef.current = null;
    sectionStartInflightRef.current = startKey;

    setChatLoading(true);
    try {
      await sendToApi(
        `I'm ready to learn about "${section.title}". Please teach me this section.`,
        null,
        sectionIdx,
      );
    } finally {
      if (sectionStartInflightRef.current === startKey) {
        sectionStartInflightRef.current = null;
      }
    }
  };

  const sendToApi = async (message, convId, sectionIdx) => {
    const secIdx = sectionIdx !== undefined ? sectionIdx : currentSectionRef.current;
    const { controller, streamId } = beginChatStream(streamAbortRef, streamGenerationRef);

    retryContextRef.current = { message, convId };
    streamHandledRef.current = false;
    setChatLoading(true);
    setRetryPayload(null);
    resetStream();

    try {
      const res = await fetchWithRetry(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: hdrs(),
        signal: controller.signal,
        body: JSON.stringify({
          message,
          context_type: 'lesson',
          context_id: folderName,
          conversation_id: convId,
          section_index: secIdx,
        }),
      });

      if (!isActiveStream(streamGenerationRef, streamId)) return;

      if (!res.ok) {
        pendingUserMessageRef.current = null;
        clearUnsendWindow();
        setChatMessages(prev => [...prev, { role: 'pedro', content: 'Sorry, something went wrong. Try again!' }]);
        setRetryPayload({ message, convId });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (!isActiveStream(streamGenerationRef, streamId)) {
          await reader.cancel().catch(() => {});
          return;
        }
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.token && isActiveStream(streamGenerationRef, streamId)) {
              appendToken(evt.token);
            }
            if (evt.done) {
              completeChatStreamResponse({
                metadataOnly: streamHandledRef.current,
                evt,
              });
            }
          } catch { /* Skip malformed non-message SSE lines; completion/error state is handled after the stream. */ }
        }
      }

      if (!isActiveStream(streamGenerationRef, streamId)) return;

      if (!streamHandledRef.current) {
        completeChatStreamResponse();
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (!isActiveStream(streamGenerationRef, streamId)) return;
      if (!streamHandledRef.current) {
        const partial = finalizeStream();
        pendingUserMessageRef.current = null;
        clearUnsendWindow();
        // Once Pedro has started answering, the server finishes and saves the turn:
        // reload it rather than asking the same question twice.
        setRetryPayload({ ...retryContextRef.current, sectionIdx: secIdx, reload: Boolean(partial) });
      }
    } finally {
      if (endChatStream(streamAbortRef, controller, streamGenerationRef, streamId)) {
        setChatLoading(false);
      }
    }
  };

  const handleRetry = async () => {
    if (!retryPayload) return;
    const { message, convId, sectionIdx, reload } = retryPayload;
    if (!reload) {
      sendToApi(message, convId);
      return;
    }
    const history = await loadSectionHistory(sectionIdx);
    const msgs = history?.messages || [];
    const last = msgs[msgs.length - 1];
    if (last?.role === 'pedro' && msgs.length >= chatMessages.length) {
      resetStream();
      setChatMessages(msgs);
      setConversationId(history.conversationId);
      conversationIdRef.current = history.conversationId;
      setRetryPayload(null);
    } else {
      setRetryPayload({ ...retryPayload, finishing: true });
    }
  };

  const handleSend = async (suggestion) => {
    const msg = typeof suggestion === 'string' ? suggestion : chatInput.trim();
    if (!msg || chatLoading) return;
    pendingUserMessageRef.current = msg;
    if (typeof suggestion !== 'string') setChatInput('');
    if (inputRef.current) resizeChatTextarea(inputRef.current);
    setRetryPayload(null);
    setAdvanceBlocked('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    startUnsendWindow();
    await sendToApi(msg, conversationId);
  };

  // Labs in Pedro's replies send their results as the student's next message. One stable
  // function, so streaming updates don't re-render every earlier message.
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const chatLoadingRef = useRef(chatLoading);
  chatLoadingRef.current = chatLoading;
  const sendLabResult = useCallback((text) => {
    if (chatLoadingRef.current) {
      window.alert('Pedro is still replying. Send the result once he has finished.');
      return false;
    }
    handleSendRef.current(text);
    return true;
  }, []);

  const handleCancelResponse = () => {
    if (!canUnsend) return;
    const pending = pendingUserMessageRef.current;
    clearUnsendWindow();
    cancelChatStream(streamAbortRef, streamGenerationRef);
    resetStream();
    setChatLoading(false);
    if (!pending) return;
    pendingUserMessageRef.current = null;
    setChatInput(pending);
    setChatMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'user' && last.content === pending) return prev.slice(0, -1);
      return prev;
    });
    requestAnimationFrame(() => {
      if (inputRef.current) {
        resizeChatTextarea(inputRef.current);
        inputRef.current.focus();
      }
    });
  };

  const handleChatKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAdvanceSection = async () => {
    setAdvancing(true);
    setAdvanceError(false);
    setAdvanceBlocked('');
    cancelChatStream(streamAbortRef, streamGenerationRef);
    sectionStartInflightRef.current = null;
    resetStream();
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

        if (data.is_complete) {
          setLessonState(prev => ({
            ...prev,
            current_section: data.current_section,
            is_complete: true,
            progress_percent: 100,
            section_verified: false,
          }));
          setChatMessages(prev => [...prev, {
            role: 'pedro',
            content: "Congratulations! You've completed the entire course! You've done an amazing job working through all the material. Take a moment to be proud of what you've accomplished.",
          }]);
          setSectionComplete(false);
          return;
        }

        const sections = data.sections?.length ? data.sections : (lessonState?.sections || []);
        setLessonState(prev => ({
          ...prev,
          ...(data.sections?.length ? { sections: data.sections } : {}),
          current_section: data.current_section,
          is_complete: false,
          section_verified: false,
          progress_percent: Math.round((data.current_section / (prev?.total_sections || 1)) * 100),
        }));

        if (sections[data.current_section]?.preparation_version === 1) {
          lastAutoStartRef.current = null;
          await fetchLessonState({ quiet: true });
        } else {
          await startSectionChat(data.current_section, sections, { fresh: true, force: true });
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
    } finally {
      setAdvancing(false);
    }
  };

  const handleViewPastSection = async (sectionIdx) => {
    setSourceCitation(null);
    setViewingLoading(true);
    setViewingSection(sectionIdx);
    setViewingChat([]);
    setSidebarOpen(false);

    try {
      const chatRes = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/section-chat/${sectionIdx}`,
        { headers: hdrs() },
      );
      if (chatRes.ok) {
        const chatData = await chatRes.json();
        setViewingChat(chatData.messages || []);
      }
    } catch { /* the empty-history message below covers a failed load */ }
    setViewingLoading(false);
  };

  const handleBackToCurrent = () => {
    setSourceCitation(null);
    setViewingSection(null);
    setViewingChat([]);
  };

  // Leaves a mastery review for the section in progress, which resumes its own conversation.
  const returnToLesson = () => {
    setReviewSectionIdx(null);
    if (!lessonState?.is_complete) {
      startSectionChat(lessonState?.current_section || 0, lessonState?.sections).catch(() => setLoadError(true));
    }
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

  if (lessonState?.has_outline && lessonState.content_ready === false) {
    const preparation = lessonState.section_preparation;
    return <div className="lv-container lv-container--fullscreen">
      <div className="lv-loading" role="status" aria-live="polite">
        {!preparation?.error && <Loader size={28} className="spinning" />}
        <strong>{preparation?.error ? 'Preparation needs attention' : 'Your roadmap is ready'}</strong>
        <span>{preparation?.error || 'Pedro is preparing this section’s pages and diagrams. The lesson will open automatically.'}</span>
        {preparation && <span>{preparation.ready_pages} of {preparation.total_pages} assigned pages ready</span>}
        <button className="lv-back-link" onClick={onClose}>Back to roadmap</button>
      </div>
    </div>;
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

  const activeIdx = isReviewMode ? reviewSectionIdx : currentIdx;
  const displaySection = isViewingPast ? sections[viewingSection] : sections[activeIdx];
  const displayIdx = isViewingPast ? viewingSection : activeIdx;
  const displayMessages = isViewingPast ? viewingChat : chatMessages;
  const activeMastery = sectionProgress[displayIdx]?.mastery_pct;
  const isStreamActive = !isViewingPast && (chatLoading);
  const streamDisplay = isStreamActive ? stripPedroTags(streamingText) : '';
  // Pedro asks something only where it matters; otherwise the student can simply continue.
  const lastPedroText = [...displayMessages].reverse().find(m => m.role === 'pedro')?.content || '';
  const awaitingAnswer = /^\s*>\s*\[!(question|q|try|practice|your-turn)\]/im.test(lastPedroText)
    || /\?\s*$/.test(lastPedroText.trim());
  const rewardTilesLine = progressReward
    ? formatTilesUnlockedLine(progressReward.map, { verb: 'uncovered' })
    : null;
  const rewardTotalTiles = progressReward ? formatTotalTilesCharted(progressReward.map) : null;

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
            {rewardTilesLine && (
              <p className="lv-reward-map">{rewardTilesLine}</p>
            )}
            {rewardTotalTiles && (
              <p className="lv-reward-explored">{rewardTotalTiles}</p>
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
                {displaySection.workshop ? 'Milestone' : 'Section'} {displayIdx + 1} of {totalSections}
              </span>
              <span className="lv-header-title">{displaySection.workshop?.title || displaySection.title}</span>
              {sections.length > 1 && (
                <span className="lv-header-segs" aria-hidden="true">
                  {sections.map((_, i) => {
                    const done = isComplete || i < currentIdx || (sectionProgress[i]?.mastery_pct ?? 0) >= 100;
                    return <i key={i} className={`${done ? 'done' : ''}${i === displayIdx ? ' now' : ''}`.trim()} />;
                  })}
                </span>
              )}
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
            onClick={() => { setSourceCitation(null); setNotesOpen(prev => sourceCitation ? true : !prev); }}
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

      <div className="lv-body" ref={bodyRef}>
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
              // The section in progress always continues its own conversation, however high its
              // mastery: a review starts a new one, so it is only for other sections.
              const canReview = !current && prog.mastery_pct != null && prog.mastery_pct < 100 && (done || prog.attempted);
              return (
                <button
                  key={i}
                  className={`lv-sidebar-item ${done ? 'done' : current ? 'current' : 'locked'} ${viewing ? 'viewing' : ''} ${reviewing ? 'reviewing' : ''}`}
                  disabled={!done && !current && !canReview}
                  onClick={() => {
                    if (current) {
                      if (isViewingPast) handleBackToCurrent();
                      else if (isReviewMode) returnToLesson();
                    } else if (canReview) {
                      startReviewSection(i, sections, sectionProgress);
                    } else if (done) {
                      handleViewPastSection(i);
                    }
                    setSidebarOpen(false);
                  }}
                >
                  <span className="lv-sidebar-item-marker">
                    {done ? <CheckCircle size={14} /> : <span>{i + 1}</span>}
                  </span>
                  <span className="lv-sidebar-item-name">{sec.workshop?.title || sec.title}</span>
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
              <button className="lv-back-current-btn" onClick={returnToLesson}>
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
          {displaySection?.workshop && (!isComplete || isReviewMode) && !isViewingPast ? (
            <details className="lv-workshop-goal">
              <summary><span>This milestone</span>{displaySection.workshop.outcome}</summary>
              <ul>{displaySection.workshop.criteria.map(item => <li key={item}>{item}</li>)}</ul>
            </details>
          ) : displaySection && (!isComplete || isReviewMode) && !isViewingPast && displaySection.learning_objectives?.length > 0 && (
            <div className="lv-section-banner lv-section-banner--compact">
              <div className="lv-section-objectives">
                {displaySection.learning_objectives.map((obj, i) => (
                  <span key={i} className="lv-section-objective">{obj}</span>
                ))}
              </div>
            </div>
          )}

          {/* Chat Messages */}
          <div className="lv-chat-area" ref={chatAreaRef} onScroll={onChatScroll}>
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
                          <PedroMessage text={msg.content} sourceReferences={lessonState?.source_references} onCitation={setSourceCitation}
                            onWidgetResult={isViewingPast ? null : sendLabResult} />
                        ) : (
                          <div className="lv-msg-user-text">{msg.content}</div>
                        )}
                      </div>
                    </div>
                    );
                  })}

                  {isStreamActive && (
                    <div className="lv-chat-msg pedro">
                      <img src={mascot} alt="" className="lv-msg-avatar" />
                      <div className={`lv-msg-bubble${!streamDisplay ? ' lv-msg-bubble--typing' : ''}`}>
                        {streamDisplay ? (
                          <PedroMessage text={streamDisplay} isStreaming streamIdle={tokenIdle}
                            sourceReferences={lessonState?.source_references} onCitation={setSourceCitation} />
                        ) : (
                          <div className="lv-typing" aria-label="Pedro is typing">
                            <span></span><span></span><span></span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {hasNewMessage && isStreamActive && (
                    <button type="button" className="lv-jump-latest" onClick={jumpToLatest}>
                      ↓ Jump to latest
                    </button>
                  )}

                  {isViewingPast && viewingChat.length === 0 && !viewingLoading && (
                    <div className="lv-empty-history">
                      <span>No chat history saved for this section.</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Retry bar */}
          {!isViewingPast && retryPayload && !chatLoading && (
            <div className="lv-retry-bar">
              <WifiOff size={14} />
              <span>
                {retryPayload.finishing
                  ? 'Pedro is still finishing that answer. Try again in a moment.'
                  : 'Connection lost — your progress is saved'}
              </span>
              <button className="lv-retry-btn" onClick={handleRetry}>
                <RefreshCw size={14} />
                {retryPayload.reload ? 'Reload chat' : 'Retry'}
              </button>
            </div>
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
              {!sectionComplete && displayMessages.length > 0 && (
                <div className="lv-teaching-actions" aria-label="Learning support">
                  {awaitingAnswer ? (
                    <button type="button" disabled={chatLoading} onClick={() => handleSend('Give me a hint that helps me reason through this, without revealing the answer.')}>
                      <Lightbulb aria-hidden="true" />Give me a hint
                    </button>
                  ) : (
                    <button type="button" disabled={chatLoading} onClick={() => handleSend('Got it, continue.')}>
                      <ChevronRight aria-hidden="true" />Continue
                    </button>
                  )}
                  <button type="button" disabled={chatLoading} onClick={() => handleSend('Explain this another way, using a different explanation or analogy.')}>
                    <Shuffle aria-hidden="true" />Explain another way
                  </button>
                  <button type="button" disabled={chatLoading} onClick={() => handleSend('Show me a worked example of a similar problem, then let me try the current question myself.')}>
                    <PenLine aria-hidden="true" />Show a worked example
                  </button>
                </div>
              )}
              <div className="lv-input-shell">
                <textarea
                  ref={inputRef}
                  className="lv-input"
                  placeholder="Write a message..."
                  value={chatInput}
                  onChange={e => {
                    setChatInput(e.target.value);
                    resizeChatTextarea(e.target);
                  }}
                  onKeyDown={handleChatKeyDown}
                  disabled={chatLoading}
                  rows={3}
                />
                <div className="lv-composer-actions">
                  {canUnsend && (
                    <button
                      type="button"
                      className="lv-cancel-btn"
                      onClick={handleCancelResponse}
                      aria-label="Unsend message"
                    >
                      <Square size={14} fill="currentColor" />
                      <span>Unsend</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="lv-send-btn"
                    onClick={handleSend}
                    disabled={chatLoading || !chatInput.trim()}
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
        {notesOpen && !sourceCitation && (
          <div
            className="lv-notes-panel"
            style={{ width: notesPanelWidth, maxWidth: '100%' }}
          >
            <div
              className="lv-notes-resize-handle"
              onMouseDown={startNotesResize}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize notes panel"
            />
            <div className="lv-notes-panel-inner">
              <div className="lv-notes-header">
                <h3 className="lv-notes-title">My Notes</h3>
                <div className="lv-notes-header-right">
                  {note.saving && <span className="lv-notes-saving">Saving…</span>}
                  {note.error && <button type="button" onClick={note.retry} role="status">{note.error}</button>}
                  <button className="lv-notes-close" onClick={() => setNotesOpen(false)}>
                    <X size={16} />
                  </button>
                </div>
              </div>
              <RichNotesEditor
                contentHtml={note.html}
                readOnly={!note.loaded}
                onChange={note.change}
                showExport
                exportTitle={`${folderName} — Notes`}
                exportFilename={`coast-notes-${folderName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`}
                placeholder="Start typing your notes… Drag in images or paste from Pedro."
              />
            </div>
          </div>
        )}
        {sourceCitation && (
          <SourceCitationViewer key={`${sourceCitation.source_id}:${sourceCitation.page}`}
            folderName={folderName} citation={sourceCitation} variant="lesson"
            onClose={() => setSourceCitation(null)} />
        )}
      </div>

      {showCalculator && (
        <Calculator onClose={() => setShowCalculator(false)} />
      )}
    </div>
  );
};




export default LessonView;
