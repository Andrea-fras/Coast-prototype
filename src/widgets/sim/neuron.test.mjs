import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEARNING, NEURON, coincidence, firingRate, learningTrial, peakVoltage, rheobase, simulate, step } from './neuron.js';

test('below rheobase the neuron settles under threshold and never fires', () => {
  assert.ok(Math.abs(rheobase() - 1.5) < 1e-12);
  const run = simulate({ input: step(1.4) });
  assert.equal(run.spikes.length, 0);
  const settled = run.v[Math.round(400 / 0.05)];
  assert.ok(Math.abs(settled - (NEURON.rest + 14)) < 0.2, `settles at rest + R·I, got ${settled}`);
});

test('above rheobase it fires at the rate the exact solution predicts', () => {
  for (const current of [2, 3, 5]) {
    const run = simulate({ input: step(current, 0, 1000), duration: 1000 });
    const measured = run.spikes.length;  // spikes in one second = Hz
    assert.ok(Math.abs(measured - firingRate(current)) <= 2, `${current} nA: ${measured} vs ${firingRate(current)}`);
  }
});

test('the rate rises with current but can never exceed 1 / refractory period', () => {
  assert.ok(firingRate(3) > firingRate(2));
  assert.ok(firingRate(1000) < 1000 / NEURON.refractory);
});

test('one input alone stays below threshold; two coincident inputs fire it', () => {
  const r = coincidence({ weightA: 5, weightB: 5, delay: 0 });
  assert.equal(r.a.spikes.length, 0);
  assert.equal(r.b.spikes.length, 0);
  assert.equal(r.both.spikes.length, 1);
  assert.ok(peakVoltage(r.a) > NEURON.rest + 5, 'a visible EPSP');
});

test('inputs far apart in time do not add up enough', () => {
  assert.equal(coincidence({ weightA: 5, weightB: 5, delay: 40 }).both.spikes.length, 0);
});

test('an inhibitory input cancels the excitation', () => {
  assert.equal(coincidence({ weightA: 9, weightB: -6, delay: 0 }).both.spikes.length, 0);
  assert.equal(coincidence({ weightA: 9, weightB: -6, delay: 0 }).a.spikes.length, 1);
});

test('pairing the bell with food makes the bell work alone; the bell alone then extinguishes it', () => {
  let w = LEARNING.bellStart;
  assert.equal(learningTrial(w, { bell: true, food: false }).fired, false);
  let pairings = 0;
  while (!learningTrial(w, { bell: true, food: false }).fired && pairings < 20) {
    w = learningTrial(w, { bell: true, food: true }).weight;
    pairings += 1;
  }
  assert.ok(pairings >= 5 && pairings <= 10, `took ${pairings} pairings`);
  let alone = 0;
  while (learningTrial(w, { bell: true, food: false }).fired && alone < 20) {
    w = learningTrial(w, { bell: true, food: false }).weight;
    alone += 1;
  }
  assert.ok(alone >= 1 && alone < 20, `extinguished after ${alone} bell-only trials`);
});
