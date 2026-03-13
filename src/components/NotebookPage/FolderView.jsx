import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, BookOpen, Loader, Send, FileText, Sparkles, RefreshCw, MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import PedroMessage from '../PedroMessage';
import './FolderView.css';

const FolderView = ({ folderName, onClose, onOpenNotebook }) => {
  const { token } = useAuth();

  const [sources, setSources] = useState([]);
  const [embeddingStats, setEmbeddingStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [embedding, setEmbedding] = useState(false);

  const [studyPlan, setStudyPlan] = useState('');
  const [planLoading, setPlanLoading] = useState(false);

  const [chatMessages, setChatMessages] = useState([
    { role: 'pedro', content: `I have access to all sources in the **${folderName}** folder. Ask me anything across your materials!` }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    fetchSources();
  }, [folderName, token]);

  const headers = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

  const fetchSources = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/sources`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setSources(data.sources || []);
        setEmbeddingStats(data.embedding_stats || []);
      }
    } catch {}
    setLoading(false);
  };

  const handleEmbed = async () => {
    setEmbedding(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/embed`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) await fetchSources();
    } catch {}
    setEmbedding(false);
  };

  const handleStudyPlan = async () => {
    setPlanLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/folders/${encodeURIComponent(folderName)}/study-plan`, {
        method: 'POST',
        headers: headers(),
      });
      if (res.ok) {
        const data = await res.json();
        setStudyPlan(data.plan || '');
      }
    } catch {}
    setPlanLoading(false);
  };

  const handleSendChat = async () => {
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg }]);
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/chat/send`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          message: msg,
          context_type: 'folder',
          context_id: folderName,
          conversation_id: conversationId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, { role: 'pedro', content: data.reply }]);
        if (data.conversation_id) setConversationId(data.conversation_id);
      } else {
        setChatMessages(prev => [...prev, { role: 'pedro', content: 'Sorry, something went wrong. Try again!' }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'pedro', content: 'Connection error. Please try again.' }]);
    }
    setChatLoading(false);
  };

  const embeddedCount = sources.filter(s => s.embedded).length;

  return (
    <div className="fv-container">
      {/* Header */}
      <div className="fv-header">
        <button className="fv-back-btn" onClick={onClose}>
          <ArrowLeft size={18} />
          <span>Back to Library</span>
        </button>
        <div className="fv-header-info">
          <h1 className="fv-title">{folderName}</h1>
          <span className="fv-subtitle">{sources.length} source{sources.length !== 1 ? 's' : ''} &middot; {embeddedCount} indexed</span>
        </div>
        <div className="fv-header-actions">
          <button className="fv-embed-btn" onClick={handleEmbed} disabled={embedding || sources.length === 0}>
            {embedding ? <Loader size={16} className="spinning" /> : <RefreshCw size={16} />}
            <span>{embedding ? 'Indexing...' : 'Index All'}</span>
          </button>
        </div>
      </div>

      <div className="fv-body">
        {/* Left: Sources + Study Plan */}
        <div className="fv-left">
          {/* Sources List */}
          <div className="fv-sources-section">
            <h2 className="fv-section-title">Sources</h2>
            {loading ? (
              <div className="fv-loading"><Loader size={20} className="spinning" /> Loading sources...</div>
            ) : sources.length === 0 ? (
              <div className="fv-empty">
                <BookOpen size={32} />
                <p>No notebooks in this folder yet.</p>
                <p className="fv-empty-hint">Move notebooks into this folder from "Your Notebooks" to get started.</p>
              </div>
            ) : (
              <div className="fv-source-list">
                {sources.map(src => (
                  <div
                    key={src.notebook_id}
                    className="fv-source-card"
                    onClick={() => onOpenNotebook({ id: src.notebook_id, _saved_id: src.saved_id, title: src.title })}
                  >
                    <div className="fv-source-icon">
                      <FileText size={18} />
                    </div>
                    <div className="fv-source-info">
                      <span className="fv-source-title">{src.title}</span>
                      <span className="fv-source-meta">
                        {src.course && <span>{src.course} &middot; </span>}
                        {src.section_count} section{src.section_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className={`fv-source-status ${src.embedded ? 'indexed' : 'pending'}`}>
                      {src.embedded ? 'Indexed' : 'Not indexed'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Study Plan */}
          <div className="fv-studyplan-section">
            <div className="fv-studyplan-header">
              <h2 className="fv-section-title">Study Plan</h2>
              <button className="fv-studyplan-btn" onClick={handleStudyPlan} disabled={planLoading || sources.length === 0}>
                {planLoading ? <Loader size={14} className="spinning" /> : <Sparkles size={14} />}
                <span>{planLoading ? 'Generating...' : studyPlan ? 'Regenerate' : 'Generate Study Plan'}</span>
              </button>
            </div>
            {studyPlan && (
              <div className="fv-studyplan-content">
                <PedroMessage content={studyPlan} />
              </div>
            )}
          </div>
        </div>

        {/* Right: Folder Chat */}
        <div className="fv-right">
          <div className="fv-chat-panel">
            <div className="fv-chat-header">
              <MessageCircle size={18} />
              <span>Chat with Pedro</span>
              <span className="fv-chat-badge">RAG</span>
            </div>

            <div className="fv-chat-messages">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`fv-chat-msg ${msg.role}`}>
                  {msg.role === 'pedro' ? (
                    <PedroMessage content={msg.content} />
                  ) : (
                    <div className="fv-chat-user-msg">{msg.content}</div>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div className="fv-chat-msg pedro">
                  <div className="fv-chat-typing">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="fv-chat-input-row">
              <input
                type="text"
                className="fv-chat-input"
                placeholder={sources.length === 0 ? 'Add sources to start chatting...' : 'Ask about your sources...'}
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                disabled={chatLoading || sources.length === 0}
              />
              <button className="fv-chat-send" onClick={handleSendChat} disabled={chatLoading || !chatInput.trim()}>
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FolderView;
