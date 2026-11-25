import {waitForChapter} from '../chapter-ready.js';
// The chapter UI owns its styles; the same renderer and loaded bench move into its viewport.
export function createChapter2Host({scene,getState,save,book,back,menu,finish,calibration}){
 const frame=document.createElement('iframe');frame.id='chapter2-frame';frame.title='第二章 · 磁场标定';frame.dataset.src='./chapter2/studio.html';frame.hidden=true;frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:20;background:#07121d';document.body.appendChild(frame);
 let generation=0;
 return {frame,async open(){const token=++generation;await waitForChapter(frame);if(token!==generation)return;frame.hidden=false;const live=()=>token===generation&&!frame.hidden&&getState().chapter===2;const state=getState();const bridge={update:model=>{if(!live())return false;scene().setCalibration(model,tag=>{if(live())frame.contentWindow.scenePick(tag);},ready=>{if(live())frame.contentWindow.updateProbeReady(ready);});return scene().calibrationDebug()?.probeReady??false;},save:cal=>{if(!live())return;getState().calibration=cal;save();},saveBook:fit=>{if(!live())return;getState().calibrationResult={...fit,saved:true};save();},book,back,menu,finish,reset:()=>{if(live())scene().reset();}};
  const viewport=frame.contentWindow.initialize(bridge,state.calibration,calibration());scene().attachViewport(viewport);await scene().setMode('calibration',{instant:true});},
 close(){if(frame.hidden){generation++;return;}frame.contentWindow.suspend?.();generation++;frame.hidden=true;scene().attachViewport(document.querySelector('#scene'));},
 dockBook(){return frame.contentDocument?.querySelector('#dock-book');},getState(){return frame.contentWindow.getState?.();}};
}
