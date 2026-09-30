// Pedro's machine-readable tags ([ANSWER_CORRECT: concept | hinted], [SECTION_COMPLETE],
// [REMEMBER: …], [CLICKED: …], …) are for the backend only — never shown to students.
const TAG_NAMES = [
  'SECTION_COMPLETE', 'TEST_OUT_PASSED', 'ANSWER_CORRECT', 'ANSWER_WRONG',
  'PLACEMENT_PASSED', 'PLACEMENT_STOP', 'REMEMBER', 'CLICKED', 'TUTOR_CORRECTION',
];
const PEDRO_TAG_RE = new RegExp(`\\[(?:${TAG_NAMES.join('|')})(?::[^\\]\\n]*)?\\]`, 'gi');
// While streaming, a tag can arrive half-written at the very end of the text.
const TRAILING_OPEN_RE = /\[([A-Za-z_]*)(:[^\]\n]*)?$/;

function stripPartialTag(text) {
  const m = text.match(TRAILING_OPEN_RE);
  if (!m) return text;
  const name = m[1];
  if (name !== name.toUpperCase()) return text; // tags are always upper-case; "[Section" is prose
  const isTag = m[2] !== undefined
    ? TAG_NAMES.includes(name)
    : TAG_NAMES.some((tag) => tag.startsWith(name));
  return isTag ? text.slice(0, m.index) : text;
}

export function stripPedroTags(text) {
  return stripPartialTag((text || '').replace(PEDRO_TAG_RE, '')).trim();
}
