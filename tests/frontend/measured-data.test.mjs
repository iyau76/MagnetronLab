import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {unpackAsset,selectRows,zeroBaseline,measurementBaseline,measurementConditions,explorationFromMeasurement,measurementCsv,steepestCutoff,fitChargeMass} from '../../frontend/modules/measured.js';

const asset=JSON.parse(readFileSync(new URL('../../frontend/assets/measurements.json',import.meta.url),'utf8'));
const data=unpackAsset(asset);
assert.equal(selectRows(data,{voltage:10,direction:'up'}).length,76);
assert.equal(selectRows(data,{voltage:10,direction:'down'}).length,6);
assert.equal(selectRows(data,{mode:'voltage'}).length,70);
const first=data.magnetic.find(r=>r.run_id==='0114'&&r.record_role==='zero_before');
assert.ok(Math.abs(zeroBaseline(data,first,'A1')-24.399)<.002);
const targets=selectRows(data,{mode:'voltage',direction:'up'});
assert.ok(targets.every(r=>Number.isFinite(zeroBaseline(data,r,'sum'))));
const reversed=selectRows(data,{voltage:10,direction:'down'})[0],baseline=measurementBaseline(data,reversed);
assert.ok(Math.abs(baseline.A1_uA-24.399)<.002);
assert.ok(baseline.A1_uA>reversed.physical_A1_current_uA*5);
assert.equal(baseline.source.record_role,'zero_before');
assert.equal(baseline.source.source_records.length,10);
assert.equal(measurementBaseline(data,first),baseline);
assert.equal(measurementBaseline(data,targets[0]).source.source_records.length,15);

// Regression: visit the 8 V magnetic scan, then enter 2377 and select its 4 V
// point. Metadata, model transfer and export must all use the selected physical
// record, never the inactive magnetic-voltage selector left at 8 V.
const contextState={mode:'magnetic',voltage:8,direction:'both',axis:'actual',selected:0,normalized:false,
  channels:new Set(['A1','A2','sum']),slope:asset.calibration.slope_mT_per_A,intercept:asset.calibration.intercept_mT};
const magneticContext=measurementConditions(data,contextState);
assert.ok(magneticContext.加速电压_V>7.98&&magneticContext.加速电压_V<8);
contextState.mode='voltage';
const sweepContext=measurementConditions(data,contextState);
assert.equal(sweepContext.加速电压_V,3.993);
assert.equal(sweepContext.当前点.设定加速电压_V,4);
assert.equal(sweepContext.当前点.source_csv_record,17);
assert.equal(sweepContext.当前显示的扫描.记录数,70);
assert.deepEqual(sweepContext.当前显示的扫描.设定加速电压范围_V,[4,10]);
assert.deepEqual(sweepContext.当前显示的扫描.实际励磁电流范围_A,[1.398,1.398]);
assert.ok(sweepContext.当前显示的扫描.流程.includes('回零'));
assert.equal(sweepContext.数据SHA256,asset.voltage_scan.sha256);
const transfer=explorationFromMeasurement(data,contextState);
assert.equal(transfer.anode_V,3.993);assert.equal(transfer.source.run_id,'2377');
assert.equal(transfer.source.accelerating_set_V,4);
assert.ok(transfer.reference.title.includes('4 V'));
assert.equal(transfer.reference.rows.length,10);
assert.equal(transfer.reference.baseline.source.voltage_index,1);
const exported=measurementCsv(data,contextState),csvLines=exported.text.split('\r\n');
const parseLine=line=>Array.from(line.matchAll(/"((?:[^"]|"")*)"/g),match=>match[1].replaceAll('""','"'));
const headers=parseLine(csvLines[0]),csvRows=csvLines.slice(1).map(parseLine);
assert.ok(exported.filename.includes('2377扫压4至10V'));
assert.equal(csvRows.length,70);
assert.equal(csvRows[0][headers.indexOf('accelerating_actual_V')],'3.993');
assert.equal(csvRows[0][headers.indexOf('display_x')],'3.993');
assert.equal(csvRows[0][headers.indexOf('accelerating_set_V')],'4');
assert.equal(csvRows[0][headers.indexOf('nominal_voltage_V')],'');
assert.ok(csvRows.every(r=>r[headers.indexOf('run_id')]==='2377'));
contextState.selected=35;
const selectedTen=measurementConditions(data,contextState);
assert.equal(selectedTen.当前点.设定加速电压_V,10);
assert.ok(selectedTen.加速电压_V>9.98&&selectedTen.加速电压_V<10.01);
assert.equal(explorationFromMeasurement(data,contextState).anode_V,selectedTen.加速电压_V);

// The derivative routine must ignore noneligible points and preserve adjacent
// source records. Repeated/retreating actual-current points cannot create a spike.
const synthetic=[0,1,2,3,4,4,3.9].map((current,index)=>({excitation_actual_A:current,
  physical_A1_current_uA:[10,10,9,1,0,-100,-200][index],source_csv_record:index+1,is_forward_cutoff_fit_point:index<5}));
const cutoff=steepestCutoff(synthetic);
assert.equal(cutoff.current_A,2.5);assert.deepEqual(cutoff.source_records,[3,4]);
assert.equal(steepestCutoff(synthetic,{lower_A:0,upper_A:.5}),null);

// Recover an independently constructed ideal charge/mass relation, including a
// nonzero magnetic-calibration intercept and an arbitrary Bc² fit intercept.
const expected=1.75882001076e11,radius=4.55,slope=4.230907194994787,intercept=-.18806673618352443;
const ideal=[4,6,8,10].map(voltage=>{const field_mT=Math.sqrt(8*(voltage-3.68/2)/(expected*(radius*.001)**2)*1e6+.3);
  return {voltage,accelerating_V:voltage,filament_V:3.68,current_A:(field_mT-intercept)/slope};});
const analytic=fitChargeMass(ideal,{slope_mT_per_A:slope,intercept_mT:intercept,radius_mm:radius});
assert.ok(Math.abs(analytic.charge_mass_C_kg/expected-1)<1e-12);
assert.ok(Math.abs(analytic.intercept_mT2-.3)<1e-12);

const cutoffs=[4,6,8,10].map(voltage=>{const rows=selectRows(data,{voltage,direction:'up'});return {...steepestCutoff(rows),voltage,
  accelerating_V:rows.reduce((s,r)=>s+r.accelerating_actual_V,0)/rows.length,filament_V:rows.reduce((s,r)=>s+r.CH3_voltage_V,0)/rows.length};});
assert.ok(cutoffs.every(c=>c.current_A>.5&&c.current_A<1.3));
const real=fitChargeMass(cutoffs,{slope_mT_per_A:slope,intercept_mT:intercept,radius_mm:radius});
assert.ok(real.charge_mass_C_kg>1e11&&real.charge_mass_C_kg<2e11);
const start=performance.now();
for(let i=0;i<1000;i++)fitChargeMass(cutoffs,{slope_mT_per_A:slope,intercept_mT:intercept,radius_mm:radius});
console.log(JSON.stringify({checks:'passed',records:data.magnetic.length+data.voltage.length,asset_bytes:readFileSync(new URL('../../frontend/assets/measurements.json',import.meta.url)).length,
  cutoff_actual_A:cutoffs.map(c=>[c.voltage,c.current_A]),charge_mass_C_kg:real.charge_mass_C_kg,thousand_fits_ms:performance.now()-start},null,2));
