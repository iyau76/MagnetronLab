/** Cold-emission, infinitely long coaxial diode in a uniform axial field.
 * Inputs use the units written in their names. The emitted electron starts at
 * (filamentRadius, 0), at rest; the cathode is equipotential and the anode is at
 * voltageV. This module has no thermal spread, axial field or guard-ring split.
 */
export const ELECTRON_CHARGE_TO_MASS = 1.75882000838e11; // |e| / m_e, C kg^-1

const DEFAULTS = Object.freeze({ voltageV: 10, anodeRadiusMm: 4.55, filamentRadiusUm: 37.5 });

function geometry({ voltageV = DEFAULTS.voltageV,
  anodeRadiusMm = DEFAULTS.anodeRadiusMm,
  filamentRadiusUm = DEFAULTS.filamentRadiusUm } = {}) {
  if (!Number.isFinite(voltageV) || voltageV < 0) throw new RangeError('加速电压必须为非负有限值。');
  const anodeRadius = anodeRadiusMm * 1e-3;
  const filamentRadius = filamentRadiusUm * 1e-6;
  if (!Number.isFinite(anodeRadius) || !Number.isFinite(filamentRadius)
    || filamentRadius <= 0 || anodeRadius <= filamentRadius) {
    throw new RangeError('阳极内半径必须大于正的灯丝半径。');
  }
  return { voltageV, anodeRadius, filamentRadius,
    logarithmicRadiusRatio: Math.log(anodeRadius / filamentRadius) };
}

/** The equality case touches the anode at its radial turning point. */
export function criticalFieldMilliTesla(parameters = {}) {
  const { voltageV, anodeRadius, filamentRadius } = geometry(parameters);
  return 1e3 * Math.sqrt(8 * voltageV / ELECTRON_CHARGE_TO_MASS)
    * anodeRadius / (anodeRadius ** 2 - filamentRadius ** 2);
}

/** Positive electron charge-to-mass magnitude, inferred from a measured cutoff. */
export function chargeToMass(parameters = {}) {
  const { voltageV, anodeRadius, filamentRadius } = geometry(parameters);
  const field = parameters.criticalFieldMT * 1e-3;
  if (voltageV === 0 || !Number.isFinite(field) || field === 0) {
    throw new RangeError('比荷反演需要正加速电压和非零截止磁场。');
  }
  return 8 * voltageV * anodeRadius ** 2
    / (field ** 2 * (anodeRadius ** 2 - filamentRadius ** 2) ** 2);
}

/** Collected current in µA. All cold electrons share the same radial orbit.
 * At |B| = B_cutoff the trajectory touches the absorbing anode: full collection.
 * At U = 0 an electron at rest cannot leave the cathode, including when B = 0.
 */
export function idealCurrent({ fieldMT = 0, emissionUA = 30, ...parameters } = {}) {
  const { voltageV } = geometry(parameters);
  if (!Number.isFinite(fieldMT) || !Number.isFinite(emissionUA) || emissionUA < 0) {
    throw new RangeError('磁场必须为有限值，发射电流必须为非负有限值。');
  }
  return voltageV > 0 && Math.abs(fieldMT) <= criticalFieldMilliTesla(parameters) ? emissionUA : 0;
}

/** Integrates the Lorentz equations with RK4 in SI units. The electric potential
 * is U ln(r/r_f) / ln(r_a/r_f), so an electron's electric acceleration is outward.
 * A positive axial B turns the electron counterclockwise in the (x,y) plane.
 * High-field tracks finish at their FIRST radial turning point. They have not
 * been collected; continuing an ideal collision-free orbit would return them
 * to the cathode. points are display samples of the actual integrated orbit.
 */
export function idealTrajectory({ fieldMT = 0, ...parameters } = {}) {
  const started = performance.now();
  const { voltageV, anodeRadius, filamentRadius, logarithmicRadiusRatio } = geometry(parameters);
  if (!Number.isFinite(fieldMT)) throw new RangeError('磁场必须为有限值。');
  const criticalFieldMT = criticalFieldMilliTesla(parameters);
  const electricAccelerationFactor = ELECTRON_CHARGE_TO_MASS * voltageV / logarithmicRadiusRatio;
  const cyclotronFrequency = ELECTRON_CHARGE_TO_MASS * fieldMT * 1e-3;
  const energyScale = ELECTRON_CHARGE_TO_MASS * voltageV;
  const initialCanonicalAngularMomentum = -cyclotronFrequency * filamentRadius ** 2 / 2;
  const angularMomentumScale = Math.max(Math.abs(cyclotronFrequency) * anodeRadius ** 2,
    Math.sqrt(2 * energyScale) * anodeRadius, Number.MIN_VALUE);
  const points = [{ xMm: filamentRadius * 1e3, yMm: 0, tNs: 0 }];
  let state = [filamentRadius, 0, 0, 0];
  let time = 0;
  let steps = 0;
  let outcome = voltageV === 0 ? 'cathode' : 'flying';
  let maxRelativeEnergyError = 0;
  let maxRelativeCanonicalAngularMomentumError = 0;

  function derivative([x, y, vx, vy]) {
    const radialFactor = electricAccelerationFactor / (x * x + y * y);
    return [vx, vy, radialFactor * x - cyclotronFrequency * vy,
      radialFactor * y + cyclotronFrequency * vx];
  }

  function step(from, dt) {
    const first = derivative(from);
    const second = derivative(from.map((value, index) => value + dt * first[index] / 2));
    const third = derivative(from.map((value, index) => value + dt * second[index] / 2));
    const fourth = derivative(from.map((value, index) => value + dt * third[index]));
    return from.map((value, index) => value
      + dt * (first[index] + 2 * second[index] + 2 * third[index] + fourth[index]) / 6);
  }

  const radius = values => Math.hypot(values[0], values[1]);
  const radialMotion = values => values[0] * values[2] + values[1] * values[3];

  function recordErrors(values) {
    const [x, y, vx, vy] = values;
    const specificEnergy = (vx * vx + vy * vy) / 2
      - electricAccelerationFactor * Math.log(Math.hypot(x, y) / filamentRadius);
    maxRelativeEnergyError = Math.max(maxRelativeEnergyError, Math.abs(specificEnergy) / energyScale);
    const canonicalAngularMomentum = x * vy - y * vx - cyclotronFrequency * (x * x + y * y) / 2;
    maxRelativeCanonicalAngularMomentumError = Math.max(maxRelativeCanonicalAngularMomentumError,
      Math.abs(canonicalAngularMomentum - initialCanonicalAngularMomentum) / angularMomentumScale);
  }

  function atEvent(from, dt, eventPassed) {
    let before = 0;
    let after = dt;
    for (let iteration = 0; iteration < 35; iteration += 1) {
      const middle = (before + after) / 2;
      if (eventPassed(step(from, middle))) after = middle;
      else before = middle;
    }
    const eventTime = (before + after) / 2;
    return { state: step(from, eventTime), dt: eventTime };
  }

  while (outcome === 'flying' && steps < 12000) {
    const distance = radius(state);
    const speed = Math.hypot(state[2], state[3]);
    const electricAcceleration = electricAccelerationFactor / distance;
    // Limit fractional radius/velocity changes and magnetic rotation per step.
    const dt = 0.02 * Math.min(Math.sqrt(distance / electricAcceleration),
      speed > 0 ? distance / speed : Infinity,
      cyclotronFrequency !== 0 ? 1 / Math.abs(cyclotronFrequency) : Infinity);
    let next = step(state, dt);
    let elapsed = dt;
    if (radius(next) >= anodeRadius) {
      const event = atEvent(state, dt, values => radius(values) >= anodeRadius);
      next = event.state;
      elapsed = event.dt;
      outcome = 'anode';
    } else if (steps > 0 && radialMotion(next) <= 0) {
      const event = atEvent(state, dt, values => radialMotion(values) <= 0);
      next = event.state;
      elapsed = event.dt;
      // At exact analytical cutoff the radial maximum and absorbing surface
      // coincide. Roundoff may place the integrated maximum just inside it.
      // Preserve the computed point (no geometric projection), and report error.
      outcome = Math.abs(fieldMT) <= criticalFieldMT ? 'anode' : 'turning';
    }
    state = next;
    time += elapsed;
    steps += 1;
    recordErrors(state);
    if (steps % 3 === 0 || outcome !== 'flying') {
      points.push({ xMm: state[0] * 1e3, yMm: state[1] * 1e3, tNs: time * 1e9 });
    }
  }

  const finalRadius = radius(state);
  return { points, outcome, diagnostics: {
    model: 'cold-coaxial-uniform-axial-field', method: 'RK4 with local physical time scales',
    criticalFieldMT, steps, flightTimeNs: time * 1e9,
    finalRadiusMm: finalRadius * 1e3,
    finalRadialVelocityMS: radialMotion(state) / finalRadius,
    finalTangentialVelocityMS: (state[0] * state[3] - state[1] * state[2]) / finalRadius,
    maxRelativeEnergyError, maxRelativeCanonicalAngularMomentumError,
    energyNormalization: '(|e|/m_e) × voltageV',
    angularMomentumNormalization: 'max(|ω_c| r_a², sqrt(2 |e| U / m_e) r_a)',
    anodeRadiusErrorMm: outcome === 'anode' ? (finalRadius - anodeRadius) * 1e3 : null,
    cutoffConvention: 'first contact with absorbing anode, including tangency',
    elapsedMs: performance.now() - started,
  } };
}
