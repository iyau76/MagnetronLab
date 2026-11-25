// The book keeps the supplied Gemini implementation in its own style boundary.
export const GEOMETRY={anodeRadiusMm:4.55,filamentRadiusUm:37.5};
export function createManual(container,{onState,onClose,onFinish}){
 const frame=document.createElement('iframe');frame.id='manual-frame';frame.title='实验讲义 · 左右对页';container.replaceChildren(frame);
 let ready=false,pending=null,closing=null,resolveClose=null;
 const send=(type,payload={})=>frame.contentWindow?.postMessage({source:'magnetron-app',type,...payload},location.origin);
 window.addEventListener('message',e=>{
  if(e.source!==frame.contentWindow||e.origin!==location.origin||e.data?.source!=='magnetron-manual')return;
  const m=e.data;
  if(m.type==='ready'){ready=true;if(pending){send('restore',{state:pending});pending=null;}}
  if(m.type==='state')onState(m.state);
  if(m.type==='close')onClose();
  if(m.type==='finish')onFinish();
  if(m.type==='closed'){resolveClose?.();closing=null;resolveClose=null;}
 });
 return {
  open(state,animate=true){if(!frame.getAttribute('src'))frame.src='./chapter1/manual.html';pending=structuredClone(state);if(ready){send('restore',{state:pending});pending=null;if(animate)send('open-animation');}frame.focus();},
  close(target){if(closing)return closing;if(!ready)return Promise.resolve();const r=target.getBoundingClientRect();closing=new Promise(resolve=>{resolveClose=resolve;});send('close-animation',{target:{x:r.x+r.width/2,y:r.y+r.height/2}});return closing;}
 };
}
