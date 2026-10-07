// node --test src/utils/pedroTags.test.mjs
// Pedro's tags never reach the student: written ⟦…⟧ while streaming, stored as [NAME: body].
import test from 'node:test';
import assert from 'node:assert/strict';
import { stripPedroTags as strip } from './pedroTags.js';

test('a tag holding square brackets is hidden whole', () => {
  const reply = 'Right.\n\n⟦ANSWER_CORRECT: expected value⟧\n⟦ANSWER_KEY: \\(0.8[0.75(6)+0.25(2)]=6\\)⟧\n⟦SECTION_COMPLETE⟧';
  assert.equal(strip(reply), 'Right.');
});

test('the stored form is hidden, brackets in its body kept full-width', () => {
  assert.equal(strip('Right.\n\n[ANSWER_KEY: \\(0.8［0.75(6)］=6\\)]\n[ANSWER_CORRECT: ev | hinted]'), 'Right.');
});

test('a tag left open ends at its line', () => {
  assert.equal(strip('Right.\n⟦ANSWER_KEY: 6\nMore text'), 'Right.\n\nMore text');
});

test('a tag arriving half-written is held back while streaming', () => {
  for (const partial of ['⟦', '⟦ANS', '⟦ANSWER_KEY: 0.8[0.7', '⟦answer_k']) {
    assert.equal(strip(`Right.\n\n${partial}`), 'Right.');
  }
});

test('⟦ ⟧ that is not a tag stays, and so does prose in brackets', () => {
  assert.equal(strip('The meaning ⟦e⟧ of e.'), 'The meaning ⟦e⟧ of e.');
  assert.equal(strip('See [Section 2] and the interval [0, 1].'), 'See [Section 2] and the interval [0, 1].');
});
