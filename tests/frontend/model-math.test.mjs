import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {measuredCurves,cutoffPosition,transferDifference,radialMaxima} from '../../frontend/chapters/model-math.js';
import {svgTex} from '../../frontend/chapter3/svg-tex.js';
import {latexToMathML} from '../../frontend/mathlite.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../../frontend/assets/'+name,import.meta.url),'utf8'));

test('chapter four uses the same 71 measured points and tail as chapter three',()=>{
  const data=measuredCurves(read('measurements.json'));
  for(const V of [4,6,8,10])assert.equal(data[V].rows.length,71);
  const d=data[10],tail=d.rows.at(-1);
  assert.ok(Math.abs(tail.A1_uA-2.188)<1e-9);
  assert.ok(Math.abs(tail.A2_uA-3.235)<1e-9);
  assert.ok(Math.abs(100*tail.A1_uA/d.zero.A1_uA-8.96747)<.001);
  assert.ok(Math.abs(100*tail.A2_uA/d.zero.A2_uA-16.25661)<.001);
});
test('full-population transfer and local cutoff agree with the physical anchor',()=>{
  const a=read('precomputed/maps/10_0.000000.json'),b=read('precomputed/maps/10_4.000000.json');
  const d=transferDifference(a,b);
  assert.deepEqual([d.H,d.central,d.K,d.net],[9,-29,64,44]);
  assert.ok(Math.abs(cutoffPosition(4,10)-8.36)<.01);
  const bundle=read('precomputed/ch4_baseline.json'),trace=bundle.traces['10:4.000000:6413'];
  const maxima=radialMaxima(trace).map(i=>trace.points[i][3]);
  assert.equal(maxima.length,5);
  assert.ok(maxima.every((r,i)=>!i||r>maxima[i-1]));
  assert.ok(Math.abs(maxima.at(-1)-4.55)<.001);
});
test('SVG units stay typeset when adjacent TeX commands are combined',()=>{
  assert.equal(svgTex(String.raw`\Delta I / \mu\mathrm{A}`),'Δ I / μA');
  assert.equal(svgTex(String.raw`10\,\mathrm{k\Omega}`),'10 kΩ');
});
test('chapter five vector notation, degrees and nested units render as mathematics',()=>{
  const source=String.raw`\mathbf{B}=B\cos\theta\,\hat{\mathbf{z}}+B\sin8^\circ\,\hat{\mathbf{x}}; B\simeq5.735\ \mathrm{mT}`;
  const rendered=latexToMathML(source);
  assert.ok(rendered.includes('<mover accent="true">'));
  assert.ok(rendered.includes('<mo>°</mo>'));
  assert.ok(!/\b(?:mathbf|circ|simeq|hat)\b/.test(rendered));
  assert.ok(latexToMathML(String.raw`10\ \mathrm{k\Omega}`).includes('Ω'));
  assert.ok(!svgTex(String.raw`P_\varphi/m`).includes('varphi'));
  assert.ok(!svgTex(String.raw`\Delta\varphi_0`).includes('varphi'));
});
