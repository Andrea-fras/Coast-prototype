import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { beginChatStream, isActiveStream, endChatStream } from '../../utils/chatStreamGuard';
import { useStreamBuffer } from '../../utils/useStreamBuffer';
import PedroMessage from '../PedroMessage';
import mascot from '../../assets/sessioncompletebird.svg';
import { Sparkles, ArrowRight, ArrowLeft, MessageCircle, Send, Brain } from 'lucide-react';
import GuidedTour from '../GuidedTour/GuidedTour';
import { buildCoastTour } from '../GuidedTour/coastTour';
import './OnboardingModal.css';
import '../NotebookPage/LessonView.css';

const ONBOARDING_START = '[ONBOARDING_START]';

function OnboardingPedroChat({ token, onComplete, onConversationId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [pedroDone, setPedroDone] = useState(false);
  const [traitsSaved, setTraitsSaved] = useState([]);
  const startedRef = useRef(false);
  const streamAbortRef = useRef(null);
  const streamGenRef = useRef(0);
  const chatEndRef = useRef(null);
  const { streamingText, appendToken, resetStream, finalizeStream } = useStreamBuffer();

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const sendStream = useCallback(async (text, { hidden = false } = {}) => {
    const { controller, streamId } = beginChatStream(streamAbortRef, streamGenRef);
    if (!hidden) {
      setMessages((prev) => [...prev, { role: 'user', content: text }]);
    }
    setLoading(true);
    resetStream();

    try {
      const res = await fetchWithRetry(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          context_type: 'onboarding',
          context_id: 'profile',
          conversation_id: conversationId,
        }),
      });

      if (!res.ok) throw new Error('stream failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let meta = null;

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
            if (evt.token && isActiveStream(streamGenRef, streamId)) appendToken(evt.token);
            if (evt.done) meta = evt;
          } catch { /* ignore */ }
        }
      }

      if (!isActiveStream(streamGenRef, streamId)) return;

      const fullText = finalizeStream() || meta?.reply || '';
      if (fullText) {
        setMessages((prev) => [...prev, { role: 'pedro', content: fullText }]);
      }
      if (meta?.conversation_id) {
        setConversationId(meta.conversation_id);
        onConversationId?.(meta.conversation_id);
      }
      if (meta?.onboarding_complete) {
        setPedroDone(true);
        if (meta.traits_saved?.length) setTraitsSaved(meta.traits_saved);
      }
    } catch {
      setMessages((prev) => [...prev, {
        role: 'pedro',
        content: "Sorry, I hit a snag — try sending your message again!",
      }]);
    } finally {
      if (endChatStream(streamAbortRef, controller, streamGenRef, streamId)) {
        setLoading(false);
      }
    }
  }, [token, conversationId, appendToken, resetStream, finalizeStream, onConversationId]);

  useEffect(() => {
    if (startedRef.current || !token) return;
    startedRef.current = true;
    sendStream(ONBOARDING_START, { hidden: true });
  }, [token, sendStream]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading || pedroDone) return;
    setInput('');
    await sendStream(msg);
  };

  const handleFinish = async () => {
    onComplete(conversationId);
  };

  return (
    <div className="onboarding-chat">
      <div className="onboarding-chat-messages">
        {messages.map((m, i) => (
          m.role === 'pedro' ? (
            <div key={i} className="lv-chat-msg pedro">
              <img src={mascot} alt="" className="lv-msg-avatar" />
              <div className="lv-msg-bubble">
                <PedroMessage text={m.content} />
              </div>
            </div>
          ) : (
            <div key={i} className="lv-chat-msg user">
              <div className="lv-msg-user-text">{m.content}</div>
            </div>
          )
        ))}
        {loading && streamingText && (
          <div className="lv-chat-msg pedro">
            <img src={mascot} alt="" className="lv-msg-avatar" />
            <div className="lv-msg-bubble">
              <PedroMessage text={streamingText} isStreaming />
            </div>
          </div>
        )}
        {loading && !streamingText && (
          <div className="lv-chat-msg pedro">
            <img src={mascot} alt="" className="lv-msg-avatar" />
            <div className="lv-msg-bubble lv-msg-bubble--typing">
              <div className="lv-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {pedroDone && traitsSaved.length > 0 && (
        <div className="onboarding-memory-card">
          <Brain size={18} />
          <div>
            <strong>Saved to your memory</strong>
            <ul>
              {traitsSaved.map((t, i) => (
                <li key={i}>{t.description}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {!pedroDone ? (
        <div className="onboarding-chat-input-row">
          <textarea
            className="onboarding-chat-input"
            rows={2}
            placeholder="Tell Pedro how you like to study…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={loading}
          />
          <button
            type="button"
            className="onboarding-chat-send"
            onClick={handleSend}
            disabled={loading || !input.trim()}
          >
            <Send size={16} />
          </button>
        </div>
      ) : (
        <button type="button" className="onboarding-next onboarding-next--full" onClick={handleFinish}>
          Start exploring <Sparkles size={16} />
        </button>
      )}
    </div>
  );
}

export default function OnboardingModal({ tourActions }) {
  const { token, updateUser, user } = useAuth();
  const [phase, setPhase] = useState('welcome'); // welcome → tour → pedro-intro → chat
  const [saving, setSaving] = useState(false);
  const conversationIdRef = useRef(null);
  const completedRef = useRef(false);
  const tourSteps = useMemo(() => buildCoastTour(tourActions), [tourActions]);

  const firstName = user?.name?.split(' ')[0] || 'there';

  const handleFinish = async (convId = null) => {
    if (completedRef.current) {
      updateUser({ onboarding_completed: true });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/api/auth/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          preferences: {},
          conversation_id: convId || conversationIdRef.current || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        completedRef.current = true;
        updateUser({ onboarding_completed: true, ...data });
      } else {
        updateUser({ onboarding_completed: true });
      }
    } catch {
      updateUser({ onboarding_completed: true });
    }
    setSaving(false);
  };

  const handleSkipAll = () => {
    tourActions?.showMap?.();
    handleFinish();
  };

  const endTour = () => {
    tourActions?.showMap?.();
    setPhase('pedro-intro');
  };

  if (phase === 'tour') {
    return <GuidedTour steps={tourSteps} onFinish={endTour} onSkip={endTour} finishLabel="Meet Pedro" />;
  }

  if (phase === 'chat') {
    return (
      <div className="onboarding-overlay">
        <div className="onboarding-card onboarding-card--chat">
          <div className="onboarding-header">
            <img src={mascot} alt="Pedro" className="onboarding-mascot" />
            <div className="onboarding-header-text">
              <span className="onboarding-kicker">Quick chat</span>
              <h2>Pedro gets to know you</h2>
            </div>
          </div>
          <p className="onboarding-chat-sub">
            ~1 minute — share as much or as little as you like. Pedro remembers for future lessons.
          </p>
          <OnboardingPedroChat
            token={token}
            onConversationId={(id) => { conversationIdRef.current = id; }}
            onComplete={(convId) => handleFinish(convId)}
          />
        </div>
      </div>
    );
  }

  const isIntro = phase === 'pedro-intro';
  const Icon = isIntro ? MessageCircle : Sparkles;
  const title = isIntro ? 'Now, a quick hello' : `Welcome to Coast, ${firstName}!`;
  const paragraphs = isIntro
    ? [
        'Pedro will ask a couple of short questions about how you like to study — usually under a minute.',
        'It helps personalise every lesson. Share as much or as little as you want.',
      ]
    : [
        'Coast turns your own lectures into lessons with Pedro, your AI tutor — and a map that grows as you learn.',
        'Let me show you around. It takes about a minute, and you can skip at any point.',
      ];

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card">
        <div className="onboarding-header">
          <img src={mascot} alt="Pedro" className="onboarding-mascot" />
          <div className="onboarding-header-text">
            <span className="onboarding-kicker">{isIntro ? 'Almost there' : 'Getting started'}</span>
            <h2>{isIntro ? 'Meet Pedro' : 'Hi, I’m Pedro'}</h2>
          </div>
        </div>

        <div className="onboarding-step" key={phase}>
          <div className="onboarding-step-icon">
            <Icon size={24} />
          </div>
          <h3 className="onboarding-step-title">{title}</h3>
          <div className="onboarding-step-body">
            {paragraphs.map((text, i) => <p key={i}>{text}</p>)}
          </div>
        </div>

        <div className="onboarding-actions">
          <div className="onboarding-actions-left">
            {isIntro ? (
              <>
                <button type="button" className="onboarding-back" onClick={() => setPhase('tour')} disabled={saving}>
                  <ArrowLeft size={16} />
                  Tour again
                </button>
                <button type="button" className="onboarding-skip" onClick={handleSkipAll} disabled={saving}>
                  Skip chat
                </button>
              </>
            ) : (
              <button type="button" className="onboarding-skip" onClick={() => setPhase('pedro-intro')} disabled={saving}>
                Skip tour
              </button>
            )}
          </div>
          <button
            type="button"
            className="onboarding-next"
            onClick={() => setPhase(isIntro ? 'chat' : 'tour')}
            disabled={saving}
          >
            {isIntro ? <>Chat with Pedro <MessageCircle size={16} /></> : <>Show me around <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
