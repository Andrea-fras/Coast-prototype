import React, { useState } from 'react';
import { Check, FlaskConical, Send } from 'lucide-react';

/** The shell every lab shares: a title bar, the lab itself, and a footer that sends the result
 *  to Pedro. `result` is the message text, or null while there is nothing to send yet. */
export default function LabFrame({ title, hint, children, result, onResult, sendLabel = 'Send to Pedro' }) {
  const [sent, setSent] = useState(null);
  const canSend = Boolean(onResult && result);
  const send = () => {
    if (!canSend) return;
    if (onResult(result) !== false) setSent(result);
  };
  return (
    <section className="lab" aria-label={title}>
      <header className="lab__head">
        <FlaskConical size={15} aria-hidden="true" />
        <span className="lab__title">{title}</span>
        {hint && <span className="lab__hint">{hint}</span>}
      </header>
      <div className="lab__body">{children}</div>
      {onResult && (
        <footer className="lab__foot">
          {sent && sent === result ? (
            <span className="lab__sent"><Check size={14} aria-hidden="true" /> Sent to Pedro</span>
          ) : (
            <button type="button" className="lab__send" onClick={send} disabled={!canSend}>
              <Send size={14} aria-hidden="true" /> {sendLabel}
            </button>
          )}
        </footer>
      )}
    </section>
  );
}

/** A number input that keeps what the student types (including an empty box) until it's valid. */
export function NumberField({ label, value, onChange, min, max, step = 'any', unit, disabled }) {
  const [draft, setDraft] = useState(null);
  const shown = draft ?? (Number.isFinite(value) ? String(value) : '');
  return (
    <label className="lab-field">
      <span className="lab-field__label">{label}</span>
      <span className="lab-field__control">
        <input
          type="number" inputMode="decimal" value={shown} min={min} max={max} step={step} disabled={disabled}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setDraft(null)}
        />
        {unit && <span className="lab-field__unit">{unit}</span>}
      </span>
    </label>
  );
}
