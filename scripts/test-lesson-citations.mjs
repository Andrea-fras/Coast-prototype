import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkLessonCitations, { resolveLessonCitation } from '../src/utils/lessonCitations.js';

const sources = [
  { source_id: 'src_mechanics', title: 'Lecture 2', filename: 'Forces.pdf', source_type: 'pdf', page_count: 28 },
  { source_id: 'src_slides', title: 'Energy & Work', filename: 'Energy.pptx', source_type: 'pptx', page_count: 100 },
];
function parse(text, catalogue = sources) {
  const parser = unified().use(remarkParse).use(remarkMath).use(remarkLessonCitations, { sources: catalogue });
  return parser.runSync(parser.parse(text));
}
function links(tree) {
  const result = [];
  function walk(n) { if (n.type === 'link') result.push(n); for (const c of n.children || []) walk(c); }
  walk(tree); return result;
}
for (const text of ['Lecture 2, p. 12', '**Lecture 2**, page 12', '*Lecture 2, p. 12*',
  '(Source: "Lecture 2", pp. 12–14)', 'Forces.pdf | page 12']) {
  assert.equal(links(parse(text))[0]?.url, '#lesson-source/src_mechanics/12', text);
}
assert.equal(links(parse('Energy & Work, slide 100'))[0]?.url, '#lesson-source/src_slides/100');
for (const text of ['Unknown lecture, p. 12', 'Lecture 2, p. 0', 'Lecture 2, p. 29',
  'Lecture 2, pp. 12–40', 'Energy & Work, page 999', 'Lecture 2, p. 1.5',
  '`Lecture 2, p. 12`', '$Lecture 2, p. 12$', '![Lecture 2, p. 12](/image.png)',
  '~~~\nLecture 2, p. 12\n~~~']) {
  assert.equal(links(parse(text)).length, 0, text);
}
assert.equal(links(parse('[Lecture 2, p. 12](https://example.com)')).length, 1);
assert.equal(links(parse('Lecture 2, p. 12', [...sources, { ...sources[0], source_id: 'duplicate' }])).length, 0);
assert.equal(links(parse('**Before** Lecture 2, p. 12, then Energy & Work, slide 2.')).length, 2);
assert.equal(parse('**Before** Lecture 2, p. 12').children[0].children[0].type, 'strong');
assert.equal(resolveLessonCitation('#lesson-source/src_mechanics/12', sources)?.page, 12);
for (const href of ['#lesson-source/missing/1', '#lesson-source/src_mechanics/29',
  '#lesson-source/src_mechanics/-1', '#lesson-source/src_mechanics/1.5',
  '#lesson-source/../1', 'https://evil.test/#lesson-source/src_mechanics/1']) {
  assert.equal(resolveLessonCitation(href, sources), null, href);
}
console.log('Lesson citation parsing and target validation checks passed.');
