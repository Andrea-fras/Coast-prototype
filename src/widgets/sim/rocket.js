// Vertical rocket flight for the "Build a Rocket" workshop. Plain module (no React) so the
// physics can be tested on its own: node --test src/widgets/sim
//
// Stages fire bottom first. Thrust is constant while a stage burns; its mass flow is
// thrust / exhaust velocity, so the ideal Δv of the flight is exactly the rocket equation.
// Gravity weakens with altitude, air thins exponentially, and drag acts on the whole stack.
// While the engines burn, every m/s the rocket fails to gain is booked as a gravity or drag
// loss: burnout speed = ideal Δv − gravity loss − drag loss.

export const G0 = 9.80665;               // m/s², standard gravity
export const EARTH_RADIUS = 6_371_000;   // m
export const SPACE_ALTITUDE = 100_000;   // m, the Kármán line
const SEA_LEVEL_DENSITY = 1.225;         // kg/m³
const SCALE_HEIGHT = 8_500;              // m: air density falls by e every 8.5 km
// Hardware can't weigh nothing: tanks weigh at least a quarter of the fuel they hold (small
// rockets like the V-2 were about 30%) and an engine about 1 kg per kN of thrust.
export const MIN_TANK_FRACTION = 0.25;
export const ENGINE_KG_PER_KN = 1;
export const minimumHardware = (fuelMass, thrust) => MIN_TANK_FRACTION * fuelMass + ENGINE_KG_PER_KN * (thrust / 1000);

export const ENGINES = {
  solid: { label: 'Solid motor', exhaustVelocity: 2_400 },
  kerosene: { label: 'Kerosene + oxygen', exhaustVelocity: 2_900 },
  hydrogen: { label: 'Hydrogen + oxygen', exhaustVelocity: 4_200 },
};

export const airDensity = (h) => SEA_LEVEL_DENSITY * Math.exp(-Math.max(0, h) / SCALE_HEIGHT);
export const gravityAt = (h) => G0 * (EARTH_RADIUS / (EARTH_RADIUS + Math.max(0, h))) ** 2;

/** Mass of the whole stack when stage `from` is the one firing. After the last stage burns
 *  out (from === stages.length) its empty shell coasts on with the payload. */
function stackMass(stages, payload, from, fuelLeft) {
  if (from >= stages.length) return payload + stages[stages.length - 1].dryMass;
  let m = payload;
  for (let i = from; i < stages.length; i += 1) m += stages[i].dryMass + (i === from ? fuelLeft : stages[i].fuelMass);
  return m;
}

export function totalMass({ stages, payload = 0 }) {
  return stackMass(stages, payload, 0, stages[0]?.fuelMass ?? 0);
}

/** Ideal Δv (m/s): the rocket equation for each stage, carrying everything above it. */
export function idealDeltaV({ stages, payload = 0 }) {
  return stages.reduce((dv, s, i) => {
    const m0 = stackMass(stages, payload, i, s.fuelMass);
    return dv + s.exhaustVelocity * Math.log(m0 / (m0 - s.fuelMass));
  }, 0);
}

export function liftoffRatio({ stages, payload = 0 }) {
  return stages[0].thrust / (totalMass({ stages, payload }) * G0);
}

/** Problems with a design, in words; [] when it can fly. */
export function designProblems({ stages, payload = 0, diameter = 0.5 }) {
  const out = [];
  stages.forEach((s, i) => {
    const name = stages.length > 1 ? `Stage ${i + 1}` : 'The rocket';
    if (!(s.fuelMass > 0)) out.push(`${name} needs some fuel.`);
    if (!(s.thrust > 0)) out.push(`${name} needs an engine with thrust.`);
    if (!(s.exhaustVelocity > 0)) out.push(`${name} needs an engine type.`);
    const least = minimumHardware(s.fuelMass, s.thrust);
    if (s.dryMass < least - 1e-9) {
      out.push(`${name}: tanks and engine must weigh at least ${Math.ceil(least)} kg (a quarter of the fuel, plus 1 kg per kN of thrust).`);
    }
  });
  if (payload < 0) out.push('Payload can’t be negative.');
  if (!(diameter > 0)) out.push('The rocket needs a diameter.');
  return out;
}

/**
 * Fly a design straight up. Returns the numbers the lab shows and sends to Pedro, and a
 * trace of {t, h, v, a, stage} for the plots (at most ~800 points).
 * options.gravity / options.drag switch those forces off for "empty space" experiments.
 */
export function simulate(design, { gravity = true, drag = true, dt = 0.01, maxTime = 4_000 } = {}) {
  const { stages, payload = 0, diameter = 0.5, dragCoefficient = 0.5 } = design;
  const area = Math.PI * (diameter / 2) ** 2;
  const ideal = idealDeltaV(design);
  const twr = liftoffRatio(design);
  const base = { idealDeltaV: ideal, liftoffRatio: twr, totalMass: totalMass(design) };
  if (gravity && twr <= 1) {
    return { ...base, liftoff: false, apogee: 0, maxVelocity: 0, burnout: null, separations: [],
      gravityLoss: 0, dragLoss: 0, maxAcceleration: 0, reachedSpace: false, trace: [{ t: 0, h: 0, v: 0, a: 0, stage: 0 }] };
  }

  let stage = 0;
  let fuel = stages[0].fuelMass;
  let h = 0; let v = 0; let t = 0;
  let gravityLoss = 0; let dragLoss = 0; let maxVelocity = 0; let maxAcceleration = 0;
  let burnout = null; let apogee = 0; let apogeeTime = 0;
  const separations = [];
  const raw = [];

  while (t < maxTime) {
    const burning = stage < stages.length;
    const m = stackMass(stages, payload, stage, fuel);
    const thrust = burning ? stages[stage].thrust : 0;
    const g = gravity ? gravityAt(h) : 0;
    const dragForce = drag ? 0.5 * airDensity(h) * v * Math.abs(v) * dragCoefficient * area : 0;
    let step = burning ? dt : dt * 5;
    if (burning) {
      const mdot = thrust / stages[stage].exhaustVelocity;
      step = Math.min(step, fuel / mdot);  // end the step exactly at burnout
    }
    const a = (thrust - dragForce) / m - g;
    if (burning) {
      // Δv gained from the engine this step, exactly as the rocket equation counts it.
      const mdot = thrust / stages[stage].exhaustVelocity;
      const burnt = mdot * step;
      const dvEngine = stages[stage].exhaustVelocity * Math.log(m / (m - burnt));
      const dvLossG = g * step;
      const dvLossD = (dragForce / m) * step;
      gravityLoss += dvLossG;
      dragLoss += dvLossD;
      v += dvEngine - dvLossG - dvLossD;
      fuel -= burnt;
    } else {
      v += a * step;
    }
    h += v * step;
    t += step;
    maxAcceleration = Math.max(maxAcceleration, Math.abs(a));
    maxVelocity = Math.max(maxVelocity, v);
    raw.push({ t, h: Math.max(0, h), v, a, stage });

    if (burning && fuel <= 1e-9) {
      separations.push({ stage: stage + 1, t, h, v });
      stage += 1;
      fuel = stage < stages.length ? stages[stage].fuelMass : 0;
      if (stage === stages.length) burnout = { t, h, v };
    }
    if (h > apogee) { apogee = h; apogeeTime = t; }
    if (h < 0 && t > 1) break;                      // fell back to the ground
    if (!gravity && stage === stages.length) break; // empty space: nothing changes after burnout
    if (stage === stages.length && v < 0) break;    // past the top of the flight
  }

  const every = Math.max(1, Math.ceil(raw.length / 800));
  const trace = [{ t: 0, h: 0, v: 0, a: 0, stage: 0 }, ...raw.filter((_, i) => i % every === 0 || i === raw.length - 1)];
  return {
    ...base, liftoff: true, apogee, apogeeTime, maxVelocity, burnout, separations,
    gravityLoss, dragLoss, maxAcceleration, reachedSpace: apogee >= SPACE_ALTITUDE, trace,
  };
}
