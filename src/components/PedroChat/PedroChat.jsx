import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowUp, Compass, History, PanelLeft, Plus, RefreshCw, Square, Target, WifiOff,
} from 'lucide-react';
import './PedroChat.css';
import '../NotebookPage/LessonView.css';
import mascot from '../../assets/sessioncompletebird.svg';
import { useAuth } from '../../context/authState';
import PedroMessage from '../PedroMessage';
import AppTopBar from '../AppNav/AppTopBar';
import { relativeDay } from '../../utils/relativeDay';

import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { logContentRetrieval } from '../../utils/logContentRetrieval';
import { useSmartScroll } from '../../utils/useSmartScroll';
import { useStreamBuffer } from '../../utils/useStreamBuffer';
import { beginChatStream, isActiveStream, endChatStream, cancelChatStream } from '../../utils/chatStreamGuard';
import { resizeChatTextarea } from '../../utils/chatTextarea';
import { useUnsendWindow } from '../../utils/useUnsendWindow';
import { stripPedroTags } from '../../utils/pedroTags';

// One-tap ways to start a conversation from the empty chat.
const STARTERS = [
  { Icon: History, title: 'Recap a lesson', prompt: 'Recap what I covered in my most recent lesson' },
  { Icon: Target, title: 'Quiz me', prompt: 'Quiz me on what I’ve learned this week' },
  { Icon: Compass, title: 'Plan what’s next', prompt: 'What should I work on next?' },
];

// The composer starts as a single line and grows with the message.
const INPUT_MIN_PX = 42;
const fitInput = (el) => resizeChatTextarea(el, INPUT_MIN_PX);

// The open conversation survives a refresh (this tab only).
const activeKey = (userId) => `coast_pedro_active_${userId || 'guest'}`;
const readActive = (userId) => {
  try { return sessionStorage.getItem(activeKey(userId)) || null; } catch { return null; }
};

const PedroChat = ({ onNavigate }) => {
  const { token, user } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [historyError, setHistoryError] = useState(false);
  const [historyReload, setHistoryReload] = useState(0);
  const [activeConvo, setActiveConvo] = useState(null);
  // A failed send, load or interrupted answer: { kind: 'send' | 'load' | 'reload', text?, convoId? }
  const [failure, setFailure] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const inputRef = useRef(null);
  const [chatRemaining, setChatRemaining] = useState(null);
  const { streamingText, tokenIdle, appendToken, resetStream, finalizeStream } = useStreamBuffer();
  const streamAbortRef = useRef(null);
  const streamGenerationRef = useRef(0);
  const pendingUserMessageRef = useRef(null);
  const streamHandledRef = useRef(false);
  const pendingConvoRef = useRef(null);
  const activeConvoAtSendRef = useRef(null);
  const { canUnsend, startUnsendWindow, clearUnsendWindow } = useUnsendWindow();
  const { scrollRef: chatAreaRef, handleScroll: onChatScroll, pinToBottom } = useSmartScroll(
    'messenger',
    [activeConvo ?? 'new'],
    streamingText.length,
  );

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/chat/conversations?context_type=global`, { headers })
      .then(res => { if (!res.ok) throw new Error('history'); return res.json(); })
      .then(data => {
        setConversations(Array.isArray(data) ? data.filter(c => c.context_type === 'global') : []);
        setHistoryError(false);
      })
      .catch(() => setHistoryError(true));
  }, [token, historyReload]);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };
    fetch(`${API_URL}/api/usage`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setChatRemaining(data.chat_messages_remaining); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (inputRef.current) fitInput(inputRef.current);
  }, []);

  useEffect(() => {
    if (inputRef.current) fitInput(inputRef.current);
  }, [input]);

  const applyStreamMeta = useCallback((evt) => {
    if (!evt) return;
    logContentRetrieval(evt);
    if (evt.usage) setChatRemaining(evt.usage.chat_messages_remaining);
    if (evt.conversation_id && !activeConvoAtSendRef.current) {
      pendingConvoRef.current = evt.conversation_id;
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
    const fullText = stripPedroTags(finalizeStream());
    setIsLoading(false);
    pendingUserMessageRef.current = null;
    clearUnsendWindow();
    applyStreamMeta(evt);
    setMessages(prev => [...prev, {
      role: 'pedro',
      text: fullText || "Sorry, I'm having trouble connecting. Please try again.",
    }]);

    const newConversationId = pendingConvoRef.current;
    if (newConversationId) {
      setActiveConvo(newConversationId);
      setConversations(prev => [{
        conversation_id: newConversationId,
        context_type: 'global',
        last_message: (fullText || '').substring(0, 100),
        last_role: 'pedro',
        updated_at: new Date().toISOString(),
      }, ...prev]);
    } else if (activeConvoAtSendRef.current) {
      setConversations(prev => prev.map(c =>
        c.conversation_id === activeConvoAtSendRef.current
          ? { ...c, last_message: (fullText || '').substring(0, 100), updated_at: new Date().toISOString() }
          : c,
      ));
    }
  }, [applyStreamMeta, clearUnsendWindow, finalizeStream]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    fitInput(e.target);
  };

  const loadConversation = useCallback(async (convoId) => {
    setActiveConvo(convoId);
    setFailure(null);
    resetStream();
    if (window.innerWidth < 900) setHistoryOpen(false);
    try {
      const res = await fetch(`${API_URL}/api/chat/history?conversation_id=${convoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('history');
      const data = await res.json();
      setMessages(data.map(m => ({ role: m.role, text: m.content })));
    } catch {
      // Keep whatever is on screen; the conversation itself is safe on the server.
      setFailure({ kind: 'load', convoId });
    }
  }, [token, resetStream]);

  // Reopen the conversation that was open before a refresh.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!token || restoredRef.current) return;
    restoredRef.current = true;
    const saved = readActive(user?.id);
    if (saved) loadConversation(saved);
  }, [token, user?.id, loadConversation]);

  useEffect(() => {
    try {
      if (activeConvo) sessionStorage.setItem(activeKey(user?.id), activeConvo);
      else sessionStorage.removeItem(activeKey(user?.id));
    } catch { /* optional convenience */ }
  }, [activeConvo, user?.id]);

  const startNewConversation = () => {
    setActiveConvo(null);
    setMessages([]);
    setFailure(null);
    resetStream();
    if (window.innerWidth < 900) setHistoryOpen(false);
    inputRef.current?.focus();
  };

  // `preset` is a starter prompt; otherwise the typed message is sent.
  const handleSend = async (preset) => {
    const fromStarter = typeof preset === 'string';
    const text = fromStarter ? preset : input;
    if (!text.trim() || isLoading || chatRemaining === 0) return;

    const userMsg = text.trim();
    setFailure(null);
    pendingUserMessageRef.current = userMsg;
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    pinToBottom();
    if (!fromStarter) {
      setInput('');
      if (inputRef.current) fitInput(inputRef.current);
    }
    startUnsendWindow();

    const { controller, streamId } = beginChatStream(streamAbortRef, streamGenerationRef);
    streamHandledRef.current = false;
    pendingConvoRef.current = null;
    activeConvoAtSendRef.current = activeConvo;
    setIsLoading(true);
    resetStream();

    try {
      const res = await fetchWithRetry(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: userMsg,
          conversation_id: activeConvo,
          context_type: 'global',
        }),
      });

      if (!isActiveStream(streamGenerationRef, streamId)) return;

      if (res.status === 429) {
        const err = await res.json().catch(() => ({}));
        setChatRemaining(0);
        pendingUserMessageRef.current = null;
        clearUnsendWindow();
        setMessages(prev => [...prev, {
          role: 'pedro',
          text: err.detail || "You've reached your weekly message limit. Thanks for testing Coast!",
        }]);
        return;
      }
      if (!res.ok) throw new Error('Failed');

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
          } catch { /* ignore */ }
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
        if (partial) {
          // Pedro had started answering, so the server has the message: show what it saved.
          setFailure({ kind: 'reload', convoId: activeConvoAtSendRef.current || pendingConvoRef.current });
        } else {
          // Never reached Pedro: take the message back into the box so nothing is lost.
          setMessages(prev => {
            const last = prev[prev.length - 1];
            return last?.role === 'user' && last.text === userMsg ? prev.slice(0, -1) : prev;
          });
          setInput(userMsg);
          setFailure({ kind: 'send', text: userMsg });
        }
      }
    } finally {
      if (endChatStream(streamAbortRef, controller, streamGenerationRef, streamId)) {
        setIsLoading(false);
      }
    }
  };

  const handleCancelResponse = () => {
    if (!canUnsend) return;
    const pending = pendingUserMessageRef.current;
    clearUnsendWindow();
    cancelChatStream(streamAbortRef, streamGenerationRef);
    resetStream();
    setIsLoading(false);
    if (!pending) return;
    pendingUserMessageRef.current = null;
    setInput(pending);
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'user' && last.text === pending) return prev.slice(0, -1);
      return prev;
    });
    requestAnimationFrame(() => {
      if (inputRef.current) {
        fitInput(inputRef.current);
        inputRef.current.focus();
      }
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRetry = async () => {
    const f = failure;
    if (!f) return;
    if (f.kind === 'send') {
      setInput('');
      handleSend(f.text);
      return;
    }
    let convoId = f.convoId;
    if (!convoId) {
      // A brand-new conversation dropped before its id arrived: it is the newest one.
      try {
        const res = await fetch(`${API_URL}/api/chat/conversations?context_type=global`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = res.ok ? await res.json() : [];
        const list = Array.isArray(data) ? data.filter(c => c.context_type === 'global') : [];
        setConversations(list);
        convoId = list[0]?.conversation_id;
      } catch { /* still offline: keep the retry bar */ }
    }
    if (convoId) loadConversation(convoId);
  };

  const failureText = failure?.kind === 'send'
    ? 'Couldn’t reach Pedro. Your message is back in the box.'
    : failure?.kind === 'reload'
      ? 'Connection lost while Pedro was answering.'
      : 'Couldn’t load this conversation.';

  const getConvoLabel = (convo) => convo.last_message?.substring(0, 60) || 'New conversation';

  const convoGroups = [
    { label: 'Today', items: conversations.filter((c) => relativeDay(c.updated_at) === 'Today') },
    { label: 'Earlier', items: conversations.filter((c) => relativeDay(c.updated_at) !== 'Today') },
  ].filter((g) => g.items.length > 0);

  const showEmpty = messages.length === 0 && !activeConvo;

  const inputPlaceholder = chatRemaining === 0
    ? 'Message limit reached for this week'
    : 'Message Pedro…';

  return (
    <div className="pedro-chat-page">
      <AppTopBar current="chat" onNavigate={onNavigate} />

      <div className="pedro-chat-body">
        {historyOpen && (
          <button
            type="button"
            className="pedro-chat-history-backdrop"
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
          />
        )}

        <aside className={`pedro-chat-history${historyOpen ? ' open' : ''}`} aria-label="Conversations">
          <button type="button" className="pedro-chat-history-new" onClick={startNewConversation}>
            <Plus size={16} />
            <span>New chat</span>
          </button>

          {historyError && conversations.length === 0 ? (
            <div className="pedro-chat-history-empty" role="alert">
              <p>Couldn’t load your conversations.</p>
              <button type="button" className="lv-retry-btn" onClick={() => setHistoryReload((k) => k + 1)}>
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          ) : conversations.length === 0 ? (
            <p className="pedro-chat-history-empty">Your conversations with Pedro will show up here.</p>
          ) : convoGroups.map((group) => (
            <div key={group.label} className="pedro-chat-history-group">
              <p className="pedro-chat-history-label">{group.label}</p>
              {group.items.map((convo) => (
                <button
                  key={convo.conversation_id}
                  type="button"
                  className="pedro-chat-history-item"
                  aria-current={activeConvo === convo.conversation_id ? 'true' : undefined}
                  onClick={() => loadConversation(convo.conversation_id)}
                >
                  <b>{getConvoLabel(convo)}</b>
                  {convo.updated_at && <small>{relativeDay(convo.updated_at)}</small>}
                </button>
              ))}
            </div>
          ))}
        </aside>

        <main className="pedro-chat-main">
          <div className="pedro-chat-toolbar">
            <button
              type="button"
              className="pedro-chat-tool"
              onClick={() => setHistoryOpen(v => !v)}
              aria-label={historyOpen ? 'Hide chat history' : 'Show chat history'}
              aria-pressed={historyOpen}
            >
              <PanelLeft size={17} />
              <span>History</span>
            </button>
            <button type="button" className="pedro-chat-tool" onClick={startNewConversation}>
              <Plus size={17} />
              <span>New chat</span>
            </button>
          </div>

          {showEmpty ? (
            <div className="pedro-chat-empty">
              <div className="pedro-hello">
                <img src={mascot} alt="" className="pedro-hello__bird" />
                <h1>Hey! I&apos;m Pedro</h1>
                <p>
                  Ask me anything about your lessons: where you&apos;re up to, what you&apos;ve covered,
                  or what&apos;s in your uploaded sources.
                </p>
                <div className="pedro-starters">
                  {STARTERS.map(({ Icon, title, prompt }) => (
                    <button
                      key={title}
                      type="button"
                      className="pedro-starter"
                      onClick={() => handleSend(prompt)}
                      disabled={isLoading || chatRemaining === 0}
                    >
                      <Icon size={18} aria-hidden="true" />
                      <b>{title}</b>
                      <small>“{prompt}”</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="lv-chat-area pedro-chat-messages" ref={chatAreaRef} onScroll={onChatScroll}>
              <div className="lv-chat-scroll-inner">
                {messages.map((msg, idx) => {
                  if (msg.role === 'pedro' && !msg.text?.trim()) return null;
                  return (
                  <div key={idx} className={`lv-chat-msg ${msg.role}`}>
                    {msg.role === 'pedro' && (
                      <img src={mascot} alt="" className="lv-msg-avatar" />
                    )}
                    <div className="lv-msg-bubble">
                      {msg.role === 'pedro' ? (
                        <PedroMessage text={msg.text} />
                      ) : (
                        <div className="lv-msg-user-text">{msg.text}</div>
                      )}
                    </div>
                  </div>
                  );
                })}
                {isLoading && (
                  <div className="lv-chat-msg pedro">
                    <img src={mascot} alt="" className="lv-msg-avatar" />
                    <div className={`lv-msg-bubble${!streamingText ? ' lv-msg-bubble--typing' : ''}`}>
                      {streamingText ? (
                        <PedroMessage text={stripPedroTags(streamingText)} isStreaming streamIdle={tokenIdle} />
                      ) : (
                        <div className="lv-typing" aria-label="Pedro is typing">
                          <span /><span /><span />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {failure && !isLoading && (
            <div className="lv-retry-bar" role="alert">
              <WifiOff size={14} />
              <span>{failureText}</span>
              <button type="button" className="lv-retry-btn" onClick={handleRetry}>
                <RefreshCw size={14} />
                {failure.kind === 'send' ? 'Retry' : failure.kind === 'reload' ? 'Reload conversation' : 'Retry'}
              </button>
            </div>
          )}

          <div className="lv-composer pedro-chat-composer" data-tour="chat-composer">
            <div className="lv-input-shell pedro-input-shell">
              <textarea
                ref={inputRef}
                className="lv-input"
                placeholder={inputPlaceholder}
                aria-label="Message Pedro"
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading || chatRemaining === 0}
                rows={1}
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
                  disabled={!input.trim() || isLoading || chatRemaining === 0}
                  aria-label="Send message"
                >
                  <ArrowUp size={18} strokeWidth={2.6} />
                </button>
              </div>
            </div>

            {chatRemaining !== null && chatRemaining <= 10 && (
              <div className={`pedro-usage-hint${chatRemaining === 0 ? ' depleted' : ''}`}>
                {chatRemaining === 0
                  ? "You've used all your messages this week. Thanks for testing!"
                  : `${chatRemaining} message${chatRemaining !== 1 ? 's' : ''} remaining this week`}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export default PedroChat;
