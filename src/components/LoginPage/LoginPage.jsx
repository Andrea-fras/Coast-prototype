import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, BrainCircuit, Eye, EyeOff, Hammer, KeyRound, Loader2, Map as MapIcon, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/authState';
import { API_URL } from '../../config';
import { getWorldMap } from '../WorldMap/mapTerrain';
import { loadWorldCanvas } from '../WorldMap/mapAsync';
import coastLogo from '../../assets/Coastlogo-white-full.svg';
import mascot from '../../assets/sessioncompletebird.svg';
import './LoginPage.css';

const LANDING_URL = 'https://www.coast.academy';

function LoginMapPreview() {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;

    // The student's first harbour, painted off the main thread.
    const world = getWorldMap(1);
    let art = null;
    let cancelled = false;

    const draw = () => {
      const { width, height } = wrap.getBoundingClientRect();
      if (!art || width < 1 || height < 1) return;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const k = art.width / world.size; // art px per tile
      const tilesW = 30;
      const tilesH = Math.max(8, tilesW * (height / width));
      const startX = world.origin.x + 0.5 - tilesW / 2;
      const startY = world.origin.y + 0.5 - tilesH / 2;
      ctx.drawImage(art, startX * k, startY * k, tilesW * k, tilesH * k, 0, 0, width, height);
    };

    loadWorldCanvas(world).then((c) => {
      if (cancelled) return;
      art = c;
      draw();
      setReady(true);
    });
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  return (
    <div className="login-map-preview" ref={wrapRef}>
      <canvas ref={canvasRef} className={`login-map-canvas${ready ? ' is-ready' : ''}`} aria-hidden="true" />
      <div className="login-map-vignette" aria-hidden="true" />
      <img src={mascot} alt="" className="login-map-mascot" />
    </div>
  );
}

// Links from the landing page and invite links: ?mode=signup|login and ?code=COAST-XXXX-XXXX.
function readInvite() {
  if (typeof window === 'undefined') return { register: false, code: '' };
  const params = new URLSearchParams(window.location.search);
  const code = (params.get('code') || '').trim().toUpperCase();
  return { register: params.get('mode') === 'signup' || Boolean(code), code };
}

const FEATURES = [
  { Icon: Sparkles, title: 'Pedro, your personal tutor', text: 'Lessons from your own lectures. You move on once you’ve shown you understand.' },
  { Icon: BrainCircuit, title: 'Remembers how you learn', text: 'Every course, what clicked and where you got stuck, kept for years.' },
  { Icon: Hammer, title: 'Learn by building', text: 'Workshops coach you through real projects, milestone by milestone.' },
  { Icon: MapIcon, title: 'A world that grows with you', text: 'Every section you finish uncovers more of your map.' },
];

const LoginPage = () => {
  const { login, register } = useAuth();
  const [invite] = useState(readInvite);
  const [isRegister, setIsRegister] = useState(invite.register);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [betaCode, setBetaCode] = useState(invite.code);
  const [codeRequired, setCodeRequired] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Read once, then tidy the address bar so a later sign-out doesn't reopen sign-up.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('mode') && !url.searchParams.has('code')) return;
    url.searchParams.delete('mode');
    url.searchParams.delete('code');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // The server decides whether sign-up is invite-only; assume it is until it answers.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/auth/config`)
      .then((res) => (res.ok ? res.json() : null))
      .then((config) => {
        if (!cancelled && config && config.beta_code_required === false) setCodeRequired(false);
      })
      .catch(() => { /* keep the code field; the server still enforces the rule */ });
    return () => { cancelled = true; };
  }, []);

  const switchMode = (toRegister) => {
    setIsRegister(toRegister);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (isRegister) {
      if (!name.trim()) {
        setError('Please enter your name.');
        return;
      }
      if (codeRequired && !betaCode.trim()) {
        setError('Enter the beta code you were given.');
        return;
      }
    }

    setLoading(true);
    try {
      if (isRegister) {
        await register(email.trim(), name.trim(), password, codeRequired ? betaCode.trim() : '');
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
      <div className="login-glow" aria-hidden="true" />

      <div className="login-shell">
        <section className="login-hero">
          <img src={coastLogo} alt="Coast" className="login-hero-logo" />
          <p className="login-hero-tagline">
            A personal tutor that turns your lectures into lessons and remembers how you learn, across every course, for years.
          </p>

          <div className="login-hero-visual">
            <LoginMapPreview />
          </div>

          <ul className="login-feature-list">
            {FEATURES.map(({ Icon, title, text }) => (
              <li key={title}>
                <span className="login-feature-icon"><Icon size={16} /></span>
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="login-panel">
          <div className="login-step">
            {isRegister && codeRequired && <span className="login-beta-pill"><span aria-hidden="true" />Private beta</span>}
            <h2>{isRegister ? 'Create your account' : 'Welcome back'}</h2>
            <p className="login-step-lead">
              {isRegister
                ? codeRequired
                  ? 'Coast is invite-only for now. You’ll need the beta code you were given.'
                  : 'Start learning with Pedro. It only takes a minute.'
                : 'Sign in to pick up where you left off.'}
            </p>

            <form onSubmit={handleSubmit} className="login-form">
              {isRegister && (
                <div className="login-field">
                  <label htmlFor="login-name">Full name</label>
                  <input
                    id="login-name"
                    type="text"
                    placeholder="Alex Johnson"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="login-field">
                <label htmlFor="login-email">Email</label>
                <input
                  id="login-email"
                  type="email"
                  placeholder="you@university.edu"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="login-field">
                <label htmlFor="login-password">Password</label>
                <div className="login-input-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={isRegister ? 'At least 8 characters' : 'Your password'}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={isRegister ? 8 : undefined}
                  />
                  <button
                    type="button"
                    className="login-input-action"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              {isRegister && codeRequired && (
                <div className="login-field">
                  <label htmlFor="login-beta-code">Beta code</label>
                  <div className="login-input-wrap login-input-wrap--icon">
                    <KeyRound size={16} className="login-input-icon" aria-hidden="true" />
                    <input
                      id="login-beta-code"
                      className="login-code-input"
                      type="text"
                      placeholder="COAST-XXXX-XXXX"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      value={betaCode}
                      onChange={(e) => setBetaCode(e.target.value.toUpperCase())}
                      aria-describedby="login-beta-code-hint"
                      required
                    />
                  </div>
                  <p className="login-field-hint" id="login-beta-code-hint">
                    Each code works once. No code yet?{' '}
                    <a href={`${LANDING_URL}/#join`} target="_blank" rel="noopener noreferrer">Join the waitlist</a>
                  </p>
                </div>
              )}

              {error && (
                <div className="login-error" role="alert">
                  <AlertCircle size={16} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button type="submit" className="login-primary-btn" disabled={loading}>
                {loading ? (
                  <><Loader2 size={17} className="login-spin" aria-hidden="true" /> Please wait…</>
                ) : (
                  <>{isRegister ? 'Create account' : 'Sign in'} <ArrowRight size={17} aria-hidden="true" /></>
                )}
              </button>
            </form>

            <div className="login-switch">
              {isRegister ? (
                <p>
                  Already have an account?{' '}
                  <button type="button" onClick={() => switchMode(false)}>Sign in</button>
                </p>
              ) : (
                <p>
                  New to Coast?{' '}
                  <button type="button" onClick={() => switchMode(true)}>Create an account</button>
                </p>
              )}
            </div>
          </div>

          <a className="login-home-link" href={LANDING_URL}>coast.academy</a>
        </section>
      </div>
    </div>
  );
};

export default LoginPage;
