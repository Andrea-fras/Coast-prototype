import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, ArrowRight } from 'lucide-react';
import './QuestionIntro.css';
import { useTheme } from '../../context/ThemeContext';

// Content mappings for each paper type
const paperContentMap = {
  'qm3_2024': [
    { title: "Solving Linear Equations", content: "When you see something like '2x + 5 = 15', think of the equation as a balance scale. Your goal is to isolate x by doing the same thing to both sides. First, subtract 5 from both sides (2x = 10), then divide both sides by 2 (x = 5). Always work backwards from what's furthest from x." },
    { title: "Derivatives Made Simple", content: "The derivative tells you the rate of change — how fast something is changing at any point. For powers like x², use the power rule: bring the exponent down and reduce it by 1. So x² becomes 2x¹, which is just 2x. Think of it as 'drop and reduce'." },
    { title: "Circle Area Formula", content: "The area of a circle is A = πr². The key insight: you're squaring the radius, then multiplying by π. So for a radius of 3, you calculate 3² = 9, then multiply by π to get 9π. Don't confuse this with circumference (2πr)." },
    { title: "Percentages: The Quick Method", content: "Finding a percentage is just multiplication in disguise. '15% of 200' means 0.15 × 200. Quick trick: 10% of 200 is 20, and 5% is 10, so 15% is 20 + 10 = 30." },
    { title: "Market Equilibrium", content: "Equilibrium is where demand equals supply. Set D(P) = S(P) and solve for P. With 90 - √P = 2√P, combine terms: 90 = 3√P, so √P = 30, meaning P = 900." }
  ],
  'econ_101': [
    { title: "Understanding Demand Shifts", content: "When the price of a substitute good increases, consumers shift to alternatives — so demand for your product increases. Think of Coke and Pepsi: if Pepsi's price rises, more people buy Coke. Substitutes move together, complements move opposite." },
    { title: "Price Elasticity of Demand", content: "Elasticity measures how responsive quantity demanded is to price changes. The formula is % change in quantity ÷ % change in price. If price rises 20% (from $10 to $12) and quantity falls 20% (from 100 to 80), elasticity is -1.0. Values > 1 mean elastic (sensitive), < 1 mean inelastic." },
    { title: "Perfect Competition", content: "In perfect competition, firms are price takers — they can't influence the market price. This means marginal revenue equals price (MR = P). Firms maximize profit where MR = MC. If you're asked about MR in perfect competition, it's always equal to the market price." },
    { title: "Price Ceilings & Consumer Surplus", content: "A price ceiling below equilibrium creates a shortage (Qd > Qs). Some consumers benefit from lower prices, but others can't buy at all due to the shortage. Overall consumer surplus may decrease because the market can't clear efficiently." },
    { title: "Opportunity Cost", content: "Opportunity cost is the value of the next best alternative you give up when making a choice. If you spend $1000 on vacation instead of investing it, your opportunity cost is the potential investment returns. Every choice has a hidden cost!" },
    { title: "Cross-Price Elasticity", content: "Cross-price elasticity measures how demand for one good responds to price changes in another. Positive elasticity = substitutes (price of B rises, demand for A rises). Negative elasticity = complements (price of B rises, demand for A falls)." }
  ],
  'stats_201': [
    { title: "Independent Events & Probability", content: "For independent events, P(A and B) = P(A) × P(B). If A has 30% chance and B has 40% chance, and they're independent, P(both) = 0.3 × 0.4 = 0.12. Independence means one event doesn't affect the other's probability." },
    { title: "Standard Error of the Mean", content: "Standard error (SE) tells you how much sample means vary from the true mean. SE = σ/√n, where σ is standard deviation and n is sample size. With SD = 4 and n = 16, SE = 4/√16 = 4/4 = 1. Larger samples give smaller standard errors — more precision!" },
    { title: "The Central Limit Theorem", content: "The CLT is a cornerstone of statistics: with large enough samples, the distribution of sample means is approximately normal — regardless of the population's shape! This allows us to use normal distribution properties for hypothesis testing and confidence intervals." },
    { title: "Interpreting Confidence Intervals", content: "A 95% CI doesn't mean 'there's a 95% chance the true value is in this interval.' It means: if we repeated the sampling process many times, 95% of the resulting intervals would contain the true parameter. It's about the procedure, not this specific interval." },
    { title: "Type I and Type II Errors", content: "Type I error: rejecting a true null hypothesis (false positive). Type II error: failing to reject a false null (false negative). Remember: Type I is like convicting an innocent person, Type II is like letting a guilty person go free." },
    { title: "Correlation vs. Causation", content: "Correlation means two variables move together; causation means one directly causes the other. Ice cream sales and drowning deaths are correlated — but ice cream doesn't cause drowning! The confounding variable is hot weather, which increases both." }
  ]
};

const QuestionIntro = ({ onClose, onStartQuestions, paper }) => {
  const { theme } = useTheme();
  const [displayedText, setDisplayedText] = useState('');
  const [currentSection, setCurrentSection] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [showButton, setShowButton] = useState(false);
  const textContainerRef = useRef(null);

  // Auto-scroll to bottom as text is typed
  useEffect(() => {
    if (textContainerRef.current) {
      textContainerRef.current.scrollTop = textContainerRef.current.scrollHeight;
    }
  }, [displayedText]);

  // Get content based on paper ID, with fallback
  const introContent = useMemo(() => {
    const paperId = paper?.id;
    return paperContentMap[paperId] || paperContentMap['qm3_2024'];
  }, [paper]);

  // Typing effect
  useEffect(() => {
    if (currentSection >= introContent.length) {
      setIsTyping(false);
      setTimeout(() => setShowButton(true), 500);
      return;
    }

    const section = introContent[currentSection];
    const fullText = `## ${section.title}\n\n${section.content}`;
    let charIndex = 0;

    const typeInterval = setInterval(() => {
      if (charIndex <= fullText.length) {
        setDisplayedText(() => {
          const previousSections = introContent
            .slice(0, currentSection)
            .map(s => `## ${s.title}\n\n${s.content}`)
            .join('\n\n');
          
          const currentText = fullText.slice(0, charIndex);
          return previousSections ? `${previousSections}\n\n${currentText}` : currentText;
        });
        charIndex++;
      } else {
        clearInterval(typeInterval);
        setTimeout(() => setCurrentSection(prev => prev + 1), 300);
      }
    }, 15); // Typing speed

    return () => clearInterval(typeInterval);
  }, [currentSection, introContent]);

  const handleSkip = () => {
    // Show all content immediately
    const allText = introContent
      .map(s => `## ${s.title}\n\n${s.content}`)
      .join('\n\n');
    setDisplayedText(allText);
    setCurrentSection(introContent.length);
    setIsTyping(false);
    setShowButton(true);
  };

  // Parse markdown-like syntax for rendering
  const renderContent = (text) => {
    const lines = text.split('\n');
    return lines.map((line, index) => {
      if (line.startsWith('## ')) {
        return <h3 key={index} className="intro-heading">{line.replace('## ', '')}</h3>;
      }
      if (line === '') {
        return <br key={index} />;
      }
      return <p key={index} className="intro-paragraph">{line}</p>;
    });
  };

  return (
    <div className={`question-page${theme === 'dark' ? ' dark' : ''}`}>
      <header className="qp-header">
        <button className="close-btn" onClick={onClose}>
          <X size={32} />
        </button>
        
        <div className="intro-header-text">
          <span className="intro-label">Preparation Notes</span>
        </div>

        {isTyping && (
          <button className="skip-btn" onClick={handleSkip}>
            Skip
          </button>
        )}
      </header>

      <div className="qp-content intro-content">
        <div className="intro-panel">
          <div className="intro-text-container" ref={textContainerRef}>
            {renderContent(displayedText)}
            {isTyping && <span className="typing-cursor">|</span>}
          </div>

          {showButton && (
            <button className="start-questions-btn" onClick={onStartQuestions}>
              <span>Start Questions</span>
              <ArrowRight size={20} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuestionIntro;
