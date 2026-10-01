import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Rocket, Trash2 } from 'lucide-react';
import LabFrame, { NumberField } from '../LabFrame';
import { fmt } from '../format';
import Plot from '../Plot';
import { ENGINES, SPACE_ALTITUDE, designProblems, idealDeltaV, liftoffRatio, minimumHardware, simulate, totalMass } from '../sim/rocket';

// The words each scene shows, for someone meeting them for the first time.
const WORDS = {
  thrust: ['Thrust', 'the engine’s push, in kilonewtons (kN). 1 kN holds up about 102 kg against gravity.'],
  weight: ['Weight', 'gravity’s pull on the whole rocket: mass in kg × 9.81 ÷ 1000, in kN so you can compare it with thrust.'],
  twr: ['Thrust-to-weight', 'thrust divided by weight.'],
  dry: ['Tanks + engine', 'everything that is left once the fuel is used up.'],
  exhaust: ['Exhaust speed', 'how fast the engine throws its gas out of the back, in metres per second (m/s). Each engine type has its own.'],
  dv: ['Δv (“delta-v”)', 'how much the rocket can change its speed by burning all its fuel, in m/s, with no gravity or air to slow it.'],
  equation: ['Rocket equation', 'Δv = exhaust speed × ln(m₀ ÷ m_f).'],
  masses: ['m₀ and m_f', 'the rocket’s mass full of fuel, and once the fuel is gone.'],
  ln: ['ln', 'the natural logarithm: the “ln” button on a calculator.'],
  payload: ['Payload', 'what the rocket carries.'],
  apogee: ['Highest point', 'where the rocket stops rising: it keeps coasting up after the fuel runs out.'],
  burnout: ['Burnout', 'the moment the fuel runs out.'],
  losses: ['Lost to gravity, lost to air', 'speed the rocket would have had without gravity pulling it back, or without air pushing against it (drag).'],
  diameter: ['Diameter', 'how wide the rocket is: a wider rocket has to push more air out of the way.'],
  g: ['g', 'the pull of gravity at the Earth’s surface: at 3 g you’d feel three times your weight.'],
  stage: ['Stage', 'a section with its own tanks and engine. Stage 1 fires first and is dropped when its fuel is gone.'],
  space: ['Space', 'by convention it starts 100 km up.'],
};
const words = (...ids) => ids.map((id) => WORDS[id]);

// What each workshop milestone's scene shows and asks for.
const SCENES = {
  liftoff: { title: 'Lift-off', hint: 'Will it leave the pad?', predict: 'liftoff', stages: 1, air: true, diameter: false, payload: false,
    terms: words('thrust', 'weight', 'twr', 'dry', 'exhaust'),
    start: [{ fuelMass: 600, dryMass: 400, thrust: 9, engine: 'kerosene' }] },
  design: { title: 'The rocket equation', hint: 'Predict the Δv, then check it.', predict: 'dv', stages: 1, air: false, diameter: false, payload: true,
    terms: words('dv', 'equation', 'masses', 'ln', 'exhaust', 'dry', 'payload'),
    start: [{ fuelMass: 600, dryMass: 400, thrust: 20, engine: 'kerosene' }] },
  flight: { title: 'Flight', hint: 'Predict the highest point, then launch.', predict: 'apogee', stages: 1, air: true, diameter: true, payload: true,
    terms: words('apogee', 'burnout', 'dv', 'losses', 'diameter', 'g', 'space'),
    start: [{ fuelMass: 400, dryMass: 400, thrust: 15, engine: 'kerosene' }] },
  staging: { title: 'Staging', hint: 'Same total mass, two stages.', predict: 'apogee', stages: 2, air: true, diameter: true, payload: true, compare: true,
    terms: words('stage', 'apogee', 'dv', 'losses', 'twr'),
    start: [{ fuelMass: 450, dryMass: 250, thrust: 20, engine: 'kerosene' }, { fuelMass: 150, dryMass: 150, thrust: 5, engine: 'kerosene' }] },
  mission: { title: 'Mission: reach space', hint: 'Carry the payload past 100 km, as light as you can.', predict: 'apogee', stages: 3, air: true, diameter: true, payload: 'fixed',
    terms: words('payload', 'space', 'stage', 'dv', 'losses', 'twr'),
    start: [{ fuelMass: 300, dryMass: 300, thrust: 10, engine: 'kerosene' }] },
};

const km = (m) => m / 1000;
const toDesign = (stages, payload, diameter) => ({
  stages: stages.map((s) => ({ dryMass: s.dryMass, fuelMass: s.fuelMass, thrust: s.thrust * 1000, exhaustVelocity: ENGINES[s.engine].exhaustVelocity })),
  payload, diameter,
});

/** The same total mass as one stage: all tanks and fuel together, the first stage's engine. */
function singleStageTwin(stages) {
  return [{ fuelMass: stages.reduce((m, s) => m + s.fuelMass, 0), dryMass: stages.reduce((m, s) => m + s.dryMass, 0),
    thrust: stages[0].thrust, engine: stages[0].engine }];
}

function describe(stages, payload, diameter, scene) {
  const parts = stages.map((s, i) => `${stages.length > 1 ? `stage ${i + 1}: ` : ''}fuel ${fmt(s.fuelMass)} kg, tanks and engine ${fmt(s.dryMass)} kg, thrust ${fmt(s.thrust, 1)} kN, ${ENGINES[s.engine].label.toLowerCase()} (exhaust ${fmt(ENGINES[s.engine].exhaustVelocity)} m/s)`);
  const d = toDesign(stages, payload, diameter);
  return `Design: ${parts.join('; ')}${scene.payload ? `; payload ${fmt(payload)} kg` : ''}${scene.diameter ? `; diameter ${fmt(diameter, 2)} m` : ''}; total ${fmt(totalMass(d))} kg; lift-off thrust-to-weight ${fmt(liftoffRatio(d), 2)}`;
}

function flightLine(r) {
  if (!r.liftoff) return `Result: it stays on the pad (thrust-to-weight ${fmt(r.liftoffRatio, 2)}: thrust is less than the weight).`;
  return `Result: highest point ${fmt(km(r.apogee), 1)} km after ${fmt(r.apogeeTime)} s${r.reachedSpace ? ' (in space)' : ''}. `
    + `Ideal Δv ${fmt(r.idealDeltaV)} m/s; engines out after ${fmt(r.burnout.t)} s at ${fmt(km(r.burnout.h), 1)} km and ${fmt(r.burnout.v)} m/s; `
    + `lost to gravity ${fmt(r.gravityLoss)} m/s, to air drag ${fmt(r.dragLoss)} m/s; peak acceleration ${fmt(r.maxAcceleration / 9.81, 1)} g.`;
}

function StageEditor({ stage, index, count, onChange, onRemove, showThrust = true }) {
  const set = (k) => (v) => onChange({ ...stage, [k]: v });
  const minDry = Math.ceil(minimumHardware(stage.fuelMass, stage.thrust * 1000));
  return (
    <fieldset className="lab-stage">
      <legend>{count > 1 ? `Stage ${index + 1}${index === 0 ? ' (fires first)' : ''}` : 'Your rocket'}
        {onRemove && <button type="button" className="lab-icon-btn" onClick={onRemove} aria-label={`Remove stage ${index + 1}`}><Trash2 size={13} /></button>}
      </legend>
      <NumberField label="Fuel" unit="kg" min={1} value={stage.fuelMass} onChange={set('fuelMass')} />
      <NumberField label="Tanks + engine" unit="kg" min={minDry} value={stage.dryMass} onChange={set('dryMass')} />
      {showThrust && <NumberField label="Thrust" unit="kN" min={0.1} value={stage.thrust} onChange={set('thrust')} />}
      <label className="lab-field">
        <span className="lab-field__label">Engine</span>
        <select value={stage.engine} onChange={(e) => set('engine')(e.target.value)}>
          {Object.entries(ENGINES).map(([id, e]) => <option key={id} value={id}>{e.label} · {fmt(e.exhaustVelocity)} m/s</option>)}
        </select>
      </label>
    </fieldset>
  );
}

/** Replays a flight over about three seconds; remounted (key) for every launch. */
function FlightView({ result, compare }) {
  const [progress, setProgress] = useState(result?.liftoff ? 0 : 1);
  const frame = useRef(0);
  useEffect(() => {
    if (!result?.liftoff) return undefined;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 3200);
      setProgress(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [result]);
  if (!result) return null;
  const trace = result.trace;
  const shown = trace.slice(0, Math.max(2, Math.ceil(trace.length * progress)));
  const now = shown[shown.length - 1];
  const top = Math.max(result.apogee, compare?.apogee || 0, SPACE_ALTITUDE * 0.3);
  const series = [{ label: 'altitude', color: '#ffb503', points: shown.map((p) => [p.t, km(p.h)]) }];
  if (compare && progress >= 1) series.push({ label: 'one stage', color: 'rgba(159,179,255,0.8)', points: compare.trace.map((p) => [p.t, km(p.h)]) });
  const xMax = Math.max(trace[trace.length - 1].t, compare?.trace?.[compare.trace.length - 1]?.t || 0, 1);
  return (
    <div className="lab-flight">
      <div className="lab-flight__rail" aria-hidden="true">
        <span className="lab-flight__space" style={{ bottom: `${Math.min(100, (SPACE_ALTITUDE / top) * 100)}%` }}>100 km · space</span>
        <span className="lab-flight__rocket" style={{ bottom: `${Math.min(92, (now.h / top) * 100)}%` }}><Rocket size={18} /></span>
      </div>
      <div className="lab-flight__plot">
        <Plot series={series} xLabel="time (s)" yLabel="altitude (km)" xMax={xMax} yMax={km(top) * 1.05}
          lines={top >= SPACE_ALTITUDE * 0.5 ? [{ y: 100, label: 'space (100 km)', color: 'rgba(69,211,195,0.8)' }] : []}
          format={(v) => fmt(v)} />
        {compare && progress >= 1 && (
          <div className="lab-legend"><span className="is-amber">— your {result.separations.length > 1 ? 'stages' : 'rocket'}</span><span className="is-iris">— one stage, same total mass</span></div>
        )}
        <p className="lab-status" role="status">
          {progress < 1 ? `t = ${fmt(now.t)} s · ${fmt(km(now.h), 1)} km · ${fmt(now.v)} m/s` : ''}
        </p>
      </div>
    </div>
  );
}

export default function RocketLab({ params = {}, onResult }) {
  const scene = SCENES[params.scene] || SCENES.flight;
  const [stages, setStages] = useState(scene.start.map((s) => ({ ...s })));
  const [payload, setPayload] = useState(scene.payload === 'fixed' ? (Number(params.payload) || 10) : 0);
  const [diameter, setDiameter] = useState(0.5);
  const [prediction, setPrediction] = useState(null);  // number (km / m/s) or 'yes' | 'no'
  const [flown, setFlown] = useState(null);             // { result, compare, prediction, design text }
  const [playKey, setPlayKey] = useState(0);
  const design = useMemo(() => toDesign(stages, payload, diameter), [stages, payload, diameter]);
  const problems = designProblems(design);
  const twr = liftoffRatio(design);
  const needsPrediction = scene.predict && (prediction === null || prediction === '');

  const launch = () => {
    const result = simulate(design, { gravity: scene.predict !== 'dv', drag: scene.air });
    const compare = scene.compare ? simulate(toDesign(singleStageTwin(stages), payload, diameter)) : null;
    setFlown({ result, compare, prediction, text: describe(stages, payload, diameter, scene) });
    setPlayKey((k) => k + 1);
  };
  const edit = (fn) => { fn(); setFlown(null); };

  let message = null;
  if (flown) {
    const r = flown.result;
    const lines = [`🧪 Rocket lab · ${scene.title}`, flown.text];
    if (scene.predict === 'liftoff') lines.push(`My prediction: it ${flown.prediction === 'yes' ? 'lifts off' : 'stays on the pad'}`);
    if (scene.predict === 'dv') lines.push(`My prediction: Δv ${fmt(flown.prediction)} m/s`);
    if (scene.predict === 'apogee') lines.push(`My prediction: highest point ${fmt(flown.prediction, 1)} km`);
    if (scene.predict === 'dv') {
      lines.push(`Result: ideal Δv ${fmt(r.idealDeltaV)} m/s (rocket equation). Flown in empty space it reaches ${fmt(r.burnout?.v)} m/s.`);
    } else {
      lines.push(flightLine(r));
    }
    if (flown.compare) lines.push(`Same total mass as one stage: ${flightLine(flown.compare).replace('Result: ', '')}`);
    if (scene.payload === 'fixed') lines.push(r.reachedSpace ? `Mission: payload of ${payload} kg reached space. Total mass ${fmt(r.totalMass)} kg.` : `Mission: not in space yet (${fmt(km(r.apogee), 1)} of 100 km).`);
    message = lines.join('\n');
  }

  return (
    <LabFrame title={`Rocket lab · ${scene.title}`} hint={scene.hint} terms={scene.terms} result={message} onResult={onResult}>
      <div className="lab-stages">
        {stages.map((s, i) => (
          <StageEditor key={i} stage={s} index={i} count={stages.length}
            onChange={(next) => edit(() => setStages((all) => all.map((x, j) => (j === i ? next : x))))}
            onRemove={scene.stages > 1 && stages.length > 1 && i > 0 ? () => edit(() => setStages((all) => all.filter((_, j) => j !== i))) : null} />
        ))}
        {stages.length < scene.stages && (
          <button type="button" className="lab-btn lab-btn--quiet" onClick={() => edit(() => setStages((all) => [...all, { fuelMass: 150, dryMass: 150, thrust: 5, engine: 'kerosene' }]))}>
            <Plus size={14} aria-hidden="true" /> Add a stage on top
          </button>
        )}
      </div>
      <div className="lab-row lab-row--wrap">
        {scene.payload && (
          <NumberField label="Payload" unit="kg" min={0} value={payload} disabled={scene.payload === 'fixed'} onChange={(v) => edit(() => setPayload(v))} />
        )}
        {scene.diameter && <NumberField label="Diameter" unit="m" min={0.1} max={5} value={diameter} onChange={(v) => edit(() => setDiameter(v))} />}
      </div>
      <p className="lab-caption">
        Total mass {fmt(totalMass(design))} kg · weight {fmt((totalMass(design) * 9.81) / 1000, 1)} kN · lift-off thrust-to-weight <b className={twr > 1 ? 'is-ok' : 'is-bad'}>{fmt(twr, 2)}</b>
        {scene.predict !== 'dv' && flown ? ` · ideal Δv ${fmt(idealDeltaV(design))} m/s` : ''}
        {scene.predict === 'dv' ? ` · full, m₀ ${fmt(totalMass(design))} kg · fuel gone, m_f ${fmt(totalMass(design) - stages[0].fuelMass)} kg` : ''}
      </p>
      {problems.length > 0 && <ul className="lab-problems">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}

      <div className="lab-predict">
        {scene.predict === 'liftoff' && (
          <div className="lab-choice" role="radiogroup" aria-label="Your prediction">
            <span>Your prediction:</span>
            {[['yes', 'It lifts off'], ['no', 'It stays on the pad']].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={prediction === v} className="lab-tab" onClick={() => { setPrediction(v); setFlown(null); }}>{l}</button>
            ))}
          </div>
        )}
        {scene.predict === 'dv' && <NumberField label="Your predicted Δv" unit="m/s" min={0} value={prediction ?? NaN} onChange={(v) => { setPrediction(v); setFlown(null); }} />}
        {scene.predict === 'apogee' && <NumberField label="Your predicted highest point" unit="km" min={0} value={prediction ?? NaN} onChange={(v) => { setPrediction(v); setFlown(null); }} />}
        <button type="button" className="lab-btn lab-btn--go" disabled={problems.length > 0 || needsPrediction} onClick={launch}>
          <Rocket size={14} aria-hidden="true" /> {scene.predict === 'dv' ? 'Check it' : 'Launch'}
        </button>
        {needsPrediction && <span className="lab-status">Predict first: that's where the learning is.</span>}
      </div>

      {flown && scene.predict === 'dv' && (
        <div className="lab-readout">
          <div><span>Rocket equation</span><b>{fmt(flown.result.idealDeltaV)} m/s</b></div>
          <div><span>Your prediction</span><b>{fmt(flown.prediction)} m/s</b></div>
          <div><span>Mass ratio m₀ / m_f</span><b>{fmt(totalMass(design) / (totalMass(design) - stages[0].fuelMass), 2)}</b></div>
        </div>
      )}
      {flown && scene.predict !== 'dv' && (
        <>
          <FlightView key={playKey} result={flown.result} compare={flown.compare} />
          <div className="lab-readout">
            {flown.result.liftoff ? (
              <>
                <div><span>Highest point</span><b>{fmt(km(flown.result.apogee), 1)} km</b></div>
                <div><span>Ideal Δv</span><b>{fmt(flown.result.idealDeltaV)} m/s</b></div>
                <div><span>Speed at burnout</span><b>{fmt(flown.result.burnout.v)} m/s</b></div>
                <div><span>Lost to gravity</span><b>{fmt(flown.result.gravityLoss)} m/s</b></div>
                <div><span>Lost to air</span><b>{fmt(flown.result.dragLoss)} m/s</b></div>
                {flown.compare && <div><span>One stage, same mass</span><b>{fmt(km(flown.compare.apogee), 1)} km</b></div>}
              </>
            ) : <div><span>Stays on the pad</span><b>thrust {fmt(stages[0].thrust, 1)} kN &lt; weight {fmt((totalMass(design) * 9.81) / 1000, 1)} kN</b></div>}
          </div>
          {scene.payload === 'fixed' && (
            <p className={`lab-verdict ${flown.result.reachedSpace ? 'is-ok' : ''}`}>
              {flown.result.reachedSpace ? `Payload in space, with a ${fmt(flown.result.totalMass)} kg rocket. Can you make it lighter?` : `${fmt(km(flown.result.apogee), 1)} km of 100: not in space yet.`}
            </p>
          )}
        </>
      )}
    </LabFrame>
  );
}
