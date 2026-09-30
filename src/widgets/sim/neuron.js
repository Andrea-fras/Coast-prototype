// A leaky integrate-and-fire neuron for the "Build a Brain" workshop. Plain module (no React)
// so it can be tested on its own: node --test src/widgets/sim
//
//   τ dV/dt = −(V − V_rest) + R·I(t)       (V in mV, I in nA, R in MΩ, t in ms)
//
// When V reaches threshold the neuron fires: the spike is drawn to +40 mV, V resets to rest and
// the neuron can't fire again for the refractory period. Synaptic inputs inject a current that
// jumps by the synapse's strength at each input spike and decays with τ_syn.

export const NEURON = {
  rest: -70,          // mV, resting potential
  threshold: -55,     // mV, firing threshold
  peak: 40,           // mV, top of a drawn spike
  tau: 15,            // ms, membrane time constant
  resistance: 10,     // MΩ, so 1 nA of input holds the membrane 10 mV above rest
  refractory: 2,      // ms
  synapseTau: 5,      // ms, decay of a synaptic current
};

/** Current (nA) needed to reach threshold at all: below it the neuron never fires. */
export const rheobase = (p = NEURON) => (p.threshold - p.rest) / p.resistance;

/** Firing rate (Hz) for a constant current, from the model's exact solution. */
export function firingRate(current, p = NEURON) {
  const drive = p.resistance * current;             // mV above rest the input would hold V at
  const gap = p.threshold - p.rest;
  if (drive <= gap) return 0;
  const interval = p.refractory + p.tau * Math.log(drive / (drive - gap));  // ms
  return 1000 / interval;
}

/**
 * Run the neuron. `input(t)` gives injected current (nA) at time t (ms); `synapses` is a list of
 * { weight (nA), spikes: [ms] }. Returns { t, v, spikes } with v sampled every `dt`.
 */
export function simulate({ input = () => 0, synapses = [], duration = 500, dt = 0.05, p = NEURON } = {}) {
  const n = Math.round(duration / dt);
  const t = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const spikes = [];
  let V = p.rest;
  let refractoryUntil = -Infinity;
  const syn = synapses.map((s) => ({ ...s, spikes: [...s.spikes].sort((a, b) => a - b), next: 0, current: 0 }));
  const decay = Math.exp(-dt / p.synapseTau);
  v[0] = V;
  for (let i = 1; i <= n; i += 1) {
    const time = i * dt;
    let current = input(time);
    for (const s of syn) {
      s.current *= decay;
      while (s.next < s.spikes.length && s.spikes[s.next] <= time) { s.current += s.weight; s.next += 1; }
      current += s.current;
    }
    t[i] = time;
    if (time < refractoryUntil) { V = p.rest; v[i] = V; continue; }
    V += (dt / p.tau) * (-(V - p.rest) + p.resistance * current);
    if (V >= p.threshold) {
      spikes.push(time);
      v[i] = p.peak;
      V = p.rest;
      refractoryUntil = time + p.refractory;
      continue;
    }
    v[i] = V;
  }
  return { t, v, spikes };
}

/** A step of current from `start` to `end` ms. */
export const step = (amplitude, start = 50, end = 450) => (t) => (t >= start && t < end ? amplitude : 0);

/** Highest membrane potential reached (mV), or the peak if it fired. */
export const peakVoltage = (run) => run.v.reduce((m, x) => Math.max(m, x), -Infinity);

/** Coincidence trials: input A alone, B alone, and both with B `delay` ms after A. */
export function coincidence({ weightA, weightB, delay = 0, at = 50, duration = 150 }) {
  const trial = (a, b) => simulate({
    duration,
    synapses: [
      ...(a ? [{ weight: weightA, spikes: [at] }] : []),
      ...(b ? [{ weight: weightB, spikes: [at + delay] }] : []),
    ],
  });
  return { a: trial(true, false), b: trial(false, true), both: trial(true, true) };
}

// Associative learning: "food" drives the neuron strongly; "bell" starts weak. A synapse
// strengthens when its input and the neuron fire together while food (the reward signal)
// is present, and weakens when the bell comes without food.
export const LEARNING = { food: 9, bellStart: 1, gain: 1, loss: 0.1, maxWeight: 12 };

export function learningTrial(bellWeight, { bell, food }, L = LEARNING) {
  const run = simulate({
    duration: 120,
    synapses: [
      ...(food ? [{ weight: L.food, spikes: [30] }] : []),
      ...(bell ? [{ weight: bellWeight, spikes: [30] }] : []),
    ],
  });
  const fired = run.spikes.length > 0;
  let next = bellWeight;
  if (bell && fired && food) next = Math.min(L.maxWeight, bellWeight + L.gain);
  if (bell && !food) next = Math.max(0, bellWeight - L.loss);
  return { run, fired, weight: next };
}
