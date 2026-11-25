import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { ELECTRON_CHARGE_TO_MASS, criticalFieldMilliTesla, chargeToMass,
  idealCurrent, idealTrajectory } from '../../frontend/modules/ideal-physics.js';

const baseline = { voltageV: 10, anodeRadiusMm: 4.55, filamentRadiusUm: 50 };
const cutoff = criticalFieldMilliTesla(baseline);
const relative = (actual, expected, tolerance, label = '') => {
  assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * tolerance,
    `${label}: ${actual} differs from ${expected}`);
};

// Independent radial energy equation: this checks the Cartesian integrator's
// event radius against conservation, rather than another copy of RK4.
function energyTurningRadius(parameters) {
  const inner = parameters.filamentRadiusUm * 1e-6;
  const outer = parameters.anodeRadiusMm * 1e-3;
  const omega = ELECTRON_CHARGE_TO_MASS * parameters.fieldMT * 1e-3;
  function radialSpeedSquared(radius) {
    return 2 * ELECTRON_CHARGE_TO_MASS * parameters.voltageV
      * Math.log(radius / inner) / Math.log(outer / inner)
      - (omega * (radius - inner * inner / radius) / 2) ** 2;
  }
  let lower = inner * (1 + 1e-9);
  let upper = outer;
  for (let iteration = 0; iteration < 90; iteration += 1) {
    const middle = (lower + upper) / 2;
    if (radialSpeedSquared(middle) > 0) lower = middle;
    else upper = middle;
  }
  return (lower + upper) / 2;
}

test('finite cathode correction, voltage/radius scaling and charge-to-mass inversion', () => {
  relative(cutoff, 4.687867692648323, 1e-13, '10 V reference cutoff (mT)');
  for (const voltageV of [0.01, 4, 10, 1000]) {
    for (const radiusScale of [0.1, 1, 10]) {
      const parameters = { voltageV, anodeRadiusMm: 4.55 * radiusScale,
        filamentRadiusUm: 50 * radiusScale };
      const criticalFieldMT = criticalFieldMilliTesla(parameters);
      relative(criticalFieldMT, cutoff * Math.sqrt(voltageV / 10) / radiusScale, 3e-15);
      relative(chargeToMass({ ...parameters, criticalFieldMT }), ELECTRON_CHARGE_TO_MASS, 2e-15);
    }
  }
  const thickCathode = criticalFieldMilliTesla({ ...baseline, filamentRadiusUm: 2000 });
  assert.ok(thickCathode > cutoff * 1.23, 'finite cathode radius must raise the cutoff');
});

test('cold current is a step; touching the anode counts as collection', () => {
  assert.equal(idealCurrent({ ...baseline, fieldMT: cutoff * (1 - 1e-9), emissionUA: 17 }), 17);
  assert.equal(idealCurrent({ ...baseline, fieldMT: cutoff, emissionUA: 17 }), 17);
  assert.equal(idealCurrent({ ...baseline, fieldMT: -cutoff, emissionUA: 17 }), 17);
  assert.equal(idealCurrent({ ...baseline, fieldMT: cutoff * (1 + 1e-9), emissionUA: 17 }), 0);
  assert.equal(idealCurrent({ ...baseline, voltageV: 0, fieldMT: 0 }), 0);
});

test('zero-field launch leaves the surface, reaches anode, and matches an independent flight-time quadrature', () => {
  const result = idealTrajectory({ ...baseline, fieldMT: 0 });
  assert.equal(result.outcome, 'anode');
  assert.ok(result.points.every(point => point.yMm === 0));
  relative(result.points[0].xMm, 0.05, 1e-15);
  relative(result.diagnostics.finalRadiusMm, 4.55, 1e-11);
  relative(result.diagnostics.finalRadialVelocityMS,
    Math.sqrt(2 * ELECTRON_CHARGE_TO_MASS * baseline.voltageV), 2e-8);

  const inner = 50e-6;
  const logRatio = Math.log(4.55e-3 / inner);
  const intervals = 4096;
  const integrationStep = Math.sqrt(logRatio) / intervals;
  let integral = 1 + Math.exp(logRatio);
  for (let index = 1; index < intervals; index += 1) {
    integral += (index % 2 ? 4 : 2) * Math.exp((index * integrationStep) ** 2);
  }
  const flightTime = 2 * inner / Math.sqrt(2 * ELECTRON_CHARGE_TO_MASS * 10 / logRatio)
    * integral * integrationStep / 3;
  relative(result.diagnostics.flightTimeNs, flightTime * 1e9, 2e-8);
});

test('cutoff has tangency; either side agrees with the analytical collection criterion', () => {
  for (const factor of [0.99999, 1, 1.00001]) {
    const result = idealTrajectory({ ...baseline, fieldMT: cutoff * factor });
    assert.equal(result.outcome, factor <= 1 ? 'anode' : 'turning');
    assert.ok(result.diagnostics.maxRelativeEnergyError < 2e-8);
    assert.ok(result.diagnostics.maxRelativeCanonicalAngularMomentumError < 2e-8);
    if (factor === 1) {
      relative(result.diagnostics.finalRadiusMm, baseline.anodeRadiusMm, 2e-8);
      assert.ok(Math.abs(result.diagnostics.finalRadialVelocityMS) < 1e-2);
    }
  }
});

test('supercritical turning radii match scalar energy conservation across physical scales', () => {
  for (const voltageV of [0.1, 10, 1000]) {
    for (const filamentRadiusUm of [5, 50, 500]) {
      const parameters = { ...baseline, voltageV, filamentRadiusUm };
      const fieldMT = criticalFieldMilliTesla(parameters) * 1.7;
      const result = idealTrajectory({ ...parameters, fieldMT });
      assert.equal(result.outcome, 'turning');
      relative(result.diagnostics.finalRadiusMm,
        energyTurningRadius({ ...parameters, fieldMT }) * 1e3, 2e-8);
      assert.ok(result.diagnostics.maxRelativeEnergyError < 2e-8);
      assert.ok(result.diagnostics.maxRelativeCanonicalAngularMomentumError < 2e-8);
      assert.ok(result.points.length < 500, 'single teaching trajectory should remain a small display payload');
      assert.ok(result.diagnostics.steps < 2000);
    }
  }
});

test('reversing the field mirrors the path without changing collection or flight time', () => {
  const positive = idealTrajectory({ ...baseline, fieldMT: 6 });
  const negative = idealTrajectory({ ...baseline, fieldMT: -6 });
  assert.equal(positive.outcome, negative.outcome);
  assert.equal(positive.points.length, negative.points.length);
  for (let index = 0; index < positive.points.length; index += 1) {
    assert.equal(positive.points[index].xMm, negative.points[index].xMm);
    assert.ok(positive.points[index].yMm === -negative.points[index].yMm);
    assert.equal(positive.points[index].tNs, negative.points[index].tNs);
  }
  assert.ok(positive.points[5].yMm > 0, 'electron bends counterclockwise for +Bz');
});

test('simultaneously scaling voltage and B keeps the orbit and rescales flight time', () => {
  const lower = idealTrajectory({ ...baseline, fieldMT: 4 });
  const higher = idealTrajectory({ ...baseline, voltageV: 40, fieldMT: 8 });
  assert.equal(lower.outcome, higher.outcome);
  assert.equal(lower.points.length, higher.points.length);
  for (let index = 0; index < lower.points.length; index += 1) {
    const before = lower.points[index];
    const after = higher.points[index];
    assert.ok(Math.hypot(before.xMm - after.xMm, before.yMm - after.yMm) < 1e-10);
  }
  relative(higher.diagnostics.flightTimeNs, lower.diagnostics.flightTimeNs / 2, 1e-12);
});

test('anode tangential speed agrees with canonical angular momentum; zero acceleration remains at cathode', () => {
  const result = idealTrajectory({ ...baseline, fieldMT: 3 });
  relative(result.diagnostics.finalTangentialVelocityMS,
    ELECTRON_CHARGE_TO_MASS * 3e-3 / 2 * (4.55e-3 - (50e-6) ** 2 / 4.55e-3), 2e-8);
  const stationary = idealTrajectory({ ...baseline, voltageV: 0, fieldMT: 6 });
  assert.equal(stationary.outcome, 'cathode');
  assert.equal(stationary.points.length, 1);
  assert.equal(stationary.diagnostics.steps, 0);
  assert.equal(stationary.diagnostics.flightTimeNs, 0);
});

test('benchmark: one trajectory is bounded interactive work', () => {
  for (let index = 0; index < 10; index += 1) idealTrajectory({ ...baseline, fieldMT: cutoff });
  const timings = [];
  const started = performance.now();
  let maxSteps = 0;
  let maxPoints = 0;
  for (let index = 0; index < 200; index += 1) {
    const result = idealTrajectory({ ...baseline, fieldMT: (index % 100) * cutoff / 50 });
    timings.push(result.diagnostics.elapsedMs);
    maxSteps = Math.max(maxSteps, result.diagnostics.steps);
    maxPoints = Math.max(maxPoints, result.points.length);
  }
  timings.sort((a, b) => a - b);
  console.log(JSON.stringify({ benchmark: 'ideal-trajectory-200-points',
    totalMs: performance.now() - started, medianMs: timings[100], p95Ms: timings[190],
    maxMs: timings.at(-1), maxSteps, maxDisplayPoints: maxPoints,
    rssMiB: process.memoryUsage().rss / 1024 ** 2 }));
  assert.ok(maxSteps < 2000);
  // Runtime is reported, not compared to a hardware-specific pass/fail threshold.
});
