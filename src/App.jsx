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
    </>
  )
}

export default App
