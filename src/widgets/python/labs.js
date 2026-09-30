// The Python labs of "Build Your Own LLM". Each lab has starter code with the key lines left
// for the student, and tests that check their work. Pedro places a lab by name; the student
// runs it in the browser and sends the code, output and test results back to him.

const SONNETS = `Shall I compare thee to a summer's day?
Thou art more lovely and more temperate:
Rough winds do shake the darling buds of May,
And summer's lease hath all too short a date;
Sometime too hot the eye of heaven shines,
And often is his gold complexion dimm'd;
And every fair from fair sometime declines,
By chance or nature's changing course untrimm'd;
But thy eternal summer shall not fade,
Nor lose possession of that fair thou ow'st;
Nor shall death brag thou wander'st in his shade,
When in eternal lines to time thou grow'st:
So long as men can breathe or eyes can see,
So long lives this, and this gives life to thee.
Let me not to the marriage of true minds
Admit impediments. Love is not love
Which alters when it alteration finds,
Or bends with the remover to remove.
O no! it is an ever-fixed mark
That looks on tempests and is never shaken;
It is the star to every wand'ring bark,
Whose worth's unknown, although his height be taken.
Love's not Time's fool, though rosy lips and cheeks
Within his bending sickle's compass come;
Love alters not with his brief hours and weeks,
But bears it out even to the edge of doom.
If this be error and upon me prov'd,
I never writ, nor no man ever lov'd.`;

const TOKENIZER = `chars = sorted(set(text))
stoi = {c: i for i, c in enumerate(chars)}
itos = {i: c for c, i in stoi.items()}
V = len(chars)
encode = lambda s: [stoi[c] for c in s]
decode = lambda ids: "".join(itos[i] for i in ids)`;

export const LABS = {
  tokenizer: {
    title: 'Your tokenizer',
    goal: 'Turn text into numbers and back again.',
    starter: `# Your text: paste anything you like (lyrics, notes, a favourite paragraph).
text = """${SONNETS.split('\n').slice(0, 4).join('\n')}"""

# The vocabulary: every distinct character, in a fixed order.
chars = sorted(set(text))
print(len(chars), "distinct characters:", repr("".join(chars)))

# TODO 1: give every character its own number, and every number back its character.
stoi = {}   # character -> number, e.g. {"\\n": 0, " ": 1, ...}
itos = {}   # number -> character

def encode(s):
    # TODO 2: turn a string into a list of numbers
    return []

def decode(ids):
    # TODO 3: turn a list of numbers back into the string
    return ""

print(encode("summer"))
print(decode(encode("summer")))
`,
    tests: [
      { name: 'Every character has its own number',
        code: 'assert len(stoi) == len(chars) and len(set(stoi.values())) == len(chars), "stoi needs a different number for every character"' },
      { name: 'encode returns whole numbers',
        code: 'ids = encode(text[:30])\nassert isinstance(ids, list) and len(ids) == 30 and all(isinstance(i, int) for i in ids), "encode should return one integer per character"' },
      { name: 'decode(encode(text)) gives the text back',
        code: 'assert decode(encode(text)) == text, "decode(encode(text)) should give back exactly the same text"' },
    ],
  },

  bigram: {
    title: 'A bigram model',
    goal: 'Count which character follows which, then generate text from the counts.',
    starter: `import random
text = """${SONNETS}"""
${TOKENIZER}

# counts[a][b] = how often character b comes straight after character a
counts = [[0] * V for _ in range(V)]
for a, b in zip(text, text[1:]):
    pass  # TODO 1: add one to the right cell (use stoi)

def next_char_probs(c):
    row = counts[stoi[c]]
    total = sum(row)
    # TODO 2: divide each count by the row's total, so the row sums to 1
    return row

def generate(start, length=200):
    out = start
    for _ in range(length):
        probs = next_char_probs(out[-1])
        out += random.choices(chars, weights=probs)[0]
    return out

if sum(map(sum, counts)) == 0:
    print("Nothing counted yet: fill in TODO 1, then run again.")
else:
    print(generate("S"))
`,
    tests: [
      { name: 'Every pair in the text is counted',
        code: 'assert sum(map(sum, counts)) == len(text) - 1, f"expected {len(text) - 1} pairs in total, found {sum(map(sum, counts))}"' },
      { name: 'Counts are in the right cells',
        code: 'a, b = "t", "h"\nexpected = sum(1 for x, y in zip(text, text[1:]) if (x, y) == (a, b))\nassert counts[stoi[a]][stoi[b]] == expected, f"\'h\' follows \'t\' {expected} times, your table says {counts[stoi[a]][stoi[b]]}"' },
      { name: 'Each row becomes probabilities that sum to 1',
        code: 'p = next_char_probs("e")\nassert abs(sum(p) - 1) < 1e-9 and all(0 <= x <= 1 for x in p), "the probabilities for one character should add up to 1"' },
      { name: 'generate writes new text',
        code: 'g = generate("S", 50)\nassert isinstance(g, str) and len(g) == 51 and set(g) <= set(chars)' },
    ],
  },

  temperature: {
    title: 'Sampling with temperature',
    goal: 'Make the generator more predictable or more adventurous.',
    starter: `import random
text = """${SONNETS}"""
${TOKENIZER}
counts = [[0] * V for _ in range(V)]
for a, b in zip(text, text[1:]):
    counts[stoi[a]][stoi[b]] += 1

def next_char_probs(c):
    row = counts[stoi[c]]
    return [x / sum(row) for x in row]

def with_temperature(probs, T):
    # TODO: raise every probability to the power 1/T, then divide each by the new total
    # so they sum to 1 again. (T below 1 sharpens the choice; above 1 flattens it.)
    return probs

def generate(start, length=150, T=1.0):
    out = start
    for _ in range(length):
        probs = with_temperature(next_char_probs(out[-1]), T)
        out += random.choices(chars, weights=probs)[0]
    return out

print("T = 0.3:", generate("S", T=0.3))
print()
print("T = 2.0:", generate("S", T=2.0))
`,
    tests: [
      { name: 'Probabilities still sum to 1',
        code: 'p = with_temperature([0.5, 0.3, 0.2], 0.5)\nassert abs(sum(p) - 1) < 1e-9, f"they sum to {sum(p):.3f}"' },
      { name: 'T = 1 changes nothing',
        code: 'p = with_temperature([0.5, 0.3, 0.2], 1)\nassert all(abs(a - b) < 1e-9 for a, b in zip(p, [0.5, 0.3, 0.2]))' },
      { name: 'Low T makes the top choice dominate',
        code: 'p = with_temperature([0.5, 0.3, 0.2], 0.1)\nassert p[0] > 0.99, f"at T = 0.1 the top choice should be almost certain, got {p[0]:.2f}"' },
      { name: 'High T flattens the choice',
        code: 'p = with_temperature([0.5, 0.3, 0.2], 5)\nassert p[0] < 0.4 and p[2] > 0.28, "at T = 5 the choices should be much closer to equal"' },
    ],
  },

  attention: {
    title: 'One attention head',
    goal: 'Compute scaled dot-product attention with a causal mask.',
    starter: `import numpy as np
np.set_printoptions(precision=2, suppress=True)

words = ["the", "cat", "sat", "on", "the", "mat"]
# Each word as a small made-up vector, and a head's query and key matrices.
X = np.array([[0.1, 0.0, 0.2, 0.9],
              [1.0, 0.2, 0.0, 0.1],
              [0.3, 1.0, 0.1, 0.0],
              [0.0, 0.1, 0.9, 0.3],
              [0.1, 0.0, 0.2, 0.9],
              [0.9, 0.1, 0.3, 0.0]])
Wq = np.array([[1.0, 0.0, 0.5, 0.0], [0.0, 1.0, 0.0, 0.5], [0.5, 0.0, 1.0, 0.0], [0.0, 0.5, 0.0, 1.0]])
Wk = np.array([[1.0, 0.5, 0.0, 0.0], [0.0, 1.0, 0.5, 0.0], [0.0, 0.0, 1.0, 0.5], [0.5, 0.0, 0.0, 1.0]])
Q, K = X @ Wq, X @ Wk

def attention_weights(Q, K):
    d = Q.shape[1]
    scores = np.zeros((len(Q), len(K)))   # TODO 1: every query against every key: Q @ K.T, divided by sqrt(d)
    ahead = np.triu(np.ones_like(scores, dtype=bool), k=1)
    scores = np.where(ahead, -np.inf, scores)  # a word may not look at later words
    weights = scores                     # TODO 2: softmax each row: exp, then divide by the row sum
    return weights

W = attention_weights(Q, K)
print(W)
for i, w in enumerate(words):
    print(f"{w!r:7} looks most at {words[int(np.argmax(W[i]))]!r}")
`,
    tests: [
      { name: 'One weight for every pair of words',
        code: 'W = attention_weights(Q, K)\nassert W.shape == (6, 6)' },
      { name: 'Each row sums to 1',
        code: 'W = attention_weights(Q, K)\nassert np.allclose(W.sum(axis=1), 1), f"row sums are {W.sum(axis=1)}"' },
      { name: 'No word looks ahead',
        code: 'W = attention_weights(Q, K)\nassert np.allclose(np.triu(W, k=1), 0), "weights above the diagonal (later words) must be 0"' },
      { name: 'Matches scaled dot-product attention',
        code: 'S = Q @ K.T / np.sqrt(4)\nS = np.where(np.triu(np.ones_like(S, dtype=bool), k=1), -np.inf, S)\nE = np.exp(S - S.max(axis=1, keepdims=True))\nassert np.allclose(attention_weights(Q, K), E / E.sum(axis=1, keepdims=True), atol=1e-6), "check the scaling by sqrt(d) and the softmax"' },
    ],
  },

  train: {
    title: 'Train your model',
    goal: 'Learn the next-character probabilities by gradient descent, then generate.',
    timeout: 90,
    starter: `import numpy as np
# Paste a longer text of your own here: the more text, the better it learns.
text = """${SONNETS}"""
${TOKENIZER}

xs = np.array(encode(text[:-1]))   # each character...
ys = np.array(encode(text[1:]))    # ...and the one that follows it
N = len(xs)

rng = np.random.default_rng(0)
W = rng.normal(0, 0.01, (V, V))    # the model: one row of scores (logits) per character

def softmax(z):
    e = np.exp(z - z.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)

losses = []
learning_rate = 20.0
for step in range(300):
    probs = softmax(W[xs])                            # predicted next-character probabilities
    loss = 0.0  # TODO 1: the average of -log(probability given to the character that really came next)
    losses.append(float(loss))

    grad = probs.copy()                               # gradient of the loss wrt the scores
    grad[np.arange(N), ys] -= 1
    grad /= N
    dW = np.zeros_like(W)
    np.add.at(dW, xs, grad)
    # TODO 2: move W a small step against the gradient (use learning_rate)

    if step % 50 == 0:
        print(f"step {step:3}: loss {loss:.3f}")
print(f"final loss {losses[-1]:.3f}  (guessing at random would be {np.log(V):.3f})")

def generate(start, length=200):
    out = start
    for _ in range(length):
        p = softmax(W[[stoi[out[-1]]]])[0]
        out += itos[int(rng.choice(V, p=p))]
    return out

print(generate("S"))
`,
    tests: [
      { name: 'The loss starts near a random guess',
        code: 'assert abs(losses[0] - np.log(V)) < 0.2, f"the first loss should be about log(V) = {np.log(V):.2f}, got {losses[0]:.2f}"' },
      { name: 'Training lowers the loss',
        code: 'assert losses[-1] < losses[0] - 0.8, f"the loss went from {losses[0]:.2f} to {losses[-1]:.2f}; it should fall by more"' },
      { name: 'The trained model writes text',
        code: 'g = generate("S", 60)\nassert isinstance(g, str) and len(g) == 61' },
    ],
  },
};
