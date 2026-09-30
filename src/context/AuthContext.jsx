import { loadSession } from '../utils/loadSession';
import { clearStudentSession } from '../utils/studentCache';
import React, { useState, useEffect } from 'react';

import { API_URL } from '../config';
const TOKEN_KEY = 'coast_token';
const USER_KEY = 'coast_user';

import { AuthContext } from './authState';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));
  const [sessionError, setSessionError] = useState('');
  const [sessionAttempt, setSessionAttempt] = useState(0);
  const retrySession = () => {
    setSessionError('');
    setLoading(true);
    setSessionAttempt(value => value + 1);
  };
  const [imageGrant, setImageGrant] = useState(null);
  const imageAccess = imageGrant?.token === token ? imageGrant.access : '';
  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;
    const renew = async () => {
      try {
        const res = await fetch(`${API_URL}/api/image-access`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setImageGrant({ token, access: data.access || '' });
      } catch { /* The next renewal or sign-in will retry. */ }
    };
    renew();
    const timer = setInterval(renew, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (token) {
      loadSession(`${API_URL}/api/auth/me`, token, { signal: controller.signal })
        .then((userData) => {
          if (cancelled) return;
          if (userData === null) {
            clearStudentSession();
            setToken(null);
            setUser(null);
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            return;
          }
          setUser(userData);
          localStorage.setItem(USER_KEY, JSON.stringify(userData));
        })
        .catch(() => {
          if (!cancelled) setSessionError('Coast could not reach the server to check your session. Your saved sign-in is still here.');
        })
        .finally(() => { if (!cancelled) setLoading(false); });
    }
    return () => { cancelled = true; controller.abort(); };
  }, [token, sessionAttempt]);

  const login = async (email, password) => {
    let res;
    try {
      res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      throw new Error('Cannot reach the Coast server. Make sure the backend is running on port 8000.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    clearStudentSession();
    setSessionError('');
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  };

  const register = async (email, name, password, betaCode = '') => {
    let res;
    try {
      res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, password, beta_code: betaCode }),
      });
    } catch {
      throw new Error('Cannot reach the Coast server. Make sure the backend is running on port 8000.');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Registration failed');
    }
    const data = await res.json();
    clearStudentSession();
    setSessionError('');
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    return data.user;
  };

  const logout = () => {
    setSessionError('');
    setLoading(false);
    clearStudentSession();
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const updateUser = (updates) => {
    const updated = { ...user, ...updates };
    setUser(updated);
    localStorage.setItem(USER_KEY, JSON.stringify(updated));
  };

  const authFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  };

  return (
    <AuthContext.Provider value={{ user, token, imageAccess, loading, sessionError, retrySession, login, register, logout, authFetch, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};
