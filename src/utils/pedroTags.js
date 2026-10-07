// Pedro's machine-readable tags are for the backend only — never shown to students. He writes
// them between ⟦ and ⟧ (⟦ANSWER_KEY: …⟧, ⟦SECTION_COMPLETE⟧), brackets teaching text never uses,
// so a tag holding a formula with square brackets still ends where he ended it. Saved replies
// carry them in the server's [NAME: body] form.
const TAG_NAMES = [
  'SECTION_COMPLETE', 'TEST_OUT_PASSED', 'ANSWER_CORRECT', 'ANSWER_WRONG', 'ANSWER_KEY',
  'PLACEMENT_PASSED', 'PLACEMENT_STOP', 'REMEMBER', 'CLICKED', 'TUTOR_CORRECTION', 'ONBOARDING_COMPLETE',
];
const NAMES = TAG_NAMES.join('|');
// A ⟦ tag runs to its ⟧ or, left open, to the end of its line.
const MODEL_TAG_RE = new RegExp(`⟦\\s*(?:${NAMES})\\b[^⟧\\n]*(?:⟧|$)`, 'gim');
const STORED_TAG_RE = new RegExp(`\\[\\s*(?:${NAMES})\\s*(?::[^\\]\\n]*)?\\]`, 'gi');
// While streaming, a tag can arrive half-written at the very end of the text.
const TRAILING_MODEL_RE = /⟦\s*([A-Za-z_]*)$/;
const TRAILING_OPEN_RE = /\[([A-Za-z_]*)(:[^\]\n]*)?$/;

const startsTag = (name) => TAG_NAMES.some((tag) => tag.startsWith(name.toUpperCase()));

function stripPartialTag(text) {
  const model = text.match(TRAILING_MODEL_RE);
  if (model) return startsTag(model[1]) ? text.slice(0, model.index) : text;
  const m = text.match(TRAILING_OPEN_RE);
  if (!m) return text;
  const name = m[1];
  if (name !== name.toUpperCase()) return text; // tags are always upper-case; "[Section" is prose
  const isTag = m[2] !== undefined ? TAG_NAMES.includes(name) : startsTag(name);
  return isTag ? text.slice(0, m.index) : text;
}

export function stripPedroTags(text) {
  return stripPartialTag((text || '').replace(MODEL_TAG_RE, '').replace(STORED_TAG_RE, '')).trim();
}
