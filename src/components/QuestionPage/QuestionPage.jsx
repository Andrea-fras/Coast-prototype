import React, { useState, useEffect, useRef } from 'react';
import { X, Check, XCircle, Loader, Sun, Moon, Send } from 'lucide-react';
import './QuestionPage.css';
import SessionSummary from './SessionSummary';
import QuestionIntro from './QuestionIntro';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import katex from 'katex';
import 'katex/dist/katex.min.css';

function renderMathText(text) {
  if (!text) return text;

  const trimmed = text.trim();
  const isPureLatex = /^[\\^_{}\d\s()+\-*/=.,|<>!a-zA-Z]*$/.test(trimmed)
    && /\\[a-zA-Z]+/.test(trimmed)
    && !/\s{2,}\w{4,}\s+\w{4,}/.test(trimmed);

  if (isPureLatex) {
    try {
      const html = katex.renderToString(trimmed, { displayMode: false, throwOnError: true, trust: true });
      return <span dangerouslySetInnerHTML={{ __html: html }} />;
    } catch { /* fall through to mixed rendering */ }
  }

  const mathPattern = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\frac\{[^}]*\}\{[^}]*\}|\\sqrt(?:\[[^\]]*\])?\{[^}]*\}|\\(?:infty|pi|alpha|beta|gamma|delta|sigma|mu|theta|lambda|epsilon|omega|leq|geq|neq|approx|cdot|times|pm|mp|sum|prod|int|partial|nabla|forall|exists|in|notin|subset|cup|cap|log|ln|sin|cos|tan|lim|max|min)\b|[a-zA-Z0-9]+\^?\{[^}]*\})/g;

  const hasInlineMath = mathPattern.test(text);
  if (!hasInlineMath) return text;

  mathPattern.lastIndex = 0;
  const parts = [];
  let lastIdx = 0;
  let match;
  while ((match = mathPattern.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    let expr = match[0].replace(/^\$\$?|\$\$?$/g, '');
    try {
      parts.push(
        <span key={match.index} dangerouslySetInnerHTML={{
          __html: katex.renderToString(expr, { displayMode: false, throwOnError: false, trust: true })
        }} />
      );
    } catch {
      parts.push(match[0]);
    }
    lastIdx = mathPattern.lastIndex;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 0 ? <>{parts}</> : text;
}

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

import { API_URL } from '../../config';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import PedroMessage from '../PedroMessage';
import mascotImg from '../../assets/sessioncompletebird.svg';

const QuestionPage = ({ onClose, paper, skipIntro = false }) => {
  const { token } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [showIntro, setShowIntro] = useState(!skipIntro);
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

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatConvoId, setChatConvoId] = useState(null);
  const chatEndRef = useRef(null);
  const chatConvoIdRef = useRef(null);
  
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatLoading]);

  const sendPedroMessage = async (msg, isAuto = false) => {
    if (!token) return;
    if (!isAuto) {
      setChatMessages(prev => [...prev, { role: 'user', text: msg }]);
    }
    setChatLoading(true);
    setChatMessages(prev => [...prev, { role: 'pedro', text: '' }]);

    try {
      const body = {
        message: msg,
        conversation_id: chatConvoIdRef.current,
        context_type: 'global',
      };
      const res = await fetchWithRetry(`${API_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      let buffer = '';

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
              setChatMessages(prev => {
                const u = [...prev];
                u[u.length - 1] = { role: 'pedro', text: fullText };
                return u;
              });
            }
            if (evt.done && evt.conversation_id && !chatConvoIdRef.current) {
              chatConvoIdRef.current = evt.conversation_id;
              setChatConvoId(evt.conversation_id);
            }
          } catch {}
        }
      }
    } catch {
      setChatMessages(prev => {
        const u = [...prev];
        u[u.length - 1] = { role: 'pedro', text: 'Sorry, I had a brief technical issue. Try asking me again!' };
        return u;
      });
    }
    setChatLoading(false);
  };

  const triggerWrongAnswerExplanation = (question, selectedOpt, correctOpt) => {
    const eqPart = question.equation ? `\nEquation: ${question.equation}` : '';
    const prompt = `The student just answered a past paper question incorrectly. Explain clearly and concisely why the correct answer is right and why their choice was wrong. Be direct and educational.

Question: ${question.text}${eqPart}
Student's answer: ${selectedOpt?.text || 'unknown'}
Correct answer: ${correctOpt?.text || 'unknown'}

Give a clear, concise explanation (3-5 sentences) of the correct approach and where the student likely went wrong.`;

    setChatMessages(prev => [...prev, {
      role: 'system-context',
      text: `Question ${question.number}: ${question.text}`,
    }]);
    setHasNewNotification(true);
    setTimeout(() => setShowChat(true), 1200);
    sendPedroMessage(prompt, true);
  };

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
        isOpenEnded: true,
      }]);
      const eqPart = currentQuestion.equation ? `\nEquation: ${currentQuestion.equation}` : '';
      const prompt = `The student just answered an open-ended question incorrectly. Explain clearly.

Question: ${currentQuestion.text}${eqPart}
Student's answer: ${openEndedAnswer}
Model answer: ${currentQuestion.modelAnswer || 'N/A'}

Explain (3-5 sentences) the correct approach and what the student missed.`;
      setChatMessages(prev => [...prev, {
        role: 'system-context',
        text: `Question ${currentQuestion.number}: ${currentQuestion.text}`,
      }]);
      setHasNewNotification(true);
      sendPedroMessage(prompt, true);
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

      if (!isCorrect) {
        const selectedOption = currentQuestion.options.find(o => o.id === selectedOptionId);
        const correctOption = currentQuestion.options.find(o => o.id === currentQuestion.correctAnswerId);
        setWrongAnswers(prev => [...prev, {
          questionId: currentQuestion.id,
          questionNumber: currentQuestion.number,
          questionText: currentQuestion.text,
          selectedAnswer: selectedOption?.text,
          correctAnswer: correctOption?.text,
          equation: currentQuestion.equation,
        }]);
        triggerWrongAnswerExplanation(currentQuestion, selectedOption, correctOption);
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
            {renderMathText(currentQuestion.text)}
          </p>
          {currentQuestion.equation && (
            <div
              className="equation-block"
              dangerouslySetInnerHTML={{
                __html: (() => {
                  try {
                    return katex.renderToString(currentQuestion.equation, {
                      displayMode: true,
                      throwOnError: false,
                      trust: true,
                    });
                  } catch {
                    return currentQuestion.equation;
                  }
                })(),
              }}
            />
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
                    <span className="option-text">{renderMathText(opt.text)}</span>
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

      {/* Pedro Chat Bubble */}
      {chatMessages.length > 0 && (
        <button
          className={`chat-bubble ${hasNewNotification ? 'has-notification' : ''}`}
          onClick={() => { setShowChat(true); setHasNewNotification(false); }}
        >
          <img src={mascotImg} alt="Pedro" className="chat-bubble-avatar" />
          {hasNewNotification && <span className="notification-dot"></span>}
        </button>
      )}

      {/* Pedro Chat Panel */}
      {showChat && (
        <div className="chat-panel pedro-chat-panel">
          <div className="chat-header">
            <div className="chat-header-left">
              <img src={mascotImg} alt="Pedro" className="chat-header-avatar" />
              <h3>Pedro</h3>
            </div>
            <button className="chat-close" onClick={() => setShowChat(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="chat-messages pedro-chat-messages">
            {chatMessages.map((msg, idx) => {
              if (msg.role === 'system-context') {
                return (
                  <div key={idx} className="pedro-chat-context">
                    {msg.text}
                  </div>
                );
              }
              if (msg.role === 'pedro') {
                return (
                  <div key={idx} className="pedro-chat-msg pedro-msg">
                    <PedroMessage content={msg.text} />
                  </div>
                );
              }
              return (
                <div key={idx} className="pedro-chat-msg user-msg">
                  <p>{msg.text}</p>
                </div>
              );
            })}
            {chatLoading && !chatMessages.length && (
              <div className="pedro-chat-msg pedro-msg">
                <Loader size={16} className="spinning" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form className="pedro-chat-input-bar" onSubmit={(e) => {
            e.preventDefault();
            if (!chatInput.trim() || chatLoading) return;
            sendPedroMessage(chatInput.trim());
            setChatInput('');
          }}>
            <input
              type="text"
              className="pedro-chat-input"
              placeholder="Ask Pedro about this question..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button type="submit" className="pedro-chat-send" disabled={!chatInput.trim() || chatLoading}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default QuestionPage;
