import React, { useCallback, useEffect, useState } from 'react';
import { Cpu, RefreshCw } from 'lucide-react';
import { API_URL } from '../../config';

const RANGES = [
  [1, 'Today'],
  [7, '7 days'],
  [30, '30 days'],
];

const FEATURE_NAMES = {
  'pedro:lesson': 'Pedro · lessons',
  'pedro:general': 'Pedro · chat',
  'pedro:notebook': 'Pedro · notebook',
  'pedro:onboarding': 'Pedro · onboarding',
  'pedro:test_out': 'Pedro · placement test',
  'folders/outline': 'Roadmap',
  source_ingest: 'Indexing uploads',
  section_memory: 'Section evaluation',
  'chat/stream': 'Pedro',
};

const featureName = (f) => FEATURE_NAMES[f] || f;
const usd = (n) => (n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${(n || 0).toFixed(!n || n >= 0.01 ? 2 : 4)}`);
const tokens = (n) => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n || 0);
};
const pct = (x) => `${Math.round((x || 0) * 100)}%`;

/** Tokens and estimated spend of every AI call, so costs per student and per feature are visible. */
export default function AiUsagePanel({ token, Chart }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/ai-usage?days=${days}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || `HTTP ${res.status}`);
      setData(json);
      setError('');
    } catch (e) {
      setError(e.message || 'Could not load AI usage');
    } finally {
      setLoading(false);
    }
  }, [token, days]);

  useEffect(() => { load(); }, [load]);

  const total = data?.total;
  const pedro = data?.by_feature?.filter((f) => f.feature.startsWith('pedro')) || [];
  const pedroCalls = pedro.reduce((n, f) => n + f.calls, 0);
  const pedroInput = pedroCalls ? Math.round(pedro.reduce((n, f) => n + f.input_tokens, 0) / pedroCalls) : 0;

  return (
    <section className="cc-panel cc-full-panel cc-ai">
      <div className="cc-panel-head">
        <Cpu size={16} />
        <h2>AI usage</h2>
        {total && <span className="cc-badge">{total.calls.toLocaleString()} calls</span>}
        <button type="button" className="cc-icon-btn cc-icon-btn--sm" onClick={load} aria-label="Refresh AI usage">
          <RefreshCw size={14} className={loading ? 'cc-spin' : ''} />
        </button>
      </div>

      <div className="cc-codes-filters" aria-label="Time range">
        {RANGES.map(([value, label]) => (
          <button key={value} type="button" aria-pressed={days === value} onClick={() => setDays(value)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="cc-codes-error" role="alert">{error}</div>}

      {total && (total.calls === 0 ? (
        <p className="cc-empty">No AI calls in this period yet.</p>
      ) : (
        <>
          <div className="cc-ai-stats">
            <div><span>Estimated cost</span><strong>{usd(total.cost_usd)}</strong></div>
            <div><span>Per active student</span><strong>{usd(total.cost_per_student_usd)}</strong><em>{total.students} students</em></div>
            <div><span>Tokens in</span><strong>{tokens(total.input_tokens)}</strong><em>{pct(total.cache_share)} from cache</em></div>
            <div><span>Tokens out</span><strong>{tokens(total.output_tokens)}</strong></div>
            <div><span>Pedro turn</span><strong>{tokens(pedroInput)}</strong><em>avg tokens sent</em></div>
            <div><span>Failed calls</span><strong>{total.failed}</strong><em>{pct(total.failed / total.calls)}</em></div>
          </div>

          {data.by_day.length > 1 && Chart && (
            <>
              <Chart data={data.by_day} valueKey="cost_usd" labelKey="day" height={80} accent="#ffb503" />
              <p className="cc-chart-caption">Estimated cost per day</p>
            </>
          )}

          <div className="cc-ai-tables">
            <UsageTable
              title="By feature"
              rows={data.by_feature}
              name={(r) => featureName(r.feature)}
              rowKey={(r) => r.feature}
            />
            <UsageTable
              title="By model"
              rows={data.by_model}
              name={(r) => `${r.model}`}
              rowKey={(r) => `${r.provider}:${r.model}`}
            />
            <UsageTable
              title="Top students"
              rows={data.top_students}
              name={(r) => r.email || `User ${r.user_id}`}
              rowKey={(r) => r.user_id}
            />
          </div>

          <p className="cc-chart-caption">
            Estimated from provider-reported tokens at list prices (checked {data.prices_checked}); your invoice is the source of truth.
            {data.unpriced_models.length > 0 && ` No price on file for: ${data.unpriced_models.join(', ')}.`}
          </p>
        </>
      ))}
    </section>
  );
}

function UsageTable({ title, rows, name, rowKey }) {
  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <caption className="cc-ai-caption">{title}</caption>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Calls</th>
            <th scope="col">Avg in</th>
            <th scope="col">Avg out</th>
            <th scope="col">Cache</th>
            <th scope="col">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)}>
              <td>{name(r)}</td>
              <td>{r.calls.toLocaleString()}</td>
              <td>{tokens(r.avg_input_tokens)}</td>
              <td>{tokens(r.avg_output_tokens)}</td>
              <td>{pct(r.cache_share)}</td>
              <td>{r.unpriced_calls === r.calls ? '—' : usd(r.cost_usd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
