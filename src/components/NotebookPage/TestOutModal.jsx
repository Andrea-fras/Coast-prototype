import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Loader, RefreshCw, WifiOff, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { logContentRetrieval } from '../../utils/logContentRetrieval';
import PedroMessage from '../PedroMessage';
import mascot from '../../assets/sessioncompletebird.svg';
import './TestOutModal.css';
import { stripPedroTags } from '../../utils/pedroTags';


const TestOutModal = ({
  folderName,
  targetIndex,
  targetSection,
  skippedSections = [],
  startIndex = 0,
  wholeCourse = false,
  onClose,
  onPassed,
}) => {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [passed, setPassed] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyDone, setApplyDone] = useState(false);
  const [applyError, setApplyError] = useState(false);
  const [retryPayload, setRetryPayload] = useState(null);
  const [placement, setPlacement] = useState(null);
  const [result, setResult] = useState(null);

  const chatRef = useRef(null);
  const inputRef = useRef(null);
  const startedRef = useRef(false);
  const applyStartedRef = useRef(false);
  const convRef = useRef(null);
  const onPassedRef = useRef(onPassed);

  useEffect(() => {
    onPassedRef.current = onPassed;
  }, [onPassed]);

  const hdrs = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    document.body.classList.add('coast-test-out-active');
    return () => document.body.classList.remove('coast-test-out-active');
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const sendToApi = useCallback(async (message, convId) => {
    setLoading(true);
    setRetryPayload(null);
    setMessages(prev => [...prev, { role: 'pedro', content: '' }]);

    const updateLastPedro = (content) => {
      setMessages(prev => {
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
          context_type: 'test_out',
          context_id: folderName,
          conversation_id: convId,
          section_index: targetIndex,
        }),
      });
    } catch {
      updateLastPedro('');
      setRetryPayload({ message, convId });
      setLoading(false);
      return;
    }

    if (!res.ok) {
      updateLastPedro('Sorry, something went wrong. Try again!');
      setRetryPayload({ message, convId });
      setLoading(false);
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
                convRef.current = evt.conversation_id;
              }
              if (evt.placement) setPlacement(evt.placement);
              if (evt.test_out_passed) setPassed(true);
            }
          } catch { /* ignore */ }
        }
      }

      if (!fullText) {
        updateLastPedro('Sorry, something went wrong. Try again!');
        setRetryPayload({ message, convId });
      }
    } catch {
      setRetryPayload({ message, convId });
    }
    setLoading(false);
  }, [folderName, targetIndex, token]);

  useEffect(() => {
    if (startedRef.current || (!targetSection && !wholeCourse)) return;
    startedRef.current = true;

    const opener = wholeCourse
      ? 'I think I already know a lot of this course. Check what I know so I can skip ahead.'
      : `I think I already know the sections before "${targetSection.title}". Check what I know so I can skip ahead.`;

    sendToApi(opener, null);
  }, [targetSection, wholeCourse, sendToApi]);

  const applyUnlock = useCallback(async () => {
    setApplying(true);
    setApplyError(false);
    try {
      const res = await fetchWithRetry(
        `${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson/test-out`,
        {
          method: 'POST',
          headers: hdrs(),
          body: JSON.stringify({ target_section: targetIndex, conversation_id: convRef.current }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        await onPassedRef.current?.(data);
        setApplyDone(true);
        return;
      }
      const err = await res.json().catch(() => ({}));
      // Section may already be unlocked if the request succeeded but UI didn't update.
      if (err.detail?.includes('already unlocked') || err.error?.includes('already unlocked')) {
        await onPassedRef.current?.();
        setApplyDone(true);
        return;
      }
      setApplyError(true);
    } catch {
      setApplyError(true);
    } finally {
      setApplying(false);
    }
  }, [folderName, targetIndex, token]);

  useEffect(() => {
    if (!passed || applyStartedRef.current) return;
    applyStartedRef.current = true;
    applyUnlock();
  }, [passed, applyUnlock]);

  const stopHere = () => {
    if (applyStartedRef.current) return;
    applyStartedRef.current = true;
    setPassed(true);
    applyUnlock();
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading || passed || placement?.done) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    await sendToApi(msg, conversationId);
  };

  const handleRetry = () => {
    if (!retryPayload) return;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'pedro' && !last.content) return prev.slice(0, -1);
      return prev;
    });
    sendToApi(retryPayload.message, retryPayload.convId);
  };

  const passedCount = placement?.passed_count || 0;
  const checking = placement?.checking_section ?? startIndex;
  const noSkip = placement?.done && !placement?.can_apply && !passed;
  const finished = passed || noSkip;
  const resultLine = result
    ? (result.is_complete
      ? 'Course complete — you showed you already know all of it.'
      : `You'll start at Section ${result.current_section + 1}. ${result.skipped_sections?.length || 0} section${result.skipped_sections?.length === 1 ? '' : 's'} credited.`)
    : '';

  return createPortal(
    <div className="test-out-overlay" role="dialog" aria-modal="true" aria-labelledby="test-out-title">
      <div className="test-out-modal">
        <header className="test-out-header">
          <div className="test-out-header-text">
            <p className="test-out-kicker">Placement check</p>
            <h2 id="test-out-title" className="test-out-title">
              {wholeCourse ? 'Skip what you already know' : `Skip ahead to Section ${targetIndex + 1}`}
            </h2>
            <p className="test-out-sub">
              Pedro checks one section at a time. Stop whenever you like — you keep every section you pass.
            </p>
            <ol className="placement-track" aria-label="Sections in this check">
              {skippedSections.map((sec, i) => {
                const index = startIndex + i;
                const status = index < startIndex + passedCount ? 'passed'
                  : (!finished && index === checking) ? 'checking' : 'later';
                return (
                  <li key={index} className={`placement-step ${status}`} title={`Section ${index + 1}: ${sec.title}`}>
                    <span className="placement-dot" aria-hidden="true" />
                    <span className="placement-label">
                      {index + 1}
                      <span className="sr-only">{`: ${sec.title} — ${status}`}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
            {!finished && placement && (
              <p className="placement-status">
                Checking Section {checking + 1}
                {passedCount > 0 && ` · ${passedCount} passed`}
              </p>
            )}
          </div>
          {!passed && (
            <button type="button" className="test-out-close" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          )}
        </header>

        <div className="test-out-chat" ref={chatRef}>
          {messages.map((msg, i) => {
            if (msg.role === 'pedro' && !msg.content?.trim()) return null;
            return (
              <div key={i} className={`test-out-msg ${msg.role}`}>
                {msg.role === 'pedro' && (
                  <img src={mascot} alt="" className="test-out-avatar" />
                )}
                <div className="test-out-bubble">
                  {msg.role === 'pedro' ? (
                    <PedroMessage text={msg.content} />
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="test-out-msg pedro">
              <img src={mascot} alt="" className="test-out-avatar" />
              <div className="test-out-bubble">
                <div className="test-out-typing"><span /><span /><span /></div>
              </div>
            </div>
          )}
        </div>

        {retryPayload && !loading && !passed && (
          <div className="test-out-retry">
            <WifiOff size={14} />
            <span>Connection lost</span>
            <button type="button" onClick={handleRetry}>
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        )}

        {passed && (
          <div className="test-out-success">
            {applying && !applyDone && (
              <>
                <Loader size={18} className="spinning" />
                <span>Unlocking section…</span>
              </>
            )}
            {applyDone && (
              <>
                <CheckCircle size={18} />
                <span>{resultLine || "You're all set!"}</span>
                <button type="button" className="test-out-continue" onClick={onClose}>
                  Continue
                </button>
              </>
            )}
            {applyError && !applying && (
              <>
                <WifiOff size={18} />
                <span>Couldn't unlock — try again</span>
                <button type="button" className="test-out-continue" onClick={applyUnlock}>
                  Retry
                </button>
              </>
            )}
          </div>
        )}

        {noSkip && (
          <div className="test-out-success neutral">
            <span>No problem — you'll start at Section {(placement?.place_at ?? startIndex) + 1} and Pedro will teach it from there.</span>
            <button type="button" className="test-out-continue" onClick={onClose}>Got it</button>
          </div>
        )}

        {!finished && passedCount > 0 && !loading && (
          <div className="placement-keep">
            <span>{passedCount} section{passedCount === 1 ? '' : 's'} passed so far.</span>
            <button type="button" className="placement-keep-btn" onClick={stopHere}>
              Keep {passedCount} and stop here
            </button>
          </div>
        )}

        {!finished && (
          <div className="test-out-composer">
            <textarea
              ref={inputRef}
              className="test-out-input"
              placeholder="Answer Pedro's question…"
              value={input}
              rows={1}
              disabled={loading}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 96)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              type="button"
              className="test-out-send"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="Send"
            >
              <Send size={15} />
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default TestOutModal;
