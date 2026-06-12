import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import NotebookPage from './components/NotebookPage/NotebookPage';
import PedroChat from './components/PedroChat/PedroChat';
import WorldMap from './components/WorldMap/WorldMap';
import LoginPage from './components/LoginPage/LoginPage';
import OnboardingModal from './components/OnboardingModal/OnboardingModal';
import FeedbackWidget from './components/FeedbackWidget/FeedbackWidget';
import ControlCenter from './components/ControlCenter/ControlCenter';
import { useAuth } from './context/AuthContext';
import { API_URL } from './config';

function App() {
  const { user, loading, token } = useAuth();
  const [showNotebook, setShowNotebook] = useState(false);
  const [showPedroChat, setShowPedroChat] = useState(false);
  const [showControlCenter, setShowControlCenter] = useState(false);

  const currentFeature = showNotebook ? 'notebook'
    : showPedroChat ? 'pedro_chat'
    : 'map';

  useEffect(() => {
    if (!token) return;
    const ping = () => {
      fetch(`${API_URL}/api/heartbeat`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feature: currentFeature }),
      }).catch(() => {});
    };
    ping();
    const id = setInterval(ping, 30000);
    return () => clearInterval(id);
  }, [token, currentFeature]);

  const featureRef = useRef(currentFeature);
  const startRef = useRef(Date.now());

  const flushActivity = useCallback((feature, startTime) => {
    if (!token || !feature) return;
    const dur = Date.now() - startTime;
    if (dur < 1000) return;
    fetch(`${API_URL}/api/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ feature, duration_ms: dur }),
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (currentFeature !== featureRef.current) {
      flushActivity(featureRef.current, startRef.current);
      featureRef.current = currentFeature;
      startRef.current = Date.now();
    }
  }, [currentFeature, flushActivity]);

  useEffect(() => {
    if (!token) return;
    const interval = setInterval(() => {
      flushActivity(featureRef.current, startRef.current);
      startRef.current = Date.now();
    }, 60000);

    const handleUnload = () => {
      if (!featureRef.current) return;
      const dur = Date.now() - startRef.current;
      if (dur < 1000) return;
      fetch(`${API_URL}/api/activity`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ feature: featureRef.current, duration_ms: dur }),
      }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
      flushActivity(featureRef.current, startRef.current);
    };
  }, [token, flushActivity]);

  useEffect(() => {
    if (!user?.is_admin) return;
    const onKey = (e) => {
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setShowControlCenter((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [user?.is_admin]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <p style={{ fontFamily: 'Nunito, sans-serif', color: '#aaa', fontSize: '1rem' }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const showOnboarding = user && !user.onboarding_completed;

  return (
    <>
      {showOnboarding && <OnboardingModal />}
      {showNotebook && (
        <NotebookPage onClose={() => setShowNotebook(false)} />
      )}
      {showPedroChat && (
        <PedroChat onClose={() => setShowPedroChat(false)} />
      )}

      <WorldMap
        isHome
        onOpenLessons={() => setShowNotebook(true)}
        onOpenChat={() => setShowPedroChat(true)}
        onOpenControlCenter={user.is_admin ? () => setShowControlCenter(true) : undefined}
      />

      {showControlCenter && user.is_admin && (
        <ControlCenter onClose={() => setShowControlCenter(false)} />
      )}

      <FeedbackWidget position="bottom-left" />
    </>
  );
}

export default App;
