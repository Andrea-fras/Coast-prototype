import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G0, designProblems, idealDeltaV, liftoffRatio, minimumHardware, simulate } from './rocket.js';

const one = (over = {}) => ({
  stages: [{ dryMass: 400, fuelMass: 600, thrust: 20_000, exhaustVelocity: 2_900, ...over }],
  payload: 0, diameter: 0.5,
});

test('ideal Δv is the rocket equation', () => {
  assert.ok(Math.abs(idealDeltaV(one()) - 2_900 * Math.log(1000 / 400)) < 1e-9);
});

test('two stages: each stage carries everything above it', () => {
  const design = { stages: [
    { dryMass: 50, fuelMass: 450, thrust: 20_000, exhaustVelocity: 2_900 },
    { dryMass: 10, fuelMass: 90, thrust: 3_000, exhaustVelocity: 2_900 },
  ], payload: 10 };
  const expected = 2_900 * Math.log(610 / 160) + 2_900 * Math.log(110 / 20);
  assert.ok(Math.abs(idealDeltaV(design) - expected) < 1e-9);
});

test('in empty space the final speed equals the ideal Δv', () => {
  const r = simulate(one(), { gravity: false, drag: false });
  assert.ok(Math.abs(r.burnout.v - r.idealDeltaV) < 0.5, `${r.burnout.v} vs ${r.idealDeltaV}`);
});

test('burnout speed = ideal Δv − gravity loss − drag loss', () => {
  const r = simulate(one());
  assert.ok(Math.abs(r.burnout.v - (r.idealDeltaV - r.gravityLoss - r.dragLoss)) < 1, JSON.stringify(r.burnout));
  assert.ok(r.gravityLoss > 0 && r.dragLoss > 0);
});

test('no air: apogee matches burnout height + v²/2g (small rocket, gravity nearly constant)', () => {
  const r = simulate(one({ fuelMass: 30, dryMass: 100, thrust: 3_000 }), { drag: false });
  assert.ok(r.apogee < 40_000, 'keep it low so g is nearly constant');
  const expected = r.burnout.h + r.burnout.v ** 2 / (2 * G0);
  assert.ok(Math.abs(r.apogee - expected) / expected < 0.01, `${r.apogee} vs ${expected}`);
});

test('a rocket heavier than its thrust stays on the pad', () => {
  const r = simulate(one({ thrust: 9_000 }));
  assert.equal(r.liftoff, false);
  assert.ok(liftoffRatio(one({ thrust: 9_000 })) < 1 && liftoffRatio(one({ thrust: 10_000 })) > 1);
});

test('the same total mass flies higher in two stages', () => {
  const single = { stages: [{ dryMass: 120, fuelMass: 1_080, thrust: 30_000, exhaustVelocity: 2_900 }], payload: 10, diameter: 0.4 };
  const staged = { stages: [
    { dryMass: 90, fuelMass: 810, thrust: 30_000, exhaustVelocity: 2_900 },
    { dryMass: 30, fuelMass: 270, thrust: 6_000, exhaustVelocity: 2_900 },
  ], payload: 10, diameter: 0.4 };
  assert.ok(idealDeltaV(staged) > idealDeltaV(single));
  assert.ok(simulate(staged).apogee > simulate(single).apogee);
});

test('the design rules name what is missing', () => {
  assert.deepEqual(designProblems(one()), []);
  assert.equal(minimumHardware(600, 20_000), 170);
  assert.match(designProblems(one({ dryMass: 169 })).join(' '), /at least 170 kg/);
  assert.deepEqual(designProblems(one({ dryMass: 170 })), []);
});

test('a reasonable sounding rocket reaches space', () => {
  const design = { stages: [
    { dryMass: 150, fuelMass: 1_350, thrust: 45_000, exhaustVelocity: 2_900 },
    { dryMass: 30, fuelMass: 270, thrust: 7_000, exhaustVelocity: 2_900 },
  ], payload: 10, diameter: 0.35 };
  const r = simulate(design);
  assert.ok(r.reachedSpace, `apogee ${Math.round(r.apogee / 1000)} km`);
});

test('the lab scenes start where the workshop notes say they do', () => {
  const d = (stages, payload = 0, diameter = 0.5) => ({ payload, diameter,
    stages: stages.map(([f, dry, kN]) => ({ fuelMass: f, dryMass: dry, thrust: kN * 1000, exhaustVelocity: 2_900 })) });
  const km = (design) => simulate(design).apogee / 1000;
  assert.ok(liftoffRatio(d([[600, 400, 9]])) < 1);                               // lift-off: stays on the pad
  assert.equal(Math.round(idealDeltaV(d([[600, 400, 20]]))), 2_657);             // rocket equation
  assert.equal(Math.round(idealDeltaV(d([[1_200, 400, 20]]))), 4_020);           // double the fuel: +51%
  assert.ok(Math.abs(km(d([[400, 400, 15]])) - 73) < 2);                           // flight: 73 km
  assert.ok(Math.abs(km(d([[450, 250, 20], [150, 150, 5]])) - 337) < 5);           // staging: 337 km...
  assert.ok(Math.abs(km(d([[600, 400, 20]])) - 167) < 3);                          // ...against 167 km as one stage
  assert.ok(Math.abs(km(d([[300, 300, 10]], 10)) - 55) < 2);                       // mission start: short of space
  assert.ok(simulate(d([[50, minimumHardware(50, 1_100), 1.1]], 10, 0.15)).reachedSpace);  // a ~74 kg rocket can make it
});
