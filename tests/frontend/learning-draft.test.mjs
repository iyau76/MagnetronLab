import test from 'node:test';
import assert from 'node:assert/strict';
import { mountLearning } from '../../frontend/modules/learning.js';

test('pagehide and remount restore the learning activity without restarting a scan or duplicating records', async () => {
  const storage=new Map(),windowEvents={},records=[];
  const names=['localStorage','document','window','cancelAnimationFrame'];
  const previous=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}});
  globalThis.document={addEventListener(){},removeEventListener(){}};
  globalThis.window={addEventListener(type,handler){windowEvents[type]=handler;},removeEventListener(type){delete windowEvents[type];}};
  globalThis.cancelAnimationFrame=()=>{};

  // The DOM surface dispatches the same change/click handlers as the page.
  // This test checks activity state and persistence, not browser layout.
  function openActivity(){
    const events={},container={innerHTML:'',classList:{add(){},remove(){}},
      addEventListener(type,handler){events[type]=handler;},removeEventListener(){},contains(){return true;}};
    const api=mountLearning(container,{onRecord:record=>records.push(record)});
    return {container,api,
      change(field,value){events.change({type:'change',target:{dataset:{field},type:'number',value,setCustomValidity(){}}});},
      click(action){events.click({target:{closest(){return {dataset:{action}};}}});}};
  }

  let first,restored;
  try {
    first=openActivity();
    first.api.setStage('principle');first.change('prediction','4.69');first.click('submit-prediction');
    first.api.setStage('calibration');first.click('cal-series');first.click('cal-fit');
    first.api.setStage('measurement');
    first.change('measurementCurrent','1.1');first.click('scan-record');
    first.change('measurementCurrent','1.2');first.click('scan-record');first.click('calculate');
    first.change('note','下一轮在截止附近缩小励磁步长。');
    first.click('scan-auto');windowEvents.pagehide();
    const draft=JSON.parse(storage.get('magnetron-learning-draft-v1'));
    assert.equal(draft.state.calRows.length,9);
    assert.equal(draft.state.scans.length,3);
    assert.equal(draft.state.results.length,1);
    assert.equal(draft.state.stage,'measurement');
    assert.equal(Object.hasOwn(draft.state,'auto'),false);
    assert.equal(Object.hasOwn(draft.state,'trajectoryCache'),false);
    first.api.destroy();first=null;

    const recordCount=records.length;
    restored=openActivity();
    assert.match(restored.container.innerHTML,/10 V · 你的扫描记录/);
    assert.doesNotMatch(restored.container.innerHTML,/data-action="scan-stop"/);
    assert.match(restored.container.innerHTML,/1\.100 A/);
    assert.match(restored.container.innerHTML,/1\.200 A/);
    restored.api.setStage('principle');
    assert.match(restored.container.innerHTML,/你的预测 4\.690/);
    restored.api.setStage('reality');
    assert.match(restored.container.innerHTML,/下一轮在截止附近缩小励磁步长。/);
    await new Promise(resolve=>setTimeout(resolve,220));
    assert.equal(records.length,recordCount);
  } finally {
    first?.api.destroy();restored?.api.destroy();
    for(const name of names){const descriptor=previous.get(name);if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
  }
});
