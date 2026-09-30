// The maths behind the "Build Your Own LLM" labs: temperature sampling, a byte-pair
// tokenizer trained on the student's own text, and one causal attention head.

/** Softmax of logits divided by the temperature (T → 0 approaches always picking the top one). */
export function softmax(logits, temperature = 1) {
  const t = Math.max(temperature, 1e-3);
  const scaled = logits.map((x) => x / t);
  const top = Math.max(...scaled);
  const exps = scaled.map((x) => Math.exp(x - top));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}

/** Entropy in bits: 0 when one choice is certain, log2(n) when all n are equally likely. */
export const entropyBits = (probs) => -probs.reduce((s, p) => s + (p > 0 ? p * Math.log2(p) : 0), 0);

/** Index drawn from `probs` using a random number in [0, 1). */
export function sampleIndex(probs, random = Math.random) {
  let r = random();
  for (let i = 0; i < probs.length; i += 1) {
    r -= probs[i];
    if (r < 0) return i;
  }
  return probs.length - 1;
}

/** Deterministic random numbers, so a class sees the same draws for the same seed. */
export function seededRandom(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Next-token scenarios for the temperature lab. Logits are made up but shaped like a real
// model's: a fact has one dominant continuation, a story has many good ones.
export const SCENARIOS = {
  fact: {
    label: 'A fact',
    context: 'The capital of France is',
    tokens: [' Paris', ' a', ' the', ' located', ' known', ' not', ' Lyon', ' beautiful'],
    logits: [9.0, 4.3, 4.0, 3.6, 3.2, 2.2, 1.4, 1.1],
  },
  story: {
    label: 'A story',
    context: 'Once upon a time there was a',
    tokens: [' little', ' young', ' king', ' princess', ' dragon', ' girl', ' small', ' robot'],
    logits: [5.1, 4.6, 4.4, 4.3, 4.0, 3.9, 3.5, 2.6],
  },
};

/** Words and punctuation, the way a word-level tokenizer would split. */
export const wordTokens = (text) => text.match(/\s*[\p{L}\p{N}']+|\s*[^\s\p{L}\p{N}]/gu) || [];

/**
 * Byte-pair encoding trained on `text`: start from single characters and repeatedly merge
 * the most frequent neighbouring pair into one new token. Spaces stay attached to the word
 * that follows them, as in GPT tokenizers. Returns { tokens, merges }.
 */
export function bytePairEncode(text, merges = 20) {
  // Pieces never cross a word start: " the" can become one token, "e t" cannot.
  const words = wordTokens(text).map((w) => [...w]);
  const learned = [];
  for (let m = 0; m < merges; m += 1) {
    const counts = new Map();
    for (const w of words) {
      for (let i = 0; i < w.length - 1; i += 1) {
        const key = `${w[i]}\u0000${w[i + 1]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    let best = null; let bestCount = 1;
    for (const [key, n] of counts) if (n > bestCount) { best = key; bestCount = n; }
    if (!best) break;  // nothing repeats any more
    const [a, b] = best.split('\u0000');
    learned.push({ pair: [a, b], token: a + b, count: bestCount });
    for (const w of words) {
      for (let i = 0; i < w.length - 1; i += 1) {
        if (w[i] === a && w[i + 1] === b) { w.splice(i, 2, a + b); }
      }
    }
  }
  return { tokens: words.flat(), merges: learned };
}

// Attention scenario: the same sentence ending in "tired" or "wide". In a GPT every word may
// only look back (causal masking). With these small hand-made vectors, "tired" looks back at
// the animal and "wide" at the street, while "it", which can't see the end of the sentence
// yet, splits its attention between the two.
// Word features: [living thing, place, pronoun, filler word, describes a living thing, describes a place]
const FEATURES = {
  animal: [1, 0, 0, 0, 0, 0], street: [0, 1, 0, 0, 0, 0], it: [0, 0, 1, 0, 0.5, 0.5],
  tired: [0, 0, 0, 0, 1, 0], wide: [0, 0, 0, 0, 0, 1], cross: [0, 0, 0, 0.5, 0.3, 0],
};
const FILLER = [0, 0, 0, 1, 0, 0];
export const ATTENTION_SENTENCES = {
  tired: "The animal didn't cross the street because it was too tired".split(' '),
  wide: "The animal didn't cross the street because it was too wide".split(' '),
};
export const HEAD_SIZE = 4;

export const embed = (word) => FEATURES[word] || FILLER;
/** Query: what a word is looking for. A describing word looks for the kind of thing it describes. */
export const query = ([, , , filler, wantsLiving, wantsPlace]) => [8 * wantsLiving, 8 * wantsPlace, 0, filler];
/** Key: what a word offers to the words looking at it. */
export const key = ([living, place, pronoun, filler]) => [living, place, pronoun, filler];

/** Causal attention weights: row i is how much word i looks at each word j (0 for j > i). */
export function attentionWeights(words, { scale = true } = {}) {
  const x = words.map(embed);
  return x.map((xi, i) => {
    const q = query(xi);
    const scores = x.slice(0, i + 1).map((xj) => key(xj).reduce((sum, kn, n) => sum + q[n] * kn, 0)
      / (scale ? Math.sqrt(HEAD_SIZE) : 1));
    return [...softmax(scores), ...Array(words.length - i - 1).fill(0)];
  });
}
