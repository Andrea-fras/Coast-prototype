import React, { useEffect, useRef, useState } from 'react';
import { Map, Sparkles, Trophy, Upload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getWorldMap, getWorldCanvas, HQ } from '../WorldMap/mapTerrain';
import coastLogo from '../../assets/Coastlogo-white-full.svg';
import mascot from '../../assets/sessioncompletebird.svg';
import medalIcon from '../../assets/lesson-icons/medal.svg';
import trophyIcon from '../../assets/lesson-icons/trophy.svg';
import './LoginPage.css';

function LoginMapPreview() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    const world = getWorldMap();
    const tilePx = 16;
    const worldCanvas = getWorldCanvas(world, tilePx);

    const draw = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (width < 1 || height < 1) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const tilesW = 30;
      const tileAspect = height / width;
      const tilesH = Math.max(8, Math.ceil(tilesW * tileAspect));
      const sx = (HQ.x - tilesW / 2) * tilePx;
      const sy = (HQ.y - tilesH / 2) * tilePx;
      const sw = tilesW * tilePx;
      const sh = tilesH * tilePx;

      ctx.drawImage(worldCanvas, sx, sy, sw, sh, 0, 0, width, height);
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="login-map-preview" ref={wrapRef}>
      <canvas ref={canvasRef} className="login-map-canvas" aria-hidden="true" />
      <div className="login-map-vignette" aria-hidden="true" />
      <img src={mascot} alt="" className="login-map-mascot" />
    </div>
  );
}

const LoginPage = () => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [course, setCourse] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          setError('Please enter your name');
          setLoading(false);
          return;
        }
        await register(email.trim(), name.trim(), password, course);
      } else {
        await login(email.trim(), password);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page login-page--v2">
      <div className="login-pixel-bg" aria-hidden="true" />

      <div className="login-shell">
        <section className="login-hero">
          <img src={coastLogo} alt="Coast" className="login-hero-logo" />
          <p className="login-hero-tagline">
            Learn on a living map. Master every section with Pedro. A fully adaptive system that learns how you learn and grows with you over years.
          </p>

          <div className="login-hero-visual">
            <LoginMapPreview />
            <div className="login-hero-badges">
              <span><img src={trophyIcon} alt="" /> Mastery stars</span>
              <span><img src={medalIcon} alt="" /> Section rewards</span>
            </div>
          </div>

          <ul className="login-feature-list">
            <li>
              <Map size={18} />
              <div>
                <strong>Exploration map</strong>
                <span>Unlock terrain as you complete lessons: fog of war, treasures, and focus sessions.</span>
              </div>
            </li>
            <li>
              <Sparkles size={18} />
              <div>
                <strong>Pedro, your AI tutor</strong>
                <span>Socratic lessons from your lectures. He verifies mastery before you advance.</span>
              </div>
            </li>
            <li>
              <Upload size={18} />
              <div>
                <strong>Your courses + premade deep dives</strong>
                <span>Upload PDFs or start instantly with curated lessons.</span>
              </div>
            </li>
            <li>
              <Trophy size={18} />
              <div>
                <strong>Built for the long run</strong>
                <span>Your pace, gaps, and review schedule adapt over months and years. XP and mastery profile stay with you.</span>
              </div>
            </li>
          </ul>
        </section>

        <section className="login-panel">
          <div className="login-step">
            <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
            <p className="login-step-lead">
              {isRegister
                ? 'Start your voyage. It only takes a minute.'
                : 'Sign in to pick up where you left off.'}
            </p>

            <form onSubmit={handleSubmit} className="login-form">
              {isRegister && (
                <div className="login-field">
                  <label>Full name</label>
                  <input
                    type="text"
                    placeholder="Alex Johnson"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="login-field">
                <label>Email</label>
                <input
                  type="email"
                  placeholder="your@university.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="login-field">
                <label>Password</label>
                <input
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {isRegister && (
                <div className="login-field">
                  <label>Course (optional)</label>
                  <select value={course} onChange={(e) => setCourse(e.target.value)}>
                    <option value="">Select your course</option>
                    <option value="QM1">Quantitative Methods 1</option>
                    <option value="Data Science">Data Science & AI</option>
                    <option value="Economics">Economics</option>
                    <option value="Statistics">Statistics</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              )}

              {error && <div className="login-error">{error}</div>}

              <button type="submit" className="login-primary-btn" disabled={loading}>
                {loading
                  ? 'Please wait…'
                  : isRegister
                    ? 'Start learning'
                    : 'Sign in'}
              </button>
            </form>

            <div className="login-switch">
              {isRegister ? (
                <p>
                  Already have an account?{' '}
                  <button type="button" onClick={() => { setIsRegister(false); setError(''); }}>
                    Sign in
                  </button>
                </p>
              ) : (
                <p>
                  Don&apos;t have an account?{' '}
                  <button type="button" onClick={() => { setIsRegister(true); setError(''); }}>
                    Create one
                  </button>
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
