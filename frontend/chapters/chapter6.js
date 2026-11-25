import {renderPanel} from './interaction.js';
import {renderMath} from '../mathlite.js';
import {PhysicsClient,modelParameters,weightedRow} from './physics-client.js';
import {measuredCurves} from './model-math.js';
import {curveChart,esc,COLORS} from './charts.js';
import {ratioChart,weightChart,multiCurve,budgetChart,CHANNELS} from './charts6.js';
import {VOLTS,weightedScan,modelFit,budgetModels,ratioErrors,BOUNDARIES,DIRECTIONS} from './math6.js';
import {setProgress,setHint,setLayout,renderClues,setDrawer,setWait,revealInstruction} from './hud.js';
const HINTS6={'0a':'零场 A₂/A₁：实测约 0.81，均匀发射模型却是 1.307','1a':'拖动端冷系数 η，让四档比例对齐实测','2a':'四档同屏：切到 B/B_c 归一，比较整族曲线','2b':'同一切线判据下的比荷总账','3a':'逐条查看简化模型之外的真实边界','3b':'选一个可证伪的下一步检验','4a':'导出实验报告，或进入全自由度实验台'};
const NAMES6={'0a':'零场比例','1a':'端冷','2a':'四档同屏','2b':'总账','3a':'边界','3b':'检验','4a':'归档','5a':'实验台'};

const $=s=>document.querySelector(s),ORDER=['0a','1a','2a','2b','3a','3b','4a','5a'];
const ACTIONS={'0a':'引入端冷分布 η，看四档会不会齐刷刷对齐','1a':'把全部 4/6/8/10 V 曲线摆上同一张台面！','2a':'打开定量偏差总账： $U_0$ 与 e/m 还差在哪？','2b':'逐一盘点简化模型之外的真实边界 →','3a':'查看未来如何用可证伪实验继续追问 →','3b':'写入手账最终页，生成独立实验报告','4a':'打开全自由度实验台 · 开放探索 →'};
const btn=(a,s,attr='')=>`<button data-action6="${a}" ${attr}>${s}</button>`;
const md=s=>esc(s).replace(/\*\*([\s\S]+?)\*\*/g,'<strong>$1</strong>');
export function createChapter6(bridge,saved,asset,calibration){
  const state={step:'0a',paragraph:0,eta:0,theta:0,preset:'base',xnorm:false,ynorm:true,showA2:true,boundary:0,direction:0,budgetTab:'models',completed:false,notes:'',...saved};
  if(!ORDER.includes(state.step))state.step='0a';
  const abort=new AbortController(),listen=(el,event,fn)=>el.addEventListener(event,fn,{signal:abort.signal}),client=new PhysicsClient();
  let alive=true,bundle,anchors,cold,dialogue,models,byVoltage={},liveData=null,loading=false,generation=0,debounce,free=null,error='',selected=10;
  const measured=measuredCurves(asset,calibration);
  const deck=document.createElement('div');deck.id='synthesis-deck';$('#stage').append(deck);
  const profile=document.createElement('div');profile.id='filament-profile';$('#stage').append(profile);
  const exportButton=document.createElement('button');exportButton.id='export-report';exportButton.textContent='导出实验报告';$('#top .top-actions').prepend(exportButton);
  const get=async url=>{const r=await fetch(url,{signal:abort.signal});if(!r.ok)throw Error('实验数据未能载入，请重新进入本章。');return r.json();};
  const persist=()=>bridge.save({...state,sandbox:free?.getState()??state.sandbox},state.completed?{completed:true,eta:state.eta,theta:state.theta,notes:state.notes}:null);
  const thermal=()=>['0a','1a'].includes(state.step);
  const currentFit=()=>state.preset==='cold'?models[0].fit:modelFit(asset,byVoltage,calibration);
  function notify(text){$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#notice').hidden=true,4800);}
  function paragraphs(){
    if(state.step==='2a'&&(loading||error||state.theta!==8||Math.abs(state.eta-.76)>.001||!state.xnorm))return ['先选「全机制 · 8°」，再切换横轴为 $B/B_c$。四档曲线显示齐全后，对照零场比例、截止附近与高场长尾。'];
    if(state.step==='1a'&&Math.abs(state.eta-.76)>.001)return ['拖动端冷系数，比较右侧四档零场读数。总发射电流保持不变，观察两端与中段各分到多少发射份额。也可以直接应用 $\\eta=0.76$。'];
    if(state.step==='3b')return [DIRECTIONS[state.direction].text];
    const out=[],limit=innerWidth<1360?173:215;
    for(const text of dialogue.steps[state.step]??[]){let page='';for(const sentence of text.match(/[^。！？]+[。！？]?/g)??[text]){if(page&&(page+sentence).replace(/\\[a-zA-Z]+|[{}*$]/g,'').length>limit){const open=(page.match(/\*\*/g)??[]).length%2;out.push(page+(open?'**':''));page=(open?'**':'')+sentence;}else page+=sentence;}if(page)out.push(page);}
    return out.length?out:[''];
  }
  function narrative(){const p=paragraphs();state.paragraph=Math.min(state.paragraph,p.length-1);$('#dialogue').innerHTML='<p>'+md(p[state.paragraph])+'</p>';renderMath($('#dialogue'));$('#dialog-page').textContent=p.length>1?`${state.paragraph+1} / ${p.length}`:'';$('#next').innerHTML=state.paragraph<p.length-1?'继续 →':ACTIONS[state.step]??'返回报告归档';renderMath($('#next'));$('#next').disabled=loading||(state.step==='1a'&&Math.abs(state.eta-.76)>.001)||(state.step==='2a'&&(!!error||state.theta!==8||Math.abs(state.eta-.76)>.001||!state.xnorm));$('#previous').disabled=state.step==='0a'&&state.paragraph===0;setWait(loading?'正在更新四档曲线…':error?error:state.step==='1a'&&Math.abs(state.eta-.76)>.001?'应用 η = 0.76 后核对定量结果':state.step==='2a'&&(state.theta!==8||Math.abs(state.eta-.76)>.001||!state.xnorm)?'应用全机制 · 8° 并切到 B/Bc 后继续':'');}
  function derive(){if(state.preset==='cold')byVoltage=Object.fromEntries(VOLTS.map(V=>[V,cold.ablations[`${V}:cold:0`].rows]));else byVoltage=liveData??Object.fromEntries(VOLTS.map(V=>[V,weightedScan(bundle,V,state.theta,state.eta)]));}
  function stage(){
    const heat=thermal(),archive=state.step==='4a';deck.hidden=heat||archive;profile.hidden=!heat;document.body.dataset.kind=heat?'cooling':'synthesis';setLayout(state.step==='2b'?'focus':heat||archive?'scene':'deck');if(archive)bridge.research({cooling:state.eta||.76,field:null,trace:null,population:[]});
    if(heat){profile.innerHTML=`<div class="profile-heading">轴向发射权重 $w(z)=1-\\eta(2z/L)^2$</div>${weightChart(state.eta)}`;renderMath(profile);$('#stage-caption').innerHTML='钨丝热发射分布<br><small>两端冷却，中段发射更强</small>';bridge.research({cooling:state.eta,field:null,trace:null,population:[]});}
    else{const fit=currentFit(),commonX=state.xnorm?Math.ceil(Math.max(...VOLTS.map(V=>5.8/(fit?.items.find(r=>r.V===V)?.bc??1)))*2)/2:5.8;deck.innerHTML=`<div class="synthesis-toolbar"><div class="button-row">${btn('xaxis','磁场 $B$',`aria-pressed="${!state.xnorm}" data-value="0"`)}${btn('xaxis','$B/B_c$',`aria-pressed="${state.xnorm}" data-value="1"`)}</div><div class="button-row">${btn('yaxis','$I/I(0)$',`aria-pressed="${state.ynorm}" data-value="1"`)}${btn('yaxis','物理电流',`aria-pressed="${!state.ynorm}" data-value="0"`)}</div><span>实线：实测 · 虚线：模型</span></div><div class="quad-grid">${VOLTS.map(V=>`<button class="quad-card ${state.step==='3a'&&BOUNDARIES[state.boundary].target===V?'highlighted':''}" data-action6="zoom" data-voltage="${V}"><b>${V} V</b>${multiCurve(byVoltage[V]??[],measured[V],{bc:fit?.items.find(r=>r.V===V)?.bc??1,xnorm:state.xnorm,ynorm:state.ynorm,xMax:commonX,channels:state.showA2?['A1_uA','A2_uA']:['A1_uA'],highlight:state.step==='3a'&&state.boundary===0})}</button>`).join('')}</div><div class="quad-key"><span style="color:${COLORS.A1}">— 中央阳极 $A_1$</span><span style="color:${COLORS.A2}">— 保护环 $A_2$</span><span>点击任意电压图放大</span></div>`;renderMath(deck);}
    $('#scene-readout').innerHTML='';$('#view-near').hidden=true;$('#view-bench').hidden=true;$('#view-tube').hidden=true;
  }
  function toolbar(){return `<div class="preset-grid">${[['cold','纯冷对照'],['base','无端冷 · 0°'],['cooled','端冷闭合 · 0°'],['full','全机制 · 8°']].map(([id,s])=>btn('preset',s,`data-preset="${id}" aria-pressed="${state.preset===id}"`)).join('')}</div><div class="control-row"><label for="eta">端冷 $\\eta$</label><input id="eta" type="range" min="0" max=".90" step=".01" value="${state.eta}" ${state.preset==='cold'?'disabled':''}><output id="eta-output">${state.eta.toFixed(2)}</output></div><div class="control-row"><label for="theta6">有效倾角</label><input id="theta6" type="range" min="0" max="12" step=".5" value="${state.theta}" ${state.preset==='cold'?'disabled':''}><output>${state.theta.toFixed(1)}°</output></div><label class="switch"><input id="show-a2" type="checkbox" ${state.showA2?'checked':''}>显示保护环 $A_2$</label>`;}
  function budget(){return `<div class="button-row">${btn('budget-tab','模型对账',`data-tab="models" aria-pressed="${state.budgetTab==='models'}"`)}${btn('budget-tab','外部预算',`data-tab="external" aria-pressed="${state.budgetTab==='external'}"`)}</div>`+(state.budgetTab==='models'?`<table class="budget-table"><thead><tr><th>方案</th><th>$U_0$/V</th><th>$e/m$偏差</th></tr></thead><tbody>${models.map(m=>`<tr><th>${m.label}</th><td>${m.fit.u0.toFixed(3)}</td><td>${m.fit.relPct>0?'+':''}${m.fit.relPct.toFixed(2)}%</td></tr>`).join('')}</tbody></table><p class="small-note">各行使用第三章同一切线判据、同一实测磁场采样网格。正偏差表示比荷高于标准值。</p>`:`<div class="budget-external"><p><b>阳极内径 9.0–9.2 mm</b><span>半径约 ±1.1% → 比荷 +2.23% / −2.16%</span></p><p><b>五孔磁场的空间差异</b><span>1 A：3.97–4.16 mT，均值4.07 mT<br>比荷敏感度 +5.10% / −4.28%</span></p><p><b>自洽空间电荷</b><span>零倾角轴对称稳态：约 −0.22 个百分点</span></p></div><p class="small-note">这些独立对照各有适用条件，不能直接相加成为总误差。</p>`);}
  function controls(){
    let html='';$('#chart-title').textContent=thermal()?'四档零场收集比例':state.step==='2b'?'比荷与横轴截距':state.step==='3a'?'模型边界':state.step==='3b'?'下一步怎样检验':state.step==='4a'?'实验报告与开放探索':'全电压对照';$('#voltage-badge').textContent='';
    if(thermal()){
      $('#chart').innerHTML=ratioChart(bundle,state.eta);$('#legend').innerHTML='<span style="--color:#8eabc0">实测</span><span style="--color:#edbe76">模型</span>';
      html=`<div class="control-row"><label for="eta">端冷系数 $\\eta$</label><input id="eta" type="range" min="0" max=".90" step=".01" value="${state.eta}" ${state.step==='0a'?'disabled':''}><output id="eta-output">${state.eta.toFixed(2)}</output></div><div class="button-row">${btn('eta-zero','均匀发射 η = 0',state.step==='0a'?'disabled':'')}${btn('eta-best','应用 η = 0.76',state.step==='0a'?'disabled':'')}</div><div id="cold-zero-values"></div><div id="cold-channels"></div><p class="small-note">总发射电流固定，仅改变灯丝沿轴向的发射份额。</p>`;
    }else{
      $('#chart').innerHTML=state.step==='2b'?`<div class="focus-grid two budget-focus"><figure class="chart-card"><div class="chart-bar"><strong>比荷相对 CODATA 的偏差</strong><span>同一切线判据 · 同一实测磁场网格</span></div>${budgetChart(models)}</figure><div class="focus-side">${budget()}</div></div>`:'';$('#legend').innerHTML='';
      if(state.step==='2a')html=toolbar()+'<div id="synthesis-values"></div>';
      
      if(state.step==='3a')html=`<div class="boundary-options">${BOUNDARIES.map((b,i)=>btn('boundary',b.title,`data-index="${i}" aria-pressed="${state.boundary===i}"`)).join('')}</div><div class="boundary-explanation"><h2>${BOUNDARIES[state.boundary].title}</h2><p>${BOUNDARIES[state.boundary].text}</p></div>${state.boundary===0?btn('hk-detail','展开模型 H / K 两路对照') : ''}`;
      if(state.step==='3b')html=`<div class="direction-options">${DIRECTIONS.map((d,i)=>btn('direction',`${d.title}<small>${d.question}</small>`,`data-index="${i}" aria-pressed="${state.direction===i}"`)).join('')}</div>${btn('archive','写入手账，进入报告归档','class="primary"')}`;
      if(state.step==='4a')html=`<div class="archive-intro"><b>六章实验记录</b><p>从磁截止测量，到落点重分配、对称破缺、端冷与模型边界。</p></div><div class="archive-actions">${btn('book','📖 翻开完整手账')}${btn('export','导出完整实验报告 (.html)','class="primary"')}${btn('sandbox','全自由度实验台 →')}</div><label class="reflection">我的观察与下一步检验<textarea id="final-notes" placeholder="记录你最想继续研究的问题。">${esc(state.notes)}</textarea></label>`;
    }
    renderPanel($('#controls'),html);renderMath($('#controls'));renderMath($('#chart'));readouts();
  }
  function readouts(){
    if(thermal()){
      const r=weightedScan(bundle,10,0,state.eta)[0],error=ratioErrors(bundle,state.eta);
      $('#cold-zero-values').innerHTML=`<div class="zero-summary"><span>10 V · 零磁场</span><b>${r.A1_uA.toFixed(3)} / ${r.A2_uA.toFixed(3)} μA</b><small>中央阳极 / 合并保护环 · 比例偏差 RMS ${error.rmse.toFixed(4)}</small></div>`;
      const rows=weightedScan(bundle,10,0,state.eta),extra=anchors.anchors.map(a=>weightedRow(a.row,a.moments,state.eta,anchors.params.emission_uA)),all=[...rows,...extra].sort((a,b)=>a.field_mT-b.field_mT);
      $('#cold-channels').innerHTML=multiCurve(all,null,{channels:['A1_uA','A2_uA','A2_H_uA','A2_K_uA']})+'<div class="channel-key">'+CHANNELS.slice(0,4).map(([k,n,c])=>`<span style="color:${c}">— ${n}</span>`).join('')+'</div>';renderMath($('#cold-channels'));
    }
    if($('#synthesis-values')){const f=currentFit();$('#synthesis-values').innerHTML=`<div class="fit-summary"><div><small>横轴截距 $U_0$</small><strong>${f?.u0.toFixed(3)??'—'} V</strong></div><div><small>比荷相对偏差</small><strong>${f?`${f.relPct>0?'+':''}${f.relPct.toFixed(2)}%`:'—'}</strong></div></div><p class="small-note" role="status">${error|| (loading?'正在按当前倾角更新四档曲线…':'四档使用相同物理参数，各档总发射电流由零场实测确定。')}</p>`;renderMath($('#synthesis-values'));}
  }
  function render(){if(!alive||!bundle||state.step==='5a')return;derive();setProgress(ORDER,state.step,NAMES6);setHint(HINTS6[state.step]??'');renderClues(6,ORDER.indexOf(state.step));setWait(loading?'正在更新四档曲线…':state.step==='1a'&&Math.abs(state.eta-.76)>.001?'应用 η = 0.76 后核对定量结果':state.step==='2a'&&(state.theta!==8||Math.abs(state.eta-.76)>.001||!state.xnorm)?'应用全机制 · 8° 并切到 B/Bc 后继续':'');document.body.dataset.chapter='6';document.body.dataset.step=state.step;$('#chapter-title').textContent='06 综合实验、模型边界与科研闭环';$('#phase').textContent=thermal()?'端冷闭合':state.step[0]==='2'?'四档总账':state.step[0]==='3'?'模型边界':'报告归档';$('#free-review').hidden=!state.completed;$('#free-review').textContent='全自由度实验台';$('#conversation').hidden=false;exportButton.hidden=false;exportButton.classList.toggle('primary',state.completed);stage();controls();narrative();}
  async function requestCurves(){
    clearTimeout(debounce);client.cancel();const token=++generation;liveData=null;loading=false;error='';
    if(bundle.scans[`10:${state.theta}`]||state.preset==='cold'){render();persist();return;}
    loading=true;liveData={};render();
    for(const V of VOLTS){if(token!==generation||!alive)return;const rows=[];let failure=null;
      await new Promise(resolve=>{const params=modelParameters(V,bundle.zero_measured[V].emission_uA,{tilt_deg:state.theta,emission_profile:'cooled_ends',end_cooling_eta:state.eta,fields_mT:bundle.scans[`${V}:0`].params.fields_mT});client.scan(params,{onRow:r=>rows.push(r),onDone:resolve,onError:e=>{failure=e;resolve();}});});
      if(token!==generation||!alive)return;if(failure){error='计算服务暂时不可用，请先选择已备好的 0° / 5° / 8° / 10° 对照。';break;}liveData[V]=rows;derive();stage();readouts();
    }
    loading=false;render();persist();
  }
  async function go(step){client.cancel();generation++;loading=false;clearTimeout(debounce);state.step=step;state.paragraph=0;setDrawer(true);if(step==='2a'){state.theta=0;state.preset='cooled';state.eta=.76;liveData=null;}if(step==='3a'){state.theta=0;state.eta=.76;state.preset='cooled';liveData=null;}if(step==='4a')state.completed=true;
    if(step==='5a'){if(!state.fromLauncher)state.completed=true;persist();$('#conversation').hidden=true;const {createSandbox}=await import('./sandbox6.js');if(!alive)return;free=createSandbox({bridge,asset,bundle,anchors,calibration,deck,profile,saved:state.sandbox,onSave:persist,exitLabel:state.fromLauncher?'← 返回首页':'← 返回报告归档',onExit:()=>{if(state.fromLauncher){persist();bridge.launcher();return;}state.sandbox=free.getState();free.suspend();free=null;go('4a');},onExport:exportReport});await free.begin();return;}
    render();revealInstruction();persist();
  }
  async function exportReport(){if(!state.completed&&state.step!=='5a'){notify('完成模型边界的对账后，即可导出完整实验报告。');return;}exportButton.disabled=true;try{const {downloadReport}=await import('./report.js');await downloadReport({asset,bundle,anchors,calibration,snapshot:bridge.snapshot(),chapter6:state,sandbox:free?.getState()??state.sandbox});notify('实验报告已生成。');}catch(e){notify('报告未能生成：'+e.message);}finally{exportButton.disabled=false;}}
  function zoom(V){selected=V;const fit=currentFit();$('#detail-body').innerHTML=`<h2>${V} V · 模型与实测</h2>${multiCurve(byVoltage[V],measured[V],{bc:fit?.items.find(i=>i.V===V)?.bc??1,xnorm:state.xnorm,ynorm:state.ynorm,channels:state.showA2?['A1_uA','A2_uA']:['A1_uA'],highlight:state.step==='3a'})}<p>实线：实测；虚线：模型。${state.xnorm?'横轴使用当前模型的切线截止场归一化。':''}</p>`;renderMath($('#detail-body'));$('#detail').showModal();}
  function hkDetail(){const rows=weightedScan(bundle,10,0,.76),all=[...rows,...anchors.anchors.map(a=>weightedRow(a.row,a.moments,.76,anchors.params.emission_uA))].sort((a,b)=>a.field_mT-b.field_mT);$('#detail-body').innerHTML='<h2>H 环回弹为何没有成为合并反超？</h2>'+multiCurve(all,measured[10],{channels:['A2_uA','A2_H_uA','A2_K_uA'],highlight:true})+'<p>4.425 mT：H 环达到自身零场的 102.81%，K 环已归零；合并保护环只剩零场的 51.28%。实线为合并保护环实测，虚线为模型（合并、H 环、K 环），各自以零场电流归一化。</p>';$('#detail').showModal();}
  listen(document,'click',e=>{const b=e.target.closest('[data-action6]');if(!b||b.disabled||state.step==='5a')return;const a=b.dataset.action6;
    if(a==='eta-zero'||a==='eta-best'){state.eta=a==='eta-best'?.76:0;state.paragraph=0;render();persist();}
    if(a==='preset'){state.preset=b.dataset.preset;state.theta=state.preset==='full'?8:0;state.eta=['full','cooled'].includes(state.preset)?.76:0;requestCurves();}
    if(a==='xaxis'){state.xnorm=b.dataset.value==='1';stage();narrative();persist();}if(a==='yaxis'){state.ynorm=b.dataset.value==='1';stage();persist();}
    if(a==='zoom')zoom(Number(b.dataset.voltage));if(a==='budget-tab'){state.budgetTab=b.dataset.tab;controls();persist();}
    if(a==='boundary'){state.boundary=Number(b.dataset.index);render();persist();}if(a==='direction'){state.direction=Number(b.dataset.index);render();persist();}
    if(a==='hk-detail')hkDetail();if(a==='book')bridge.book();if(a==='archive')go('4a');if(a==='export')exportReport();if(a==='sandbox')go('5a');
  });
  listen($('#controls'),'input',e=>{if(state.step==='5a')return;if(e.target.id==='final-notes'){state.notes=e.target.value;persist();return;}
    if(e.target.id==='eta'){state.eta=Number(e.target.value);$('#eta-output').textContent=state.eta.toFixed(2);if(thermal()){stage();$('#chart').innerHTML=ratioChart(bundle,state.eta);readouts();narrative();persist();}else{state.preset='custom';if(bundle.scans[`10:${state.theta}`]){liveData=null;derive();stage();readouts();narrative();persist();}else{clearTimeout(debounce);debounce=setTimeout(requestCurves,180);}}}
    if(e.target.id==='theta6'){state.theta=Number(e.target.value);state.preset='custom';e.target.nextElementSibling.textContent=state.theta.toFixed(1)+'°';clearTimeout(debounce);client.cancel();generation++;loading=true;narrative();debounce=setTimeout(requestCurves,180);}
    if(e.target.id==='show-a2'){state.showA2=e.target.checked;stage();persist();}
  });
  listen($('#next'),'click',()=>{if(state.step==='5a'||$('#next').disabled)return;const p=paragraphs();if(state.paragraph<p.length-1){state.paragraph++;narrative();revealInstruction();persist();}else go(ORDER[ORDER.indexOf(state.step)+1]);});
  listen($('#previous'),'click',()=>{if(state.step==='5a')return;if(state.paragraph){state.paragraph--;narrative();persist();}else go(ORDER[Math.max(0,ORDER.indexOf(state.step)-1)]);});
  listen($('#menu'),'click',bridge.menu);listen($('#dock-book'),'click',bridge.book);listen($('#reset'),'click',()=>bridge.research({focus:'all'}));listen($('#detail-close'),'click',()=>$('#detail').close());listen($('#free-review'),'click',()=>{if(state.step!=='5a')go('5a');});listen(exportButton,'click',exportReport);
  return {async begin(){[bundle,anchors,cold,dialogue]=await Promise.all([get('../assets/precomputed/ch6_bundle.json'),get('../assets/precomputed/ch6_anchors.json'),get('../assets/precomputed/ch4_baseline.json'),get('./ch6-dialogue.json')]);if(!alive)return;models=budgetModels(bundle,asset,calibration);await bridge.view('tube');if(!alive)return;bridge.update({heater:true,accelerator:true,magnet:false,actualPoint:true,acceleratingVoltage:10,filamentVoltage:3.68});bridge.research({enabled:true,focus:'all'});if(state.step==='5a')await go('5a');else{if(!bundle.scans[`10:${state.theta}`]){state.theta=8;state.preset='full';}render();persist();}},
    suspend(){alive=false;generation++;client.cancel();free?.suspend();clearTimeout(debounce);clearTimeout(notify.timer);abort.abort();deck.remove();profile.remove();exportButton.remove();$('#conversation').hidden=false;$('#notice').hidden=true;$('#detail').close();},
    pick(){},getState:()=>({...structuredClone(state),sandbox:free?.getState()??state.sandbox}),getDebug:()=>({state:structuredClone(state),loading,error,ratios:bundle?ratioErrors(bundle,state.eta):null,fit:bundle?currentFit():null,free:free?.getDebug()})};
}
