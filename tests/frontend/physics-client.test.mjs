import assert from 'node:assert/strict';
import test from 'node:test';
import {PhysicsClient,localPotentialTraceRequest,modelParameters,weightedRow} from '../../frontend/chapters/physics-client.js';

test('local potential requests never subtract the filament half-drop twice',()=>{
  for(const voltage of [4,6,8,10]) {
    const params=modelParameters(voltage,44.299,{field_mT:4});
    const initial=[3.75e-5,0,.01072,1,2,-3];
    const body=localPotentialTraceRequest(params,initial);
    assert.equal(body.params.gradient,false);
    assert.equal(body.params.filament_V,0.0);
    assert.equal(body.params.anode_V,voltage-3.68*(.01072/.035+.5));
    assert.deepEqual(body.initial_state,initial);
    assert.notEqual(body.initial_state,initial);
    assert.equal(params.filament_V,3.68);
  }
});

function clock() {
  let now=0,next=0;const callbacks=new Map();
  return {options:{now:()=>now,requestFrame:f=>{callbacks.set(++next,f);return next;},cancelFrame:id=>callbacks.delete(id)},
    advance(ms=60){now+=ms;const ready=[...callbacks.values()];callbacks.clear();for(const f of ready)f(now);}};
}

test('offline cache is paced left to right, including shuffled cached rows',async()=>{
  const time=clock(),seen=[];let finished=0;
  const client=new PhysicsClient({fetcher:()=>{throw Error('offline presets must not call API');},streamOptions:time.options});
  await client.scan({fields_mT:[0,1,2]},{preset:{rows:[{field_idx:2},{field_idx:0},{field_idx:1}]},
    onRow:(_,i)=>seen.push(i),onDone:()=>finished++});
  assert.deepEqual(seen,[]);
  for(let i=0;i<6;i++)time.advance();
  assert.deepEqual(seen,[0,1,2]);assert.equal(finished,1);
});

test('unordered HTTP rows are buffered and stale presentation is cancelled',async()=>{
  const time=clock(),seen=[],requests=[];
  const fetcher=async(url)=>{
    requests.push(url);
    const data=url.endsWith('/scan')?{id:'a'}:url.includes('/cancel/')?{}:
      {state:'done',next_cursor:3,preview_rows:[1,2,3],rows:[{field_idx:2},{field_idx:0},{field_idx:1}],result:{}};
    return {ok:true,json:async()=>data};
  };
  const client=new PhysicsClient({fetcher,streamOptions:time.options});
  await client.scan({fields_mT:[0,1,2]},{onRow:(_,i)=>seen.push(i)});
  time.advance(130);assert.deepEqual(seen,[0]);
  client.cancel();for(let i=0;i<5;i++)time.advance();assert.deepEqual(seen,[0]);
  assert(requests.includes('/api/job/a?since=0'));
});

test('quadratic source weighting keeps total emission normalized',()=>{
  const moments={particles:4,q_sum:2,outcome_counts:[0,2,2,0,0,0],outcome_q_sums:[0,.2,1.8,0,0,0],
    collectors:{A1:{count:2,q_sum:.2},A2_H:{count:1,q_sum:.8},A2_K:{count:1,q_sum:1}}};
  const row=weightedRow({},moments,.76,40);
  assert(Math.abs(row.sum_uA-40)<1e-12);
  assert(Math.abs(row.fractions.reduce((a,b)=>a+b)-1)<1e-12);
  assert(row.A1_uA>20);
});

test('a production point result is committed and completes the single-point stream',async()=>{
  const time=clock(),seen=[];let done=0;
  const client=new PhysicsClient({streamOptions:time.options,fetcher:async url=>({ok:true,json:async()=>url.endsWith('/point')?{id:'point'}:{state:'done',rows:[],next_cursor:0,result:{row:{field_mT:5.7,A1_uA:2}}}})});
  await client.scan({field_mT:5.7},{endpoint:'/point',onRow:r=>seen.push(r),onDone:()=>done++});
  time.advance(200);assert.equal(seen.length,1);assert.equal(seen[0].field_idx,0);assert.equal(done,1);
});
