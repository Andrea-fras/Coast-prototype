import React, { useMemo, useState } from 'react';
import { Bell, Beef, RotateCcw, Zap } from 'lucide-react';
import LabFrame, { NumberField } from '../LabFrame';
import { fmt } from '../format';
import Plot from '../Plot';
import { LEARNING, NEURON, coincidence, firingRate, learningTrial, peakVoltage, rheobase, simulate, step } from '../sim/neuron';

// The words each mode shows, for someone meeting them for the first time.
const WORDS = {
  potential: ['Membrane potential', 'the voltage across the neuron’s outer skin (its membrane), in millivolts (mV, thousandths of a volt).'],
  rest: ['Rest', '−70 mV: where the membrane sits when nothing is coming in.'],
  threshold: ['Threshold', '−55 mV: if the membrane reaches it, the neuron fires.'],
  spike: ['Spike', 'a brief electrical pulse: the neuron’s signal. “Fires” means it sends one.'],
  current: ['Current', 'the input, in nanoamps (nA, billionths of an amp): a tiny flow of charge into the neuron.'],
  leak: ['Leak', 'charge seeps back out, so the membrane drifts back to rest.'],
  resistance: ['Resistance and time constant', 'how far a current moves the membrane (10 MΩ: each 1 nA moves it 10 mV) and how quickly (about 15 ms, thousandths of a second).'],
  rate: ['Firing rate', 'spikes per second, in hertz (Hz).'],
  refractory: ['Refractory period', 'after a spike the neuron can’t fire again for 2 ms.'],
  synapse: ['Synapse', 'the contact where a signal passes from one neuron to the next.'],
  strength: ['Strength', 'how big a bump in the membrane one input gives.'],
  excitatory: ['Excitatory, inhibitory', 'an excitatory input pushes the membrane up towards threshold; an inhibitory one pushes it down, away from it.'],
  bell: ['Bell synapse strength', 'how strongly the bell’s input excites the neuron. Food’s input is strong enough to fire it on its own.'],
};
const words = (...ids) => ids.map((id) => WORDS[id]);

const MODES = {
  single: { title: 'A neuron at rest', hint: 'Inject current and watch the membrane.',
    terms: words('potential', 'rest', 'threshold', 'spike', 'current', 'leak', 'resistance') },
  rate: { title: 'Firing rate', hint: 'How does the rate grow with input?',
    terms: words('rate', 'current', 'threshold', 'spike', 'refractory') },
  synapses: { title: 'Synapses', hint: 'Two inputs, one neuron.',
    terms: words('synapse', 'strength', 'excitatory', 'potential', 'threshold', 'spike') },
  learning: { title: 'Learning', hint: 'Pair the bell with food.',
    terms: words('bell', 'synapse', 'spike', 'threshold') },
};

/** Membrane trace as plot points, keeping every spike's peak. */
function tracePoints(run, every = 4) {
  const pts = [];
  for (let i = 0; i < run.t.length; i += 1) {
    if (i % every === 0 || run.v[i] >= NEURON.threshold) pts.push([run.t[i], run.v[i]]);
  }
  return pts;
}

function VoltagePlot({ runs, duration }) {
  const colors = ['#ffb503', '#9fb3ff', '#45d3c3'];
  return (
    <Plot series={runs.map((r, i) => ({ label: r.label, color: colors[i % 3], points: tracePoints(r.run) }))}
      xLabel="time (ms)" yLabel="membrane potential (mV)" xMax={duration} yMin={-80} yMax={45}
      lines={[{ y: NEURON.threshold, label: 'threshold −55 mV', color: 'rgba(255,138,122,0.8)' }, { y: NEURON.rest, label: 'rest −70 mV', color: 'rgba(242,238,230,0.35)' }]}
      format={(v) => fmt(v)} height={200} />
  );
}

function SingleNeuron({ onResult }) {
  const [current, setCurrent] = useState(1);
  const [prediction, setPrediction] = useState(null);
  const [shown, setShown] = useState(null);
  const run = useMemo(() => simulate({ input: step(current) }), [current]);
  const fire = () => setShown({ current, prediction, spikes: run.spikes.length });
  const settle = NEURON.rest + NEURON.resistance * current;
  const message = shown ? [
    '🧪 Neuron lab · a neuron at rest',
    `Input: a step of ${fmt(shown.current, 2)} nA from 50 to 450 ms (membrane resistance 10 MΩ, time constant 15 ms)`,
    `My prediction: it ${shown.prediction === 'yes' ? 'fires' : 'does not fire'}`,
    shown.spikes > 0
      ? `Result: it fired ${shown.spikes} spikes in 400 ms (${fmt(shown.spikes / 0.4)} Hz). Threshold is −55 mV; the input alone would hold the membrane at ${fmt(NEURON.rest + NEURON.resistance * shown.current, 1)} mV.`
      : `Result: no spikes. The membrane rose to ${fmt(NEURON.rest + NEURON.resistance * shown.current, 1)} mV and stayed below the −55 mV threshold, then leaked back to −70 mV when the input stopped.`,
  ].join('\n') : null;
  return (
    <LabFrame title="Neuron lab · A neuron at rest" hint={MODES.single.hint} terms={MODES.single.terms} result={message} onResult={onResult}>
      <label className="lab-slider">
        <span>Input current <b>{fmt(current, 2)} nA</b> · on its own it would hold the membrane at <b>{fmt(settle, 1)} mV</b></span>
        <input type="range" min="0" max="4" step="0.05" value={current} onChange={(e) => { setCurrent(Number(e.target.value)); setShown(null); }} />
      </label>
      <div className="lab-predict">
        <div className="lab-choice" role="radiogroup" aria-label="Your prediction">
          <span>Will it fire?</span>
          {[['yes', 'Yes, it spikes'], ['no', 'No, it stays below threshold']].map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={prediction === v} className="lab-tab" onClick={() => { setPrediction(v); setShown(null); }}>{l}</button>
          ))}
        </div>
        <button type="button" className="lab-btn lab-btn--go" disabled={!prediction} onClick={fire}><Zap size={14} aria-hidden="true" /> Inject current</button>
      </div>
      {shown && (
        <>
          <VoltagePlot runs={[{ label: 'V', run }]} duration={500} />
          <p className="lab-verdict">{run.spikes.length ? `${run.spikes.length} spikes (${fmt(run.spikes.length / 0.4)} Hz).` : 'No spikes: the leak wins before it reaches threshold.'}</p>
        </>
      )}
    </LabFrame>
  );
}

function FiringRate({ onResult }) {
  const [guess, setGuess] = useState(null);
  const [measured, setMeasured] = useState([]);
  const [current, setCurrent] = useState(2);
  const curve = useMemo(() => Array.from({ length: 101 }, (_, i) => [i * 0.1, firingRate(i * 0.1)]), []);
  const measure = () => {
    const run = simulate({ input: step(current, 0, 1000), duration: 1000 });
    setMeasured((m) => [...m.filter((p) => p.current !== current), { current, rate: run.spikes.length }].sort((a, b) => a.current - b.current));
  };
  const message = measured.length ? [
    '🧪 Neuron lab · firing rate',
    guess !== null ? `My prediction: the smallest current that makes it fire is ${fmt(guess, 2)} nA` : '',
    `Measured (spikes in one second): ${measured.map((p) => `${fmt(p.current, 2)} nA → ${p.rate} Hz`).join(', ')}`,
    `The model's threshold current is ${fmt(rheobase(), 2)} nA; the rate can never pass ${fmt(1000 / NEURON.refractory)} Hz (2 ms refractory period).`,
  ].filter(Boolean).join('\n') : null;
  return (
    <LabFrame title="Neuron lab · Firing rate" hint={MODES.rate.hint} terms={MODES.rate.terms} result={message} onResult={onResult}>
      <div className="lab-predict">
        <NumberField label="Smallest current that makes it fire (your guess)" unit="nA" min={0} value={guess ?? NaN} onChange={setGuess} />
      </div>
      <label className="lab-slider">
        <span>Current to test <b>{fmt(current, 2)} nA</b></span>
        <input type="range" min="0" max="10" step="0.1" value={current} onChange={(e) => setCurrent(Number(e.target.value))} />
      </label>
      <div className="lab-row">
        <button type="button" className="lab-btn lab-btn--go" disabled={guess === null} onClick={measure}><Zap size={14} aria-hidden="true" /> Measure 1 second</button>
        {guess === null && <span className="lab-status">Guess first, then measure.</span>}
        {measured.length > 0 && <button type="button" className="lab-btn lab-btn--quiet" onClick={() => setMeasured([])}><RotateCcw size={14} aria-hidden="true" /> Clear</button>}
      </div>
      {measured.length > 0 && (
        <Plot series={[{ label: 'measured', color: '#ffb503', points: measured.map((p) => [p.current, p.rate]) },
          ...(measured.length >= 4 ? [{ label: 'model', color: 'rgba(69,211,195,0.6)', points: curve }] : [])]}
          marks={measured.map((p) => ({ x: p.current, y: p.rate, color: '#ffb503' }))}
          xLabel="input current (nA)" yLabel="firing rate (Hz)" xMax={10} yMax={300} format={(v) => fmt(v)} />
      )}
      {measured.length > 0 && measured.length < 4 && <p className="lab-caption">Measure at least four currents to see the whole curve.</p>}
    </LabFrame>
  );
}

function Synapses({ onResult }) {
  const [a, setA] = useState(5);
  const [b, setB] = useState(5);
  const [delay, setDelay] = useState(0);
  const [inhibitory, setInhibitory] = useState(false);
  const [shown, setShown] = useState(false);
  const wB = inhibitory ? -b : b;
  const trials = useMemo(() => coincidence({ weightA: a, weightB: wB, delay }), [a, wB, delay]);
  const fired = (r) => (r.spikes.length ? 'fires' : `no spike (peak ${fmt(peakVoltage(r), 1)} mV)`);
  const message = shown ? [
    '🧪 Neuron lab · synapses',
    `Input A strength ${fmt(a, 1)}; input B strength ${fmt(b, 1)} (${inhibitory ? 'inhibitory' : 'excitatory'}); B arrives ${fmt(delay)} ms after A`,
    `A alone: ${fired(trials.a)}. B alone: ${fired(trials.b)}. Both: ${fired(trials.both)}.`,
  ].join('\n') : null;
  return (
    <LabFrame title="Neuron lab · Synapses" hint={MODES.synapses.hint} terms={MODES.synapses.terms} result={message} onResult={onResult}>
      <div className="lab-row lab-row--wrap">
        <label className="lab-slider"><span>Input A strength <b>{fmt(a, 1)}</b></span>
          <input type="range" min="0" max="12" step="0.5" value={a} onChange={(e) => { setA(Number(e.target.value)); setShown(false); }} /></label>
        <label className="lab-slider"><span>Input B strength <b>{fmt(b, 1)}</b></span>
          <input type="range" min="0" max="12" step="0.5" value={b} onChange={(e) => { setB(Number(e.target.value)); setShown(false); }} /></label>
        <label className="lab-slider"><span>B arrives <b>{fmt(delay)} ms</b> after A</span>
          <input type="range" min="0" max="40" step="1" value={delay} onChange={(e) => { setDelay(Number(e.target.value)); setShown(false); }} /></label>
      </div>
      <label className="lab-check"><input type="checkbox" checked={inhibitory} onChange={(e) => { setInhibitory(e.target.checked); setShown(false); }} /> Make B inhibitory</label>
      <div className="lab-row">
        <button type="button" className="lab-btn lab-btn--go" onClick={() => setShown(true)}><Zap size={14} aria-hidden="true" /> Run the three trials</button>
      </div>
      {shown && (
        <>
          <VoltagePlot runs={[{ label: 'A alone', run: trials.a }, { label: 'B alone', run: trials.b }, { label: 'both', run: trials.both }]} duration={150} />
          <div className="lab-legend"><span className="is-amber">A alone: {fired(trials.a)}</span><span className="is-iris">B alone: {fired(trials.b)}</span><span className="is-sea">Both: {fired(trials.both)}</span></div>
        </>
      )}
    </LabFrame>
  );
}

function Learning({ onResult }) {
  const [weight, setWeight] = useState(LEARNING.bellStart);
  const [log, setLog] = useState([]);  // [{ kind, fired, weight }]
  const [last, setLast] = useState(null);
  const trial = (kind) => {
    const r = learningTrial(weight, { bell: kind !== 'food', food: kind !== 'bell' });
    setWeight(r.weight);
    setLast({ kind, run: r.run, fired: r.fired });
    setLog((l) => [...l, { kind, fired: r.fired, weight: r.weight }]);
  };
  const names = { pair: 'bell + food', bell: 'bell alone', food: 'food alone' };
  const counts = log.reduce((c, t) => ({ ...c, [t.kind]: (c[t.kind] || 0) + 1 }), {});
  const bellTests = log.filter((t) => t.kind === 'bell');
  const message = log.length ? [
    '🧪 Neuron lab · learning',
    `Trials: ${counts.pair || 0} bell + food, ${counts.bell || 0} bell alone, ${counts.food || 0} food alone`,
    `Bell synapse strength: started at ${fmt(LEARNING.bellStart, 1)}, now ${fmt(weight, 1)} (food synapse fixed at ${LEARNING.food})`,
    `Sequence: ${log.map((t) => `${names[t.kind]}${t.kind === 'pair' ? '' : t.fired ? ' → fired' : ' → no spike'}`).join('; ')}`,
    bellTests.length ? `Last bell-alone test: ${bellTests[bellTests.length - 1].fired ? 'the neuron fired' : 'no spike'}` : '',
  ].filter(Boolean).join('\n') : null;
  return (
    <LabFrame title="Neuron lab · Learning" hint={MODES.learning.hint} terms={MODES.learning.terms} result={message} onResult={onResult}>
      <p className="lab-caption">Food excites the neuron strongly. The bell's synapse starts weak. It strengthens when the bell and the neuron fire together while food is there, and weakens a little each time the bell comes without food.</p>
      <div className="lab-row lab-row--wrap">
        <button type="button" className="lab-btn lab-btn--go" onClick={() => trial('pair')}><Bell size={14} aria-hidden="true" /><Beef size={14} aria-hidden="true" /> Bell + food</button>
        <button type="button" className="lab-btn" onClick={() => trial('bell')}><Bell size={14} aria-hidden="true" /> Bell alone</button>
        <button type="button" className="lab-btn" onClick={() => trial('food')}><Beef size={14} aria-hidden="true" /> Food alone</button>
        <button type="button" className="lab-btn lab-btn--quiet" onClick={() => { setWeight(LEARNING.bellStart); setLog([]); setLast(null); }}><RotateCcw size={14} aria-hidden="true" /> Start over</button>
      </div>
      <div className="lab-readout">
        <div><span>Bell synapse strength</span><b>{fmt(weight, 1)}</b></div>
        <div><span>Trials so far</span><b>{log.length}</b></div>
        {last && <div><span>Last trial ({names[last.kind]})</span><b className={last.fired ? 'is-ok' : ''}>{last.fired ? 'fired' : 'no spike'}</b></div>}
      </div>
      {log.length > 1 && (
        <Plot series={[{ label: 'bell strength', color: '#ffb503', points: [[0, LEARNING.bellStart], ...log.map((t, i) => [i + 1, t.weight])] }]}
          xLabel="trial" yLabel="bell synapse strength" xMax={Math.max(10, log.length)} yMax={LEARNING.maxWeight} format={(v) => fmt(v)} height={160} />
      )}
      {last && <VoltagePlot runs={[{ label: names[last.kind], run: last.run }]} duration={120} />}
    </LabFrame>
  );
}

export default function NeuronLab({ params = {}, onResult }) {
  const mode = MODES[params.mode] ? params.mode : 'single';
  if (mode === 'rate') return <FiringRate onResult={onResult} />;
  if (mode === 'synapses') return <Synapses onResult={onResult} />;
  if (mode === 'learning') return <Learning onResult={onResult} />;
  return <SingleNeuron onResult={onResult} />;
}
