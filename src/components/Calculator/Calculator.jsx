import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { X, GripHorizontal, Trash2, Delete, CornerDownLeft, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { evaluateAll, formatNumber, toFraction } from './calcEngine';
import './Calculator.css';

const POS_KEY = 'coast_calc_pos';
const STATE_KEY = 'coast_calc_state_v1';
const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 580;

let nextId = 1;
const row = (text = '') => ({ id: nextId++, text });

function getInitialPos() {
  try {
    const saved = JSON.parse(localStorage.getItem(POS_KEY));
    if (saved?.x != null && saved?.y != null) {
      return {
        x: Math.max(0, Math.min(window.innerWidth - 120, saved.x)),
        y: Math.max(0, Math.min(window.innerHeight - 40, saved.y)),
      };
    }
  } catch { /* Position persistence is optional; keep the calculator usable. */ }
  return {
    x: Math.max(8, window.innerWidth - DEFAULT_WIDTH - 24),
    y: Math.max(8, window.innerHeight - DEFAULT_HEIGHT - 24),
  };
}

function getInitialState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY));
    if (Array.isArray(saved?.rows) && saved.rows.length) {
      return { rows: saved.rows.slice(0, 100).map((t) => row(String(t))), angle: saved.angle === 'deg' ? 'deg' : 'rad' };
    }
  } catch { /* Saved rows are optional. */ }
  return { rows: [row()], angle: 'rad' };
}

function Tex({ latex, className }) {
  const html = useMemo(() => katex.renderToString(latex, { throwOnError: false, output: 'html', strict: false }), [latex]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

// Typing shortcuts, applied as you type: * → ×, pi → π, sqrt → √.
function prettify(text) {
  return text.replace(/\*/g, '×').replace(/pi/g, 'π').replace(/sqrt/g, '√');
}

// Keypad keys: `insert` goes in at the caret, which then sits `caret` characters into it.
const MAIN_KEYS = [
  { label: 'x²', latex: 'x^{2}', insert: '²' }, { label: 'xʸ', latex: 'x^{y}', insert: '^' }, { label: '√', insert: '√()', caret: 2, title: 'Square root' },
  { label: '7', num: true }, { label: '8', num: true }, { label: '9', num: true }, { label: '÷', op: true },
  { label: '(', insert: '(' }, { label: ')', insert: ')' }, { label: 'π', latex: '\\pi', insert: 'π' },
  { label: '4', num: true }, { label: '5', num: true }, { label: '6', num: true }, { label: '×', op: true },
  { label: '|a|', latex: '|a|', insert: '||', caret: 1 }, { label: ',', insert: ',' }, { label: 'e', latex: 'e', insert: 'e' },
  { label: '1', num: true }, { label: '2', num: true }, { label: '3', num: true }, { label: '−', op: true, insert: '-' },
  { label: 'ans', insert: 'ans' }, { label: 'n!', latex: 'n!', insert: '!' }, { label: '%', insert: '%' },
  { label: '0', num: true }, { label: '.', num: true }, { label: '=', insert: '=', title: 'Define a variable, e.g. a = 5' }, { label: '+', op: true },
];
const fn = (label, name, latex) => ({ label, latex, insert: `${name}()`, caret: name.length + 1 });
const FUNC_KEYS = [
  fn('sin', 'sin', '\\sin'), fn('cos', 'cos', '\\cos'), fn('tan', 'tan', '\\tan'),
  fn('ln', 'ln', '\\ln'), fn('log', 'log', '\\log'), fn('log₂', 'log2', '\\log_{2}'), { label: 'eˣ', latex: 'e^{x}', insert: 'e^' },
  fn('sin⁻¹', 'arcsin', '\\sin^{-1}'), fn('cos⁻¹', 'arccos', '\\cos^{-1}'), fn('tan⁻¹', 'arctan', '\\tan^{-1}'),
  { label: '10ˣ', latex: '10^{x}', insert: '10^' }, { label: '∛', insert: '∛()', caret: 2, title: 'Cube root' },
  { label: 'ⁿ√', insert: 'nthroot(,)', caret: 8, title: 'nthroot(x, n)' }, { label: 'x⁻¹', latex: 'x^{-1}', insert: '^-1' },
  fn('sinh', 'sinh', '\\sinh'), fn('cosh', 'cosh', '\\cosh'), fn('tanh', 'tanh', '\\tanh'),
  { label: 'nCr', insert: 'nCr(,)', caret: 4, title: 'nCr(n, r): ways to choose r of n' }, { label: 'nPr', insert: 'nPr(,)', caret: 4, title: 'nPr(n, r)' },
  { label: 'mod', insert: 'mod(,)', caret: 4, title: 'mod(a, b): remainder' }, { label: '°', insert: '°', title: 'Degrees, e.g. sin(30°)' },
  fn('floor', 'floor', '\\lfloor x\\rfloor'), fn('ceil', 'ceil', '\\lceil x\\rceil'), { label: 'round', insert: 'round()', caret: 6, title: 'round(x) or round(x, places)' },
  { label: 'min', insert: 'min(,)', caret: 4 }, { label: 'max', insert: 'max(,)', caret: 4 },
  { label: 'gcd', insert: 'gcd(,)', caret: 4 }, { label: 'lcm', insert: 'lcm(,)', caret: 4 },
];

const Calculator = ({ onClose }) => {
  const [pos, setPos] = useState(getInitialPos);
  const [{ rows, angle }, setCalc] = useState(getInitialState);
  const [activeId, setActiveId] = useState(() => null);
  const [tab, setTab] = useState('main');
  const [fractions, setFractions] = useState(() => new Set());
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const caretRef = useRef(null);

  const active = rows.find((r) => r.id === activeId) || rows[rows.length - 1];
  const results = useMemo(() => evaluateAll(rows.map((r) => r.text), angle), [rows, angle]);

  useEffect(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* optional */ }
  }, [pos]);
  useEffect(() => {
    try { localStorage.setItem(STATE_KEY, JSON.stringify({ rows: rows.map((r) => r.text), angle })); } catch { /* optional */ }
  }, [rows, angle]);

  // Put the caret where an edit or keypad press left it.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (caretRef.current != null) {
      el.focus();
      el.setSelectionRange(caretRef.current, caretRef.current);
      caretRef.current = null;
    }
  });

  const focusRow = useCallback((id, caret = 'end') => {
    setActiveId(id);
    const target = rows.find((r) => r.id === id);
    caretRef.current = caret === 'end' ? (target?.text.length ?? 0) : caret;
  }, [rows]);

  const setText = useCallback((id, text, caret) => {
    setCalc((c) => ({ ...c, rows: c.rows.map((r) => (r.id === id ? { ...r, text } : r)) }));
    if (caret != null) caretRef.current = caret;
  }, []);

  const addRowAfter = useCallback((id) => {
    const fresh = row();
    setCalc((c) => {
      const i = c.rows.findIndex((r) => r.id === id);
      const next = [...c.rows];
      next.splice(i + 1, 0, fresh);
      return { ...c, rows: next };
    });
    setActiveId(fresh.id);
    caretRef.current = 0;
    requestAnimationFrame(() => {
      listRef.current?.querySelector(`[data-row="${fresh.id}"]`)?.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  const removeRow = useCallback((id) => {
    setCalc((c) => {
      const left = c.rows.filter((r) => r.id !== id);
      return { ...c, rows: left.length ? left : [row()] };
    });
    setFractions((f) => { const n = new Set(f); n.delete(id); return n; });
  }, []);

  const clearAll = () => {
    const fresh = row();
    setCalc((c) => ({ ...c, rows: [fresh] }));
    setFractions(new Set());
    setActiveId(fresh.id);
    caretRef.current = 0;
  };

  const caretSpan = () => {
    const el = inputRef.current;
    if (el && document.activeElement === el) return [el.selectionStart ?? active.text.length, el.selectionEnd ?? active.text.length];
    return [active.text.length, active.text.length];
  };

  const insert = (text, caret = text.length) => {
    const [start, end] = caretSpan();
    setActiveId(active.id);
    setText(active.id, active.text.slice(0, start) + text + active.text.slice(end), start + caret);
  };

  const backspace = () => {
    const [start, end] = caretSpan();
    if (start !== end) { setText(active.id, active.text.slice(0, start) + active.text.slice(end), start); return; }
    if (start === 0) {
      const i = rows.findIndex((r) => r.id === active.id);
      if (!active.text && rows.length > 1) {
        removeRow(active.id);
        focusRow(rows[Math.max(0, i - 1)].id === active.id ? rows[i + 1].id : rows[Math.max(0, i - 1)].id);
      }
      return;
    }
    // Deleting "(" of an empty "()" removes the pair.
    const pair = active.text.slice(start - 1, start + 1);
    const cut = pair === '()' || pair === '||' ? 1 : 0;
    setText(active.id, active.text.slice(0, start - 1) + active.text.slice(start + cut), start - 1);
  };

  const moveCaret = (delta) => {
    const [start] = caretSpan();
    setActiveId(active.id);
    caretRef.current = Math.max(0, Math.min(active.text.length, start + delta));
    setCalc((c) => ({ ...c })); // re-render so the caret effect runs
  };

  const pressKey = (key) => {
    if (key.num) insert(key.label);
    else if (key.op) insert(key.insert || key.label);
    else insert(key.insert, key.caret ?? key.insert.length);
  };

  const onInputChange = (e) => {
    const el = e.target;
    const at = el.selectionStart ?? el.value.length;
    const before = prettify(el.value.slice(0, at));
    setText(active.id, before + prettify(el.value.slice(at)), before.length);
  };

  const onKeyDown = (e) => {
    const i = rows.findIndex((r) => r.id === active.id);
    if (e.key === 'Enter') { e.preventDefault(); addRowAfter(active.id); } else if (e.key === 'ArrowUp' && i > 0) { e.preventDefault(); focusRow(rows[i - 1].id); } else if (e.key === 'ArrowDown' && i < rows.length - 1) { e.preventDefault(); focusRow(rows[i + 1].id); } else if (e.key === 'Backspace' && !active.text && rows.length > 1) {
      e.preventDefault();
      removeRow(active.id);
      focusRow(rows[i > 0 ? i - 1 : 1].id);
    }
  };

  const toggleFraction = (id) => setFractions((f) => {
    const n = new Set(f);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handlePointerDown = useCallback((e) => {
    if (e.target.closest('button')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = { ...pos };
    const onMove = (ev) => {
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 120, startPos.x + ev.clientX - startX)),
        y: Math.max(0, Math.min(window.innerHeight - 40, startPos.y + ev.clientY - startY)),
      });
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [pos]);

  const keepFocus = (e) => e.preventDefault(); // keypad presses mustn't steal the caret
  const keys = tab === 'main' ? MAIN_KEYS : FUNC_KEYS;

  return createPortal(
    <div className="calc-floating" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label="Scientific calculator">
      <div className="calc-titlebar" onPointerDown={handlePointerDown}>
        <GripHorizontal size={14} className="calc-grip" />
        <span className="calc-title">Calculator</span>
        <div className="calc-angle" role="group" aria-label="Angle unit">
          {['deg', 'rad'].map((a) => (
            <button key={a} type="button" aria-pressed={angle === a} onClick={() => setCalc((c) => ({ ...c, angle: a }))}>
              {a === 'deg' ? 'DEG' : 'RAD'}
            </button>
          ))}
        </div>
        <button type="button" className="calc-icon" onClick={clearAll} aria-label="Clear all" title="Clear all">
          <Trash2 size={14} />
        </button>
        <button type="button" className="calc-icon" onClick={onClose} aria-label="Close calculator">
          <X size={15} />
        </button>
      </div>

      <div className="calc-list" ref={listRef}>
        {rows.map((r, i) => {
          const res = results[i];
          const isActive = r.id === active.id;
          const fraction = res.value != null ? toFraction(res.value) : null;
          const showFraction = fraction && fractions.has(r.id);
          const answer = res.value != null && !res.trivial
            ? (showFraction ? fraction.latex : formatNumber(res.value).latex) : null;
          return (
            <div
              key={r.id}
              data-row={r.id}
              className={`calc-row${isActive ? ' is-active' : ''}${res.error && !isActive ? ' has-error' : ''}`}
              onMouseDown={(e) => {
                if (e.target.closest('button, input')) return;
                e.preventDefault();
                focusRow(r.id);
              }}
            >
              <span className="calc-row__n">{i + 1}</span>
              <div className="calc-row__main">
                {isActive ? (
                  <input
                    ref={inputRef}
                    className="calc-input"
                    value={r.text}
                    onChange={onInputChange}
                    onKeyDown={onKeyDown}
                    onFocus={() => setActiveId(r.id)}
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                    inputMode="text"
                    aria-label={`Expression ${i + 1}`}
                    placeholder={i === 0 && rows.length === 1 ? 'Type a calculation, e.g. 2π·3²' : ''}
                  />
                ) : res.latex ? (
                  <Tex latex={res.latex} className="calc-tex" />
                ) : (
                  <span className="calc-raw">{r.text}</span>
                )}
                {answer && (
                  <button
                    type="button"
                    className={`calc-answer${fraction ? ' can-toggle' : ''}`}
                    onClick={() => fraction && toggleFraction(r.id)}
                    title={fraction ? (showFraction ? 'Show as a decimal' : 'Show as a fraction') : undefined}
                  >
                    <Tex latex={`=${answer}`} />
                  </button>
                )}
                {res.error && !isActive && (
                  <span className="calc-error"><AlertTriangle size={12} /> {res.error}</span>
                )}
              </div>
              {(r.text || rows.length > 1) && (
                <button type="button" className="calc-row__del" onClick={() => removeRow(r.id)} aria-label={`Delete expression ${i + 1}`}>
                  <X size={13} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="calc-pad">
        <div className="calc-pad__tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'main'} onMouseDown={keepFocus} onClick={() => setTab('main')}>123</button>
          <button type="button" role="tab" aria-selected={tab === 'func'} onMouseDown={keepFocus} onClick={() => setTab('func')}>functions</button>
        </div>
        <div className="calc-keys">
          {keys.map((key) => (
            <button
              key={key.label}
              type="button"
              className={`calc-key${key.num ? ' calc-key--num' : ''}${key.op ? ' calc-key--op' : ''}`}
              onMouseDown={keepFocus}
              onClick={() => pressKey(key)}
              title={key.title}
              aria-label={key.title || key.label}
            >
              {key.latex ? <Tex latex={key.latex} /> : key.label}
            </button>
          ))}
        </div>
        <div className="calc-nav">
          <button type="button" className="calc-key" onMouseDown={keepFocus} onClick={() => moveCaret(-1)} aria-label="Move left"><ChevronLeft size={17} /></button>
          <button type="button" className="calc-key" onMouseDown={keepFocus} onClick={() => moveCaret(1)} aria-label="Move right"><ChevronRight size={17} /></button>
          <button type="button" className="calc-key" onMouseDown={keepFocus} onClick={backspace} aria-label="Backspace"><Delete size={17} /></button>
          <button type="button" className="calc-key calc-key--enter" onMouseDown={keepFocus} onClick={() => addRowAfter(active.id)} aria-label="New line">
            <CornerDownLeft size={17} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default Calculator;
