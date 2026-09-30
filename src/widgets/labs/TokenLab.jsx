import React, { useMemo, useState } from 'react';
import LabFrame from '../LabFrame';
import { bytePairEncode, wordTokens } from '../sim/llm';

const DEFAULT = 'Tokenizers turn text into numbers. Unbelievably, "tokenization" is split into pieces!';
const show = (t) => t.replace(/ /g, '·').replace(/\n/g, '↵');

function Chips({ tokens }) {
  return (
    <div className="lab-chips">
      {tokens.slice(0, 400).map((t, i) => <span key={i} className={`lab-chip lab-chip--${i % 4}`}>{show(t)}</span>)}
      {tokens.length > 400 && <span className="lab-chip lab-chip--more">+{tokens.length - 400} more</span>}
    </div>
  );
}

export default function TokenLab({ params = {}, onResult }) {
  const [text, setText] = useState(typeof params.text === 'string' && params.text ? params.text : DEFAULT);
  const [merges, setMerges] = useState(20);
  const [view, setView] = useState('subword');
  const chars = useMemo(() => [...text], [text]);
  const words = useMemo(() => wordTokens(text), [text]);
  const bpe = useMemo(() => bytePairEncode(text, merges), [text, merges]);
  const tokens = view === 'chars' ? chars : view === 'words' ? words : bpe.tokens;
  const distinct = (list) => new Set(list).size;

  const message = [
    '🧪 Tokenizer lab',
    `Text (${chars.length} characters): "${text.length > 160 ? `${text.slice(0, 160)}…` : text}"`,
    `Characters: ${chars.length} tokens, ${distinct(chars)} different ones`,
    `Words: ${words.length} tokens, ${distinct(words)} different ones`,
    `Subword merges (${bpe.merges.length} learned): ${bpe.tokens.length} tokens`,
    bpe.merges.length ? `First merges: ${bpe.merges.slice(0, 6).map((m) => `"${show(m.pair[0])}"+"${show(m.pair[1])}"`).join(', ')}` : '',
  ].filter(Boolean).join('\n');

  return (
    <LabFrame title="Tokenizer lab" hint="Type anything and see how it splits." result={message} onResult={onResult}>
      <textarea className="lab-text" value={text} rows={3} onChange={(e) => setText(e.target.value)} aria-label="Text to tokenize" />
      <div className="lab-tabs" role="tablist">
        {[['chars', `Characters · ${chars.length}`], ['words', `Words · ${words.length}`], ['subword', `Subwords · ${bpe.tokens.length}`]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className="lab-tab" onClick={() => setView(id)}>{label}</button>
        ))}
      </div>
      {view === 'subword' && (
        <label className="lab-slider">
          <span>Merges learned from this text: <b>{bpe.merges.length}</b></span>
          <input type="range" min="0" max="80" value={merges} onChange={(e) => setMerges(Number(e.target.value))} />
        </label>
      )}
      <Chips tokens={tokens} />
      <p className="lab-caption">
        {view === 'subword'
          ? (bpe.merges.length
            ? <>Most frequent pairs merged first: {bpe.merges.slice(0, 5).map((m) => <code key={m.token}>{show(m.token)}</code>)}. GPT tokenizers do this on huge amounts of text, ending with about 50,000 to 200,000 tokens.</>
            : 'No pair of characters repeats yet: add more text.')
          : view === 'chars'
            ? `${distinct(chars)} different characters: a tiny vocabulary, but long sequences.`
            : `${distinct(words)} different words: short sequences, but every new word needs its own token.`}
      </p>
    </LabFrame>
  );
}
