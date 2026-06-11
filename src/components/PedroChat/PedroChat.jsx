import React, { useState, useRef, useEffect } from 'react';
import {
  X, Send, MessageCircle, Plus, PanelLeft, PanelLeftClose,
} from 'lucide-react';
import './PedroChat.css';
import '../NotebookPage/LessonView.css';
import mascot from '../../assets/sessioncompletebird.svg';
import { useAuth } from '../../context/AuthContext';
import PedroMessage from '../PedroMessage';

import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { logContentRetrieval } from '../../utils/logContentRetrieval';

const PedroChat = ({ onClose }) => {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const chatAreaRef = useRef(null);
  const inputRef = useRef(null);

  const [chatRemaining, setChatRemaining] = useState(null);

  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/chat/conversations?context_type=global`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => setConversations(Array.isArray(data) ? data.filter(c => c.context_type === 'global') : []))
      .catch(() => {});

    fetch(`${API_URL}/api/usage`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setChatRemaining(data.chat_messages_remaining); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleInputChange = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const loadConversation = async (convoId) => {
    setActiveConvo(convoId);
    if (window.innerWidth < 900) setHistoryOpen(false);
    try {
      const res = await fetch(`${API_URL}/api/chat/history?conversation_id=${convoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map(m => ({ role: m.role, text: m.content })));
      }
    } catch { /* ignore */ }
  };

  const startNewConversation = () => {
    setActiveConvo(null);
    setMessages([]);
    if (window.innerWidth < 900) setHistoryOpen(false);
    inputRef.current?.focus();
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      const body = {
        message: userMsg,
        conversation_id: activeConvo,
        context_type: 'global',
      };

      setMessages(prev => [...prev, { role: 'pedro', text: '' }]);

      const res = await fetchWithRetry(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 429) {
        const err = await res.json().catch(() => ({}));
        setChatRemaining(0);
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'pedro',
            text: err.detail || "You've reached your weekly message limit. Thanks for testing Coast!",
          };
          return updated;
        });
        setIsLoading(false);
        return;
      }
      if (!res.ok) throw new Error('Failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';
      let newConversationId = null;

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
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'pedro', text: fullText };
                return updated;
              });
            }
            if (evt.done && evt.conversation_id && !activeConvo) {
              newConversationId = evt.conversation_id;
            }
            if (evt.done) logContentRetrieval(evt);
            if (evt.usage) setChatRemaining(evt.usage.chat_messages_remaining);
          } catch { /* ignore */ }
        }
      }

      if (newConversationId) {
        setActiveConvo(newConversationId);
        setConversations(prev => [{
          conversation_id: newConversationId,
          context_type: 'global',
          last_message: fullText.substring(0, 100),
          last_role: 'pedro',
          updated_at: new Date().toISOString(),
        }, ...prev]);
      } else if (activeConvo) {
        setConversations(prev => prev.map(c =>
          c.conversation_id === activeConvo
            ? { ...c, last_message: fullText.substring(0, 100), updated_at: new Date().toISOString() }
            : c,
        ));
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'pedro',
          text: "Sorry, I'm having trouble connecting. Please try again.",
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getConvoLabel = (convo) => convo.last_message?.substring(0, 40) || 'New conversation';

  const showEmpty = messages.length === 0 && !activeConvo;

  const inputPlaceholder = chatRemaining === 0
    ? 'Message limit reached for this week'
    : 'Write a message...';

  return (
    <div className="pedro-chat-page dark">
      <header className="pedro-chat-header">
        <div className="pedro-chat-header-left">
          <button type="button" className="pedro-chat-close" onClick={onClose} aria-label="Close chat">
            <X size={22} />
          </button>
          <button
            type="button"
            className={`pedro-chat-history-toggle${historyOpen ? ' active' : ''}`}
            onClick={() => setHistoryOpen(v => !v)}
            aria-label={historyOpen ? 'Hide chat history' : 'Show chat history'}
            aria-pressed={historyOpen}
          >
            {historyOpen ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
          </button>
        </div>

        <div className="pedro-chat-header-center">
          <img src={mascot} alt="" className="pedro-chat-header-mascot" />
          <span className="pedro-chat-header-title">Pedro</span>
        </div>

        <button type="button" className="pedro-chat-new-btn" onClick={startNewConversation}>
          <Plus size={18} />
          <span>New chat</span>
        </button>
      </header>

      <div className="pedro-chat-body">
        {historyOpen && (
          <button
            type="button"
            className="pedro-chat-history-backdrop"
            aria-label="Close chat history"
            onClick={() => setHistoryOpen(false)}
          />
        )}

        <aside className={`pedro-chat-history${historyOpen ? ' open' : ''}`}>
          <div className="pedro-chat-history-head">
            <h2>History</h2>
            <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Close history">
              <PanelLeftClose size={16} />
            </button>
          </div>

          <button type="button" className="pedro-chat-history-new" onClick={startNewConversation}>
            <Plus size={16} />
            <span>New chat</span>
          </button>

          <div className="pedro-chat-history-list">
            {conversations.length === 0 && (
              <p className="pedro-chat-history-empty">No conversations yet</p>
            )}
            {conversations.map((convo) => (
              <button
                key={convo.conversation_id}
                type="button"
                className={`pedro-chat-history-item${activeConvo === convo.conversation_id ? ' active' : ''}`}
                onClick={() => loadConversation(convo.conversation_id)}
              >
                <MessageCircle size={15} />
                <span>{getConvoLabel(convo)}</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="pedro-chat-main">
          {showEmpty ? (
            <div className="pedro-chat-empty">
              <img src={mascot} alt="Pedro" className="pedro-empty-mascot" />
              <h2>Hey! I&apos;m Pedro</h2>
              <p className="pedro-chat-intro">
                I can talk about any lessons you&apos;ve made: where you&apos;re up to,
                what you&apos;ve covered, and content from your uploaded sources.
              </p>
              <ul className="pedro-chat-capabilities">
                <li>Discuss your courses and study progress</li>
                <li>Explain concepts from your lesson materials</li>
                <li>Help you revise or figure out what to work on next</li>
              </ul>
            </div>
          ) : (
            <div className="lv-chat-area pedro-chat-messages" ref={chatAreaRef}>
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
                    <div className="lv-msg-bubble">
                      <div className="lv-typing">
                        <span /><span /><span />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="lv-composer pedro-chat-composer">
            <div className="lv-input-shell pedro-input-shell">
              <textarea
                ref={inputRef}
                className="lv-input"
                placeholder={inputPlaceholder}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading || chatRemaining === 0}
                rows={1}
              />

              <div className="lv-composer-actions">
                <button
                  type="button"
                  className="lv-send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading || chatRemaining === 0}
                  aria-label="Send message"
                >
                  <Send size={16} />
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
