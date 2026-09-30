import React, { useCallback, useEffect, useState } from 'react';
import { Ban, Check, Copy, Link as LinkIcon, Plus, RefreshCw, Ticket } from 'lucide-react';
import { API_URL } from '../../config';

const FILTERS = [
  ['all', 'All'],
  ['unused', 'Unused'],
  ['used', 'Used'],
  ['revoked', 'Revoked'],
];

// Opens this app on "Create your account" with the code already filled in.
function inviteLink(code) {
  return `${window.location.origin}/?mode=signup&code=${encodeURIComponent(code)}`;
}

/** Single-use beta invite codes: make them, hand them out, see who used which. */
export default function BetaCodesPanel({ token, formatTime }) {
  const [codes, setCodes] = useState([]);
  const [counts, setCounts] = useState({ unused: 0, used: 0, revoked: 0 });
  const [required, setRequired] = useState(true);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [filter, setFilter] = useState('all');
  const [fresh, setFresh] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const call = useCallback(async (path, options = {}) => {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
    return json;
  }, [token]);

  const load = useCallback(async () => {
    try {
      const json = await call('/api/admin/beta-codes');
      setCodes(json.codes || []);
      setCounts(json.counts || { unused: 0, used: 0, revoked: 0 });
      setRequired(json.required !== false);
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load beta codes');
    }
  }, [call]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const json = await call('/api/admin/beta-codes', {
        method: 'POST',
        body: JSON.stringify({ count: Math.max(1, Math.min(50, Number(count) || 1)), note: note.trim() }),
      });
      setFresh((json.codes || []).map((c) => c.code));
      setNote('');
      setFilter('all');
      await load();
    } catch (err) {
      setError(err.message || 'Could not create codes');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (code) => {
    if (!window.confirm(`Revoke ${code}? Nobody will be able to sign up with it.`)) return;
    try {
      await call(`/api/admin/beta-codes/${encodeURIComponent(code)}/revoke`, { method: 'POST' });
      await load();
    } catch (err) {
      setError(err.message || 'Could not revoke the code');
    }
  };

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? '' : current)), 1600);
    } catch {
      setError('Copying failed. Select the code and copy it manually.');
    }
  };

  const shown = codes.filter((c) => filter === 'all' || c.status === filter);

  return (
    <section className="cc-panel cc-full-panel cc-codes">
      <div className="cc-panel-head">
        <Ticket size={16} />
        <h2>Beta codes</h2>
        <span className="cc-badge">{counts.unused} unused · {counts.used} used</span>
        <button type="button" className="cc-icon-btn cc-icon-btn--sm" onClick={load} aria-label="Refresh beta codes">
          <RefreshCw size={14} />
        </button>
      </div>

      {!required && (
        <p className="cc-codes-note">Sign-up is open right now (COAST_REQUIRE_BETA_CODE is off), so new accounts don&apos;t need a code.</p>
      )}

      <form className="cc-codes-form" onSubmit={create}>
        <label className="cc-codes-field cc-codes-field--count">
          <span>How many</span>
          <input type="number" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} />
        </label>
        <label className="cc-codes-field">
          <span>Who they&apos;re for (optional)</span>
          <input
            type="text"
            maxLength={255}
            placeholder="e.g. Maastricht ML society"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button type="submit" className="cc-codes-create" disabled={busy}>
          <Plus size={15} /> {busy ? 'Creating…' : 'Create codes'}
        </button>
      </form>

      {error && <div className="cc-codes-error" role="alert">{error}</div>}

      <div className="cc-codes-filters" aria-label="Filter codes">
        {FILTERS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
            {label}
            {key !== 'all' && <span>{counts[key] ?? 0}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="cc-empty">{codes.length ? 'No codes match this filter.' : 'No codes yet. Create one above and send it to a student.'}</p>
      ) : (
        <div className="cc-table-wrap">
          <table className="cc-table cc-codes-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>For</th>
                <th>Status</th>
                <th>Used by</th>
                <th><span className="cc-visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.code} className={fresh.includes(c.code) ? 'cc-codes-fresh' : ''}>
                  <td><code className="cc-code">{c.code}</code></td>
                  <td>{c.note || '—'}</td>
                  <td><span className={`cc-code-status cc-code-status--${c.status}`}>{c.status}</span></td>
                  <td>
                    {c.used_email ? (
                      <>{c.used_email}<span className="cc-codes-when"> · {formatTime(c.used_at)}</span></>
                    ) : '—'}
                  </td>
                  <td className="cc-codes-actions">
                    {c.status === 'unused' && (
                      <>
                        <button type="button" onClick={() => copy(c.code, `${c.code}:code`)}>
                          {copied === `${c.code}:code` ? <Check size={13} /> : <Copy size={13} />} Code
                        </button>
                        <button type="button" onClick={() => copy(inviteLink(c.code), `${c.code}:link`)}>
                          {copied === `${c.code}:link` ? <Check size={13} /> : <LinkIcon size={13} />} Invite link
                        </button>
                        <button type="button" className="cc-codes-revoke" onClick={() => revoke(c.code)}>
                          <Ban size={13} /> Revoke
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
