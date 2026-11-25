import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {loadSweepData,resolveCalibration,physicalField,linearField,analyzeVoltage,fitRegression} from '../../frontend/chapter3/cutoff-math.js';
import {SweepStreamEngine} from '../../frontend/chapter3/sweep-stream.js';
const asset=JSON.parse(readFileSync(new URL('../../frontend/assets/measurements.json',import.meta.url)));
const data=loadSweepData(asset),cal=resolveCalibration(asset);
const near=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
test('real forward rows, per-voltage zero baselines and actual current cutoff anchors',()=>{
 const anchors=[[4,7,22.990285714,.541050538,2.101067877],[6,10,23.677,.766298555,3.054071334],[8,10,24.0958,.933944653,3.763366416],[10,10,24.3993,1.075184061,4.360937244]];
 for(const [v,n,zero,ic,bc] of anchors){assert.equal(data[v].zeroCount,n);assert.equal(data[v].pts.length,71);near(data[v].zb_a1,zero);near(data[v].pts.at(-1)[1],1.398);const a=analyzeVoltage(data,v,cal);near(a.ic,ic);near(a.bc,bc);}
 near(data[10].pts.at(-1)[6],2.188);near(data[10].pts.at(-1)[2],58.041);
});
test('intercept, finite cathode geometry and every cutoff convention recompute',()=>{
 const f=fitRegression(data,cal);near(f.slope,2.4322718667);near(f.u0,2.177087417);near(f.em/1e11,1.588964079);near(f.relPct,-9.6573799);
 near(fitRegression(data,cal,'tangent','actual').u0,2.169840823);
 near(fitRegression(data,cal,'steepest').u0,1.673156187);near(fitRegression(data,cal,'steepest').em/1e11,1.591090042);
 near(fitRegression(data,cal,'halfmax').u0,1.716624836);near(fitRegression(data,cal,'halfmax').em/1e11,1.502802767);
 assert.ok(Math.max(...f.items.map(r=>r.emUeff))-Math.min(...f.items.map(r=>r.emUeff))<.25*(Math.max(...f.items.map(r=>r.emNaive))-Math.min(...f.items.map(r=>r.emNaive))));
 const alternative=resolveCalibration(asset,{slope:4.1,intercept:-.1});near(linearField(.8,alternative),3.18);assert.notEqual(fitRegression(data,alternative).em,f.em);
 assert.equal(physicalField(0,cal),0);assert.equal(physicalField(.04,cal),0);assert.ok(linearField(0,cal)<0);
});
test('queue commits in order, survives a missing result, and rejects previous run tokens',()=>{
 let clock=0,log=[],done=[];const e=new SweepStreamEngine({now:()=>clock,requestFrame:()=>1,cancelFrame:()=>{},onCommit:(p,i)=>log.push([i,p]),onDone:t=>done.push(t)});
 const token=e.start({total:4,delayMs:450});e.push(3,'d',token);e.push(1,'b',token);e.advance(500);assert.deepEqual(log,[]);
 e.push(0,'a',token);e.advance(clock=500);e.pause();e.advance(clock=1000);assert.equal(log.length,1);e.resume();e.advance(clock=1041);assert.equal(log.length,1);e.advance(clock=1042);assert.equal(log.length,2);
 e.finish();assert.equal(log.length,2);e.push(2,'c',token);e.advance(clock);assert.deepEqual(log,[[0,'a'],[1,'b'],[2,'c'],[3,'d']]);assert.deepEqual(done,[token]);
 const next=e.start({total:1,delayMs:0});assert.equal(e.push(0,'stale',token),false);e.push(0,'new',next);e.finish();assert.equal(log.at(-1)[1],'new');
});
test('cancelling from a commit cannot let queued points leak into another scan',()=>{
 let e,log=[];e=new SweepStreamEngine({requestFrame:()=>1,cancelFrame:()=>{},onCommit:(p,i)=>{log.push(p);if(i===0)e.cancel();}});
 const t=e.start({total:3});for(let i=0;i<3;i++)e.push(i,i,t);e.finish();assert.deepEqual(log,[0]);assert.equal(e.active,false);assert.equal(e.readyMap.size,0);
});
