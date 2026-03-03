import React, { useState, useEffect, useRef } from 'react';
import { X, Check, XCircle, MessageCircle, Loader, Sun, Moon } from 'lucide-react';
import './QuestionPage.css';
import SessionSummary from './SessionSummary';
import QuestionIntro from './QuestionIntro';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

// Simple semantic similarity check using keyword matching
const checkSemanticSimilarity = (userAnswer, modelAnswer, keyTerms = []) => {
  if (!userAnswer || userAnswer.trim().length < 10) {
    return { score: 0, feedback: "Please provide a more detailed answer." };
  }
  
  const userLower = userAnswer.toLowerCase();
  const modelLower = modelAnswer.toLowerCase();
  
  // Check for key terms
  let matchedTerms = 0;
  let missingTerms = [];
  
  keyTerms.forEach(term => {
    if (userLower.includes(term.toLowerCase())) {
      matchedTerms++;
    } else {
      missingTerms.push(term);
    }
  });
  
  const keyTermScore = keyTerms.length > 0 ? matchedTerms / keyTerms.length : 0;
  
  // Check word overlap with model answer
  const modelWords = modelLower.split(/\s+/).filter(w => w.length > 3);
  const userWords = userLower.split(/\s+/).filter(w => w.length > 3);
  const overlap = modelWords.filter(w => userWords.includes(w)).length;
  const overlapScore = modelWords.length > 0 ? Math.min(overlap / (modelWords.length * 0.3), 1) : 0;
  
  // Combined score
  const score = (keyTermScore * 0.6 + overlapScore * 0.4);
  
  let feedback = "";
  if (score >= 0.7) {
    feedback = "Excellent! Your answer covers the key concepts well.";
  } else if (score >= 0.5) {
    feedback = "Good effort! Consider also mentioning: " + missingTerms.slice(0, 2).join(", ");
  } else if (score >= 0.3) {
    feedback = "Partial understanding. Key concepts to include: " + missingTerms.slice(0, 3).join(", ");
  } else {
    feedback = "Review the model answer. Focus on these concepts: " + missingTerms.slice(0, 3).join(", ");
  }
  
  return { score, feedback, isCorrect: score >= 0.5 };
};

// Socratic explanations for each question type
const getSocraticExplanation = (questionId, questionText, selectedAnswer, correctAnswer, equation) => {
  const explanations = {
    'q1': [
      "Let's think about this together. You have 2x + 5 = 15.",
      "What operation is being done to x? It's being multiplied by 2, then 5 is added.",
      "To isolate x, we need to undo these operations. Which should we undo first — the multiplication or the addition?",
      "Right! We undo the last operation first. So we subtract 5 from both sides. What do we get?",
      "2x = 10. Now, what's left to do to find x?",
      "Divide both sides by 2. So x = 5. Does that make sense when you plug it back in?"
    ],
    'q2': [
      "Think about what a derivative represents — it's the rate of change.",
      "For x², imagine a square growing. If the side length increases, how fast does the area grow?",
      "The power rule says: bring the exponent down and reduce it by 1.",
      "So for x², we bring down the 2, making it 2x^(2-1) = 2x¹ = 2x.",
      "Why do you think your answer was different? What step might have been missed?"
    ],
    'q3': [
      "The area of a circle uses the formula A = πr². What does r represent?",
      "Right, the radius. Here r = 3. So what's r²?",
      "3² = 9. And then we multiply by π.",
      "So A = 9π. A common mistake is confusing this with the circumference formula (2πr). Which formula uses r² versus just r?"
    ],
    'q4': [
      "Percentages can be tricky. '15% of 200' means 15/100 × 200.",
      "Another way to think about it: 10% of 200 is easy — it's 20. What's 5% of 200?",
      "5% is half of 10%, so it's 10. Add them: 20 + 10 = 30.",
      "This 'chunking' method makes percentages much easier. Does this approach make sense?"
    ],
    'q5': [
      "When we have y = 3x - 2 and x = 4, we substitute.",
      "Replace x with 4: y = 3(4) - 2.",
      "What's 3 times 4? And then what happens when you subtract 2?",
      "12 - 2 = 10. The key is doing operations in the right order. Multiply first, then subtract."
    ],
    'q6': [
      "Look at the shape carefully. How many sides does it have?",
      "Are all sides equal? Are the angles all the same?",
      "What's the defining characteristic that makes a square different from a rectangle?"
    ],
    'q7': [
      "Market equilibrium is where supply equals demand. D(P) = S(P).",
      "We have 90 - √P = 2√P. Notice √P appears on both sides.",
      "If we add √P to both sides, what do we get on the right?",
      "90 = 3√P. Now, to find √P, we divide by 3. What's 90 ÷ 3?",
      "√P = 30. To find P, we need to square both sides. What's 30²?",
      "P = 900. The trick was treating √P as a single variable to solve for."
    ]
  };

  return explanations[questionId] || [
    `Let's review this question together.`,
    `You selected "${selectedAnswer}", but the correct answer was "${correctAnswer}".`,
    `What do you think might have led to this confusion?`,
    `Try working through the problem step by step. What's the first thing you notice?`
  ];
};

const API_URL = 'http://localhost:8000';

const QuestionPage = ({ onClose, paper }) => {
  const { token } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // State - ALL HOOKS MUST BE AT THE TOP, BEFORE ANY RETURNS
  const [showIntro, setShowIntro] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState({}); 
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [openEndedAnswer, setOpenEndedAnswer] = useState('');
  const [openEndedFeedback, setOpenEndedFeedback] = useState(null);
  const [isSessionComplete, setIsSessionComplete] = useState(false);
  const [feedbackState, setFeedbackState] = useState(null);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [claimedReward, setClaimedReward] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState([]);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const sessionReportedRef = useRef(false);
  const [backendSessionId, setBackendSessionId] = useState(null);
  
  const questions = paper?.questions || [];
  const totalQuestions = questions?.length || 0;

  // Report session completion to backend (for streak tracking + skill profile)
  useEffect(() => {
    if (!isSessionComplete || sessionReportedRef.current || !token) return;
    sessionReportedRef.current = true;

    const correct = Object.values(userAnswers).filter(a => a.isCorrect).length;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ paper_id: paper?.id || 'unknown', paper_title: paper?.title || '', batch_number: 1 }),
    })
      .then(res => res.json())
      .then(async (data) => {
        if (!data.session_id) return;
        setBackendSessionId(data.session_id);
        const sid = data.session_id;

        // Submit individual answers so the skill profile can extract topics
        const answerPromises = Object.entries(userAnswers).map(([qId, ans]) => {
          const question = questions.find(q => q.id === qId);
          if (!question) return Promise.resolve();

          let userAns = '';
          let correctAns = '';

          if (question.type === 'open-ended') {
            userAns = ans.openEndedText || '';
            correctAns = question.modelAnswer || '';
          } else {
            const selOpt = question.options?.find(o => o.id === ans.selected);
            const corOpt = question.options?.find(o => o.id === question.correctAnswerId);
            userAns = selOpt?.text || ans.selected || '';
            correctAns = corOpt?.text || '';
          }

          return fetch(`${API_URL}/api/sessions/${sid}/answer`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              question_id: qId,
              question_text: question.text || '',
              user_answer: userAns,
              correct_answer: correctAns,
              is_correct: !!ans.isCorrect,
              time_spent_ms: 0,
            }),
          }).catch(() => {});
        });

        await Promise.all(answerPromises);

        // Now complete the session (triggers skill profile update)
        return fetch(`${API_URL}/api/sessions/${sid}/complete`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ score: correct, total: totalQuestions }),
        });
      })
      .catch(() => {});
  }, [isSessionComplete]);
  const currentQuestion = questions ? questions[currentQuestionIndex] : null;
  // Calculate if all questions are answered (to show summary option)
  const allQuestionsAnswered = Object.keys(userAnswers).length === totalQuestions;

  const answeredCount = Object.keys(userAnswers).length;
  const correctCount = Object.values(userAnswers).filter(a => a.isCorrect).length;
  const isPerfectRun = correctCount === totalQuestions && isSessionComplete;

  // Reset selection when changing questions - MUST BE BEFORE ANY RETURNS
  useEffect(() => {
    if (currentQuestion && userAnswers[currentQuestion.id]) {
      setSelectedOptionId(userAnswers[currentQuestion.id].selected);
      setOpenEndedAnswer(userAnswers[currentQuestion.id].openEndedText || '');
      setOpenEndedFeedback(userAnswers[currentQuestion.id].openEndedFeedback || null);
    } else {
      setSelectedOptionId(null);
      setOpenEndedAnswer('');
      setOpenEndedFeedback(null);
    }
  }, [currentQuestionIndex, currentQuestion?.id, userAnswers]);

  // Show intro screen first
  if (showIntro) {
    return (
      <QuestionIntro 
        onClose={onClose}
        onStartQuestions={() => setShowIntro(false)}
        paper={paper}
      />
    );
  }

  if (!currentQuestion && !isSessionComplete) {
     return <div className={`question-page${theme === 'dark' ? ' dark' : ''}`}>Loading...</div>;
  }

  const handleOptionSelect = (optionId) => {
    if (userAnswers[currentQuestion.id]) return; // Locked if already answered
    setSelectedOptionId(optionId);
  };

  const applyOpenEndedResult = (result) => {
    setOpenEndedFeedback(result);
    setFeedbackState(result.isCorrect ? 'correct' : 'incorrect');

    const newUserAnswers = {
      ...userAnswers,
      [currentQuestion.id]: {
        openEndedText: openEndedAnswer,
        openEndedFeedback: result,
        isCorrect: result.isCorrect
      }
    };
    setUserAnswers(newUserAnswers);

    if (!result.isCorrect) {
      setWrongAnswers(prev => [...prev, {
        questionId: currentQuestion.id,
        questionNumber: currentQuestion.number,
        questionText: currentQuestion.text,
        selectedAnswer: openEndedAnswer,
        correctAnswer: currentQuestion.modelAnswer,
        equation: currentQuestion.equation,
        isOpenEnded: true
      }]);
      setHasNewNotification(true);
    }

    if (Object.keys(newUserAnswers).length === totalQuestions) {
      setTimeout(() => {
        setFeedbackState(null);
        setIsSessionComplete(true);
      }, 2500);
    } else if (currentQuestionIndex < questions.length - 1) {
      setTimeout(() => {
        setFeedbackState(null);
        setCurrentQuestionIndex(prev => prev + 1);
      }, 2500);
    }
  };

  const handleCheck = async () => {
    const isOpenEnded = currentQuestion.type === 'open-ended';
    
    if (isOpenEnded) {
      if (!openEndedAnswer.trim()) return;
      setIsEvaluating(true);

      try {
        const body = {
          question_text: currentQuestion.text,
          student_answer: openEndedAnswer,
          model_answer: currentQuestion.modelAnswer || null,
          key_terms: currentQuestion.keyTerms || null,
          mark_scheme: currentQuestion.markScheme || null,
          total_marks: currentQuestion.totalMarks || null,
        };

        const res = await fetch(`${API_URL}/api/evaluate-answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) throw new Error('API error');
        const data = await res.json();

        const result = {
          mode: data.mode,
          score: data.score,
          isCorrect: data.is_correct,
          feedback: data.feedback,
          marksAwarded: data.marks_awarded,
          totalMarks: data.total_marks,
          pointsHit: data.points_hit || [],
          pointsMissed: data.points_missed || [],
          matchedTerms: data.matched_terms || [],
          missingTerms: data.missing_terms || [],
        };

        setIsEvaluating(false);
        applyOpenEndedResult(result);
      } catch {
        setIsEvaluating(false);
        const fallback = checkSemanticSimilarity(
          openEndedAnswer,
          currentQuestion.modelAnswer,
          currentQuestion.keyTerms || []
        );
        applyOpenEndedResult(fallback);
      }
    } else {
      // Handle multiple-choice question
      if (!selectedOptionId) return;

      const isCorrect = selectedOptionId === currentQuestion.correctAnswerId;
      
      // Show feedback
      setFeedbackState(isCorrect ? 'correct' : 'incorrect');
      
      const newUserAnswers = {
        ...userAnswers,
        [currentQuestion.id]: {
          selected: selectedOptionId,
          isCorrect
        }
      };
      setUserAnswers(newUserAnswers);

      // If wrong, add to wrongAnswers for chat
      if (!isCorrect) {
        const selectedOption = currentQuestion.options.find(o => o.id === selectedOptionId);
        const correctOption = currentQuestion.options.find(o => o.id === currentQuestion.correctAnswerId);
        setWrongAnswers(prev => [...prev, {
          questionId: currentQuestion.id,
          questionNumber: currentQuestion.number,
          questionText: currentQuestion.text,
          selectedAnswer: selectedOption?.text,
          correctAnswer: correctOption?.text,
          equation: currentQuestion.equation
        }]);
        setHasNewNotification(true);
      }

      // Check if session is complete (all questions answered)
      if (Object.keys(newUserAnswers).length === totalQuestions) {
        setTimeout(() => {
          setFeedbackState(null);
          setIsSessionComplete(true);
        }, 1500);
      } else if (currentQuestionIndex < questions.length - 1) {
        setTimeout(() => {
          setFeedbackState(null);
          setCurrentQuestionIndex(prev => prev + 1);
        }, 1500); 
      }
    }
  };

  const jumpToQuestion = (index) => {
    // If session is complete, allow viewing any question? Usually yes.
    if (isSessionComplete) {
      // If we go back to a question, we exit the summary view temporarily? 
      // Or maybe the summary view is a separate "page" index?
      // For now, let's say clicking a progress bar item GOES BACK to that question.
      setIsSessionComplete(false); 
      setCurrentQuestionIndex(index);
      return;
    }

    let firstUnanswered = 0;
    for (let i = 0; i < questions.length; i++) {
      if (!userAnswers[questions[i].id]) {
        firstUnanswered = i;
        break;
      }
      if (i === questions.length - 1) firstUnanswered = questions.length;
    }

    if (index <= firstUnanswered) {
      setCurrentQuestionIndex(index);
    }
  };

  // Render Summary if complete
  if (isSessionComplete) {
    const stats = {
      totalQuestions,
      accuracy: Math.round((correctCount / totalQuestions) * 100),
      time: "0:04", // Mocked
      bait: "RARE" // Mocked
    };

    return (
      <div className={`question-page${theme === 'dark' ? ' dark' : ''}`}>
        <header className="qp-header">
          <button className="close-btn" onClick={onClose}>
            <X size={32} />
          </button>
          
          <div className={`progress-bar-container ${isPerfectRun ? 'perfect-run' : ''}`}>
            {questions.map((q, idx) => (
              <div 
                key={q.id} 
                className={`progress-segment ${userAnswers[q.id]?.isCorrect ? 'correct' : 'incorrect'}`}
                onClick={() => jumpToQuestion(idx)}
              />
            ))}
            {allQuestionsAnswered && (
            <>
              <div className="progress-divider"></div>
              <div 
                className={`progress-segment summary ${isSessionComplete ? 'current' : ''}`}
                onClick={() => setIsSessionComplete(true)}
                title="View Summary"
              >
              </div>
            </>
          )}
          </div>
        </header>

        <div className="qp-content">
          <SessionSummary 
            stats={stats} 
            isPerfectRun={isPerfectRun}
            rewardClaimed={rewardClaimed}
            claimedReward={claimedReward}
            onRewardClaimed={(reward) => {
              setRewardClaimed(true);
              setClaimedReward(reward);
            }}
            wrongAnswers={wrongAnswers}
            showChat={showChat}
            setShowChat={setShowChat}
            hasNewNotification={hasNewNotification}
            setHasNewNotification={setHasNewNotification}
            sessionId={backendSessionId}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`question-page${theme === 'dark' ? ' dark' : ''}`}>
      <header className="qp-header">
        <button className="close-btn" onClick={onClose}>
          <X size={32} />
        </button>
        
        <button className="qp-theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="progress-bar-container">
          {questions.map((q, idx) => {
            const answer = userAnswers[q.id];
            let statusClass = '';
            
            let maxReached = 0;
            questions.forEach((_, i) => {
               if (userAnswers[questions[i]?.id]) maxReached = i + 1; 
            });

            if (idx === maxReached) {
               statusClass = 'current'; 
            } else if (answer) {
               statusClass = answer.isCorrect ? 'correct' : 'incorrect';
            } else {
               statusClass = 'locked';
            }

            const isViewing = idx === currentQuestionIndex;
            
            return (
              <div 
                key={q.id} 
                className={`progress-segment ${statusClass} ${isViewing ? 'viewing-answered' : ''}`}
                onClick={() => jumpToQuestion(idx)}
              />
            );
          })}
          
          {/* Summary Segment - Only if all answered */}
          {allQuestionsAnswered && (
            <>
              <div className="progress-divider"></div>
              <div 
                className={`progress-segment summary ${isSessionComplete ? 'current' : ''}`}
                onClick={() => setIsSessionComplete(true)}
                title="View Summary"
              >
              </div>
            </>
          )}
        </div>
      </header>

      <div className="qp-content">
        {/* Left Panel: Question */}
        <div className="qp-panel question-panel">
          <span className="question-number">Question {currentQuestion.number}</span>
          <h2 className="question-title">Question {currentQuestion.number}</h2>
          <p className="question-text">
            {currentQuestion.text}
          </p>
          {currentQuestion.equation && (
            <div className="equation-block">
              {currentQuestion.equation}
            </div>
          )}
        </div>

        {/* Right Panel: Answer */}
        <div className="qp-panel answer-panel">
          {currentQuestion.type === 'open-ended' ? (
            /* Open-ended question UI */
            <div className="open-ended-container">
              <label className="open-ended-label">Your Answer:</label>
              <textarea
                className={`open-ended-input ${feedbackState ? 'submitted' : ''}`}
                placeholder="Type your answer here..."
                value={openEndedAnswer}
                onChange={(e) => setOpenEndedAnswer(e.target.value)}
                disabled={!!userAnswers[currentQuestion.id]}
                rows={6}
              />
              
              {isEvaluating && (
                <div className="open-ended-feedback evaluating">
                  <div className="evaluating-indicator">
                    <Loader size={18} className="spinning" />
                    <span>Evaluating your answer...</span>
                  </div>
                </div>
              )}

              {openEndedFeedback && (
                <div className={`open-ended-feedback ${openEndedFeedback.isCorrect ? 'correct' : 'needs-work'}`}>
                  <div className="feedback-score-row">
                    {openEndedFeedback.mode === 'mark_scheme' ? (
                      <span className="feedback-marks">
                        {openEndedFeedback.marksAwarded}/{openEndedFeedback.totalMarks} marks
                      </span>
                    ) : (
                      <span className="feedback-marks">
                        {Math.round(openEndedFeedback.score * 100)}%
                      </span>
                    )}
                    <span className={`feedback-badge ${openEndedFeedback.isCorrect ? 'pass' : 'fail'}`}>
                      {openEndedFeedback.isCorrect ? 'Good' : 'Needs work'}
                    </span>
                  </div>

                  <p className="feedback-text">{openEndedFeedback.feedback}</p>

                  {openEndedFeedback.pointsHit?.length > 0 && (
                    <div className="feedback-points">
                      {openEndedFeedback.pointsHit.map((pt, i) => (
                        <div key={`hit-${i}`} className="feedback-point hit">
                          <Check size={14} />
                          <span>{pt}</span>
                        </div>
                      ))}
                      {openEndedFeedback.pointsMissed?.map((pt, i) => (
                        <div key={`miss-${i}`} className="feedback-point missed">
                          <XCircle size={14} />
                          <span>{pt}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {openEndedFeedback.missingTerms?.length > 0 && (
                    <div className="feedback-terms">
                      <span className="feedback-terms-label">Missing concepts:</span>
                      <span className="feedback-terms-list">{openEndedFeedback.missingTerms.join(', ')}</span>
                    </div>
                  )}

                  {!openEndedFeedback.isCorrect && currentQuestion.modelAnswer && (
                    <div className="model-answer-section">
                      <span className="model-answer-label">Model Answer:</span>
                      <p className="model-answer-text">{currentQuestion.modelAnswer}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* Multiple-choice question UI */
            <div className="options-list">
              {currentQuestion.options?.map(opt => {
                const isSelected = selectedOptionId === opt.id;
                const isCorrectAnswer = opt.id === currentQuestion.correctAnswerId;
                const showCorrectHighlight = feedbackState === 'incorrect' && isCorrectAnswer;
                const showIncorrectShake = feedbackState === 'incorrect' && isSelected;
                const showCorrectGlow = feedbackState === 'correct' && isSelected;
                
                return (
                  <div 
                    key={opt.id} 
                    className={`option-item 
                      ${isSelected ? 'selected' : ''} 
                      ${showCorrectGlow ? 'correct-feedback' : ''}
                      ${showIncorrectShake ? 'incorrect-feedback' : ''}
                      ${showCorrectHighlight ? 'correct-highlight' : ''}
                    `}
                    onClick={() => handleOptionSelect(opt.id)}
                  >
                    <div className="option-circle">
                      {showCorrectGlow && <Check size={14} color="#fff" />}
                      {showIncorrectShake && <XCircle size={14} color="#fff" />}
                      {showCorrectHighlight && <Check size={14} color="#fff" />}
                    </div>
                    <span className="option-text">{opt.text}</span>
                  </div>
                );
              })}
            </div>
          )}
          
          <button 
            className="check-btn" 
            onClick={handleCheck}
            disabled={
              isEvaluating ||
              (currentQuestion.type === 'open-ended' 
                ? (!openEndedAnswer.trim() || !!userAnswers[currentQuestion.id])
                : (!selectedOptionId || !!userAnswers[currentQuestion.id]))
            }
          >
            {isEvaluating ? (
              <>
                <Loader size={16} className="spinning" />
                <span>Checking...</span>
              </>
            ) : (
              'CHECK'
            )}
          </button>
        </div>
      </div>

      {/* Chat Bubble */}
      {wrongAnswers.length > 0 && (
        <button 
          className={`chat-bubble ${hasNewNotification ? 'has-notification' : ''}`}
          onClick={() => {
            setShowChat(true);
            setHasNewNotification(false);
          }}
        >
          <MessageCircle size={24} />
          {hasNewNotification && <span className="notification-dot"></span>}
        </button>
      )}

      {/* Chat Panel */}
      {showChat && (
        <div className="chat-panel">
          <div className="chat-header">
            <h3>Let's Review Together</h3>
            <button className="chat-close" onClick={() => setShowChat(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="chat-messages">
            {wrongAnswers.map((wrong, idx) => (
              <div key={wrong.questionId} className="chat-question-block">
                <div className="chat-question-header">
                  <span className="chat-q-number">Question {wrong.questionNumber}</span>
                  <span className="chat-q-text">{wrong.questionText}</span>
                </div>
                <div className="chat-your-answer">
                  You answered: <span className="wrong">{wrong.selectedAnswer}</span>
                </div>
                <div className="chat-correct-answer">
                  Correct answer: <span className="correct">{wrong.correctAnswer}</span>
                </div>
                <div className="socratic-messages">
                  {getSocraticExplanation(
                    wrong.questionId, 
                    wrong.questionText, 
                    wrong.selectedAnswer, 
                    wrong.correctAnswer,
                    wrong.equation
                  ).map((msg, msgIdx) => (
                    <div key={msgIdx} className="tutor-message">
                      {msg}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionPage;
