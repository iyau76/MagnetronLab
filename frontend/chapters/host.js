import {waitForChapter} from '../chapter-ready.js';

export function createResearchHost({scene,getState,save,book,menu,finish,explore,launcher,prepareBench,measurements}) {
  const frame=document.createElement('iframe');frame.id='research-frame';frame.title='微观探究实验';frame.dataset.src='./chapters/studio.html';frame.hidden=true;
  frame.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:20;background:#08131d';document.body.append(frame);
  let generation=0;
  return {
    async open(){
      const chapter=getState().chapter;
      const token=++generation;await waitForChapter(frame);if(token!==generation)return;frame.hidden=false;
      const live=()=>token===generation&&!frame.hidden&&getState().chapter===chapter;
      const bridge={
        update:p=>{if(live())scene().setPower(p);},
        research:p=>{if(live())scene().research(p);},
        save:(value,result)=>{if(!live())return;if(result?.completed&&!getState()[`chapter${chapter}Result`]?.completed)getState().bookPage=chapter===4?7:chapter===5?9:11;getState()[`chapter${chapter}`]=value;getState()[`chapter${chapter}Result`]=result;getState().stage=chapter+'.'+value.step[0];save();},
        view:async mode=>{
          if(!live())return;
          const state=getState();state.view=mode;
          if(mode==='bench')await prepareBench();
          if(live()&&state.view===mode)return scene().setMode(mode);
        },
        focus:id=>{if(live())scene().select(id);},reset:()=>{if(live())scene().reset();},snapshot:()=>structuredClone(getState()),book,menu,finish,explore,launcher,
      };
      const state=getState();const viewport=frame.contentWindow.initialize(bridge,state[`chapter${chapter}`],measurements(),state.calibrationResult??state.calibrationHandoff,chapter);
      scene().attachViewport(viewport);scene().setLit(['L1','L2','L3','L4','L5']);
      await frame.contentWindow.begin();
    },
    close(){if(frame.hidden){generation++;return;}frame.contentWindow.suspend?.();scene().research({enabled:false});generation++;frame.hidden=true;scene().attachViewport(document.querySelector('#scene'));},
    pick:tag=>frame.contentWindow.scenePick?.(tag),
    dockBook:()=>frame.contentDocument?.querySelector('#dock-book'),
    getState:()=>frame.contentWindow.getState?.(),debug:()=>frame.contentWindow.getDebug?.(),
  };
}
