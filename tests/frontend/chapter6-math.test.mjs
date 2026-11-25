import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {weightedScan,modelFit,budgetModels,ratioErrors} from '../../frontend/chapters/math6.js';
import {weightedRow} from '../../frontend/chapters/physics-client.js';
import {ratioChart,weightChart,multiCurve} from '../../frontend/chapters/charts6.js';
const read=name=>JSON.parse(fs.readFileSync(new URL('../../frontend/assets/'+name,import.meta.url),'utf8'));
const b=read('precomputed/ch6_bundle.json'),a=read('measurements.json');
test('same tangent operator reproduces independently recomputed model and measured budgets',()=>{
  const models=budgetModels(b,a),ref=[[0,0],[2.163466,2.42017],[2.173877,1.97112],[2.184309,4.37385],[2.177087,-9.65738]];
  models.forEach((m,i)=>{assert.ok(Math.abs(m.fit.u0-ref[i][0])<2e-6);assert.ok(Math.abs(m.fit.relPct-ref[i][1])<1e-5);});
  assert.equal(modelFit(a,{}),null);
});
test('end cooling preserves emitted weight, resolves four ratios and H-only rebound',()=>{
  assert.deepEqual(ratioErrors(b,.76).ratios.map(v=>+v.toFixed(3)),[.809,.820,.822,.822]);
  for(const eta of [0,.76,1])for(const V of [4,6,8,10]){
    for(const r of weightedScan(b,V,8,eta)){
      assert.ok(Math.abs(r.fractions.reduce((s,n)=>s+n,0)-1)<1e-12);
      assert.ok(Math.abs(r.A2_uA-r.A2_H_uA-r.A2_K_uA)<1e-12);
    }
  }
  const extra=read('precomputed/ch6_anchors.json'),p=extra.anchors.find(p=>p.row.field_mT===4.425),r=weightedRow(p.row,p.moments,.76,extra.params.emission_uA),z=weightedScan(b,10,0,.76)[0];
  assert.ok(Math.abs(100*r.A2_H_uA/z.A2_H_uA-102.80855)<1e-5);
  assert.ok(Math.abs(100*r.A2_uA/z.A2_uA-51.27756)<1e-5);
  assert.equal(r.A2_K_uA,0);
});
test('finite-field presets use their actual field grid and disclose pending weight',()=>{
  const edge=read('precomputed/ch6_edge_bundle.json');
  for(const s of Object.values(edge.scans))assert.deepEqual(s.params.fields_mT,s.rows.map(r=>r.field_mT));
  const s=edge.scans.open_t7_n8192,z=s.rows[0],r=s.rows.find(r=>r.field_mT===4.5);
  assert.ok(Math.abs(100*r.A2_uA/z.A2_uA-104.586979)<1e-6);
  assert.ok(r.pending_fraction>0);
  assert.ok(edge.metadata.source_sha256['fine_t10/field.npz']);
});
test('chapter six axis notation leaves no literal TeX command in SVG',()=>{
  for(const s of [ratioChart(b,.76),weightChart(.76),multiCurve(weightedScan(b,10,8,.76),null)])assert.ok(!/\\(?:mathrm|eta|mu)/.test(s));
});
