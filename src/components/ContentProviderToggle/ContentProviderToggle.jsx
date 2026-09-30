import React, { useEffect, useState } from 'react';
import { API_URL } from '../../config';
import { logContentSource } from '../../utils/logContentRetrieval';
import './ContentProviderToggle.css';

const isLocal = () =>
  API_URL.includes('localhost') || API_URL.includes('127.0.0.1');

export default function ContentProviderToggle() {
  const [mode, setMode] = useState('rag'); // 'oma' | 'rag'
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLocal()) return undefined;
    let cancelled = false;
    fetch(`${API_URL}/api/dev/content-provider`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data && !cancelled) setMode(data.oma_enabled ? 'oma' : 'rag'); })
      .catch(() => { /* The local backend may not be running. */ });
    return () => { cancelled = true; };
  }, []);

  const switchMode = async (next) => {
    if (loading || next === mode) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/dev/content-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: next === 'oma' ? 'oma' : 'flat' }),
      });
      if (res.ok) {
        const data = await res.json();
        setMode(data.oma_enabled ? 'oma' : 'rag');
        logContentSource(data.oma_enabled ? 'OMA' : 'RAG', {
          switched: true,
          label: data.label,
        });
        console.info(
          `[Coast] Content provider → ${data.label}. Pedro & lessons will use ${data.oma_enabled ? 'Content OMA' : 'Chroma RAG'}.`,
        );
      }
    } catch {
      console.warn('[Coast] Could not switch content provider — is the backend running?');
    }
    setLoading(false);
  };

  if (!isLocal()) return null;

  return (
    <div className="content-provider-toggle" title="Dev: switch Pedro content retrieval">
      <span className="cpt-label">Content</span>
      <button
        type="button"
        className={`cpt-btn ${mode === 'rag' ? 'active' : ''}`}
        disabled={loading}
        onClick={() => switchMode('rag')}
      >
        RAG
      </button>
      <button
        type="button"
        className={`cpt-btn ${mode === 'oma' ? 'active' : ''}`}
        disabled={loading}
        onClick={() => switchMode('oma')}
      >
        OMA
      </button>
    </div>
  );
}
