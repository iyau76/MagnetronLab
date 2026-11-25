import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const app=fs.readFileSync(new URL('../../frontend/app.js',import.meta.url),'utf8');
const point=JSON.parse(fs.readFileSync(new URL('../../frontend/assets/default_point.json',import.meta.url)));
const scan=JSON.parse(fs.readFileSync(new URL('../../frontend/assets/default_scan.json',import.meta.url)));

test('runtime default metadata does not invalidate the initial scan',()=>{
 const runtime=app.match(/const RUNTIME_ONLY_KEYS=\[[^;]+;/)[0];
 const adoption=app.match(/function adoptParams\(source\)\{[^\n]+/)[0];
 const mismatch=app.match(/function curveMismatch\(\)\{[^\n]+/)[0];
 const sandbox={defaults:{...scan.params,thread_choices:[1,2,4,8,11],fast_threads:11,logical_cores:12,geometry_presets:{specimen_35mm_20261107:{length_mm:35}}},scanData:scan};
 vm.createContext(sandbox);
 vm.runInContext(`let params;${runtime}\n${adoption}\n${mismatch}\nadoptParams(defaults);globalThis.mismatch=curveMismatch();globalThis.adopted=params;`,sandbox);
 assert.equal(sandbox.mismatch,false);
 assert.equal('geometry_presets' in sandbox.adopted,false);
});

test('precomputed examples share current geometry, launch settings, and engine',()=>{
 assert.equal(point.engine,scan.engine);
 for(const data of [point,scan]){
  assert.equal(data.params.length_mm,35);
  assert.equal(data.params.central_mm,15);
  assert.equal(data.params.filament_radius_um,37.5);
  assert.equal(data.params.anode_radius_mm,4.55);
  assert.equal(data.params.launch_mode,'full');
  assert.equal(data.params.emission_profile,'uniform');
  assert.equal(data.max_flight_ns??2000,2000);
 }
 assert.equal(point.paths.length,48);
 assert.equal(scan.rows.length,42);
 assert.deepEqual(point.path_columns,['z_mm','x_mm','y_mm','time_ns']);
});
