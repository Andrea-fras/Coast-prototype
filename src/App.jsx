import React, { useState } from 'react';
import './App.css'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Dashboard from './components/Dashboard/Dashboard'
import QuestionPage from './components/QuestionPage/QuestionPage'
import NotebookPage from './components/NotebookPage/NotebookPage'
import PedroChat from './components/PedroChat/PedroChat'
import PomodoroPage from './components/PomodoroPage/PomodoroPage'
import AdminDashboard from './components/AdminDashboard/AdminDashboard'
import LoginPage from './components/LoginPage/LoginPage'
import ReviewSession from './components/ReviewSession/ReviewSession'
import OnboardingModal from './components/OnboardingModal/OnboardingModal'
import Calculator from './components/Calculator/Calculator'
import './components/Calculator/Calculator.css'
import FeedbackWidget from './components/FeedbackWidget/FeedbackWidget'
import { useAuth } from './context/AuthContext'

// Import all papers
import paper1 from './data/samplePaper.json'
import paper2 from './data/paper2.json'
import paper3 from './data/paper3.json'

// Papers configuration
const papers = [
  { id: 0, data: paper1, name: 'Quantitative Methods 3' },
  { id: 1, data: paper2, name: 'Economics 101' },
  { id: 2, data: paper3, name: 'Statistics 201' }
];

function App() {
  const { user, loading, logout } = useAuth();
  const [showQuestionPage, setShowQuestionPage] = useState(false);
  const [showNotebook, setShowNotebook] = useState(false);
  const [showPedroChat, setShowPedroChat] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [activePaper, setActivePaper] = useState(null);
  const [selectedPaperIndex, setSelectedPaperIndex] = useState(1);
  const [showCalculator, setShowCalculator] = useState(false);

  // Show loading spinner while checking auth
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
        <p style={{ fontFamily: 'Nunito, sans-serif', color: '#aaa', fontSize: '1rem' }}>Loading...</p>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!user) {
    return <LoginPage />;
  }

  const showOnboarding = user && !user.onboarding_completed;

  const handleStartQuest = () => {
    setActivePaper(papers[selectedPaperIndex].data);
    setShowQuestionPage(true);
  };

  const handleCloseQuest = () => {
    setShowQuestionPage(false);
    setActivePaper(null);
  };

  const handleOpenNotebook = () => {
    setShowNotebook(true);
  };

  const handleOpenPedro = () => {
    setShowPedroChat(true);
  };

  const handleOpenPomodoro = () => {
    setShowPomodoro(true);
  };

  const handleNotebookQuestions = (matchedPaper) => {
    setShowNotebook(false);
    setActivePaper(matchedPaper);
    setShowQuestionPage(true);
  };

  return (
    <>
      {showOnboarding && <OnboardingModal />}
      {showQuestionPage && <QuestionPage onClose={handleCloseQuest} paper={activePaper || papers[selectedPaperIndex].data} />}
      {showNotebook && (
        <NotebookPage 
          onClose={() => setShowNotebook(false)} 
          onStartQuestions={handleNotebookQuestions}
        />
      )}
      {showPedroChat && (
        <PedroChat onClose={() => setShowPedroChat(false)} />
      )}
      {showAdmin && (
        <AdminDashboard onClose={() => setShowAdmin(false)} />
      )}
      {showPomodoro && (
        <PomodoroPage onClose={() => setShowPomodoro(false)} />
      )}
      {showReview && (
        <ReviewSession onClose={() => setShowReview(false)} />
      )}
      
      {!showQuestionPage && (
        <div className="dashboard-zoom">
          <Navbar onNotebookClick={handleOpenNotebook} onPedroClick={handleOpenPedro} onPomodoroClick={handleOpenPomodoro} onLogoClick={user.email === 'andreaf.fraschetti@gmail.com' ? () => setShowAdmin(true) : undefined} userName={user.name} onLogout={logout} />
          <Dashboard
            papers={papers}
            selectedPaperIndex={selectedPaperIndex}
            setSelectedPaperIndex={setSelectedPaperIndex}
            onStartQuestions={handleStartQuest}
            onOpenNotebook={handleOpenNotebook}
            onOpenPedro={handleOpenPedro}
            onOpenPomodoro={handleOpenPomodoro}
            onStartReview={() => setShowReview(true)}
          />
          <Footer />
        </div>
      )}

      <button
        className={`calc-fab ${showCalculator ? 'active' : ''}`}
        onClick={() => setShowCalculator(prev => !prev)}
        title="Scientific Calculator"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="10" x2="8" y2="10.01" />
          <line x1="12" y1="10" x2="12" y2="10.01" />
          <line x1="16" y1="10" x2="16" y2="10.01" />
          <line x1="8" y1="14" x2="8" y2="14.01" />
          <line x1="12" y1="14" x2="12" y2="14.01" />
          <line x1="16" y1="14" x2="16" y2="14.01" />
          <line x1="8" y1="18" x2="8" y2="18.01" />
          <line x1="12" y1="18" x2="12" y2="18.01" />
          <line x1="16" y1="18" x2="16" y2="18.01" />
        </svg>
      </button>
      {showCalculator && <Calculator onClose={() => setShowCalculator(false)} />}
      <FeedbackWidget />
    </>
  )
}

export default App
