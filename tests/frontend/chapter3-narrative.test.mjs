import test from 'node:test';
import assert from 'node:assert/strict';
import { latexToMathML } from '../../frontend/mathlite.js';
import { nearestCurvePoint } from '../../frontend/chapter3/charts.js';
import { STEPS, fulfilled, frontierStep, restoredStory } from '../../frontend/chapter3/guided-stage.js';

test('braced exponents and both script orders render the intended MathML', () => {
  const power = latexToMathML('10^{11}');
  assert.match(power, /<msup><mn>10<\/mn><mrow><mn>11<\/mn><\/mrow><\/msup>/);
  assert.equal(latexToMathML('B_c^2'), latexToMathML('B^2_c'));
  assert.match(latexToMathML(String.raw`\mathrm{CH2}^-`), /<msup><mrow><mi mathvariant="normal">C<\/mi><mi mathvariant="normal">H<\/mi><mn>2<\/mn><\/mrow><mrow><mo>−<\/mo><\/mrow><\/msup>/);
  assert.match(latexToMathML(String.raw`1\text{ k}\Omega`), /Ω/);
  assert.match(latexToMathML(String.raw`1.84\text{ V}`), /<mtext>\u00a0V<\/mtext>/);
});

test('backtracking to a completed action exposes a continuation', () => {
  const s = {
    swept: Object.fromEntries([4, 6, 8, 10].map((v) => [v, { done: true }])),
    singleCalcDone: true,
    scatterDone: true,
    fitDone: true,
  };
  for (const id of ['0c', '1', '2a', '3', '4a'])
    assert.equal(
      fulfilled(
        STEPS.find((x) => x.id === id),
        s,
      ),
      true,
      id,
    );
  assert.equal(frontierStep(s), '5a');
  s.heaterFound = true;
  assert.equal(frontierStep(s), '5b');
  s.probeCompared = true;
  assert.equal(frontierStep(s), '5c');
  s.ueffVerified = true;
  assert.equal(frontierStep(s), '7a');
});

test('free-mode partial acquisition and v1 migration resume at the real frontier', () => {
  const s = { swept: { 4: { done: true } } };
  assert.equal(frontierStep(s), '1');
  assert.equal(restoredStory({}, s).step, '1');
  assert.equal(restoredStory({ manualLayout: true }, s).manualLayout, true);
});

test('clamped magnetic-field projection can select the first zero-field sample', () => {
  const pts = [0, 0.02, 0.04, 0.06, 0.08].map((i, k) => [k * 20, i]);
  const b = (i) => Math.max(0, 4.231 * i - 0.188);
  assert.equal(nearestCurvePoint(pts, 5, 0, b, 'B'), 0);
  assert.equal(nearestCurvePoint(pts, 5, b(0.08) / b(1.45), b, 'B'), 4);
  assert.equal(nearestCurvePoint(pts, 5, 0.04 / 1.45, b, 'IM'), 2);
});
