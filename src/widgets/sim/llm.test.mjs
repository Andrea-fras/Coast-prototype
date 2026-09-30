import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ATTENTION_SENTENCES, SCENARIOS, attentionWeights, bytePairEncode, entropyBits, sampleIndex, seededRandom, softmax } from './llm.js';
import { sameItem, scoreRecall } from './recall.js';

test('temperature: low picks the top token, high flattens the distribution', () => {
  const { logits } = SCENARIOS.fact;
  assert.ok(softmax(logits, 0.05)[0] > 0.999);
  assert.ok(entropyBits(softmax(logits, 2)) > entropyBits(softmax(logits, 1)));
  const p = softmax(logits, 1);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test('sampling follows the probabilities', () => {
  const rng = seededRandom(7);
  const counts = [0, 0];
  for (let i = 0; i < 20_000; i += 1) counts[sampleIndex([0.8, 0.2], rng)] += 1;
  assert.ok(Math.abs(counts[0] / 20_000 - 0.8) < 0.02, JSON.stringify(counts));
});

test('byte-pair encoding merges frequent pairs and never loses text', () => {
  const text = 'the cat and the hat and the bat';
  const { tokens, merges } = bytePairEncode(text, 10);
  assert.equal(tokens.join(''), text);
  assert.ok(tokens.length < text.length);
  assert.ok(merges.length > 0 && merges[0].count >= 2);
  assert.ok(tokens.includes(' the') || tokens.includes('the'), tokens.join('|'));
});

test('attention: "tired" looks back at the animal, "wide" at the street, "it" is torn', () => {
  const tired = ATTENTION_SENTENCES.tired;
  const w = attentionWeights(tired);
  const last = w[tired.length - 1];
  assert.equal(tired[last.indexOf(Math.max(...last))], 'animal');
  const wide = ATTENTION_SENTENCES.wide;
  const w2 = attentionWeights(wide).at(-1);
  assert.equal(wide[w2.indexOf(Math.max(...w2))], 'street');
  const it = w[tired.indexOf('it')];
  assert.ok(Math.abs(it[tired.indexOf('animal')] - it[tired.indexOf('street')]) < 1e-9);
  for (const row of w) assert.ok(Math.abs(row.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  w.forEach((row, i) => row.slice(i + 1).forEach((x) => assert.equal(x, 0)));
});

test('recall scoring forgives small differences but not wrong items', () => {
  assert.ok(sameItem('Mitocondria', 'mitochondria'));
  assert.ok(sameItem('the ribosomes', 'ribosome'));
  assert.ok(!sameItem('nucleus', 'lysosome'));
  const r = scoreRecall([{ place: 'door', item: 'Golgi' }, { place: 'sofa', item: 'nucleus' }], ['golgi', 'lysosome']);
  assert.equal(r.inPlace, 1);
  assert.equal(r.recalled, 1);
});
