import React, { useMemo, useState } from 'react';
import LabFrame from '../LabFrame';
import { ATTENTION_SENTENCES, attentionWeights } from '../sim/llm';

const pct = (p) => `${Math.round(p * 100)}%`;

export default function AttentionLab({ params = {}, onResult }) {
  const [ending, setEnding] = useState(ATTENTION_SENTENCES[params.sentence] ? params.sentence : 'tired');
  const words = ATTENTION_SENTENCES[ending];
  const [picked, setPicked] = useState(words.length - 1);
  const [scaled, setScaled] = useState(true);
  const weights = useMemo(() => attentionWeights(words, { scale: scaled }), [words, scaled]);
  const row = weights[picked];
  const ranked = row.slice(0, picked + 1).map((w, j) => [w, j]).sort((a, b) => b[0] - a[0]);

  const describe = (i) => {
    const r = weights[i].slice(0, i + 1).map((w, j) => [w, j]).sort((a, b) => b[0] - a[0]).slice(0, 3);
    return `"${words[i]}" → ${r.map(([w, j]) => `"${words[j]}" ${pct(w)}`).join(', ')}`;
  };
  const message = [
    '🧪 Attention lab',
    `Sentence: "${words.join(' ')}"${scaled ? '' : ' (without dividing by √d)'}`,
    `Chosen word: ${describe(picked)}`,
    picked !== words.indexOf('it') ? `For comparison: ${describe(words.indexOf('it'))}` : '',
  ].filter(Boolean).join('\n');

  return (
    <LabFrame title="Attention lab" hint="Click a word to see where it looks." result={message} onResult={onResult}>
      <div className="lab-tabs" role="tablist">
        {Object.keys(ATTENTION_SENTENCES).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={ending === id} className="lab-tab"
            onClick={() => { setEnding(id); setPicked(ATTENTION_SENTENCES[id].length - 1); }}>…too {id}</button>
        ))}
      </div>
      <div className="lab-words">
        {words.map((w, j) => (
          <button key={j} type="button" className={`lab-word${j === picked ? ' is-picked' : ''}`}
            style={{ '--w': j <= picked ? row[j] : 0 }} onClick={() => setPicked(j)}
            aria-pressed={j === picked} title={j <= picked ? `${pct(row[j])} of "${words[picked]}"'s attention` : 'later word: hidden'}>
            {w}
          </button>
        ))}
      </div>
      <div className="lab-bars">
        {ranked.slice(0, 5).map(([w, j]) => (
          <div key={j} className="lab-bar">
            <span className="lab-bar__label">{words[j]}</span>
            <span className="lab-bar__track"><span className="lab-bar__fill lab-bar__fill--sea" style={{ width: `${w * 100}%` }} /></span>
            <span className="lab-bar__value">{pct(w)}</span>
          </div>
        ))}
      </div>
      <p className="lab-caption">
        “{words[picked]}” can only look back at earlier words; later ones are masked. Scores are query · key{scaled ? ' ÷ √d' : ''}, then softmax, so each row adds up to 100%.
      </p>
      <label className="lab-check">
        <input type="checkbox" checked={scaled} onChange={(e) => setScaled(e.target.checked)} /> Divide scores by √d (d = 4)
      </label>
      <details className="lab-details">
        <summary>Whole attention matrix</summary>
        <div className="lab-matrix" style={{ gridTemplateColumns: `auto repeat(${words.length}, 1fr)` }}>
          <span />
          {words.map((w, j) => <span key={`c${j}`} className="lab-matrix__head">{w}</span>)}
          {weights.map((r, i) => (
            <React.Fragment key={i}>
              <span className="lab-matrix__head lab-matrix__head--row">{words[i]}</span>
              {r.map((w, j) => <span key={j} className="lab-matrix__cell" style={{ '--w': w }} title={j > i ? 'masked' : pct(w)} />)}
            </React.Fragment>
          ))}
        </div>
      </details>
    </LabFrame>
  );
}
