import React from 'react';
import { Check, Sparkles } from 'lucide-react';

/**
 * Actual preparation stages. Model generation has no measurable percentage.
 */
export default function LessonPrepareProgress({
  percent = 0,
  stage = 'sources',
  indeterminate = true,
  elapsedMs = 0,
  statusLine = '',
  tip = '',
  done = false,
  error = null,
}) {
  return (
    <div className="fv-v2-prepare" role="status" aria-live="polite">
      <ol className="fv-v2-prepare-steps" aria-label="Lesson preparation stages">
        {['Sources', 'Roadmap', 'First section'].map((label, index) => {
          const current = ['sources', 'roadmap', 'section', 'done'].indexOf(stage);
          return <li key={label} className={index < current ? 'is-complete' : index === current ? 'is-current' : ''}
            aria-current={index === current ? 'step' : undefined}>
            <span>{index < current ? <Check size={12} /> : index + 1}</span>{label}
          </li>;
        })}
      </ol>
      <div className="fv-v2-prepare-bar-wrap" role="progressbar" aria-label={statusLine || 'Preparing lesson'}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={!indeterminate || done ? (done ? 100 : percent) : undefined}>
        <div
          className={`fv-v2-prepare-bar${done ? ' fv-v2-prepare-bar--done' : indeterminate ? ' fv-v2-prepare-bar--indeterminate' : ''}`}
          style={{ width: done ? '100%' : indeterminate ? '35%' : `${Math.min(100, Math.max(0, percent || 0))}%` }}
        />
      </div>

      <p className="fv-v2-prepare-status">
        {done ? (
          <>
            <Check size={18} className="fv-v2-prepare-check" aria-hidden />
            {statusLine || 'Your lesson is ready!'}
          </>
        ) : (
          statusLine || 'Preparing your lesson…'
        )}
      </p>
      {!done && <p className="fv-v2-prepare-detail" aria-live="off">
        {stage === 'roadmap' ? 'Pedro is arranging your topics and learning objectives.' : 'You can return to the library while this prepares.'}
        {elapsedMs >= 1000 && ` · ${Math.floor(elapsedMs / 60000)}:${String(Math.floor(elapsedMs / 1000) % 60).padStart(2, '0')} elapsed`}
      </p>}

      {!done && tip && (
        <div className="fv-v2-prepare-tip">
          <span className="fv-v2-prepare-tip-label">
            <Sparkles size={12} aria-hidden />
            Pedro tip
          </span>
          <p className="fv-v2-prepare-tip-text">{tip}</p>
        </div>
      )}

      {error && <p className="fv-v2-error fv-v2-gen-error">{error}</p>}
    </div>
  );
}
