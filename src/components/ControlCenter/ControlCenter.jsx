import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, Clock, Database, HardDrive, MessageSquare, RefreshCw,
  Server, TrendingUp, Users, X, Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../config';
import coastLogo from '../../assets/Coastlogo-white-full.svg';
import './ControlCenter.css';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / 1024 ** i;
  return `${val >= 100 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const FEATURE_LABELS = {
  map: 'World Map',
  notebook: 'Lessons',
  pedro_chat: 'Pedro Chat',
  unknown: 'Active',
  '': 'Active',
};

function MiniBarChart({ data, valueKey = 'count', labelKey = 'date', height = 72, accent = '#3dd6c8' }) {
  const values = (data || []).map((d) => d[valueKey] || 0);
  const max = Math.max(...values, 1);
  return (
    <div className="cc-bar-chart" style={{ height }}>
      {(data || []).map((d, i) => (
        <div
          key={`${d[labelKey]}-${i}`}
          className="cc-bar-col"
          title={`${d[labelKey]}: ${d[valueKey]}`}
        >
          <div
            className="cc-bar-fill"
            style={{
              height: `${Math.max(4, (d[valueKey] / max) * 100)}%`,
              background: accent,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="cc-kpi">
      <div className="cc-kpi-icon" style={{ color: accent }}>
        <Icon size={18} />
      </div>
      <div className="cc-kpi-body">
        <span className="cc-kpi-value">{value}</span>
        <span className="cc-kpi-label">{label}</span>
        {sub && <span className="cc-kpi-sub">{sub}</span>}
      </div>
    </div>
  );
}

function StorageBar({ label, bytes, totalBytes, path }) {
  const pct = totalBytes > 0 ? Math.min(100, (bytes / totalBytes) * 100) : 0;
  return (
    <div className="cc-storage-row" title={path}>
      <div className="cc-storage-head">
        <span>{label}</span>
        <span>{formatBytes(bytes)}</span>
      </div>
      <div className="cc-storage-track">
        <div className="cc-storage-fill" style={{ width: `${Math.max(pct, bytes > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

export default function ControlCenter({ onClose }) {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!token) return;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/control-center`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setData(json);
      setError('');
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message || 'Failed to load control center');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const id = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(id);
  }, [fetchData]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const signupsChart = useMemo(
    () => (data?.growth?.signups_per_day || []).slice(-14),
    [data],
  );
  const dauChart = useMemo(
    () => (data?.active_users?.dau_trend || []).slice(-14),
    [data],
  );
  const trafficChart = useMemo(
    () => data?.server?.traffic?.series_60m || [],
    [data],
  );

  const disk = data?.server?.storage?.disk;
  const storageBreakdown = data?.server?.storage?.breakdown || [];
  const totalStorageUsed = storageBreakdown.reduce((s, i) => s + (i.bytes || 0), 0);

  return (
    <div className="cc-overlay" role="dialog" aria-modal="true" aria-label="Coast Control Center">
      <div className="cc-shell">
        <header className="cc-header">
          <div className="cc-header-left">
            <img src={coastLogo} alt="Coast" className="cc-logo" />
            <div>
              <h1 className="cc-title">
                Control Center
                <span className="cc-live-dot" aria-hidden />
              </h1>
              <p className="cc-subtitle">
                {data?.server?.environment === 'production' ? 'Production' : 'Development'}
                {' · '}
                Uptime {formatUptime(data?.server?.uptime_seconds)}
              </p>
            </div>
          </div>
          <div className="cc-header-actions">
            <span className="cc-updated">
              {lastFetch ? `Updated ${lastFetch.toLocaleTimeString()}` : 'Loading…'}
            </span>
            <button type="button" className="cc-icon-btn" onClick={() => fetchData()} aria-label="Refresh">
              <RefreshCw size={18} className={loading ? 'cc-spin' : ''} />
            </button>
            <button type="button" className="cc-close-btn" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </div>
        </header>

        {error && (
          <div className="cc-error">{error}</div>
        )}

        {data && (
          <>
            <section className="cc-kpi-grid">
              <KpiCard
                icon={Zap}
                label="Online now"
                value={data.kpis.online_now}
                sub={`${data.kpis.signups_today} signups today`}
                accent="#4ade80"
              />
              <KpiCard
                icon={Users}
                label="DAU / WAU / MAU"
                value={`${data.kpis.dau} / ${data.kpis.wau} / ${data.kpis.mau}`}
                sub={`${data.kpis.total_users} total users`}
                accent="#3dd6c8"
              />
              <KpiCard
                icon={MessageSquare}
                label="Messages"
                value={data.kpis.messages_today}
                sub={`${data.kpis.total_messages.toLocaleString()} all time`}
                accent="#60a5fa"
              />
              <KpiCard
                icon={Clock}
                label="Platform hours"
                value={data.kpis.total_hours}
                sub={`${data.engagement?.pct_completed_lesson || 0}% completed a course`}
                accent="#fbbf24"
              />
              <KpiCard
                icon={Activity}
                label="Req / min"
                value={data.server?.traffic?.requests_per_minute ?? 0}
                sub={`${data.server?.traffic?.requests_last_5m ?? 0} in last 5m`}
                accent="#c084fc"
              />
              <KpiCard
                icon={HardDrive}
                label="Disk used"
                value={disk ? `${disk.used_pct}%` : '—'}
                sub={disk ? `${formatBytes(disk.free_bytes)} free` : formatBytes(totalStorageUsed)}
                accent="#fb7185"
              />
            </section>

            <div className="cc-main-grid">
              <section className="cc-panel cc-live-panel">
                <div className="cc-panel-head">
                  <Users size={16} />
                  <h2>Live now</h2>
                  <span className="cc-badge cc-badge-live">{data.live.count}</span>
                </div>
                {data.live.users.length === 0 ? (
                  <p className="cc-empty">No active sessions — waiting for heartbeats.</p>
                ) : (
                  <ul className="cc-live-list">
                    {data.live.users.map((u) => (
                      <li key={u.user_id} className="cc-live-item">
                        <div className="cc-live-avatar">{u.name?.charAt(0)?.toUpperCase() || '?'}</div>
                        <div className="cc-live-info">
                          <span className="cc-live-name">{u.name}</span>
                          <span className="cc-live-email">{u.email}</span>
                        </div>
                        <span className="cc-feature-pill">
                          {FEATURE_LABELS[u.feature] || u.feature}
                        </span>
                        <span className="cc-live-age">{u.seconds_ago}s ago</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="cc-panel">
                <div className="cc-panel-head">
                  <Server size={16} />
                  <h2>Server traffic</h2>
                  <span className="cc-badge">{data.server?.traffic?.total_requests?.toLocaleString()} total</span>
                </div>
                <MiniBarChart
                  data={trafficChart}
                  valueKey="count"
                  labelKey="minute"
                  height={100}
                  accent="#c084fc"
                />
                <p className="cc-chart-caption">Requests per minute · last 60 minutes</p>
              </section>

              <section className="cc-panel">
                <div className="cc-panel-head">
                  <TrendingUp size={16} />
                  <h2>Signups</h2>
                  <span className="cc-badge">14 days</span>
                </div>
                <MiniBarChart data={signupsChart} accent="#3dd6c8" />
                <p className="cc-chart-caption">New accounts per day</p>
              </section>

              <section className="cc-panel">
                <div className="cc-panel-head">
                  <Activity size={16} />
                  <h2>Daily active users</h2>
                  <span className="cc-badge">14 days</span>
                </div>
                <MiniBarChart data={dauChart} accent="#4ade80" />
                <p className="cc-chart-caption">Unique users with activity</p>
              </section>

              <section className="cc-panel cc-storage-panel">
                <div className="cc-panel-head">
                  <HardDrive size={16} />
                  <h2>Storage</h2>
                  <span className="cc-badge">{formatBytes(totalStorageUsed)} indexed</span>
                </div>
                {disk && (
                  <div className="cc-disk-summary">
                    <div className="cc-disk-ring-wrap">
                      <svg viewBox="0 0 36 36" className="cc-disk-ring">
                        <path
                          className="cc-disk-bg"
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                        <path
                          className="cc-disk-fg"
                          strokeDasharray={`${disk.used_pct}, 100`}
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        />
                      </svg>
                      <span className="cc-disk-pct">{disk.used_pct}%</span>
                    </div>
                    <div>
                      <p className="cc-disk-label">{disk.mount}</p>
                      <p className="cc-disk-detail">
                        {formatBytes(disk.used_bytes)} used · {formatBytes(disk.free_bytes)} free
                      </p>
                    </div>
                  </div>
                )}
                <div className="cc-storage-list">
                  {storageBreakdown.map((item) => (
                    <StorageBar
                      key={item.label}
                      label={item.label}
                      bytes={item.bytes}
                      totalBytes={disk?.total_bytes || totalStorageUsed || 1}
                      path={item.path}
                    />
                  ))}
                </div>
              </section>

              <section className="cc-panel">
                <div className="cc-panel-head">
                  <Database size={16} />
                  <h2>Database</h2>
                </div>
                <div className="cc-db-grid">
                  {Object.entries(data.server?.database || {}).map(([key, val]) => (
                    <div key={key} className="cc-db-stat">
                      <span className="cc-db-val">{val.toLocaleString()}</span>
                      <span className="cc-db-key">{key.replace(/_/g, ' ')}</span>
                    </div>
                  ))}
                </div>
                <div className="cc-retention">
                  <span>Retention D1 {data.kpis.retention?.day_1}%</span>
                  <span>D7 {data.kpis.retention?.day_7}%</span>
                  <span>D30 {data.kpis.retention?.day_30}%</span>
                </div>
              </section>

              <section className="cc-panel cc-wide-panel">
                <div className="cc-panel-head">
                  <Users size={16} />
                  <h2>Recent signups</h2>
                </div>
                <div className="cc-table-wrap">
                  <table className="cc-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Course</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data.recent_signups || []).map((u) => (
                        <tr key={u.id}>
                          <td>{u.name}</td>
                          <td>{u.email}</td>
                          <td>{u.course || '—'}</td>
                          <td>{formatTime(u.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="cc-panel">
                <div className="cc-panel-head">
                  <Clock size={16} />
                  <h2>Time by feature</h2>
                </div>
                <ul className="cc-feature-time">
                  {Object.entries(data.time?.per_feature || {}).map(([feat, hrs]) => (
                    <li key={feat}>
                      <span>{FEATURE_LABELS[feat] || feat}</span>
                      <strong>{hrs}h</strong>
                    </li>
                  ))}
                </ul>
                {data.oma && (
                  <div className="cc-oma-status">
                    <span>OMA {data.oma.enabled ? 'on' : 'off'}</span>
                    <span>Student OMA {data.oma.student_oma_enabled ? 'on' : 'off'}</span>
                    <span>{data.oma.rag_provider}</span>
                  </div>
                )}
              </section>
            </div>
          </>
        )}

        {loading && !data && (
          <div className="cc-loading">
            <RefreshCw size={28} className="cc-spin" />
            <p>Initializing mission control…</p>
          </div>
        )}
      </div>
    </div>
  );
}
