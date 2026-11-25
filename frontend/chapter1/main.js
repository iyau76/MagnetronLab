import {createResearchHost} from '../chapters/host.js';
import {createChapter3Host} from '../chapter3/host.js';
import {createChapter2Host} from '../chapter2/host.js';
import {createScene} from './scene.js';
import {createManual} from './book.js';
import {circuitSVG,structureSVG,guardComparisonSVG} from './diagrams.js';
import {renderMath} from '../mathlite.js';
import {PARTS,LEADS,STRUCTURE_PARTS,loadMeasurements,freshState,restoreState,readSaves,writeSave,SAVE_KEY,SETTINGS_KEY} from './data.js';
const $=s=>document.querySelector(s),all=s=>document.querySelectorAll(s);
const touchViewport = matchMedia('(pointer: coarse) and (max-width: 1100px)');
const initialQuality = touchViewport.matches ? (Math.min(innerWidth, innerHeight) < 550 ? 'low' : 'medium') : 'high';
let state=freshState(),active=false,settings={quality:initialQuality,font:'standard',guidance:'full'},data=null,ready=false,scene=null,saveTimer=null,transitioning=false,modalOrigin=null,bookOrigin=null;
try{settings={...settings,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};}catch{}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.body.insertAdjacentHTML('beforeend',`<header id="hud" hidden><div class="hud-left"><button class="icon-button" data-action="menu" aria-label="主菜单">☰</button><button class="breadcrumb" data-action="chapter-menu"><strong id="chapter-title"></strong><small id="stage-title"></small></button></div><div id="task-hint"></div><div class="view-controls"><button data-action="bench-view" aria-pressed="true">实验台</button><button data-action="tube-view" aria-pressed="false">管内</button><button class="icon-button" data-action="reset-view" aria-label="重置视角">↻</button></div></header>
<aside id="drawer" aria-label="电路与结构" hidden></aside><aside id="instrument-panel" aria-label="通电试车" hidden></aside>
<div id="hover-label" hidden></div><div id="scene-note" hidden></div>
<nav id="dock" aria-label="实验工具" hidden><button data-action="book" id="dock-book"><span aria-hidden="true">📖</span> 实验讲义</button><button data-action="circuit" id="dock-circuit"><span aria-hidden="true">🔌</span> 电路与结构</button><button data-action="instruments" id="dock-instruments"><span aria-hidden="true">🎛️</span> 仪器控制</button><button id="dock-records" disabled title="完成磁场标定后查看记录"><span aria-hidden="true">📊</span> 标定记录</button><button data-action="return-chapter1" id="dock-return" hidden>返回第一章</button></nav>
<div id="book-overlay" class="overlay" hidden><article id="book" role="dialog" aria-modal="true" aria-label="实验讲义" tabindex="-1"></article></div>
<div id="modal-overlay" class="overlay" hidden><section id="modal" role="dialog" aria-modal="true" tabindex="-1"></section></div>
<div id="transition" role="status" hidden><div class="transition-symbol" aria-hidden="true">◎</div><h2 id="transition-title">正在准备实验台</h2><div class="load-track"><i id="load-progress"></i></div><p id="transition-text"></p></div><div id="toast" role="status" hidden></div>`);
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,3500);}
function saveNow(){try{writeSave(state);return true;}catch{toast('进度未能保存到本机，可从实验菜单导出档案。');return false;}}
function save(){if(active){clearTimeout(saveTimer);saveTimer=setTimeout(saveNow,220);}}
function applySettings(){document.documentElement.dataset.font=settings.font;document.documentElement.dataset.guidance=settings.guidance;scene?.quality(settings.quality);localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));if(!$('#book-overlay').hidden)renderBook();}
function launcherSaves(){const saves=readSaves();$('#continue-experiment').disabled=!saves.length;$('#save-hint').textContent=saves.length?'':'暂无已保存进度';}
function learningStage(){return state.progress.circuit?'1.3':state.lessonDone||state.progress.structure||state.lit.length?'1.2':'1.1';}
function nextTask(){
 const stage=learningStage();
 if(stage==='1.1')return '当前任务：打开 [📖 实验讲义]，了解磁截止原理，并留下你对实测曲线的猜测。';
 if(stage==='1.3'&&state.view==='tube')return '当前任务：对照管内轨迹与毫伏表，观察增大励磁电流后电子能否到达阳极。';
 if(state.view==='tube')return '当前任务：观察中央阳极、两侧保护环与钨丝的位置关系，点击零件查看结构与作用。';
 if(state.panel==='circuit')return `当前任务：点击电路图或实验台上的元件了解作用，点击灰色导线连接回路（已连接 ${state.lit.length}/5）。`;
 if(stage==='1.2')return '当前任务：打开 [🔌 电路与结构]，点击电路图或实验台上的元件，摸清电路结构。';
 if(state.panel==='instruments')return trialComplete()?'当前任务：已完成通电试车，进入磁场标定，把励磁电流换算为磁感应强度。':'当前任务：打开三路电源，调节线圈励磁电流，观察灯丝与毫伏表读数的变化。';
 if(!state.progress.trial)return '当前任务：打开 [🎛️ 仪器控制]，试试各路通电，观察灯丝、电表和磁场的变化。';
 return '当前任务：进入磁场标定，测量线圈励磁电流与磁感应强度的关系。';
}
function updateHint(){
 if(state.chapter>=3)return;
 const chapter2=state.chapter===2;
 $('#chapter-title').textContent=chapter2?'02 磁场标定':'01 实验预习与装置';
 const stage=learningStage(),section={'1.1':'1.1 实验预习','1.2':'1.2 电路与结构','1.3':'1.3 通电试车'}[stage];
 $('#stage-title').textContent=chapter2?'空载标定工位':section;
 if(!chapter2)state.stage=stage;
 $('#dock-book').classList.toggle('unread',state.guess==null);
 $('#dock-book').title=state.guess==null?'讲义第 6 页：留下你对实测曲线的猜测':'打开实验讲义';
 $('#task-hint').textContent=chapter2?'空载线圈 · 霍尔探头测量工位':nextTask();
 for(const id of ['book','circuit','instruments']){$('#dock-'+id).hidden=chapter2;$('#dock-'+id).classList.toggle('suggested',!chapter2&&!state.panel&&id===(state.lessonDone?(state.progress.circuit?'instruments':'circuit'):'book'));}
 $('#dock-return').hidden=!chapter2;$('#dock-records').hidden=chapter2;
 all('[data-action="tube-view"]').forEach(b=>b.disabled=chapter2);
}
function syncView(){all('[data-action="bench-view"]').forEach(b=>b.setAttribute('aria-pressed',state.view==='bench'));all('[data-action="tube-view"]').forEach(b=>b.setAttribute('aria-pressed',state.view==='tube'));$('#scene-note').textContent=state.view==='tube'?'轨迹示意图':touchViewport.matches?'单指旋转 · 双指缩放或平移':'拖动旋转 · 右键平移 · 滚轮缩放';document.body.dataset.view=state.view;}
function setView(view,{instant=false,overview=false}={}){if(state.chapter===2)view='bench';state.view=view;const motion=scene?.setMode(state.chapter===2?'calibration':view,{instant,overview});syncView();updateHint();save();return motion;}
function selectedInfo(){return PARTS[state.selected]??LEADS[state.selected];}
function selectPart(id,{fromScene=false}={}){
 if(!active||state.chapter!==1||!PARTS[id])return;
 state.panel='circuit';state.selected=id;state.visited=[...new Set([...state.visited,id])];
 if(STRUCTURE_PARTS.includes(id)||(id==='tube'&&fromScene)){state.tab='structure';state.progress.structure=true;setView('tube');}
 else{state.tab='circuit';if(state.view!=='bench')setView('bench');}
 renderPanels();scene.select(id);save();
}
function selectLead(id){if(!active||state.chapter!==1||!LEADS[id])return;state.selected=id;state.tab='circuit';state.panel='circuit';state.lit=[...new Set([...state.lit,id])];if(state.view!=='bench')setView('bench');renderPanels();scene.select(id);save();}
function openStructure(){state.panel='circuit';state.tab='structure';state.selected='';state.progress.structure=true;setView('tube');renderPanels();save();}
function explanationMarkup(){const p=selectedInfo();return `<div class="explanation" aria-live="polite"><h3>${p?.title??(state.tab==='structure'?'保护环与中央阳极':'点击元件查看作用，点击导线连接回路')}</h3>${p?.short?`<small>${p.short}</small>`:''}<p>${p?.text??(state.tab==='structure'?'两侧保护环与中央阳极近似等电位，减小中央区域的端部边缘效应，使电场更接近径向场。':'中央阳极电流经过取样电阻测量；保护环直接接加速电源正极。已连接的导线会同时出现在实验台上。')}</p>${state.tab==='circuit'&&state.selected==='tube'?'<button class="text-button" data-action="structure-tab">查看管内结构 →</button>':''}</div>`;}
function renderPanels(){
 const circuit=state.chapter===1&&state.panel==='circuit',instruments=state.chapter===1&&state.panel==='instruments';
 document.body.dataset.panel=circuit?'circuit':instruments?'instruments':'none';$('#drawer').hidden=!circuit;$('#instrument-panel').hidden=!instruments;
 $('#dock-circuit').classList.toggle('active',circuit);$('#dock-instruments').classList.toggle('active',instruments);
 if(circuit){
  const allLit=state.lit.length===5,canFinish=allLit&&state.progress.structure;
  $('#drawer').innerHTML=`<div class="panel-heading"><h2>电路与结构</h2><button data-action="close-panel" aria-label="收起电路与结构">×</button></div><div class="panel-tabs"><button data-action="circuit-tab" aria-pressed="${state.tab==='circuit'}">电路图</button><button data-action="structure-tab" aria-pressed="${state.tab==='structure'}">管体结构</button></div><div class="diagram-area ${state.tab==='structure'?'structure-area':''}">${state.tab==='circuit'?`<small class="diagram-instruction">点导线接通回路 · 点元件查看作用</small>${circuitSVG({lit:state.lit,selected:state.selected})}<div class="lead-keys" aria-label="五条电路">${Object.entries(LEADS).map(([id,p],i)=>`<button data-lead="${id}" aria-pressed="${state.lit.includes(id)}" aria-label="${p.title}" title="${p.title}">${state.lit.includes(id)?'✓':i+1}</button>`).join('')}<button class="light-all" data-action="light-all" ${allLit?'disabled':''}>点亮全部</button></div>`:`${structureSVG()}<div class="structure-terms" aria-label="装配细节">${[['glass','玻璃壳'],['support','定心支撑'],['tension','张紧弹簧'],['base','管座引线']].map(([id,title])=>`<button data-part="${id}" class="${state.selected===id?'selected':''}" aria-pressed="${state.selected===id}">${title}</button>`).join('')}</div><div class="guard-comparison"><h3>保护环对比</h3>${guardComparisonSVG()}</div>`}</div>${explanationMarkup()}<div class="panel-next"><span>${state.lit.length}/5 条回路已连接 · ${state.progress.structure?'已查看管体':'尚未查看管体'}</span><button class="primary" data-action="complete-circuit" ${canFinish?'':'disabled'}>${state.progress.circuit?'打开仪器控制 →':'完成装置认识 → 通电试车'}</button>${!canFinish?`<small>${allLit?'切换到“管体结构”，观察保护环。':'点击灰色导线或上方编号连接各路。'}</small>`:''}</div>`;
  renderMath($('#drawer'));
 }
 if(instruments)renderInstruments();
 scene?.setLit(state.lit);requestAnimationFrame(()=>scene?.setLayout(circuit||instruments));updateHint();syncView();
}
function powerHint(){
 if(!state.heater)return state.accelerator?'加速电压已经加上，表数仍是零。试着打开 CH3，让灯丝热起来，看看读数会怎样变化。':state.magnet?'线圈已经通电。管内的电子从哪里来？打开 CH3，观察灯丝加热后的变化。':'三路电源都还没打开。先想一想：要让管内出现电子，应该先让哪个部件工作？';
 if(!state.accelerator)return '灯丝已经热起来了。接着打开 CH2，给阳极加上正电压，看看毫伏表有没有读数。';
 if(!state.magnet)return '现在能读到中央阳极的收集电流了。打开 CH1，逐渐增大励磁电流，观察表数如何变化。';
 if(!state.trial.lowReading)return '先把励磁电流调回 0 A，记住此时的表数，再逐渐增大电流，作一次比较。';
 if(!state.trial.dropReading)return '继续增大励磁电流，留意毫伏表：达到临界磁场附近，读数一路骤降。';
 return '刚才增大励磁电流时，收集电流明显下降了。它对应多大的磁场？下一步通过标定，把励磁电流换算成磁感应强度 B。';
}
function trialComplete(){return ['heater','accelerator','magnet','lowReading','dropReading'].every(k=>state.trial[k]);}
function canCompleteChapter(){return state.progress.circuit&&trialComplete();}
function renderInstruments(){
 const channels=[['magnet','CH1','励磁电源','I<sub>M</sub>'],['accelerator','CH2','加速电源','Uₐ'],['heater','CH3','灯丝电源','I<sub>f</sub>']];
 $('#instrument-panel').innerHTML=`<div class="panel-heading"><h2>三路直流电源</h2><button data-action="close-panel" aria-label="收起仪器控制">×</button></div>
 <div class="instrument-body"><div class="power-rows">${channels.map(([key,ch,name,symbol])=>`<section class="power-row" data-channel="${key}">
 <label class="power-toggle"><span class="channel-name"><b>${ch}</b> ${name} <em>${symbol}</em></span><input type="checkbox" data-power="${key}" aria-label="${ch} ${name}" ${state[key]?'checked':''}><span class="switch-track"></span></label>
 ${key==='magnet'?`<label class="field-label" for="magnet-current">调节线圈励磁电流</label><input id="magnet-current" type="range" min="0" max="1.44" step="0.01" value="${state.current}" ${state.magnet?'':'disabled'}><div class="range-ends"><span>0.00 A</span><output id="magnet-output">${state.current.toFixed(2)} A</output><span>1.44 A</span></div>`:`<div class="fixed-setting"><span>${key==='heater'?'0.60 A / 约 3.68 V':'10.00 V'}</span><small>🔒 固定档位</small></div><input type="range" disabled value="50" aria-label="${name}固定档位">`}</section>`).join('')}</div>
 <p id="power-hint" aria-live="polite"></p>
 <div class="meter-reading" title="电表示数依据 10 V 实测记录插值"><div><span>数字毫伏表 · 中央阳极</span><strong><span id="current-reading">0.000</span><small>mV</small></strong></div><small>1 mV 对应 1 μA 收集电流</small></div></div>
 <div class="instrument-footer"><p id="trial-next-hint" hidden></p><button class="primary next-chapter" data-action="complete-trial">完成通电试车 · 进入磁场标定 →</button><button class="text-button" data-action="skip-chapter2">跳过未完成步骤，进入磁场标定 →</button></div>`;
 updatePower();
}
function updatePower(){
 if(!data)return 0;const current=state.magnet?state.current:0,reading=state.heater&&state.accelerator?data.reading(current):0;
 if(active&&state.chapter===1){for(const k of ['heater','accelerator','magnet'])if(state[k])state.trial[k]=true;if(state.heater&&state.accelerator){if(current<=.05)state.trial.lowReading=true;if(state.trial.lowReading&&state.magnet&&reading<data.reading(0)*.5)state.trial.dropReading=true;}state.progress.trial=trialComplete();}
 scene?.setPower({heater:state.heater,accelerator:state.accelerator,magnet:state.magnet,current,reading,coilVoltage:data.voltage(current),actualPoint:false,fieldMT:null,trajectoryVoltage:10,acceleratingVoltage:10,filamentVoltage:3.68,filamentCurrent:.6});
 if($('#current-reading')){
  $('#current-reading').textContent=reading===0?'0.000':reading.toFixed(2);$('#magnet-output').textContent=state.current.toFixed(2)+' A';$('#magnet-current').disabled=!state.magnet;
  all('.power-row').forEach(row=>row.classList.toggle('powered',state[row.dataset.channel]));
  $('#power-hint').textContent=powerHint();
  $('[data-action="complete-trial"]').disabled=!canCompleteChapter();$('#trial-next-hint').hidden=state.progress.circuit||!trialComplete();$('#trial-next-hint').textContent='先返回“电路与结构”，完成装置认识。';
 }
 updateHint();return reading;
}
function dialogBackground(){const loadingOpen=!$('#transition').hidden,modalOpen=!$('#modal-overlay').hidden,bookOpen=!$('#book-overlay').hidden;for(const selector of ['#scene','#launcher','#hud','#dock','#drawer','#instrument-panel'])$(selector).inert=modalOpen||bookOpen||loadingOpen;for(const id of ['chapter2-frame','chapter3-frame','research-frame'])if($('#'+id))$('#'+id).inert=modalOpen||bookOpen||loadingOpen;$('#book-overlay').inert=modalOpen||loadingOpen;document.body.dataset.overlay=modalOpen||bookOpen||loadingOpen?'true':'false';$('#hover-label').hidden=true;}
const manual=createManual($('#book'),{
 onState:patch=>{Object.assign(state,patch);if(state.chapter===3&&Object.hasOwn(patch,'guess'))cutoffHost.guess(patch.guess);save();},
 onClose:()=>closeBook(),
 onFinish:async()=>{if(state.chapter>=2){await closeBook();return;}await closeBook();if(!$('#book-overlay').hidden)return;state.lessonDone=true;state.panel=null;state.tab='circuit';setView('bench');renderPanels();save();}
});
function renderBook(){const opening=$('#book-overlay').hidden;if(opening)bookOrigin=document.activeElement;$('#book-overlay').hidden=false;dialogBackground();manual.open(state,opening);}
async function closeBook(){if($('#book-overlay').hidden)return;if(state.chapter===1&&!ready){
  let loaded=false;
  await loading('正在准备实验台','正在载入仪器与接线……',async()=>{await prepareBench();loaded=true;});
  if(!loaded)return;
 }await manual.close(state.chapter>=4?researchHost.dockBook():state.chapter===3?cutoffHost.dockBook():state.chapter===2?calibrationHost.dockBook():$('#dock-book'));$('#book-overlay').hidden=true;dialogBackground();bookOrigin?.focus?.({preventScroll:true});updateHint();save();}
function modal(content,label){if($('#modal-overlay').hidden)modalOrigin=document.activeElement;$('#modal').innerHTML=content;$('#modal').setAttribute('aria-label',label);$('#modal-overlay').hidden=false;renderMath($('#modal'));all('[data-note]').forEach(el=>el.value=state.notes[el.dataset.note]??'');dialogBackground();$('#modal').focus({preventScroll:true});}
function closeModal(){$('#modal-overlay').hidden=true;dialogBackground();if(modalOrigin?.isConnected)modalOrigin.focus({preventScroll:true});}
const modalHeading=t=>`<div class="panel-heading"><h2>${t}</h2><button data-action="close-modal" aria-label="关闭对话框">×</button></div>`;
function settingsModal(){modal(modalHeading('设置')+[['quality','渲染画质',[['high','高'],['medium','中'],['low','低']]],['font','界面字号',[['standard','标准'],['large','较大']]],['guidance','实验引导',[['full','完整指引'],['concise','精简提示']]]].map(([k,l,opts])=>`<label class="setting-row">${l}<select data-setting="${k}">${opts.map(([v,t])=>`<option value="${v}" ${settings[k]===v?'selected':''}>${t}</option>`).join('')}</select></label>`).join('')+'<button class="danger-text" data-action="clear-saves">清空本地实验记录</button>','设置');}
function continueModal(){modal(modalHeading('继续实验')+`<div class="save-list">${readSaves().map(s=>`<button data-action="load-save" data-id="${esc(s.id)}"><strong>${new Date(s.createdAt).toLocaleString('zh-CN')} 的实验</strong><span>${s.chapter===6&&s.chapter6?.step==='5a'?'自由探索沙盘':s.chapter>=4?['04 \u96f6\u503e\u89d2\u6d88\u878d\u4e0e\u5fae\u89c2\u7834\u6848','05 \u9ad8\u573a\u957f\u5c3e\u4e0e\u5bf9\u79f0\u7834\u7f3a','06 \u7efc\u5408\u5b9e\u9a8c\u4e0e\u5f00\u653e\u63a2\u7d22'][s.chapter-4]:s.chapter===3?'03 正式磁截止实验':s.chapter===2?'02 磁场标定':s.progress?.trial?'已完成通电试车':s.progress?.circuit?'已认识装置':s.lessonDone?'已完成预习':'实验预习中'}${s.progress?.skippedTrial?' · 曾跳过步骤':''}</span><small>保存于 ${new Date(s.savedAt).toLocaleString('zh-CN')}</small></button>`).join('')}</div>`,'选择实验存档');}
const animate=async(el,frames,duration)=>{const a=el.animate(frames,{duration:matchMedia('(prefers-reduced-motion:reduce)').matches?80:duration,easing:'ease-in-out',fill:'both'});await a.finished;a.cancel();};
async function loading(title,text,action){
 if(transitioning)return;transitioning=true;
 const layer=$('#transition');$('#transition-title').textContent=title;$('#transition-text').textContent=text;$('#load-progress').style.width='8%';layer.hidden=false;dialogBackground();
 try{
  await animate(layer,[{opacity:0},{opacity:1}],280);
  $('#load-progress').style.width='30%';await action();$('#load-progress').style.width='100%';
  await animate(layer,[{opacity:1},{opacity:1}],240);
  await animate(layer,[{opacity:1},{opacity:0}],600);
 }catch(e){researchHost.close();cutoffHost.close();calibrationHost.close();state.chapter=1;state.view='bench';state.panel=null;renderPanels();await scene?.setMode('bench',{instant:true});toast('载入失败，请重试：'+e.message);console.error(e);}finally{layer.hidden=true;transitioning=false;dialogBackground();}
}
async function enter({resume=false}={}){
 const sandbox=state.chapter===6&&state.chapter6?.step==='5a';
 const startWithBook=touchViewport.matches&&!resume&&state.chapter===1;
 await loading(sandbox?'正在打开自由探索沙盘':'正在准备实验台',sandbox?'正在载入管内模型与电流曲线……':'正在摆放实验台器材与读取仪器基线……',async()=>{
  if(!scene)throw new Error('三维场景未能启动，请刷新重试');
  const earlyEntry=touchViewport.matches&&(sandbox||startWithBook);
  await Promise.all([earlyEntry?Promise.resolve():prepareBench(),measurements]);active=true;$('#launcher').hidden=true;$('#hud').hidden=$('#dock').hidden=$('#scene-note').hidden=false;document.body.dataset.active='true';
  if(!resume)state.panel=null;if(state.chapter>=2){state.panel=null;state.view='bench';}
  renderPanels();await setView(sandbox?'tube':state.view??'bench',{instant:true});updatePower();if(state.chapter===2)await calibrationHost.open();if(state.chapter===3)await cutoffHost.open();if(state.chapter>=4)await researchHost.open();
  if(startWithBook){renderBook();prepareBench().catch(()=>{});}
  save();
 });
}
async function chapter2({skip=false}={}){
 closeModal();await loading('第二章 · 磁场标定','正在切换至空载磁场标定工位：暂移真空二极管并断开管座连线，置入特斯拉计，准备测绘线圈磁场……',async()=>{
  await prepareBench();researchHost.close();cutoffHost.close();if(skip)state.progress.skippedTrial=!canCompleteChapter();state.chapter=2;state.panel=null;state.view='bench';$('#book-overlay').hidden=true;
  renderPanels();await setView('bench',{instant:true});await calibrationHost.open();save();window.dispatchEvent(new CustomEvent('magnetron:chapterchange',{detail:{chapter:2,workstation:'empty-coils',state:structuredClone(state)}}));
 });
}
async function returnChapter1(){closeModal();await loading('第一章 · 实验预习与装置','正在恢复真空二极管、电路连线与仪器，返回实验台……',async()=>{await prepareBench();researchHost.close();cutoffHost.close();calibrationHost.close();state.chapter=1;state.panel=null;state.view='bench';renderPanels();await setView('bench',{instant:true});updatePower();save();});}
function toLauncher(){researchHost.close();cutoffHost.close();calibrationHost.close();clearTimeout(saveTimer);if(active)saveNow();active=false;closeModal();$('#book-overlay').hidden=true;for(const id of ['hud','dock','drawer','instrument-panel','scene-note'])$('#'+id).hidden=true;$('#launcher').hidden=false;document.body.dataset.panel='none';document.body.dataset.active='false';scene.setMode('bench');scene.setLayout(false);launcherSaves();dialogBackground();}
document.addEventListener('click',async e=>{
 const lead=e.target.closest('[data-lead]'),part=e.target.closest('[data-part]');if(lead){selectLead(lead.dataset.lead);return;}if(part){selectPart(part.dataset.part);return;}
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const action=b.dataset.action;
 switch(action){
 case 'open-sandbox':{
  if(transitioning)return;
  const previous=readSaves().find(s=>s.chapter===6&&s.chapter6?.step==='5a'&&s.chapter6.fromLauncher);
  state=previous??{...freshState(),chapter:6,chapter6:{step:'5a',fromLauncher:true}};
  await enter({resume:true});break;
 }
 case 'new':researchHost.close();cutoffHost.close();calibrationHost.close();state=freshState();await enter();break;
 case 'continue':continueModal();break;
 case 'load-save':researchHost.close();cutoffHost.close();calibrationHost.close();state=restoreState(readSaves().find(s=>s.id===b.dataset.id));closeModal();await enter({resume:true});break;
 case 'settings':settingsModal();break;
 case 'close-modal':closeModal();break;
 case 'exit':if(window.magnetronDesktop?.close)window.magnetronDesktop.close();else toast('请关闭当前浏览器标签页。');break;
 case 'clear-saves':modal(modalHeading('清空本地实验记录？')+'<p>已导出的档案不受影响。</p><div class="modal-actions"><button data-action="close-modal">保留记录</button><button class="primary" data-action="confirm-clear">清空记录</button></div>','清空记录');break;
 case 'confirm-clear':clearTimeout(saveTimer);active=false;localStorage.removeItem(SAVE_KEY);state=freshState();toLauncher();updatePower();toast('本地实验记录已清空');break;
 case 'book':closeModal();renderBook();break;
 case 'close-book':closeBook();break;
 case 'circuit':if(state.chapter!==1)break;state.panel=state.panel==='circuit'?null:'circuit';if(state.panel)setView(state.tab==='structure'?'tube':'bench');renderPanels();save();break;
 case 'light-all':if(state.chapter===1){state.lit=Object.keys(LEADS);renderPanels();save();}break;
 case 'close-panel':state.panel=null;renderPanels();save();break;
 case 'circuit-tab':state.tab='circuit';state.selected='';setView('bench');renderPanels();save();break;
 case 'structure-tab':openStructure();break;
 case 'complete-circuit':if(state.lit.length!==5||!state.progress.structure)break;state.progress.circuit=true;state.panel='instruments';setView('bench',{overview:true});renderPanels();save();break;
 case 'instruments':if(state.chapter!==1)break;state.panel=state.panel==='instruments'?null:'instruments';if(state.panel)setView('bench',{overview:true});renderPanels();save();break;
 case 'bench-view':setView('bench');if(state.panel==='circuit'){state.tab='circuit';state.selected='';renderPanels();}break;
 case 'tube-view':if(state.chapter===1){setView('tube');state.tab='structure';state.progress.structure=true;if(state.panel==='circuit')renderPanels();}break;
 case 'reset-view':scene.reset();break;
 case 'complete-trial':if(canCompleteChapter())await chapter2();break;
 case 'skip-chapter2':await chapter2({skip:true});break;
 case 'chapter3':await chapter3();break;
 case 'chapter4':await chapter4();break;
 case 'chapter5':await researchChapter(5);break;
 case 'chapter6':await researchChapter(6);break;
 case 'return-chapter1':await returnChapter1();break;
 case 'menu':case 'chapter-menu':modal(modalHeading('实验菜单')+'<button class="menu-entry" data-action="return-chapter1">01　实验预习与装置</button><button class="menu-entry" data-action="skip-chapter2">02　磁场标定工位</button><button class="menu-entry" data-action="chapter3">03　正式磁截止实验</button><button class="menu-entry" data-action="chapter4">04　零倾角消融与微观破案</button><button class="menu-entry" data-action="chapter5">05　对称性的破缺与长尾</button><button class="menu-entry" data-action="chapter6">06　综合实验与模型边界</button><hr><button class="menu-entry" data-action="save-now">保存当前进度</button><button class="menu-entry" data-action="export">导出实验档案</button><button class="menu-entry" data-action="settings">设置</button><button class="menu-entry" data-action="launcher">返回入口</button>','实验菜单');break;
 case 'save-now':if(saveNow()){toast('实验进度已保存');closeModal();}break;
 case 'export':{const blob=new Blob([JSON.stringify({application:'磁截止实验室',state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='磁截止实验室_实验档案.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;}
 case 'launcher':toLauncher();break;
 }
});
document.addEventListener('input',e=>{
 if(e.target.id==='magnet-current'){state.current=Number(e.target.value);updatePower();save();}
 if(e.target.dataset.note){state.notes[e.target.dataset.note]=e.target.value;save();}
});
document.addEventListener('change',e=>{if(e.target.dataset.power){state[e.target.dataset.power]=e.target.checked;updatePower();save();}if(e.target.dataset.setting){settings[e.target.dataset.setting]=e.target.value;applySettings();}});
function semanticHover(e,enter){const t=e.target.closest('#drawer [data-part], #drawer [data-lead]');if(t&&!t.contains(e.relatedTarget))scene?.hover(enter?(t.dataset.part??t.dataset.lead):null);}
document.addEventListener('pointerover',e=>semanticHover(e,true));document.addEventListener('pointerout',e=>semanticHover(e,false));
document.addEventListener('focusin',e=>semanticHover(e,true));document.addEventListener('focusout',e=>semanticHover(e,false));
document.addEventListener('keydown',e=>{
 const modalOpen=!$('#modal-overlay').hidden,bookOpen=!$('#book-overlay').hidden,dialog=modalOpen?$('#modal'):bookOpen?$('#book'):null;
 if(e.key==='Tab'&&dialog){const candidates=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]')].filter(x=>x.getClientRects().length),first=candidates[0],last=candidates.at(-1);if(!first){e.preventDefault();return;}if(e.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===dialog)){e.preventDefault();first.focus();}}
 if((e.key==='Enter'||e.key===' ')&&e.target.matches('g[data-part],g[data-lead]')){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
 if(e.key==='Escape'){if(modalOpen)closeModal();else if(bookOpen)closeBook();else if(state.panel){state.panel=null;renderPanels();}}
});
window.addEventListener('pagehide',()=>{if(active){clearTimeout(saveTimer);saveNow();}});
async function prepareBench(){
 try{await Promise.all([scene.ready,measurements]);ready=true;$('#preload-status').textContent='实验台已就绪';}
 catch(err){$('#preload-status').textContent='实验台载入失败，请重试';throw err;}
}
const measurements=loadMeasurements().then(result=>{data=result;return result;});
try{scene=createScene($('#scene'),{onPick:tag=>state.chapter>=4?researchHost.pick(tag):state.chapter===3?cutoffHost.pick(tag):tag.lead?selectLead(tag.lead):selectPart(tag.part,{fromScene:true}),onAnchor:()=>{},onHover:(text,id)=>{if(state.chapter===3)cutoffHost.hover(text,id);const label=$('#hover-label');label.textContent=text;label.hidden=state.chapter>=3||!text||!active||document.body.dataset.overlay==='true';all('#drawer [data-part]').forEach(el=>el.classList.toggle('is-hovered',el.dataset.part===id));},onProgress:ratio=>{$('#load-progress').style.width=Math.round(ratio*100)+'%';$('#preload-status').textContent=ratio===1?'实验台已就绪':'正在准备实验台 '+Math.round(ratio*100)+'%';}});if(!touchViewport.matches)prepareBench().catch(()=>{});else $('#preload-status').textContent='';
 applySettings();}catch(e){$('#preload-status').textContent='当前设备无法启动三维画面';console.error(e);}
async function chapter3({skip=false}={}){
 closeModal();await loading('第三章 · 正式磁截止实验','正在装回真空二极管，连接中央阳极测量回路，载入四档扫场记录……',async()=>{
  await prepareBench();researchHost.close();calibrationHost.close();state.chapter=3;state.panel=null;state.view='bench';$('#book-overlay').hidden=true;
  state.calibrationHandoff=state.calibrationResult??{slope:data.asset.calibration.slope_mT_per_A,intercept:data.asset.calibration.intercept_mT,skipped:true};
  renderPanels();await cutoffHost.open();save();
 });
}
const calibrationHost=createChapter2Host({scene:()=>scene,getState:()=>state,save,book:renderBook,back:returnChapter1,menu:()=>document.querySelector('[data-action="menu"]').click(),calibration:()=>data.asset.calibration,finish:skip=>chapter3({skip})});
const cutoffHost=createChapter3Host({scene:()=>scene,getState:()=>state,save,book:renderBook,back:n=>n===1?returnChapter1():chapter2(),
 menu:()=>document.querySelector('[data-action="menu"]').click(),measurements:()=>data.asset,
 finish:()=>chapter4()});
async function chapter4(){
 closeModal();await loading('第四章 · 零倾角消融与微观破案','正在准备消融对照与电子轨迹……',async()=>{
  researchHost.close();cutoffHost.close();calibrationHost.close();state.chapter=4;state.panel=null;state.view='bench';$('#book-overlay').hidden=true;renderPanels();await researchHost.open();save();
 });
}
const researchHost=createResearchHost({launcher:toLauncher,prepareBench,scene:()=>scene,getState:()=>state,save,book:renderBook,menu:()=>document.querySelector('[data-action="menu"]').click(),measurements:()=>data.asset,
 explore:()=>{state.chapter6={...state.chapter6,step:'5a',paragraph:0};return researchChapter(6);},
 finish:()=>researchChapter(state.chapter===4?5:6)});
async function researchChapter(chapter){
 closeModal();await loading(chapter===6?'第六章 · 综合实验与模型边界':'第五章 · 对称性的破缺与长尾',chapter===6?'正在准备四档对照与实验记录……':'正在准备倾角对照与单电子轨迹……',async()=>{
 researchHost.close();cutoffHost.close();calibrationHost.close();state.chapter=chapter;state.panel=null;state.view='tube';$('#book-overlay').hidden=true;renderPanels();await researchHost.open();save();
 });
}

launcherSaves();
window.__magnetronChapter1={getState:()=>structuredClone(state),getChapter4:()=>researchHost.getState(),getResearch:()=>researchHost.getState(),researchDebug:()=>researchHost.debug(),chapter4Debug:()=>researchHost.debug(),getChapter3:()=>cutoffHost.getState(),chapter3Debug:()=>cutoffHost.debug(),getCalibration:()=>calibrationHost.getState(),calibrationDebug:()=>scene.calibrationDebug(),getScene:()=>scene.debug(),project:p=>scene.project(p),getReady:()=>ready||Boolean(touchViewport.matches&&scene&&data),measurementAt:I=>data?.reading(I)};

const entry=$('#launcher');
entry.dataset.ready='true';
if(entry.dataset.pending)entry.querySelector(`button[data-action="${entry.dataset.pending}"]`)?.click();
