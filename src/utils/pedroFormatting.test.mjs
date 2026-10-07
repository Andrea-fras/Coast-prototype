// node --test src/utils/pedroFormatting.test.mjs
// Pedro writes math as \( … \) and \[ … \]; a $ is a currency sign. These tests parse the result
// with the same markdown and math parser the app uses, so they check what the student sees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import { formatPedroForDisplay as format } from './pedroFormatting.js';

const parse = (markdown) => unified().use(remarkParse).use(remarkMath, { singleDollarTextMath: false }).runSync(
  unified().use(remarkParse).use(remarkMath, { singleDollarTextMath: false }).parse(markdown));
function collect(node, out = { inline: [], display: [], text: '' }) {
  if (node.type === 'inlineMath') out.inline.push(node.value);
  else if (node.type === 'math') out.display.push(node.value);
  else if (node.type === 'text') out.text += node.value;
  (node.children || []).forEach((c) => collect(c, out));
  return out;
}
const seen = (reply) => collect(parse(format(reply)));

test('inline formulas render as math, prices as text', () => {
  const r = seen('With probability \\(0.7\\) and reward \\(4\\), the meal cost $5 and the tip $2. So \\(V^\\pi(s)=4+\\gamma\\).');
  assert.deepEqual(r.inline, ['0.7', '4', 'V^\\pi(s)=4+\\gamma']);
  assert.deepEqual(r.display, []);
  assert.match(r.text, /cost \$5 and the tip \$2/);
});

test('a displayed equation on its own lines renders as a block', () => {
  assert.deepEqual(seen('Then\n\\[\nV = r + \\gamma P V\n\\]\nholds.').display, ['V = r + \\gamma P V']);
  assert.deepEqual(seen('Then\n\\[V = r\\]\nholds.').display, ['V = r']);
});

test('a displayed equation inside a question box stays in the box', () => {
  const md = format('> [!QUESTION] Practice\n> Solve\n> \\[\n> x = 1\n> \\]\n> now.');
  const box = parse(md).children[0];
  assert.equal(box.type, 'blockquote');
  assert.deepEqual(collect(box).display, ['x = 1']);
});

test('two inline formulas on one line stay inline', () => {
  const r = seen('\\(a\\) and \\(b\\)');
  assert.deepEqual(r.inline, ['a', 'b']);
  assert.deepEqual(r.display, []);
});

test('\\[ \\] inside a sentence renders inline', () => {
  assert.deepEqual(seen('so \\[x=1\\] holds').inline, ['x=1']);
});

test('code keeps its text', () => {
  const md = '```python\nprint("\\(raw\\)", "$5")\n```\nand `\\(x\\)` too';
  assert.equal(format(md), md);
});

test('µ inside a formula is typeset', () => {
  assert.deepEqual(seen('size \\(5µm\\)').inline, ['5\\mu{}m']);
});

test('a bare question box is quoted, its hidden tag left outside', () => {
  assert.equal(format('plans.\n\n[!QUESTION] Practice\nConsider \\(x\\).\n[ANSWER_CORRECT: a]'),
    'plans.\n\n> [!QUESTION] Practice\n> Consider $$x$$.\n[ANSWER_CORRECT: a]');
});

test('a box marker inside a sentence starts its own box', () => {
  assert.equal(format('Nice work. [!QUESTION] Practice\nWhy?'), 'Nice work.\n\n> [!QUESTION] Practice\n> Why?');
});

test('a box that is already right is left alone', () => {
  assert.equal(format('> [!KEY]\n> A rule.'), '> [!KEY]\n> A rule.');
});

test('while streaming, a formula still being written is held back', () => {
  assert.equal(format('Done \\(x\\). The value is \\(\\gam', { streaming: true }), 'Done $$x$$. The value is ');
  assert.equal(format('Done \\(x\\). The value is \\(\\gamma\\)', { streaming: true }), 'Done $$x$$. The value is $$\\gamma$$');
});

test('while streaming, a line that has only begun is held back', () => {
  for (const tail of ['==', '-', '---']) {
    assert.equal(format(`Intro.\n\n> [!KEY]\n> ${tail}`, { streaming: true }), 'Intro.\n\n> [!KEY]', tail);
  }
  assert.equal(format('Intro.\n\n> [!KEY]\n> ==Big', { streaming: true }), 'Intro.\n\n> [!KEY]\n> ==Big');
  assert.equal(format('A\n---'), 'A\n---');
});
