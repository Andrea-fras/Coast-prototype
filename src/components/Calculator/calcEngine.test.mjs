import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAll, formatNumber, parse, toFraction, toLatex } from './calcEngine.js';

const one = (text, angle = 'rad') => evaluateAll([text], angle)[0];
const val = (text, angle) => {
  const r = one(text, angle);
  if (r.error) throw new Error(`${text}: ${r.error}`);
  return r.value;
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≉ ${b}`);

test('arithmetic and precedence', () => {
  assert.equal(val('1+2*3'), 7);
  assert.equal(val('(1+2)*3'), 9);
  assert.equal(val('2^3^2'), 512);
  assert.equal(val('-2^2'), -4);
  assert.equal(val('2^-1'), 0.5);
  assert.equal(val('10/4'), 2.5);
  assert.equal(val('7 − 2 × 3 ÷ 2'), 4);
  near(val('6.02E23 / 1E23'), 6.02);
});

test('implicit multiplication and constants', () => {
  near(val('2π'), 2 * Math.PI);
  near(val('2pi'), 2 * Math.PI);
  assert.equal(val('3(4)'), 12);
  assert.equal(val('(2)(3)'), 6);
  near(val('e'), Math.E);
  near(val('2sin(π/2)'), 2);
});

test('functions', () => {
  assert.equal(val('√16'), 4);
  assert.equal(val('√(9)+∛27'), 6);
  assert.equal(val('sqrt(2)^2').toFixed(10), '2.0000000000');
  assert.equal(val('|-5|+abs(-2)'), 7);
  assert.equal(val('log(1000)'), 3);
  assert.equal(val('log10(100)'), 2);
  assert.equal(val('log2(8)'), 3);
  near(val('ln(e^2)'), 2);
  assert.equal(val('5!'), 120);
  near(val('0.5!'), Math.sqrt(Math.PI) / 2);
  assert.equal(val('nCr(5,2)'), 10);
  assert.equal(val('nPr(5,2)'), 20);
  assert.equal(val('mod(-7,3)'), 2);
  assert.equal(val('round(3.14159,2)'), 3.14);
  assert.equal(val('max(1,5,3)'), 5);
  assert.equal(val('gcd(12,18)'), 6);
  assert.equal(val('50%'), 0.5);
  assert.equal(val('3²+4²'), 25);
  assert.equal(val('(-8)^(1/3)'), -2);
  assert.equal(val('nthroot(-32,5)'), -2);
});

test('angles: degrees and radians', () => {
  near(val('sin(30)', 'deg'), 0.5);
  assert.equal(val('sin(180)', 'deg'), 0);
  assert.equal(val('cos(90)', 'deg'), 0);
  near(val('arcsin(1)', 'deg'), 90);
  near(val('sin(π/6)'), 0.5);
  near(val('sin(30°)'), 0.5);
  near(val('sin 30', 'deg'), 0.5);
  assert.match(one('tan(90)', 'deg').error, /undefined/);
});

test('variables, ans and errors', () => {
  const rows = evaluateAll(['a = 3', 'b = a + 1', 'ab', 'ans * 2', '', 'c + 1', '1/0', '(2+3', 'sqrt(-1)']);
  assert.equal(rows[0].assign, 'a');
  assert.equal(rows[1].value, 4);
  assert.equal(rows[2].value, 12);
  assert.equal(rows[3].value, 24);
  assert.ok(rows[4].empty);
  assert.match(rows[5].error, /Define c/);
  assert.match(rows[6].error, /zero/);
  assert.match(rows[7].error, /closing bracket/);
  assert.match(rows[8].error, /Undefined/);
  assert.match(one('pi = 3').error ?? '', /single letter|missing/i);
  assert.match(one('2 +').error, /missing/i);
});

test('nothing reaches JavaScript eval', () => {
  for (const attack of ['alert(1)', 'constructor', 'this', '__proto__', 'x=>x', '`1`', 'globalThis']) {
    const r = one(attack);
    assert.ok(r.error || typeof r.value === 'number', attack);
  }
  assert.throws(() => parse('a;b'));
});

test('display', () => {
  assert.equal(toLatex(parse('1/2+√x')), '\\frac{1}{2}+\\sqrt{x}');
  assert.equal(toLatex(parse('2π')), '2\\pi');
  assert.equal(toLatex(parse('sin(30)^2')), '{\\sin\\left(30\\right)}^{2}');
  assert.equal(formatNumber(0.1 + 0.2).text, '0.3');
  assert.equal(formatNumber(1 / 3).text, '0.3333333333');
  assert.equal(formatNumber(6.02e23).latex, '6.02\\times 10^{23}');
  assert.equal(formatNumber(1e-16).text, '0');
  assert.deepEqual(toFraction(0.75).latex, '\\frac{3}{4}');
  assert.equal(toFraction(-1 / 3).latex, '-\\frac{1}{3}');
  assert.equal(toFraction(Math.PI), null);
  assert.equal(toFraction(2), null);
});
