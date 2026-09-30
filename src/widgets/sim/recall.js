// Scoring for the memory palace recall lab: which items came back, in which place.

const normalise = (s) => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
  .replace(/\b(the|a|an)\b /g, '').replace(/s\b/g, '');

function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** Same item, allowing plurals, articles, case and a small typo ("mitocondria"). */
export function sameItem(answer, target) {
  const a = normalise(answer); const b = normalise(target);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  return distance(a, b) <= (b.length >= 8 ? 2 : b.length >= 5 ? 1 : 0);
}

/** Score an attempt: per location, whether the right item came back there. */
export function scoreRecall(targets, answers) {
  const perPlace = targets.map((t, i) => ({ ...t, answer: answers[i] || '', correct: sameItem(answers[i], t.item) }));
  const recalled = targets.filter((t) => answers.some((a) => sameItem(a, t.item))).length;
  return { inPlace: perPlace.filter((p) => p.correct).length, recalled, total: targets.length, perPlace };
}
