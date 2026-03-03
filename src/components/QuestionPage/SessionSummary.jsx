import React, { useState, useMemo, useRef, useEffect } from 'react';
import Lottie from 'lottie-react';
import { Minimize2, MessageCircle, X, Send } from 'lucide-react';
import './SessionSummary.css';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import sessionCompleteBird from '../../assets/sessioncompletebird.svg';
import skyBg from '../../assets/gamebg.svg';
import skyBgExpanded from '../../assets/gamebg-expanded.svg';
import skyBgDark from '../../assets/gamebg-dark.svg';
import skyBgExpandedDark from '../../assets/gamebg-expanded-dark.svg';
import fishCommon from '../../assets/fish-common.svg';
import fishRare from '../../assets/fish-rare.svg';
import fishLegendary from '../../assets/fish-legendary.svg';
import fishingAnimation from '../../assets/lottie-react.json';

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

// Generate personalized recommendations based on performance
const generateRecommendations = (wrongAnswers, stats) => {
  const topicMap = {
    'q1': { topic: 'Linear Equations', chapter: 'Chapter 2: Solving Linear Equations', exercises: 'Practice problems 2.1-2.15 focusing on two-step equations' },
    'q2': { topic: 'Derivatives', chapter: 'Chapter 5: Introduction to Calculus', exercises: 'Power Rule exercises 5.3-5.12, especially polynomial derivatives' },
    'q3': { topic: 'Circle Geometry', chapter: 'Chapter 3: Area and Circumference', exercises: 'Circle problems 3.8-3.20, focus on distinguishing area vs. circumference formulas' },
    'q4': { topic: 'Percentages', chapter: 'Chapter 1: Arithmetic Fundamentals', exercises: 'Percentage word problems 1.25-1.40, try the "chunking" method' },
    'q5': { topic: 'Function Substitution', chapter: 'Chapter 4: Functions and Expressions', exercises: 'Substitution drills 4.5-4.18, order of operations practice' },
    'q6': { topic: 'Shape Recognition', chapter: 'Chapter 3: Geometry Basics', exercises: 'Shape identification quiz 3.1-3.7, properties of quadrilaterals' },
    'q7': { topic: 'Market Equilibrium', chapter: 'Chapter 8: Economic Applications', exercises: 'Supply-demand problems 8.12-8.25, solving equations with radicals' }
  };

  const recommendations = [];
  const weakTopics = [];

  // Analyze wrong answers to find weak areas
  wrongAnswers.forEach(wrong => {
    const mapping = topicMap[wrong.questionId];
    if (mapping && !weakTopics.includes(mapping.topic)) {
      weakTopics.push(mapping.topic);
      recommendations.push({
        type: 'chapter',
        topic: mapping.topic,
        chapter: mapping.chapter,
        exercises: mapping.exercises
      });
    }
  });

  // Add overall performance-based recommendations
  const accuracy = stats.accuracy;
  let overallAdvice = '';
  
  if (accuracy >= 80) {
    overallAdvice = "Great work! You're showing strong understanding. Focus on the few areas where you slipped up to achieve mastery.";
  } else if (accuracy >= 60) {
    overallAdvice = "Good progress! You've got a solid foundation. Dedicate focused practice to your weak areas before moving on.";
  } else if (accuracy >= 40) {
    overallAdvice = "You're building understanding, but some core concepts need reinforcement. Consider reviewing the fundamentals before tackling more complex problems.";
  } else {
    overallAdvice = "Let's slow down and build a stronger foundation. Review the recommended chapters carefully and work through the exercises step by step.";
  }

  return { recommendations, overallAdvice, weakTopics };
};

const API_URL = 'http://localhost:8000';

const SessionSummary = ({ 
  stats, 
  isPerfectRun, 
  rewardClaimed, 
  claimedReward, 
  onRewardClaimed,
  wrongAnswers = [],
  showChat,
  setShowChat,
  hasNewNotification,
  setHasNewNotification,
  sessionId,
}) => {
  const { token } = useAuth();
  const { theme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [reelCount, setReelCount] = useState(0);
  const [showReward, setShowReward] = useState(rewardClaimed || false);
  const [isReeling, setIsReeling] = useState(false);
  const [rewardData, setRewardData] = useState(claimedReward || null);
  const [fishCaught, setFishCaught] = useState(rewardClaimed || false);
  const [isShaking, setIsShaking] = useState(false);
  const lottieRef = useRef(null);
  const idleIntervalRef = useRef(null);
  const hasShownConfetti = useRef(rewardClaimed || false);

  // Interactive chat with Pedro
  const [pedroMessages, setPedroMessages] = useState([]);
  const [pedroInput, setPedroInput] = useState('');
  const [isPedroLoading, setIsPedroLoading] = useState(false);
  const [pedroConvoId, setPedroConvoId] = useState(null);
  const pedroChatEndRef = useRef(null);

  // Play animation once (for reel clicks)
  const playAnimationOnce = () => {
    if (lottieRef.current) {
      lottieRef.current.goToAndPlay(0);
    }
  };

  // Idle animation loop with 5 second interval (only if reward not claimed)
  useEffect(() => {
    if (!isExpanded && !fishCaught && !rewardClaimed) {
      // Play immediately on mount
      if (lottieRef.current) {
        lottieRef.current.goToAndPlay(0);
      }
      
      // Set up interval to play every 5 seconds
      idleIntervalRef.current = setInterval(() => {
        if (lottieRef.current) {
          lottieRef.current.goToAndPlay(0);
        }
      }, 5000);
    }

    return () => {
      if (idleIntervalRef.current) {
        clearInterval(idleIntervalRef.current);
      }
    };
  }, [isExpanded, fishCaught, rewardClaimed]);

  // Generate confetti pieces on mount
  const confettiPieces = useMemo(() => {
    const colors = ['#FFB503', '#FF7B02', '#4FA3D1', '#2ECC71', '#E74C3C', '#9B59B6', '#F1C40F'];
    return Array.from({ length: 50 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 8 + Math.random() * 8,
    }));
  }, []);

  // Scroll Pedro chat
  useEffect(() => {
    pedroChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [pedroMessages, isPedroLoading]);

  // Generate recommendations based on performance
  const { recommendations, overallAdvice, weakTopics } = useMemo(() => {
    return generateRecommendations(wrongAnswers, stats);
  }, [wrongAnswers, stats]);

  const handlePedroSend = async () => {
    if (!pedroInput.trim() || isPedroLoading || !token) return;

    const userMsg = pedroInput.trim();
    setPedroMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setPedroInput('');
    setIsPedroLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMsg,
          conversation_id: pedroConvoId,
          context_type: 'session',
          context_id: sessionId ? String(sessionId) : null,
        }),
      });

      if (!res.ok) throw new Error('Failed');

      const data = await res.json();
      if (data.conversation_id && !pedroConvoId) {
        setPedroConvoId(data.conversation_id);
      }
      setPedroMessages(prev => [...prev, { role: 'pedro', text: data.reply }]);
    } catch {
      setPedroMessages(prev => [...prev, {
        role: 'pedro',
        text: "Sorry, I couldn't connect. Try again in a moment."
      }]);
    } finally {
      setIsPedroLoading(false);
    }
  };

  const handlePedroKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePedroSend();
    }
  };

  const handleRewardClick = (e) => {
    // Don't trigger if clicking minimize button
    if (e.target.closest('.minimize-btn')) return;
    
    if (!isExpanded) {
      setIsExpanded(true);
      // When first expanding, stop the idle loop
      if (lottieRef.current) {
        lottieRef.current.stop();
      }
    } else if (!showReward && !fishCaught) {
      // Play animation once on each click (prevent clicks after fish caught)
      playAnimationOnce();
      
      // Trigger reel animation and shake
      setIsReeling(true);
      setIsShaking(true);
      setTimeout(() => setIsReeling(false), 300);
      setTimeout(() => setIsShaking(false), 200);

      const nextCount = reelCount + 1;
      setReelCount(nextCount);
      
      if (nextCount >= 5) {
        determineReward();
        setFishCaught(true);
        // Animation will stop naturally since loop is false
        setTimeout(() => setShowReward(true), 2000); // Give animation time to complete
      }
    }
  };

  const handleMinimize = (e) => {
    e.stopPropagation();
    setIsExpanded(false);
    // Resume looping animation when minimized
    if (lottieRef.current && !fishCaught) {
      lottieRef.current.play();
    }
  };

  const determineReward = () => {
    const rand = Math.random();
    let type = 'common';
    if (rand > 0.9) type = 'legendary';
    else if (rand > 0.6) type = 'rare';

    const rewards = {
      common: { name: 'Small Fry', color: '#B0BEC5', glowColor: 'rgba(176, 190, 197, 0.5)', fishSvg: fishCommon },
      rare: { name: 'Golden Carp', color: '#FFC107', glowColor: 'rgba(255, 193, 7, 0.6)', fishSvg: fishRare },
      legendary: { name: 'Abyssal Glow', color: '#9C27B0', glowColor: 'rgba(156, 39, 176, 0.7)', fishSvg: fishLegendary }
    };
    const reward = rewards[type];
    setRewardData(reward);
    
    // Notify parent to persist the reward
    if (onRewardClaimed) {
      onRewardClaimed(reward);
    }
  };

  const getReelFeedback = () => {
    if (reelCount === 0) return "Tap to Reel";
    if (reelCount === 1) return "Something's there!";
    if (reelCount === 2) return "It's fighting!";
    if (reelCount === 3) return "Reel it in!";
    if (reelCount === 4) return "ONE MORE!";
    return "";
  };

  return (
    <div className={`session-summary ${isExpanded ? 'reward-active' : ''}`}>
      {/* Confetti - only show if reward hasn't been claimed yet */}
      {!rewardClaimed && (
        <div className="confetti-container">
          {confettiPieces.map((piece) => (
            <div
              key={piece.id}
              className="confetti"
              style={{
                left: `${piece.left}%`,
                width: `${piece.size}px`,
                height: `${piece.size}px`,
                backgroundColor: piece.color,
                animationDelay: `${piece.delay}s`,
                animationDuration: `${piece.duration}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* Left Panel: Stats */}
      <div className="summary-left-panel">
        <div>
          <h2 className="summary-title">Session Complete!</h2>
          <p className="summary-subtitle">Questions Answered: {stats.totalQuestions}</p>
        </div>

        <img src={sessionCompleteBird} alt="Mascot" className="bird-mascot" />

        <div className="stats-grid">
          <div className="stat-card orange">
            <div className="stat-label">Accuracy</div>
            <div className="stat-value">{stats.accuracy}%</div>
          </div>
          <div className="stat-card orange">
            <div className="stat-label">Time</div>
            <div className="stat-value">{stats.time}</div>
          </div>
          <div className="stat-card orange">
            <div className="stat-label">Bait</div>
            <div className="stat-value">RARE</div>
          </div>
        </div>

        <div className="xp-container">
          <div className="xp-row">
            <span className="xp-gained">+{Math.round(stats.accuracy / 5)} XP</span>
            <span className="xp-level">LVL.{Math.max(1, Math.floor(stats.accuracy / 8))}</span>
          </div>
          <div className="xp-bar-bg">
            <div className="xp-bar-fill" style={{ width: `${Math.min(stats.accuracy, 100)}%` }}></div>
          </div>
        </div>
      </div>

      {/* Right Panel: Reward */}
      <div 
        className={`summary-right-panel ${isExpanded ? 'expanded' : ''} ${showReward ? 'reward-shown' : ''}`}
        onClick={handleRewardClick}
      >
        {/* Minimize button - show when expanded OR when reward is shown */}
        {(isExpanded || showReward) && (
          <button className="minimize-btn" onClick={handleMinimize}>
            <Minimize2 size={24} />
          </button>
        )}

        {/* Scene Container - hidden when reward is revealed */}
        {!showReward && (
          <div 
            className={`scene-container ${isReeling ? 'reeling' : ''} ${isShaking ? 'shake' : ''}`}
            data-intensity={reelCount}
          >
            <img src={isExpanded ? (theme === 'dark' ? skyBgExpandedDark : skyBgExpanded) : (theme === 'dark' ? skyBgExpandedDark : skyBgExpanded)} className="sky-background" alt="" />
            <div className="glow-overlay"></div>
            
            <div className={`boat-wrapper ${isReeling ? 'reeling-anim' : ''} ${fishCaught ? 'fish-caught' : ''}`}>
              <Lottie
                lottieRef={lottieRef}
                animationData={fishingAnimation}
                loop={false}
                autoplay={false}
                className="fishing-lottie"
                renderer="svg"
              />
            </div>
            
            <div className="splash"></div>
            
            <div className="ocean">
              <div className="wave wave1"></div>
              <div className="wave wave2"></div>
              <div className="wave wave3"></div>
            </div>
          </div>
        )}

        {/* UI Overlay */}
        {showReward ? (
          <div className="reward-screen">
            <div className="reward-badge">{rewardData?.name === 'Abyssal Glow' ? 'LEGENDARY' : rewardData?.name === 'Golden Carp' ? 'RARE' : 'COMMON'}</div>
            <div className="reward-fish-ring" style={{ '--glow-color': rewardData?.glowColor || 'rgba(255,255,255,0.3)' }}>
              <img src={rewardData?.fishSvg} className="reward-fish-img" alt={rewardData?.name} />
            </div>
            <h2 className="reward-fish-name" style={{ color: rewardData?.color }}>{rewardData?.name}</h2>
            <p className="reward-subtitle">Added to your collection</p>
          </div>
        ) : (
          <div className="ui-overlay">
            <h2 className="reward-title">CLAIM YOUR<br/>REWARD</h2>
            
            <div style={{ flex: 1 }}></div> 

            <div className={`tap-text ${reelCount > 0 ? 'active' : ''}`}>
              {getReelFeedback()}
            </div>
            
            <div className="reward-circles">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`circle ${i < reelCount ? 'filled' : ''}`}></div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat Bubble - show if there are wrong answers OR recommendations */}
      {(wrongAnswers.length > 0 || recommendations.length > 0) && (
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
        <div className="chat-panel session-chat">
          <div className="chat-header">
            <h3>Your Study Guide</h3>
            <button className="chat-close" onClick={() => setShowChat(false)}>
              <X size={20} />
            </button>
          </div>
          <div className="chat-messages">
            {/* Session Complete Recommendations - Show first */}
            <div className="chat-recommendation-block">
              <div className="recommendation-header">
                <span className="rec-icon">📊</span>
                <span className="rec-title">Session Analysis</span>
              </div>
              <div className="recommendation-stats">
                <div className="rec-stat">
                  <span className="rec-stat-label">Accuracy</span>
                  <span className={`rec-stat-value ${stats.accuracy >= 70 ? 'good' : stats.accuracy >= 50 ? 'medium' : 'needs-work'}`}>
                    {stats.accuracy}%
                  </span>
                </div>
                <div className="rec-stat">
                  <span className="rec-stat-label">Wrong Answers</span>
                  <span className="rec-stat-value">{wrongAnswers.length}</span>
                </div>
              </div>
              <p className="overall-advice">{overallAdvice}</p>
            </div>

            {/* Study Recommendations */}
            {recommendations.length > 0 && (
              <div className="chat-recommendation-block study-plan">
                <div className="recommendation-header">
                  <span className="rec-icon">📚</span>
                  <span className="rec-title">Recommended Study</span>
                </div>
                <p className="rec-intro">Based on your performance, focus on these areas:</p>
                
                {recommendations.map((rec, idx) => (
                  <div key={idx} className="study-recommendation">
                    <div className="study-topic">
                      <span className="topic-badge">{rec.topic}</span>
                    </div>
                    <div className="study-chapter">
                      <span className="chapter-icon">📖</span>
                      <span>Read: <strong>{rec.chapter}</strong></span>
                    </div>
                    <div className="study-exercises">
                      <span className="exercise-icon">✏️</span>
                      <span>{rec.exercises}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Long-term Learning Note */}
            <div className="chat-recommendation-block learning-model">
              <div className="recommendation-header">
                <span className="rec-icon">🎯</span>
                <span className="rec-title">Your Learning Journey</span>
              </div>
              <p className="learning-note">
                {weakTopics.length > 0 ? (
                  <>
                    We've noticed <strong>{weakTopics.join(', ')}</strong> {weakTopics.length === 1 ? 'is' : 'are'} areas where you could use more practice. 
                    These concepts build on each other — mastering them now will make advanced topics much easier.
                  </>
                ) : (
                  <>
                    Excellent work this session! Keep up the consistent practice. 
                    Consider challenging yourself with more advanced problems in your strongest areas.
                  </>
                )}
              </p>
              <p className="learning-tip">
                <strong>Pro tip:</strong> Revisit these topics again in 2-3 days. 
                Spaced repetition helps move concepts from short-term to long-term memory.
              </p>
            </div>

            {/* Previous Wrong Answers */}
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

            {/* Interactive Pedro Messages */}
            {pedroMessages.map((msg, idx) => (
              <div key={`pedro-${idx}`} className={`session-pedro-msg ${msg.role}`}>
                {msg.role === 'pedro' && (
                  <img src={sessionCompleteBird} alt="" className="session-pedro-avatar" />
                )}
                <div className="session-pedro-bubble">{msg.text}</div>
              </div>
            ))}
            {isPedroLoading && (
              <div className="session-pedro-msg pedro">
                <img src={sessionCompleteBird} alt="" className="session-pedro-avatar" />
                <div className="session-pedro-bubble session-pedro-typing">
                  <span className="session-typing-dot"></span>
                  <span className="session-typing-dot"></span>
                  <span className="session-typing-dot"></span>
                </div>
              </div>
            )}
            <div ref={pedroChatEndRef} />
          </div>

          {/* Interactive input */}
          <div className="session-pedro-input-area">
            <div className="session-pedro-input-wrapper">
              <input
                type="text"
                placeholder="Ask Pedro about your results..."
                value={pedroInput}
                onChange={(e) => setPedroInput(e.target.value)}
                onKeyDown={handlePedroKeyDown}
                disabled={isPedroLoading}
              />
              <button
                className="session-pedro-send"
                onClick={handlePedroSend}
                disabled={!pedroInput.trim() || isPedroLoading}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionSummary;
