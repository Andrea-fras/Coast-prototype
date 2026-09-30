// The calculator's maths: a small, safe expression language (nothing is ever passed to eval).
// parse(text) → tree, evaluate(tree, env, angle) → number, toLatex(tree) → KaTeX source for
// the typeset view, and formatting helpers. Behaves like Desmos's scientific calculator:
// implicit multiplication (2π, 3(4), 2sin(30)), e is Euler's number, log is base 10,
// "a = 5" defines a variable later rows can use, and "ans" is the previous answer.

export class CalcError extends Error {}

const FUNCTIONS = {
  sin: 1, cos: 1, tan: 1, csc: 1, sec: 1, cot: 1,
  arcsin: 1, arccos: 1, arctan: 1, asin: 1, acos: 1, atan: 1,
  sinh: 1, cosh: 1, tanh: 1,
  ln: 1, log: 1, log2: 1, exp: 1,
  sqrt: 1, cbrt: 1, nthroot: 2, abs: 1,
  floor: 1, ceil: 1, round: [1, 2], sign: 1,
  mod: 2, ncr: 2, npr: 2, gcd: [2, Infinity], lcm: [2, Infinity], min: [1, Infinity], max: [1, Infinity],
};
const ALIASES = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', nCr: 'ncr', nPr: 'npr', root: 'nthroot', log10: 'log' };
const CONSTANTS = { pi: Math.PI, 'π': Math.PI, tau: 2 * Math.PI, 'τ': 2 * Math.PI, e: Math.E };
const WORDS = [...Object.keys(FUNCTIONS), ...Object.keys(ALIASES), 'ans', 'pi', 'tau'].sort((a, b) => b.length - a.length);
const RESERVED = new Set([...Object.keys(FUNCTIONS), ...Object.keys(ALIASES).map((k) => k.toLowerCase()), 'ans', 'pi', 'tau', 'e', 'π', 'τ']);

/* ── tokens ─────────────────────────────────────────────────────────────── */

const SYMBOLS = {
  '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '·': '*', '⋅': '*', '/': '/', '÷': '/',
  '^': '^', '(': '(', ')': ')', '[': '(', ']': ')', ',': ',', '!': '!', '%': '%', '=': '=', '|': '|',
  '√': '√', '∛': '∛', '²': '²', '³': '³', '°': '°',
};

export function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?/.exec(text.slice(i));
    if (num) {
      tokens.push({ type: 'num', value: Number(num[0]), text: num[0] });
      i += num[0].length;
      continue;
    }
    if (/[A-Za-zα-ωΑ-Ω]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-zα-ωΑ-Ω]/.test(text[j])) j += 1;
      // "log2"/"log10": digits that belong to a function name
      const digits = /^\d+/.exec(text.slice(j));
      let run = text.slice(i, j);
      if (digits && /log$/i.test(run) && (digits[0] === '2' || digits[0] === '10')) { run += digits[0]; j += digits[0].length; }
      // Split a run of letters into known words and single-letter variables: "sinx" → sin x.
      let k = 0;
      while (k < run.length) {
        const rest = run.slice(k);
        const word = WORDS.find((w) => rest.toLowerCase().startsWith(w.toLowerCase()));
        if (word) {
          const name = (ALIASES[word] || word).toLowerCase();
          tokens.push({ type: 'name', value: name, text: rest.slice(0, word.length) });
          k += word.length;
        } else {
          tokens.push({ type: 'name', value: rest[0], text: rest[0] });
          k += 1;
        }
      }
      i = j;
      continue;
    }
    if (SYMBOLS[ch]) {
      tokens.push({ type: SYMBOLS[ch], text: ch });
      i += 1;
      continue;
    }
    throw new CalcError(`“${ch}” isn’t something I can calculate with`);
  }
  return tokens;
}

/* ── parser ─────────────────────────────────────────────────────────────── */

export function parse(text) {
  const tokens = tokenize(text);
  if (!tokens.length) return null;
  let pos = 0;
  let absDepth = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (type, message) => {
    if (peek()?.type !== type) throw new CalcError(message);
    return next();
  };

  const startsPrimary = (t) => t && (t.type === 'num' || t.type === 'name' || t.type === '(' || t.type === '√'
    || t.type === '∛' || (t.type === '|' && absDepth === 0));

  function expression() {
    let left = term();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type;
      left = { type: 'bin', op, left, right: term() };
    }
    return left;
  }

  function term() {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t && (t.type === '*' || t.type === '/')) {
        next();
        left = { type: 'bin', op: t.type, left, right: unary() };
      } else if (startsPrimary(t)) {
        left = { type: 'bin', op: '*', implicit: true, left, right: power() };
      } else {
        return left;
      }
    }
  }

  function unary() {
    if (peek()?.type === '-') { next(); return { type: 'neg', arg: unary() }; }
    if (peek()?.type === '+') { next(); return unary(); }
    return power();
  }

  function power() {
    const base = postfix(primary());
    if (peek()?.type === '^') {
      next();
      if (!peek()) throw new CalcError('Add an exponent after ^');
      return { type: 'bin', op: '^', left: base, right: unary() }; // right-associative; 2^-1 works
    }
    return base;
  }

  function postfix(node) {
    for (;;) {
      const t = peek()?.type;
      if (t === '!') { next(); node = { type: 'post', op: '!', arg: node }; } else if (t === '%') { next(); node = { type: 'post', op: '%', arg: node }; } else if (t === '²' || t === '³') { next(); node = { type: 'bin', op: '^', left: node, right: { type: 'num', value: t === '²' ? 2 : 3, text: t === '²' ? '2' : '3' }, sup: true }; } else if (t === '°') { next(); node = { type: 'post', op: '°', arg: node }; } else return node;
    }
  }

  function args(name) {
    expect('(', `Add brackets after ${name}`);
    const list = [];
    if (peek()?.type !== ')') {
      list.push(expression());
      while (peek()?.type === ',') { next(); list.push(expression()); }
    }
    expect(')', 'Missing a closing bracket )');
    return list;
  }

  function primary() {
    const t = next();
    if (!t) throw new CalcError('Something is missing at the end');
    if (t.type === 'num') return { type: 'num', value: t.value, text: t.text };
    if (t.type === '(') {
      if (peek()?.type === ')') throw new CalcError('Empty brackets');
      const inner = expression();
      expect(')', 'Missing a closing bracket )');
      return { type: 'group', arg: inner };
    }
    if (t.type === '|') {
      absDepth += 1;
      const inner = expression();
      expect('|', 'Missing a closing |');
      absDepth -= 1;
      return { type: 'call', name: 'abs', args: [inner], bars: true };
    }
    if (t.type === '√' || t.type === '∛') {
      const arg = peek()?.type === '(' ? primary() : power();
      return { type: 'call', name: t.type === '√' ? 'sqrt' : 'cbrt', args: [arg] };
    }
    if (t.type === 'name') {
      const name = t.value;
      if (FUNCTIONS[name]) {
        if (peek()?.type === '(') return { type: 'call', name, args: args(name) };
        if (!startsPrimary(peek())) throw new CalcError(`Add brackets after ${name}`);
        return { type: 'call', name, args: [power()] }; // "sin 30", "ln2"
      }
      if (name === 'ans') return { type: 'ans' };
      if (name in CONSTANTS) return { type: 'const', name: name === 'π' ? 'pi' : name === 'τ' ? 'tau' : name };
      return { type: 'var', name };
    }
    if (t.type === ')') throw new CalcError('There’s an extra closing bracket )');
    throw new CalcError(`Something is missing before “${t.text}”`);
  }

  // "a = expression" defines a variable; anything else is a plain calculation.
  let assign = null;
  if (tokens.length > 2 && tokens[0].type === 'name' && tokens[1].type === '=' && !RESERVED.has(tokens[0].value.toLowerCase())) {
    assign = tokens[0].value;
    pos = 2;
  }
  const tree = expression();
  if (pos < tokens.length) {
    const t = tokens[pos];
    if (t.type === ')') throw new CalcError('There’s an extra closing bracket )');
    if (t.type === '=') throw new CalcError('Only a single letter can be set with =, like a = 5');
    throw new CalcError(`Something is missing before “${t.text}”`);
  }
  return assign ? { type: 'assign', name: assign, value: tree } : tree;
}

/* ── evaluation ─────────────────────────────────────────────────────────── */

function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * t ** (z + 0.5) * Math.exp(-t) * x;
}

function factorial(n) {
  if (Number.isInteger(n)) {
    if (n < 0) throw new CalcError('Factorials of negative whole numbers are undefined');
    if (n > 170) return Infinity;
    let r = 1;
    for (let i = 2; i <= n; i += 1) r *= i;
    return r;
  }
  return gamma(n + 1);
}

const isWhole = (x) => Number.isInteger(x) || Math.abs(x - Math.round(x)) < 1e-9;
function gcd2(a, b) {
  a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

function call(name, a, angle) {
  const toRad = (x) => (angle === 'deg' ? (x * Math.PI) / 180 : x);
  const fromRad = (x) => (angle === 'deg' ? (x * 180) / Math.PI : x);
  // Exact values at the angles people type most (sin 180° is 0, not 1.2e-16).
  const trig = (f, x) => {
    const r = toRad(x);
    const v = f(r);
    return Math.abs(v) < 1e-15 ? 0 : v;
  };
  switch (name) {
    case 'sin': return trig(Math.sin, a[0]);
    case 'cos': return trig(Math.cos, a[0]);
    case 'tan': {
      if (Math.abs(Math.cos(toRad(a[0]))) < 1e-15) throw new CalcError('tan is undefined here');
      return trig(Math.tan, a[0]);
    }
    case 'csc': return 1 / trig(Math.sin, a[0]);
    case 'sec': return 1 / trig(Math.cos, a[0]);
    case 'cot': return 1 / trig(Math.tan, a[0]);
    case 'arcsin': return fromRad(Math.asin(a[0]));
    case 'arccos': return fromRad(Math.acos(a[0]));
    case 'arctan': return fromRad(Math.atan(a[0]));
    case 'sinh': return Math.sinh(a[0]);
    case 'cosh': return Math.cosh(a[0]);
    case 'tanh': return Math.tanh(a[0]);
    case 'ln': return Math.log(a[0]);
    case 'log': return Math.log10(a[0]);
    case 'log2': return Math.log2(a[0]);
    case 'exp': return Math.exp(a[0]);
    case 'sqrt': return Math.sqrt(a[0]);
    case 'cbrt': return Math.cbrt(a[0]);
    case 'nthroot': {
      const [x, n] = a;
      if (x < 0 && isWhole(n) && Math.round(n) % 2 === 1) return -((-x) ** (1 / n));
      return x ** (1 / n);
    }
    case 'abs': return Math.abs(a[0]);
    case 'floor': return Math.floor(a[0]);
    case 'ceil': return Math.ceil(a[0]);
    case 'round': {
      const places = a.length > 1 ? Math.round(a[1]) : 0;
      const f = 10 ** places;
      return Math.round(a[0] * f) / f;
    }
    case 'sign': return Math.sign(a[0]);
    case 'mod': return ((a[0] % a[1]) + a[1]) % a[1];
    case 'ncr': case 'npr': {
      const [n, r] = a;
      if (!isWhole(n) || !isWhole(r) || r < 0 || n < 0) throw new CalcError(`${name === 'ncr' ? 'nCr' : 'nPr'} needs whole numbers`);
      if (r > n) return 0;
      let v = 1;
      for (let i = 0; i < r; i += 1) v *= (n - i) / (name === 'ncr' ? i + 1 : 1);
      return Math.round(v);
    }
    case 'gcd': return a.reduce(gcd2);
    case 'lcm': return a.reduce((x, y) => Math.abs(Math.round(x) * Math.round(y)) / gcd2(x, y));
    case 'min': return Math.min(...a);
    case 'max': return Math.max(...a);
    default: throw new CalcError(`${name} isn’t a function I know`);
  }
}

export function evaluate(node, env = {}, angle = 'rad') {
  const go = (n) => evaluate(n, env, angle);
  switch (node.type) {
    case 'num': return node.value;
    case 'group': return go(node.arg);
    case 'const': return CONSTANTS[node.name];
    case 'ans':
      if (env.ans === undefined) throw new CalcError('No previous answer yet');
      return env.ans;
    case 'var':
      if (!env.vars || !(node.name in env.vars)) throw new CalcError(`Define ${node.name} first, e.g. ${node.name} = 2`);
      return env.vars[node.name];
    case 'neg': return -go(node.arg);
    case 'post': {
      const v = go(node.arg);
      if (node.op === '!') return factorial(v);
      if (node.op === '%') return v / 100;
      return angle === 'deg' ? v : (v * Math.PI) / 180; // °
    }
    case 'bin': {
      const l = go(node.left);
      const r = go(node.right);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/':
          if (r === 0) throw new CalcError('Division by zero');
          return l / r;
        case '^': {
          // Odd roots of negatives: (-8)^(1/3) is -2, as on a calculator.
          if (l < 0 && !Number.isInteger(r)) {
            const inv = 1 / r;
            if (isWhole(inv) && Math.round(inv) % 2 === 1) return -((-l) ** r);
          }
          return l ** r;
        }
        default: break;
      }
      break;
    }
    case 'call': {
      const arity = FUNCTIONS[node.name];
      const [lo, hi] = Array.isArray(arity) ? arity : [arity, arity];
      if (node.args.length < lo || node.args.length > hi) {
        throw new CalcError(`${node.name} takes ${lo === hi ? lo : `${lo} or more`} value${lo === 1 && hi === 1 ? '' : 's'}`);
      }
      return call(node.name, node.args.map(go), angle);
    }
    case 'assign': return go(node.value);
    default: break;
  }
  throw new CalcError('I can’t calculate that');
}

/** Evaluate every row in order: variables and ans flow down the list. */
export function evaluateAll(texts, angle = 'rad') {
  const vars = {};
  let ans;
  return texts.map((text) => {
    if (!text.trim()) return { empty: true };
    let tree;
    try {
      tree = parse(text);
    } catch (err) {
      return { error: err instanceof CalcError ? err.message : 'I can’t read that' };
    }
    if (!tree) return { empty: true };
    const latex = toLatex(tree);
    try {
      const value = evaluate(tree, { vars, ans }, angle);
      if (Number.isNaN(value)) return { latex, error: 'Undefined (not a real number)' };
      if (tree.type === 'assign') vars[tree.name] = value;
      ans = value;
      const trivial = tree.type === 'num' || (tree.type === 'assign' && tree.value.type === 'num')
        || (tree.type === 'neg' && tree.arg.type === 'num');
      return { latex, value, assign: tree.type === 'assign' ? tree.name : null, trivial };
    } catch (err) {
      return { latex, error: err instanceof CalcError ? err.message : 'I can’t calculate that' };
    }
  });
}

/* ── display ────────────────────────────────────────────────────────────── */

const FN_LATEX = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', csc: '\\csc', sec: '\\sec', cot: '\\cot',
  arcsin: '\\arcsin', arccos: '\\arccos', arctan: '\\arctan', sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  ln: '\\ln', log: '\\log', log2: '\\log_{2}', exp: '\\exp', sign: '\\operatorname{sign}', mod: '\\operatorname{mod}',
  ncr: '\\operatorname{nCr}', npr: '\\operatorname{nPr}', gcd: '\\gcd', lcm: '\\operatorname{lcm}', min: '\\min', max: '\\max',
  round: '\\operatorname{round}', nthroot: '\\operatorname{root}',
};
const VAR_LATEX = { α: '\\alpha', β: '\\beta', γ: '\\gamma', θ: '\\theta', λ: '\\lambda', μ: '\\mu', σ: '\\sigma', φ: '\\phi', ω: '\\omega' };

const strip = (n) => (n.type === 'group' ? n.arg : n);

export function toLatex(node) {
  const L = toLatex;
  switch (node.type) {
    case 'num': return node.text;
    case 'group': return `\\left(${L(node.arg)}\\right)`;
    case 'const': return { pi: '\\pi', tau: '\\tau', e: 'e' }[node.name];
    case 'ans': return '\\operatorname{ans}';
    case 'var': return VAR_LATEX[node.name] || node.name;
    case 'neg': return `-${L(node.arg)}`;
    case 'post': return `${L(node.arg)}${{ '!': '!', '%': '\\%', '°': '^{\\circ}' }[node.op]}`;
    case 'assign': return `${VAR_LATEX[node.name] || node.name}=${L(node.value)}`;
    case 'bin':
      switch (node.op) {
        case '+': return `${L(node.left)}+${L(node.right)}`;
        case '-': return `${L(node.left)}-${L(node.right)}`;
        case '/': return `\\frac{${L(strip(node.left))}}{${L(strip(node.right))}}`;
        case '^': return `{${L(node.left)}}^{${L(strip(node.right))}}`;
        case '*': {
          const numbers = node.right.type === 'num' || node.right.type === 'neg'
            || (node.left.type === 'num' && node.right.type === 'bin' && node.right.left?.type === 'num');
          return node.implicit && !numbers ? `${L(node.left)}${L(node.right)}` : `${L(node.left)}\\times ${L(node.right)}`;
        }
        default: return '';
      }
    case 'call': {
      const a = node.args.map((x) => L(strip(x)));
      if (node.name === 'sqrt') return `\\sqrt{${a[0]}}`;
      if (node.name === 'cbrt') return `\\sqrt[3]{${a[0]}}`;
      if (node.name === 'nthroot') return `\\sqrt[${a[1]}]{${a[0]}}`;
      if (node.name === 'abs') return `\\left|${a[0]}\\right|`;
      if (node.name === 'floor') return `\\left\\lfloor ${a[0]}\\right\\rfloor`;
      if (node.name === 'ceil') return `\\left\\lceil ${a[0]}\\right\\rceil`;
      return `${FN_LATEX[node.name] || `\\operatorname{${node.name}}`}\\left(${a.join(',')}\\right)`;
    }
    default: return '';
  }
}

/** A result for display: up to 10 significant digits, scientific notation for very big or small. */
export function formatNumber(value) {
  if (value === Infinity) return { text: '∞', latex: '\\infty' };
  if (value === -Infinity) return { text: '-∞', latex: '-\\infty' };
  if (Object.is(value, -0) || Math.abs(value) < 1e-14) value = 0;
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) {
    const [mantissa, exponent] = value.toExponential(9).split('e');
    const m = String(Number(mantissa));
    const exp = Number(exponent);
    return { text: `${m}E${exp}`, latex: `${m}\\times 10^{${exp}}` };
  }
  const text = String(Number(value.toPrecision(10)));
  return { text, latex: text };
}

/** The value as a fraction when it is (very nearly) one with a modest denominator. */
export function toFraction(value, maxDenominator = 10000) {
  if (!Number.isFinite(value) || Number.isInteger(value)) return null;
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  let [h0, h1, k0, k1] = [0, 1, 1, 0];
  let b = x;
  for (let i = 0; i < 40; i += 1) {
    const a = Math.floor(b);
    [h0, h1] = [h1, a * h1 + h0];
    [k0, k1] = [k1, a * k1 + k0];
    if (k1 > maxDenominator) return null;
    if (Math.abs(x - h1 / k1) < 1e-10 * Math.max(1, x)) break;
    b = 1 / (b - a);
    if (!Number.isFinite(b)) break;
  }
  if (Math.abs(x - h1 / k1) >= 1e-10 * Math.max(1, x) || k1 === 1) return null;
  return { numerator: sign * h1, denominator: k1, latex: `${sign < 0 ? '-' : ''}\\frac{${h1}}{${k1}}` };
}
