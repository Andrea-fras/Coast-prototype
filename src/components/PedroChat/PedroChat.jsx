import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, MessageCircle, ArrowLeft, Plus, Trash2, BookOpen } from 'lucide-react';
import './PedroChat.css';
import mascot from '../../assets/sessioncompletebird.svg';
import { useAuth } from '../../context/AuthContext';
import PedroMessage from '../PedroMessage';

import { API_URL } from '../../config';

const PedroChat = ({ onClose }) => {
  const { token } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const [chatRemaining, setChatRemaining] = useState(null);

  // @ mention state
  const [notebooks, setNotebooks] = useState([]);
  const [referencedNotebooks, setReferencedNotebooks] = useState([]);
  const [mentionQuery, setMentionQuery] = useState(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionDropdownRef = useRef(null);

  // Load conversations, notebooks, and usage on mount
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/chat/conversations`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => setConversations(data))
      .catch(() => {});

    fetch(`${API_URL}/api/notebooks`, { headers })
      .then(res => res.ok ? res.json() : [])
      .then(data => setNotebooks(data))
      .catch(() => {});

    fetch(`${API_URL}/api/usage`, { headers })
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setChatRemaining(data.chat_messages_remaining); })
      .catch(() => {});
  }, [token]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Filtered notebooks for mention dropdown
  const mentionResults = mentionQuery !== null
    ? notebooks.filter(nb =>
        (nb.title || '').toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  // Detect @ trigger in input
  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);

    const cursorPos = e.target.selectionStart;
    const textBefore = val.slice(0, cursorPos);
    const atMatch = textBefore.match(/@([^\s]*)$/);

    if (atMatch) {
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const selectMention = useCallback((nb) => {
    if (referencedNotebooks.some(r => r.id === nb.id)) {
      setMentionQuery(null);
      const cursorPos = inputRef.current?.selectionStart || input.length;
      const textBefore = input.slice(0, cursorPos);
      const cleaned = textBefore.replace(/@[^\s]*$/, '');
      setInput(cleaned + input.slice(cursorPos));
      return;
    }

    setReferencedNotebooks(prev => [...prev, { id: nb.id, title: nb.title }]);

    const cursorPos = inputRef.current?.selectionStart || input.length;
    const textBefore = input.slice(0, cursorPos);
    const cleaned = textBefore.replace(/@[^\s]*$/, '');
    setInput(cleaned + input.slice(cursorPos));
    setMentionQuery(null);
    inputRef.current?.focus();
  }, [input, referencedNotebooks]);

  const removeReference = (nbId) => {
    setReferencedNotebooks(prev => prev.filter(r => r.id !== nbId));
  };

  const loadConversation = async (convoId) => {
    setActiveConvo(convoId);
    setShowSidebar(false);
    setReferencedNotebooks([]);
    try {
      const res = await fetch(`${API_URL}/api/chat/history?conversation_id=${convoId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map(m => ({ role: m.role, text: m.content })));
      }
    } catch {}
  };

  const startNewConversation = () => {
    setActiveConvo(null);
    setMessages([]);
    setShowSidebar(false);
    setReferencedNotebooks([]);
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    const refTitles = referencedNotebooks.map(r => r.title);
    const displayMsg = refTitles.length > 0
      ? `${refTitles.map(t => `@${t}`).join(' ')} ${userMsg}`
      : userMsg;

    setMessages(prev => [...prev, { role: 'user', text: displayMsg }]);
    setInput('');
    setMentionQuery(null);
    setIsLoading(true);

    const nbIds = referencedNotebooks.map(r => r.id);
    setReferencedNotebooks([]);

    try {
      const body = {
        message: userMsg,
        conversation_id: activeConvo,
        context_type: 'global',
      };
      if (nbIds.length > 0) {
        body.notebook_ids = nbIds;
      }

      setMessages(prev => [...prev, { role: 'pedro', text: '' }]);

      const res = await fetch(`${API_URL}/api/chat/stream`, {
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
            text: err.detail || "You've reached your weekly message limit. Thanks for testing Coast!"
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
            if (evt.usage) setChatRemaining(evt.usage.chat_messages_remaining);
          } catch {}
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
            : c
        ));
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'pedro',
          text: "Sorry, I'm having trouble connecting. Please try again."
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => Math.min(prev + 1, mentionResults.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getConvoLabel = (convo) => {
    if (convo.context_type === 'notebook') return `Notebook Chat`;
    if (convo.context_type === 'session') return `Session Review`;
    return convo.last_message?.substring(0, 40) || 'New conversation';
  };

  return (
    <div className="pedro-chat-page">
      <button className="pedro-chat-close" onClick={onClose}>
        <X size={28} />
      </button>

      <div className="pedro-chat-layout">
        {/* Sidebar */}
        <div className={`pedro-chat-sidebar ${showSidebar ? 'open' : ''}`}>
          <div className="pedro-sidebar-header">
            <div className="pedro-sidebar-title-row">
              <img src={mascot} alt="Pedro" className="pedro-sidebar-mascot" />
              <h2>Pedro</h2>
            </div>
            <p className="pedro-sidebar-desc">Your personal AI tutor</p>
          </div>

          <button className="pedro-new-chat-btn" onClick={startNewConversation}>
            <Plus size={18} />
            <span>New Chat</span>
          </button>

          <div className="pedro-convo-list">
            {conversations.length === 0 && (
              <p className="pedro-no-convos">No conversations yet. Start chatting!</p>
            )}
            {conversations.map((convo) => (
              <div
                key={convo.conversation_id}
                className={`pedro-convo-item ${activeConvo === convo.conversation_id ? 'active' : ''}`}
                onClick={() => loadConversation(convo.conversation_id)}
              >
                <MessageCircle size={16} />
                <div className="pedro-convo-preview">
                  <span className="pedro-convo-label">{getConvoLabel(convo)}</span>
                  <span className="pedro-convo-type">{convo.context_type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="pedro-chat-main">
          {/* Mobile back button */}
          <button className="pedro-mobile-back" onClick={() => setShowSidebar(true)}>
            <ArrowLeft size={20} />
          </button>

          {messages.length === 0 && !activeConvo ? (
            <div className="pedro-chat-empty">
              <img src={mascot} alt="Pedro" className="pedro-empty-mascot" />
              <h2>Hey! I'm Pedro</h2>
              <p>
                I'm your personal AI tutor. Ask me about anything you're studying — 
                I'll reference your notebooks, track your progress, and guide you with 
                Socratic questions to help you truly understand.
              </p>
              <p className="pedro-at-hint">
                Tip: Type <strong>@</strong> to reference a specific notebook
              </p>
              <div className="pedro-suggestions">
                <button onClick={() => setInput("What topics am I weakest in?")}>
                  What am I weakest in?
                </button>
                <button onClick={() => setInput("Can you help me study for my next quiz?")}>
                  Help me prepare for a quiz
                </button>
                <button onClick={() => setInput("What should I focus on this week?")}>
                  What should I study this week?
                </button>
              </div>
            </div>
          ) : (
            <div className="pedro-chat-messages">
              {messages.map((msg, idx) => (
                <div key={idx} className={`pedro-chat-msg ${msg.role}`}>
                  {msg.role === 'pedro' && (
                    <img src={mascot} alt="" className="pedro-chat-avatar" />
                  )}
                  <div className="pedro-chat-bubble">
                    {msg.role === 'pedro' ? <PedroMessage text={msg.text} /> : msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="pedro-chat-msg pedro">
                  <img src={mascot} alt="" className="pedro-chat-avatar" />
                  <div className="pedro-chat-bubble pedro-typing-global">
                    <span className="typing-dot-g"></span>
                    <span className="typing-dot-g"></span>
                    <span className="typing-dot-g"></span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input area */}
          <div className="pedro-chat-input-area">
            {/* Referenced notebook chips */}
            {referencedNotebooks.length > 0 && (
              <div className="pedro-ref-chips">
                {referencedNotebooks.map(nb => (
                  <span key={nb.id} className="pedro-ref-chip">
                    <BookOpen size={12} />
                    <span>{nb.title}</span>
                    <button onClick={() => removeReference(nb.id)}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="pedro-chat-input-wrapper">
              {/* @ mention dropdown */}
              {mentionQuery !== null && mentionResults.length > 0 && (
                <div className="pedro-mention-dropdown" ref={mentionDropdownRef}>
                  <div className="pedro-mention-header">Reference a notebook</div>
                  {mentionResults.map((nb, idx) => (
                    <button
                      key={nb.id}
                      className={`pedro-mention-option ${idx === mentionIndex ? 'active' : ''}`}
                      onMouseDown={(e) => { e.preventDefault(); selectMention(nb); }}
                    >
                      <BookOpen size={14} />
                      <div className="pedro-mention-info">
                        <span className="pedro-mention-title">{nb.title}</span>
                        {nb.course && <span className="pedro-mention-course">{nb.course}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {mentionQuery !== null && mentionResults.length === 0 && (
                <div className="pedro-mention-dropdown" ref={mentionDropdownRef}>
                  <div className="pedro-mention-empty">No notebooks match "{mentionQuery}"</div>
                </div>
              )}

              <input
                ref={inputRef}
                type="text"
                placeholder={
                  chatRemaining === 0
                    ? "Message limit reached for this week"
                    : referencedNotebooks.length > 0
                      ? "Ask about this notebook..."
                      : "Ask Pedro anything... (type @ to reference a notebook)"
                }
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={isLoading || chatRemaining === 0}
              />
              <button
                className="pedro-chat-send"
                onClick={handleSend}
                disabled={!input.trim() || isLoading || chatRemaining === 0}
              >
                <Send size={18} />
              </button>
            </div>
            {chatRemaining !== null && chatRemaining <= 10 && (
              <div className={`pedro-usage-hint ${chatRemaining === 0 ? 'depleted' : ''}`}>
                {chatRemaining === 0
                  ? "You've used all your messages this week — thanks for testing!"
                  : `${chatRemaining} message${chatRemaining !== 1 ? 's' : ''} remaining this week`}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PedroChat;
