import React, { useMemo, useState } from 'react';
import { Dices } from 'lucide-react';
import LabFrame from '../LabFrame';
import { SCENARIOS, entropyBits, sampleIndex, softmax } from '../sim/llm';

const pct = (p) => (p >= 0.995 ? '>99%' : p < 0.005 ? '<1%' : `${Math.round(p * 100)}%`);

export default function TemperatureLab({ params = {}, onResult }) {
  const [scenario, setScenario] = useState(SCENARIOS[params.scenario] ? params.scenario : 'story');
  const [temperature, setTemperature] = useState(1);
  const [draws, setDraws] = useState([]);  // [{ scenario, T, picks }]
  const s = SCENARIOS[scenario];
  const probs = useMemo(() => softmax(s.logits, temperature), [s, temperature]);
  const order = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);

  const sample = () => {
    const picks = Array.from({ length: 10 }, () => s.tokens[sampleIndex(probs)].trim());
    setDraws((d) => [...d.slice(-5), { scenario, T: temperature, picks }]);
  };

  const recent = draws.slice(-4);
  const message = recent.length ? [
    '🧪 Temperature lab',
    ...recent.map((d) => {
      const sc = SCENARIOS[d.scenario];
      const p = softmax(sc.logits, d.T);
      const top = p.indexOf(Math.max(...p));
      return `"${sc.context} …" at T = ${d.T.toFixed(2)}: top choice "${sc.tokens[top].trim()}" ${pct(p[top])}; 10 draws: ${d.picks.join(', ')}`;
    }),
  ].join('\n') : null;

  return (
    <LabFrame title="Temperature lab" hint="Slide, then draw 10 next words." result={message} onResult={onResult}
      sendLabel={recent.length ? 'Send my draws to Pedro' : 'Draw first, then send'}>
      <div className="lab-tabs" role="tablist">
        {Object.entries(SCENARIOS).map(([id, sc]) => (
          <button key={id} type="button" role="tab" aria-selected={scenario === id} className="lab-tab" onClick={() => setScenario(id)}>{sc.label}</button>
        ))}
      </div>
      <p className="lab-context">“{s.context} <span className="lab-blank">___</span>”</p>
      <label className="lab-slider">
        <span>Temperature <b>{temperature.toFixed(2)}</b> {temperature < 0.3 ? '(nearly always the top word)' : temperature > 1.5 ? '(adventurous)' : ''}</span>
        <input type="range" min="0.05" max="3" step="0.05" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
      </label>
      <div className="lab-bars">
        {order.map(([p, i]) => (
          <div key={s.tokens[i]} className="lab-bar">
            <span className="lab-bar__label">{s.tokens[i].trim()}</span>
            <span className="lab-bar__track"><span className="lab-bar__fill" style={{ width: `${Math.max(p * 100, 0.5)}%` }} /></span>
            <span className="lab-bar__value">{pct(p)}</span>
          </div>
        ))}
      </div>
      <div className="lab-row">
        <button type="button" className="lab-btn lab-btn--go" onClick={sample}><Dices size={14} aria-hidden="true" /> Draw 10 next words</button>
        <span className="lab-status">Uncertainty: {entropyBits(probs).toFixed(2)} bits (0 = certain, 3 = all eight equally likely)</span>
      </div>
      {recent.length > 0 && (
        <ul className="lab-log">
          {[...recent].reverse().map((d, i) => (
            <li key={draws.length - i}><b>T = {d.T.toFixed(2)}</b> {SCENARIOS[d.scenario].label.toLowerCase()}: {d.picks.join(' · ')}</li>
          ))}
        </ul>
      )}
    </LabFrame>
  );
}
