import React from 'react';

/** A round step (1, 2, 2.5 or 5 × a power of ten) that splits `range` into about `count` parts. */
function niceStep(range, count = 5) {
  const raw = range / count || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= raw);
}

function ticks(lo, hi) {
  const s = niceStep(hi - lo);
  const out = [];
  for (let v = Math.ceil(lo / s - 1e-9) * s; v <= hi + 1e-9; v += s) out.push(+v.toFixed(10));
  return out;
}

/** Round an automatic axis end up to its next tick. */
const roundUp = (lo, hi) => Math.ceil(hi / niceStep(hi - lo)) * niceStep(hi - lo);

/**
 * A small line chart. series: [{ points: [[x, y]], color, label }]; lines: horizontal guides
 * [{ y, label, color }]; marks: points to highlight [{ x, y, color }].
 */
export default function Plot({ series, xLabel, yLabel, xMax, yMin, yMax, lines = [], marks = [], height = 190, format = (v) => v }) {
  const W = 560; const H = height; const L = 48; const R = 12; const T = 12; const B = 30;
  const xs = series.flatMap((s) => s.points.map((p) => p[0]));
  const ys = series.flatMap((s) => s.points.map((p) => p[1]));
  const x1 = xMax ?? roundUp(0, Math.max(...xs, 1e-9));
  const y0 = yMin ?? Math.min(0, ...ys);
  const y1 = yMax ?? roundUp(y0, Math.max(...ys, ...lines.map((l) => l.y), y0 + 1e-9));
  const sx = (x) => L + (x / x1) * (W - L - R);
  const sy = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  return (
    <svg className="lab-plot" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} against ${xLabel}`}>
      {ticks(y0, y1).map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} className="lab-plot__grid" />
          <text x={L - 6} y={sy(v) + 4} textAnchor="end" className="lab-plot__tick">{format(v)}</text>
        </g>
      ))}
      {ticks(0, x1).map((v) => (
        <text key={`x${v}`} x={sx(v)} y={H - 12} textAnchor="middle" className="lab-plot__tick">{format(v)}</text>
      ))}
      {lines.map((l) => (
        <g key={l.label}>
          <line x1={L} x2={W - R} y1={sy(l.y)} y2={sy(l.y)} className="lab-plot__guide" style={{ stroke: l.color }} />
          <text x={W - R - 4} y={sy(l.y) - 4} textAnchor="end" className="lab-plot__guide-label" style={{ fill: l.color }}>{l.label}</text>
        </g>
      ))}
      {series.map((s) => (
        <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round"
          points={s.points.map(([x, y]) => `${sx(x).toFixed(1)},${sy(Math.max(y0, Math.min(y1, y))).toFixed(1)}`).join(' ')} />
      ))}
      {marks.map((m, i) => <circle key={i} cx={sx(m.x)} cy={sy(m.y)} r="4" fill={m.color} />)}
      <text x={(L + W - R) / 2} y={H - 1} textAnchor="middle" className="lab-plot__axis">{xLabel}</text>
      <text x={L + 4} y={T + 2} className="lab-plot__axis">{yLabel}</text>
    </svg>
  );
}
