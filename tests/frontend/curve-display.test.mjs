import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothPath} from '../../frontend/chapters/curve-path.js';
import {fieldGrid} from '../../frontend/chapters/scan-grid.js';

test('curve connection preserves sampled extrema, flat tails and source data',()=>{
  for(const points of [
    [[0,100],[1,100],[2,102],[3,30],[4,2],[6,0]],
    [[0,0],[.05,3],[.051,1],[.7,1],[1,10],[2,0]],
    fieldGrid(6,121).map((x,i)=>[x,100*Math.exp(-x)+(i%7)*.1]),
  ]){
    const before=structuredClone(points),d=smoothPath(points);
    const segments=d.split(' C').slice(1);
    assert.equal(segments.length,points.length-1);
    segments.forEach((segment,i)=>{
      const [a,b,c,e,x,y]=segment.split(/[ ,]+/).map(Number),[x0,y0]=points[i];
      assert.ok(Math.abs(x-points[i+1][0])<.001);
      assert.ok(Math.abs(y-points[i+1][1])<.001);
      for(let j=0;j<=100;j++){
        const t=j/100,u=1-t,Y=u**3*y0+3*u*u*t*b+3*u*t*t*e+t**3*y;
        assert.ok(Y>=Math.min(y0,y)-.001&&Y<=Math.max(y0,y)+.001,'extra extremum');
      }
    });
    assert.deepEqual(points,before);
  }
});
test('density choices generate distinct, ordered physical work points',()=>{
  for(const n of [29,61,121])for(const hi of [4,5.735,8]){
    const xs=fieldGrid(hi,n);assert.equal(xs.length,n);assert.equal(xs[0],0);assert.equal(xs.at(-1),hi);
    assert.ok(xs.every((v,i)=>i===0||v>xs[i-1]));
  }
});
test('repeated zero-field measurements retain smooth joins beyond the zero group',()=>{
  const points=[[0,100],[0,101],[0,100.5],[1,102],[2,50],[3,2]],before=structuredClone(points);
  const d=smoothPath(points);
  assert.equal((d.match(/ C/g)??[]).length,3);
  assert.ok(d.includes('L0.000,101.000'));
  assert.ok(d.includes('L0.000,100.500'));
  assert.deepEqual(points,before);
});
