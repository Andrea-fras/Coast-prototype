import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, CheckCircle, Loader, Send, List, Clock, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import PedroMessage from '../PedroMessage';
import mascot from '../../assets/sessioncompletebird.svg';
import './LessonView.css';

const LessonView = ({ folderName, onClose }) => {
  const { token } = useAuth();

  const [lessonState, setLessonState] = useState(null);
  const [loading, setLoading] = useState(true);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sectionComplete, setSectionComplete] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  const chatAreaRef = useRef(null);
  const inputRef = useRef(null);

  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  useEffect(() => {
    fetchLessonState();
  }, [folderName, token]);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (last?.role === 'pedro' && last.content?.includes('[SECTION_COMPLETE]')) {
      setSectionComplete(true);
    }
  }, [chatMessages]);

  const fetchLessonState = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setLessonState(data);
        if (data.has_outline && !data.is_complete) {
          startSectionChat(data.current_section, data.sections);
        }
      }
    } catch {}
    setLoading(false);
  };

  const startSectionChat = (sectionIdx, sections) => {
    setSectionComplete(false);
    setConversationId(null);
    const section = sections?.[sectionIdx];
    if (!section) return;

    setChatMessages([]);
    setChatLoading(true);

    sendToApi(
      `I'm ready to learn about "${section.title}". Please teach me this section.`,
      null,
    );
  };

  const sendToApi = async (message, convId) => {
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/chat/send`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          message,
          context_type: 'lesson',
          context_id: folderName,
          conversation_id: convId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        let reply = data.reply || '';
        const cleanReply = reply.replace('[SECTION_COMPLETE]', '').trim();
        const isComplete = reply.includes('[SECTION_COMPLETE]');

        setChatMessages(prev => [...prev, { role: 'pedro', content: cleanReply }]);
        if (data.conversation_id) setConversationId(data.conversation_id);
        if (isComplete) setSectionComplete(true);
      } else {
        setChatMessages(prev => [...prev, { role: 'pedro', content: 'Sorry, something went wrong. Try again!' }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'pedro', content: 'Connection error. Please try again.' }]);
    }
    setChatLoading(false);
  };

  const handleSend = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    await sendToApi(msg, conversationId);
  };

  const handleAdvanceSection = async () => {
    setAdvancing(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/lesson/advance`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) {
        const data = await res.json();
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
          startSectionChat(data.current_section, lessonState?.sections);
        }
      }
    } catch {}
    setAdvancing(false);
  };

  if (loading) {
    return (
      <div className="lv-container">
        <div className="lv-loading">
          <Loader size={28} className="spinning" />
          <span>Loading lesson...</span>
        </div>
      </div>
    );
  }

  if (!lessonState?.has_outline) {
    return (
      <div className="lv-container">
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
  const currentSection = sections[currentIdx];
  const progressPercent = isComplete ? 100 : Math.round((currentIdx / Math.max(totalSections, 1)) * 100);

  return (
    <div className="lv-container">
      {/* Header */}
      <div className="lv-header">
        <button className="lv-close-btn" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>Exit Lesson</span>
        </button>

        <div className="lv-header-center">
          <span className="lv-header-title">{folderName}</span>
          <div className="lv-header-progress">
            <div className="lv-header-progress-bar">
              <div
                className="lv-header-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="lv-header-progress-label">
              {isComplete ? 'Complete' : `${currentIdx} / ${totalSections}`}
            </span>
          </div>
        </div>

        <button
          className="lv-sidebar-toggle"
          onClick={() => setSidebarOpen(prev => !prev)}
          title="Toggle sections"
        >
          <List size={18} />
        </button>
      </div>

      <div className="lv-body">
        {/* Section Sidebar */}
        <div className={`lv-sidebar ${sidebarOpen ? 'open' : ''}`}>
          <h3 className="lv-sidebar-title">Sections</h3>
          <div className="lv-sidebar-list">
            {sections.map((sec, i) => {
              const done = i < currentIdx;
              const current = i === currentIdx && !isComplete;
              return (
                <button
                  key={i}
                  className={`lv-sidebar-item ${done ? 'done' : current ? 'current' : 'locked'}`}
                  disabled={!done && !current}
                  onClick={() => {
                    if (done || current) setSidebarOpen(false);
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
          {/* Section Title Banner */}
          {currentSection && !isComplete && (
            <div className="lv-section-banner">
              <span className="lv-section-number">Section {currentIdx + 1} of {totalSections}</span>
              <h2 className="lv-section-title">{currentSection.title}</h2>
              {currentSection.learning_objectives?.length > 0 && (
                <div className="lv-section-objectives">
                  {currentSection.learning_objectives.map((obj, i) => (
                    <span key={i} className="lv-section-objective">{obj}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chat Messages */}
          <div className="lv-chat-area" ref={chatAreaRef}>
            {chatMessages.map((msg, i) => (
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
            ))}
            {chatLoading && (
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

          {/* Next Section Button */}
          {sectionComplete && !isComplete && (
            <div className="lv-next-section-bar">
              <button
                className="lv-next-section-btn"
                onClick={handleAdvanceSection}
                disabled={advancing}
              >
                {advancing ? (
                  <Loader size={18} className="spinning" />
                ) : (
                  <ChevronRight size={18} />
                )}
                <span>{advancing ? 'Loading next section...' : 'Next Section'}</span>
              </button>
            </div>
          )}

          {/* Completed state */}
          {isComplete && (
            <div className="lv-complete-bar">
              <CheckCircle size={20} />
              <span>You've completed the entire lesson! Great job.</span>
            </div>
          )}

          {/* Input */}
          {!isComplete && (
            <div className="lv-input-row">
              <input
                ref={inputRef}
                type="text"
                className="lv-input"
                placeholder="Type your response..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                disabled={chatLoading}
              />
              <button className="lv-send-btn" onClick={handleSend} disabled={chatLoading || !chatInput.trim()}>
                <Send size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LessonView;
