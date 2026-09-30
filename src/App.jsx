import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import './App.css';
const NotebookPage = lazy(() => import('./components/NotebookPage/NotebookPage'));
const PedroChat = lazy(() => import('./components/PedroChat/PedroChat'));
import WorldMap from './components/WorldMap/WorldMap';
import LoginPage from './components/LoginPage/LoginPage';
const OnboardingModal = lazy(() => import('./components/OnboardingModal/OnboardingModal'));
import FeedbackWidget from './components/FeedbackWidget/FeedbackWidget';
const GuidedTour = lazy(() => import('./components/GuidedTour/GuidedTour'));
import { buildCoastTour } from './components/GuidedTour/coastTour';
import ContentProviderToggle from './components/ContentProviderToggle/ContentProviderToggle';
const ControlCenter = lazy(() => import('./components/ControlCenter/ControlCenter'));
import { useAuth } from './context/authState';
import { API_URL } from './config';

function App() {
  const { user, loading, token, sessionError, retrySession } = useAuth();
  const [showNotebook, setShowNotebook] = useState(false);
  const [initialLessonFolder, setInitialLessonFolder] = useState(null);
  const [initialCourseFolder, setInitialCourseFolder] = useState(null);
  const [showPedroChat, setShowPedroChat] = useState(false);
  const [showControlCenter, setShowControlCenter] = useState(false);
  const [replayTour, setReplayTour] = useState(false);

  // Map, Lessons and Chat are reachable from every main screen through the shared nav.
  const navigate = useCallback((target, folder = null) => {
    if (target === 'map') {
      setShowNotebook(false);
      setShowPedroChat(false);
    } else if (target === 'lessons' || target === 'course' || target === 'lesson') {
      setShowPedroChat(false);
      setInitialLessonFolder(target === 'lesson' ? folder : null);
      setInitialCourseFolder(target === 'course' ? folder : null);
      setShowNotebook(true);
    } else if (target === 'chat') {
      setShowNotebook(false);
      setShowPedroChat(true);
    }
  }, []);

  // The product tour drives the real screens so every step highlights the actual control.
  const tourActions = useMemo(() => ({
    showMap: () => navigate('map'),
    openLessons: () => navigate('lessons'),
    openChat: () => navigate('chat'),
  }), [navigate]);
  const tourSteps = useMemo(() => buildCoastTour(tourActions), [tourActions]);

  useEffect(() => {
    const start = () => setReplayTour(true);
    window.addEventListener('coast:start-tour', start);
    return () => window.removeEventListener('coast:start-tour', start);
  }, []);
  const endReplay = useCallback(() => { tourActions.showMap(); setReplayTour(false); }, [tourActions]);

  const currentFeature = showNotebook ? 'notebook'
    : showPedroChat ? 'pedro_chat'
    : 'map';

  useEffect(() => {
    if (!token) return;
    const ping = () => {
      if (document.hidden) return; // a background tab isn't a live session
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
  const startRef = useRef(0);
  useEffect(() => { startRef.current = Date.now(); }, []);

  const flushActivity = useCallback((feature, startTime) => {
    if (!token || !feature || !startTime) return;
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

  if (loading || sessionError) {
    return (
      <main className="coast-session-screen">
        <section className="coast-session-card" aria-live="polite">
          <h1>{sessionError ? 'Let’s reconnect' : 'Opening Coast…'}</h1>
          <p role={sessionError ? 'alert' : 'status'}>{sessionError || 'Checking your saved session.'}</p>
          {sessionError && <button type="button" onClick={retrySession}>Try again</button>}
        </section>
      </main>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const showOnboarding = user && !user.onboarding_completed;

  return (
    <>
      {showOnboarding && <Suspense fallback={<div role="status">Preparing your welcome…</div>}><OnboardingModal tourActions={tourActions} /></Suspense>}
      {replayTour && !showOnboarding && (
        <Suspense fallback={null}><GuidedTour steps={tourSteps} onFinish={endReplay} onSkip={endReplay} /></Suspense>
      )}
      {showNotebook && (
        <Suspense fallback={<div role="status" className="coast-screen-loading">Opening your lessons…</div>}><NotebookPage initialLessonFolder={initialLessonFolder} initialCourseFolder={initialCourseFolder} onNavigate={navigate} onClose={() => setShowNotebook(false)} /></Suspense>
      )}
      {showPedroChat && (
        <Suspense fallback={<div role="status">Opening Pedro…</div>}><PedroChat onNavigate={navigate} onClose={() => setShowPedroChat(false)} /></Suspense>
      )}

      <WorldMap
        isHome
        overlayActive={showNotebook || showPedroChat}
        onNavigate={navigate}
        onOpenLessons={() => navigate('lessons')}
        onContinueLesson={(folder) => navigate('lesson', folder)}
        onOpenCourse={(folder) => navigate('course', folder)}
        onOpenChat={() => navigate('chat')}
        onOpenControlCenter={user.is_admin ? () => setShowControlCenter(true) : undefined}
      />

      {showControlCenter && user.is_admin && (
        <Suspense fallback={null}><ControlCenter onClose={() => setShowControlCenter(false)} /></Suspense>
      )}

      <FeedbackWidget position="bottom-left" />
      <ContentProviderToggle />
    </>
  );
}

export default App;
