import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './LoginPage.css';

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
    <div className="login-page">
      <div className="login-container">
        <div className="login-left">
          <div className="login-brand">
            <h1 className="login-logo">Coast</h1>
            <p className="login-tagline">Your study edge, unlocked.</p>
          </div>
          <div className="login-features">
            <div className="login-feature">
              <span className="login-feature-icon">📓</span>
              <div>
                <strong>AI-Powered Study Guides</strong>
                <p>Upload lectures, get intuitive Socratic notes</p>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon">📝</span>
              <div>
                <strong>Past Paper Practice</strong>
                <p>Real exam questions matched to your topics</p>
              </div>
            </div>
            <div className="login-feature">
              <span className="login-feature-icon">🐦</span>
              <div>
                <strong>Pedro AI Tutor</strong>
                <p>Get Socratic explanations when you're stuck</p>
              </div>
            </div>
          </div>
        </div>

        <div className="login-right">
          <div className="login-form-container">
            <h2 className="login-form-title">
              {isRegister ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="login-form-subtitle">
              {isRegister
                ? 'Start studying smarter today'
                : 'Sign in to continue studying'}
            </p>

            <form onSubmit={handleSubmit} className="login-form">
              {isRegister && (
                <div className="login-field">
                  <label>Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Alex Johnson"
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {isRegister && (
                <div className="login-field">
                  <label>Course</label>
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

              <button type="submit" className="login-submit" disabled={loading}>
                {loading
                  ? 'Please wait...'
                  : isRegister
                  ? 'Create Account'
                  : 'Sign In'}
              </button>
            </form>

            <div className="login-switch">
              {isRegister ? (
                <p>
                  Already have an account?{' '}
                  <button onClick={() => { setIsRegister(false); setError(''); }}>
                    Sign in
                  </button>
                </p>
              ) : (
                <p>
                  Don't have an account?{' '}
                  <button onClick={() => { setIsRegister(true); setError(''); }}>
                    Create one
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
