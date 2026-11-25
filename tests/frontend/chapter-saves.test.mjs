import test from 'node:test';
import assert from 'node:assert/strict';
import {freshState,restoreState,readSaves,writeSave,SAVE_KEY} from '../../frontend/chapter1/data.js';

test('one damaged entry cannot erase valid experiments or the original bad entry',()=>{
 const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
 const good=freshState(),bad={version:1,id:'broken'},next=freshState();
 localStorage.setItem(SAVE_KEY,JSON.stringify([null,good,bad]));
 assert.equal(readSaves().length,1);
 writeSave(next);
 assert.deepEqual(readSaves().map(s=>s.id),[next.id,good.id]);
 const raw=JSON.parse(localStorage.getItem(SAVE_KEY));
 assert.ok(raw.includes(null));assert.ok(raw.some(s=>s?.id==='broken'));
 const recovered=restoreState({...good,current:'bad',visited:null});
 assert.equal(recovered.current,0);assert.deepEqual(recovered.visited,[]);
});
test('an unreadable whole store is preserved when a save is attempted',()=>{
 let value='{corrupted';globalThis.localStorage={getItem:()=>value,setItem:(_,v)=>value=v};
 assert.deepEqual(readSaves(),[]);
 assert.throws(()=>writeSave(freshState()));assert.equal(value,'{corrupted');
});
