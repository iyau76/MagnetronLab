import {renderPanel,fieldGrid} from './interaction.js';
import {renderMath} from '../mathlite.js';
import {PhysicsClient,modelParameters} from './physics-client.js';
import {curveChart,COLORS,esc} from './charts.js';
import {symmetryChart,fateWheel,FATE_NAMES} from './charts5.js';
import {measuredCurves,traceIndex} from './model-math.js';
import {setProgress,setHint,setLayout,renderClues,setDrawer,setWait,revealInstruction} from './hud.js';
const HINTS5={'0a':'截止之后：零倾角模型已归零，实测仍拖着两条尾巴','1a':'拖动有效倾角，看高场尾巴能否被拉出来','1b':'几度偏角，怎样把电子送过磁截止势垒？','2a':'#3415 · 零倾角：正则角动量守恒，近地点停在灯丝附近','2b':'同一颗电子加 8°：正则角动量漂移，近地点逐圈外扩','3a':'相同初能，72 个起飞方位：命运各不相同','4a':'对称破缺定案；零场分配比留给第六章'};
const NAMES5={'0a':'长尾','1a':'调角','1b':'追问','2a':'0° 受困','2b':'8° 逃逸','3a':'命运轮','4a':'定案'};
const FOCUS5=new Set(['0a','4a']);

const $=s=>document.querySelector(s),ORDER=['0a','1a','1b','2a','2b','3a','4a'];
const ACTIONS={
  '0a':'把有效倾角 θ 拉开试试 →','1a':'进一步追问：这几度偏角怎么就把电子送过去了？',
  '1b':'进入单电子对比，锁定受困代表 #3415','2a':'给同一颗电子加上 8° 倾角！',
  '2b':'可如果只有向外的力，为什么不是所有电子都逃出去了？',
  '3a':'把对称破缺定案记入手账，核对最后的账本 →','4a':'进入第六章 · 综合实验、模型边界与科研闭环 →'};
const btn=(action,text,attr='')=>`<button data-do="${action}" ${attr}>${text}</button>`;
const markdown=s=>esc(s).replace(/\*\*([\s\S]+?)\*\*/g,'<strong>$1</strong>');

export function createChapter5(bridge,saved,asset,calibration) {
  const state={step:'0a',paragraph:0,voltage:10,theta:0,scanPoints:29,pid:3415,mode:'zero',time:0,sector:0,prediction:null,seenAngles:[],seenTilt:false,completed:false,fullTime:false,hull:false,...saved};
  if(!ORDER.includes(state.step))state.step='0a';
  const measured=measuredCurves(asset,calibration),client=new PhysicsClient(),abort=new AbortController();
  const listen=(el,event,fn)=>el.addEventListener(event,fn,{signal:abort.signal});
  let alive=true,bundle,dialogue,cloudIndex,rows=[],preview=[],loading=false,error='',failureDetail='',field=5.735,playing=false,raf=0,last=0,debounce=0,wheelTrace=null,wheelGeneration=0,loadingWheel=false,cloudGeneration=0,cloudAbort=null;
  const wheelCache=new Map(),cloudCache=new Map();
  const kind=()=>state.step[0]==='2'?'trace':state.step==='3a'?'wheel':state.step==='4a'?'closing':'scan';
  const zero=()=>bundle.traces[`${state.pid}:0`],tilt=()=>bundle.traces[`${state.pid}:8`];
  const fieldForPid=()=>state.pid===3415?5.735:5;
  const persist=()=>bridge.save({...state},state.completed?{completed:true,theta:state.theta,voltage:state.voltage,prediction:state.prediction,seenAngles:state.seenAngles,pid:state.pid,sector:state.sector}:null);
  const get=async url=>{const r=await fetch(url,{signal:abort.signal});if(!r.ok)throw new Error('这组轨迹未能载入，请重试。');return r.json();};
  const notify=message=>{$('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(notify.timer);notify.timer=setTimeout(()=>$('#notice').hidden=true,4500);};
  function pages() {
    let paragraphs=dialogue.steps[state.step]??[];
    if(loading&&['scan','closing'].includes(kind()))return ['模型曲线正在按磁场从低到高生成。等高场端出现后，再比较两路余流。'];
    if(state.step==='1a'&&(loading||state.theta!==8||state.voltage!==10||!rows.length))return [loading?'倾角已改变，曲线正在按磁场从低到高生成。等高场端出现后，再比较两路余流。':'先试 3°、5°，再切到 8°，比较高场尾巴怎样变化。完成 10 V、8° 的扫描后，再核对这一组定量结果。'];
    if(state.pid!==3415&&['trace','wheel'].includes(kind()))paragraphs=kind()==='trace'?[`现在对照 #42，在 $5.00\\ \\mathrm{mT}$ 下，零倾角经过 ${zero().radial_bounces} 次径向折返、${zero().flight_ns.toFixed(2)} ns 后返回灯丝；同一初态加上 $8^\\circ$ 倾角，经过 ${tilt().radial_bounces} 次径向折返、${tilt().flight_ns.toFixed(2)} ns 后到达中央阳极。比较它的角动量与近地点变化。`]:['保持 #42 的初始能量、径向和轴向速度，把初态每次旋转 $5^\\circ$。72 个方位中，10 个回灯丝、24 个抵达中央阳极、11 个抵达保护环、27 个飞出端面。点选色块，可以逐一查看它们的真实轨迹。'];
    if(state.step==='2b'&&state.time<tilt().flight_ns-.001)return ['同一初态加上 8° 倾角，先看轨迹如何展开。播放到终点后，再核对它的落点、角动量和每圈近地点。'];
    const out=[],limit=innerWidth<1360?175:215;
    for(const text of paragraphs){let page='';for(const sentence of text.match(/[^。！？]+[。！？]?/g)??[text]){
      if(page&&page.length+sentence.length>limit){const open=(page.match(/\*\*/g)??[]).length%2;out.push(page+(open?'**':''));page=(open?'**':'')+sentence;}else page+=sentence;
    }if(page)out.push(page);}
    return out.length?out:[''];
  }
  function canAdvance(){return state.step==='1a'?state.theta===8&&state.voltage===10&&state.seenAngles.includes(8)&&!loading:state.step==='2b'?state.seenTilt:state.step==='3a'?!loadingWheel:true;}
  function narrative(){const p=pages();state.paragraph=Math.min(state.paragraph,p.length-1);$('#dialogue').innerHTML=`<p>${markdown(p[state.paragraph])}</p>`;renderMath($('#dialogue'));$('#dialog-page').textContent=p.length>1?`${state.paragraph+1} / ${p.length}`:'';$('#next').textContent=state.paragraph<p.length-1?'继续 →':ACTIONS[state.step];$('#next').disabled=state.paragraph===p.length-1&&!canAdvance();const blocked=state.paragraph===p.length-1&&!canAdvance();setWait(!blocked?'':state.step==='1a'?(loading?'扫描中…':'完成 10 V、8° 的扫描后继续'):state.step==='2b'?'播放到 8° 轨迹终点后继续':state.step==='3a'?'正在载入轨迹…':'');$('#previous').disabled=state.step==='0a'&&state.paragraph===0;}
  function tailSeries(){
    const V=state.voltage,m=measured[V],baseline=bundle.scans[`${V}:0`].rows[0];
    const series=[];
    for(const c of ['A1','A2']){
      series.push({points:m.rows.map(r=>[r.field_mT,100*r[c+'_uA']/m.zero[c+'_uA']]),color:COLORS[c],width:2.3});
      if(preview.length)series.push({points:preview.map(r=>[r.field_mT,100*r[c+'_uA']/preview[0][c+'_uA']]),color:COLORS[c],opacity:.3,dash:'2 4'});
      if(rows.length)series.push({points:rows.map(r=>[r.field_mT,100*r[c+'_uA']/baseline[c+'_uA']]),color:COLORS[c],width:2.3,dash:'7 4',opacity:.95});
    }
    return series;
  }
  const card=(title,note,svg)=>`<figure class="chart-card"><div class="chart-bar"><strong>${title}</strong><span>${note}</span></div>${svg}</figure>`;
  function tailFocus(){
    const V=state.voltage,m=measured[V],series=tailSeries(),end=m.rows.at(-1);
    const inTail=series.flatMap(s=>s.points.filter(p=>p[0]>=4.8).map(p=>p[1]));const ytop=Math.min(100,Math.max(20,Math.ceil((Math.max(...inTail)+3)/10)*10));
    const marks=['A1','A2'].map(c=>({x:end.field_mT,y:100*end[c+'_uA']/m.zero[c+'_uA'],label:`实测 ${c==='A1'?'A₁':'A₂'} ${(100*end[c+'_uA']/m.zero[c+'_uA']).toFixed(2)}%`,color:COLORS[c],anchor:'end'}));
    const main=curveChart(series.map(s=>({...s,smooth:true})),{y:[0,110],ylabel:'I/I(0) / %',window:[4.8,5.8],height:430,yticks:[0,20,40,60,80,100]});
    const zoom=curveChart(series.map(s=>({...s,smooth:true})),{x:[4.8,5.8],y:[0,ytop],ylabel:'I/I(0) / %',height:430,marks});
    const side=state.step==='0a'?`<h2>你的第一判断</h2><div class="diagnoses">${['高场增强了阴极发射','磁场的柱对称被打破','管内有固定漏电暗流'].map((t,i)=>btn('predict',`${'ABC'[i]} · ${t}`,`data-value="${i}" aria-pressed="${state.prediction===i}"`)).join('')}</div>${comparison()}`
      :`${comparison()}<div class="evidence">零场收集比 $A_2/A_1$：均匀发射模型 1.307，实测约 0.81。下一步比较灯丝不同位置的发射份额。</div><div class="button-row voltage-presets">${[4,6,8,10].map(V=>btn('voltage',`${V} V`,`data-voltage="${V}" aria-pressed="${V===state.voltage}"`)).join('')}</div>`;
    $('#chart').innerHTML=`<div class="focus-grid three">${card(`${V} V · 中央阳极与保护环`,`实线：实测　虚线：${state.theta.toFixed(0)}° 模型`,main)}${card('高场端局部放大','4.8–5.8 mT',zoom)}<div class="focus-side">${side}</div></div>`;
    renderMath($('#chart'));
  }
  function scanPlot(){
    if(FOCUS5.has(state.step)){tailFocus();$('#legend').innerHTML=`<span style="--color:${COLORS.A1}">中央阳极 $A_1$</span><span style="--color:${COLORS.A2}">保护环 $A_2$</span>`;renderMath($('#legend'));return;}
    const V=state.voltage,m=measured[V],baseline=bundle.scans[`${V}:0`].rows[0];
    const series=[];
    for(const c of ['A1','A2']){
      series.push({points:m.rows.map(r=>[r.field_mT,100*r[c+'_uA']/m.zero[c+'_uA']]),color:COLORS[c],width:2.1});
      if(preview.length)series.push({points:preview.map(r=>[r.field_mT,100*r[c+'_uA']/preview[0][c+'_uA']]),color:COLORS[c],opacity:.25,dash:true});
      if(rows.length)series.push({points:rows.map(r=>[r.field_mT,100*r[c+'_uA']/baseline[c+'_uA']]),color:COLORS[c],dash:'7 4'});
    }
    $('#chart').innerHTML=curveChart(series.map(s=>({...s,smooth:true})),{y:[0,110],ylabel:'I/I(0) / %',cursor:5.735,yticks:[0,20,40,60,80,100],inset:{x:[4.8,5.8],y:[0,30],label:'高场长尾 4.8–5.8 mT · %'}});
    $('#legend').innerHTML=`<span style="--color:${COLORS.A1}">中央阳极 $A_1$</span><span style="--color:${COLORS.A2}">保护环 $A_2$</span><span>实线：实测 · 虚线：模型${loading?' / 快速骨架':''}</span>`;renderMath($('#legend'));
  }
  function plot(){
    const k=kind();$('#chart-title').textContent=k==='trace'?'角动量与近地点':k==='wheel'?'相同初能，72 个起飞方位':'高场余流的对照';$('#voltage-badge').textContent=`${['trace','wheel'].includes(k)?10:state.voltage} V`;
    if(k==='trace'){$('#chart').innerHTML=symmetryChart(zero(),tilt(),{mode:state.mode,time:state.time,full:state.fullTime,hull:state.hull});$('#legend').innerHTML='<span style="--color:#8ccbe4">0° 同轴</span><span style="--color:#f1b575">8° 倾斜</span><span>圆点：每次径向折返之间的近地点</span>';}
    else if(k==='wheel'){$('#chart').innerHTML=fateWheel(bundle.wheels[state.pid],state.pid,state.sector);$('#legend').innerHTML='<span>点选扇区，或用下方转角滑块逐一查看</span>';}
    else scanPlot();
  }
  function comparison(){const m=measured[state.voltage],me=m.rows.at(-1),end=rows.at(-1),base=bundle.scans[`${state.voltage}:0`].rows[0],complete=end?.field_mT===5.735;
    return `<table class="tail-table"><thead><tr><th>$B\\simeq5.735\\ \\mathrm{mT}$</th><th>$A_1$ 余流</th><th>$A_2$ 余流</th></tr></thead><tbody><tr><th>实测</th>${['A1','A2'].map(k=>`<td>${(100*me[k+'_uA']/m.zero[k+'_uA']).toFixed(2)}%</td>`).join('')}</tr><tr><th>${state.theta.toFixed(1)}° 模型</th>${['A1','A2'].map(k=>`<td>${complete?(100*end[k+'_uA']/base[k+'_uA']).toFixed(2)+'%':'…'}</td>`).join('')}</tr></tbody></table>`;
  }
  function controls(){
    const k=kind();let html='';
    if(FOCUS5.has(state.step)){$('#controls').innerHTML='';return;}
    if(k==='scan'||k==='closing'){
      if(state.step==='0a')html=`<div class="diagnoses">${['高场增强了阴极发射','磁场的柱对称被打破','管内有固定漏电暗流'].map((s,i)=>btn('predict',`${'ABC'[i]} · ${s}`,`data-value="${i}" aria-pressed="${state.prediction===i}"`)).join('')}</div>`;
      else html=`<div class="control-row"><label for="tilt">有效倾角 $\\theta$</label><input id="tilt" type="range" min="0" max="12" step=".5" value="${state.theta}"><output id="tilt-output">${state.theta.toFixed(1)}°</output></div><div class="button-row angle-presets">${[0,3,5,8,10].map(t=>btn('angle',`${t}°`,`data-angle="${t}" aria-pressed="${t===state.theta}"`)).join('')}${btn('finish-scan','立即完成',loading?'':'disabled')}${btn('densify',state.scanPoints>=61?'61 点加密':'加密到 61 点',state.scanPoints>=61?'disabled':'')}</div>`;
      html+=`<div class="progress-track"><i style="width:${rows.length/(state.scanPoints||29)*100}%"></i></div><div id="scan-status" role="status" class="small-note">${statusText()}</div>${comparison()}`;
      if(error)html+=`<div class="evidence">${esc(error)} ${btn('angle','切换到 8° 高清基准','data-angle="8"')}</div>`;
      if(state.step!=='0a')html+=`<div class="button-row voltage-presets">${[4,6,8,10].map(V=>btn('voltage',`${V} V`,`data-voltage="${V}" aria-pressed="${V===state.voltage}"`)).join('')}</div>`;
      if(k==='closing')html+='<div class="evidence">零场收集比 $A_2/A_1$：均匀发射模型 1.307，实测约 0.81。下一步比较灯丝不同位置的发射份额。</div>';
    }else{
      html=`<div class="button-row"><span class="segmented">${[3415,42].map(id=>btn('pid',`#${id} · ${id===3415?'5.735':'5.00'} mT`,`data-pid="${id}" aria-pressed="${state.pid===id}"`)).join('')}</span>${k==='trace'?`<span class="segmented">${[['zero','0° 受困'],['tilt','8° 逃逸'],['both','双轨叠放']].map(([m,label])=>btn('mode',label,`data-mode="${m}" aria-pressed="${state.mode===m}"`)).join('')}</span>`:''}</div>`;
      if(k!=="trace")html+=`<div class="control-row"><label for="sector">转角 $\\Delta\\varphi_0$</label><input id="sector" type="range" min="0" max="71" step="1" value="${state.sector}"><output>${state.sector*5}°</output></div>`;
      const active=activeTrace();html+=`<div class="control-row"><label for="trace-time">飞行时间</label><input id="trace-time" type="range" min="0" max="${duration()}" step=".01" value="${state.time}"><output id="time-output">${state.time.toFixed(2)} ns</output></div><div class="button-row">${btn('play',playing?'暂停':'▶ 播放')}${btn('end','看终点')}${k==='trace'?btn('full-time','完整时间轴',`aria-pressed="${state.fullTime}"`)+btn('hull','磁通尺度',`aria-pressed="${state.hull}"`)+btn('principle','原理 ↗'):''}</div>`;
      if(k==='trace')html+=`<div class="trace-stats"><span>0°：<b>${zero().radial_bounces} 次 / ${zero().flight_ns.toFixed(2)} ns</b></span><span>8°：<b>${tilt().radial_bounces} 次 / ${tilt().flight_ns.toFixed(2)} ns</b></span></div>`;
      else if(active)html+=`<div class="evidence">${FATE_NAMES[active.outcome]} · ${active.radial_bounces} 次径向折返 · ${active.flight_ns.toFixed(2)} ns${loadingWheel?' · 正在载入所选轨迹…':''}</div>`;
    }
    renderPanel($('#controls'),html);renderMath($('#controls'));
  }
  function statusText(){return error?'扫描未完成':loading?(preview.length?`高清推演：已扫至 ${field.toFixed(3)} mT（${rows.length}/${state.scanPoints||29}）`:'正在生成 1024 粒子快速骨架…'):'扫描完成 · 8192 粒子';}
  function fieldStage(B=field,theta=state.theta){
    bridge.research({field:{B,theta}});const a=theta*Math.PI/180;
    const g=Math.min(1,Math.max(.12,3*a)),ex=10+70*Math.cos(g),ey=42-70*Math.sin(g);$('#stage-caption').innerHTML=`<svg class="field-gizmo" viewBox="0 0 120 54" aria-hidden="true"><path d="M10,42H80" stroke="#91abc5" stroke-width="1.6"/><path d="M10,42L${ex},${ey}" stroke="#91e5e5" stroke-width="2.2"/><path d="M${ex},42V${ey}" stroke="#f0bd73" stroke-width="1.6" stroke-dasharray="3 2"/><path d="M40,42A30,30 0 0 0 ${10+30*Math.cos(g)},${42-30*Math.sin(g)}" fill="none" stroke="#d6ac73"/><text x="84" y="46" fill="#91abc5" font-size="10">B<tspan baseline-shift="sub" font-size="7">z</tspan></text><text x="${ex+4}" y="${ey+3}" fill="#91e5e5" font-size="10">B</text><text x="44" y="38" fill="#d6ac73" font-size="9">θ</text><text x="${ex+4}" y="${(42+ey)/2+8}" fill="#f0bd73" font-size="9">B⊥</text></svg><span>$\\mathbf{B}=B\\cos\\theta\\,\\mathbf{e}_z+B\\sin\\theta\\,\\mathbf{e}_x$${theta?'<small>（角度示意 ×3）</small>':''}</span><br><span class="field-components">$B_z=${(B*Math.cos(a)).toFixed(3)}\\ \\mathrm{mT}$　$B_\\perp=${(B*Math.sin(a)).toFixed(3)}\\ \\mathrm{mT}$</span>`;renderMath($('#stage-caption'));
  }
  async function cloudFrame(index){
    if(!['scan','closing'].includes(kind()))return;
    const generation=++cloudGeneration,key=`${state.voltage}:${state.theta}`,B=field,V=state.voltage,theta=state.theta;cloudAbort?.abort();
    try{
      let traces;
      if(cloudIndex?.files[key]){
        if(!cloudCache.has(key))cloudCache.set(key,get('../assets/precomputed/'+cloudIndex.files[key]));
        const fields=bundle.scans[key].params.fields_mT;const at=fields.reduce((best,b,i)=>Math.abs(b-B)<Math.abs(fields[best]-B)?i:best,0);traces=(await cloudCache.get(key))[at];
      }else{
        cloudAbort=new AbortController();const params=modelParameters(V,bundle.zero_measured[V].emission_uA,{field_mT:B,tilt_deg:theta});
        traces=(await client.json('/trace',{signal:cloudAbort.signal,body:{params,particle_ids:[42,169,245,2277,3415,6413]}})).traces;
      }
      if(!alive||generation!==cloudGeneration||!['scan','closing'].includes(kind()))return;
      bridge.research({population:traces??[]});
    }catch(e){if(e.name!=='AbortError'&&generation===cloudGeneration)bridge.research({population:[]});}
  }
  function activeTrace(){return kind()==='wheel'?wheelTrace:state.mode==='zero'?zero():tilt();}
  function duration(){return kind()==='wheel'?(wheelTrace?.flight_ns??1):state.mode==='both'?Math.max(zero().flight_ns,tilt().flight_ns):activeTrace().flight_ns;}
  function setSceneTrace({focus=false}={}){
    const k=kind(),tr=['trace','wheel'].includes(k)?activeTrace():null;
    bridge.research({enabled:true,trace:tr,counter:k==='trace'&&state.mode==='both'?zero():null,traceOptions:{color:state.mode==='zero'&&k==='trace'?0x8ccbe4:0xf1b575,counterColor:0x8ccbe4,solidCounter:true,markers:k==='trace'},time:state.time,...(focus?{focus:'all'}:{})});
    fieldStage(['trace','wheel'].includes(k)?fieldForPid():field,k==='trace'?(state.mode==='zero'?0:8):k==='wheel'?8:state.theta);readout();
    if(['scan','closing'].includes(k)&&rows.length)cloudFrame(rows.length-1);
  }
  function readout(){const tr=activeTrace();if(['trace','wheel'].includes(kind())&&tr){const p=tr.points[traceIndex(tr,state.time)];$('#scene-readout').innerHTML=`<div><small>电子 #${state.pid}</small><strong>${Math.min(state.time,tr.flight_ns).toFixed(2)} ns</strong></div><div><small>半径 $r$</small><strong>${p[3].toFixed(3)} mm</strong></div><div><small>轴向位置 $z$</small><strong>${p[2].toFixed(2)} mm</strong></div>`;renderMath($('#scene-readout'));}else $('#scene-readout').innerHTML='';}
  function render(){if(!alive||!bundle)return;document.body.dataset.chapter='5';document.body.dataset.kind=kind();setLayout(FOCUS5.has(state.step)?'focus':'scene');setProgress(ORDER,state.step,NAMES5);setHint(HINTS5[state.step]??'');renderClues(5,state.completed?ORDER.length-1:ORDER.indexOf(state.step));$('#chapter-title').textContent='05 对称性的破缺与长尾';$('#phase').textContent={scan:'长尾对比与调角',trace:'正则角动量与近地点',wheel:'方位角命运轮',closing:'核对最后的账目'}[kind()];$('#free-review').hidden=!state.completed;$('#free-review').textContent='全自由度实验台';$('#view-bench').hidden=true;$('#view-tube').hidden=true;$('#view-near').hidden=!['trace','wheel'].includes(kind());plot();controls();narrative();readout();}
  const scanKey=()=>`${state.voltage}:${state.theta}:${state.scanPoints}`;
  function savedScan(){return state.scanCache?.[scanKey()];}
  function rememberScan(){
    state.scanCache={...state.scanCache,[scanKey()]:structuredClone(rows)};
    const keys=Object.keys(state.scanCache);while(keys.length>6)delete state.scanCache[keys.shift()];
  }
  function restoreScan(){
    rows=structuredClone(savedScan()??((state.scanPoints<=29||FOCUS5.has(state.step))?bundle.scans[`${state.voltage}:${state.theta}`]?.rows??[]:[]));
    preview=[];field=rows.at(-1)?.field_mT??5.735;
  }
  function scanProgress(){const bar=$('.progress-track i'),status=$('#scan-status');if(bar)bar.style.width=100*rows.length/(state.scanPoints||29)+'%';if(status)status.textContent=statusText();}
  function scan(){
    clearTimeout(debounce);client.cancel();loading=true;error='';rows=[];preview=[];field=0;render();setSceneTrace();
    const candidate=bundle.scans[`${state.voltage}:${state.theta}`],preset=state.scanPoints>29?null:candidate,params=modelParameters(state.voltage,bundle.zero_measured[state.voltage].emission_uA,{tilt_deg:state.theta,fields_mT:preset?.params.fields_mT??fieldGrid(5.735,state.scanPoints)});
    client.scan(params,{preset,onPreview:rs=>{preview=rs;scanPlot();scanProgress();},onRow:row=>{rows.push(row);field=row.field_mT;scanPlot();scanProgress();fieldStage();cloudFrame(rows.length-1);},onDone:()=>{loading=false;preview=[];rememberScan();scanPlot();if(!state.seenAngles.includes(state.theta))state.seenAngles.push(state.theta);controls();narrative();persist();},onError:e=>{loading=false;failureDetail=e.message;error='计算服务暂时不可用。可以先用已备好的倾角继续对照。';controls();narrative();}});
  }
  function changeAngle(theta,{delay=false}={}){state.theta=theta;cloudGeneration++;cloudAbort?.abort();bridge.research({population:[]});client.cancel();loading=false;clearTimeout(debounce);fieldStage(5.735,theta);if(delay)debounce=setTimeout(scan,120);else scan();persist();}
  function stop(){playing=false;cancelAnimationFrame(raf);last=0;const button=$('[data-do="play"]');if(button)button.textContent='▶ 播放';}
  function setTime(value){state.time=Math.max(0,Math.min(duration(),value));bridge.research({time:state.time});const slider=$('#trace-time');if(slider)slider.value=state.time;const output=$('#time-output');if(output)output.textContent=state.time.toFixed(2)+' ns';readout();if(kind()==='trace')plot();if(kind()==='trace'&&state.mode!=='zero'&&state.time>=tilt().flight_ns-.01){state.seenTilt=true;narrative();} }
  function play(){if(playing){stop();controls();return;}if(state.time>=duration()-.01)state.time=0;playing=true;controls();last=0;const loop=now=>{if(!alive||!playing)return;if(last)setTime(state.time+(now-last)*duration()/9000);last=now;if(state.time>=duration()){stop();controls();persist();}else raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);}
  async function selectSector(index){
    stop();state.sector=index;loadingWheel=true;const generation=++wheelGeneration,entry=bundle.wheels[state.pid].sectors[index];controls();plot();
    try{if(!wheelCache.has(entry.trace))wheelCache.set(entry.trace,await get('../assets/precomputed/'+entry.trace));if(!alive||generation!==wheelGeneration)return;wheelTrace=wheelCache.get(entry.trace);state.time=wheelTrace.flight_ns;loadingWheel=false;setSceneTrace();render();persist();}catch(e){if(e.name!=='AbortError'){loadingWheel=false;notify(e.message);controls();}}
  }
  async function go(step){
    stop();setDrawer(true);clearTimeout(debounce);client.cancel();loading=false;state.step=step;state.paragraph=0;state.time=0;error='';
    if(step==='2a'){state.pid=3415;state.mode='zero';state.fullTime=true;}
    if(step==='2b'){state.mode='both';state.fullTime=false;}
    if(step==='3a'){await selectSector(0);}
    if(step==='4a'){state.completed=true;state.voltage=10;state.theta=8;restoreScan();}
    if(step==='0a'){state.voltage=10;state.theta=0;restoreScan();}
    render();revealInstruction();setSceneTrace({focus:['2a','3a'].includes(step)});persist();if(step==='2a'||step==='2b')play();if(FOCUS5.has(step)&&state.scanPoints>29&&!savedScan())scan();
  }
  function principle(){
    $('#detail-body').innerHTML='<h2>横向磁场怎样改变角动量？</h2><p>取 $\\mathbf B=(B_x,0,B_z)$，电场绕管轴对称。机械角动量加上轴向磁通项，得到</p><p>$$P_\\varphi/m=xv_y-yv_x-\\frac{e}{2m}B_z(x^2+y^2).$$</p><p>沿运动方程求导，径向电场不产生绕轴力矩，$B_z$ 对应的两项相消，剩下</p><p>$$\\frac{d(P_\\varphi/m)}{dt}=-\\frac{e}{m}B_xxv_z.$$</p><p>同轴时 $B_x=0$，这个量守恒。倾斜后，横向磁场让轴向速度参与角向偏转；位置 $x$ 与速度 $v_z$ 的正负决定力矩方向。因此不同方位的电子会走向不同结局。</p><p>图中的 $P_B/m=\\frac{e}{2m}Br_a^2$ 是比较角动量变化的磁通尺度。近地点图列出每次局部极小值。以 #3415 为例，零倾角的前六次由 0.039 mm 增至 0.061 mm，后续仍在灯丝附近往返。</p>';renderMath($('#detail-body'));$('#detail').showModal();
  }
  listen(document,'click',e=>{const b=e.target.closest('[data-do]');if(!b||b.disabled)return;const a=b.dataset.do;
    if(a==='predict'){state.prediction=Number(b.dataset.value);controls();persist();}
    if(a==='angle')changeAngle(Number(b.dataset.angle));
    if(a==='voltage'){state.voltage=Number(b.dataset.voltage);scan();persist();}
    if(a==='finish-scan')client.finish();if(a==='densify'){state.scanPoints=61;scan();persist();}
    if(a==='mode'){stop();state.mode=b.dataset.mode;state.time=0;state.fullTime=state.mode==='zero';render();setSceneTrace();play();persist();}
    if(a==='pid'){stop();state.pid=Number(b.dataset.pid);state.paragraph=0;state.time=0;if(kind()==='wheel')selectSector(0);else{render();setSceneTrace();persist();}}
    if(a==='play')play();if(a==='end'){stop();setTime(duration());controls();persist();}
    if(a==='full-time'){state.fullTime=!state.fullTime;plot();controls();persist();}if(a==='hull'){state.hull=!state.hull;plot();controls();persist();}if(a==='principle')principle();
  });
  listen($('#chart'),'click',e=>{const sector=e.target.closest('[data-sector]');if(sector)selectSector(Number(sector.dataset.sector));});
  listen($('#chart'),'keydown',e=>{if(kind()!=='wheel')return;const d={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[e.key];if(d){e.preventDefault();selectSector((state.sector+d+72)%72);}if(e.key==='Enter'||e.key===' '){e.preventDefault();play();}});
  listen($('#controls'),'input',e=>{if(e.target.id==='tilt'){$('#tilt-output').textContent=Number(e.target.value).toFixed(1)+'°';changeAngle(Number(e.target.value),{delay:true});}if(e.target.id==='trace-time'){stop();setTime(Number(e.target.value));persist();}if(e.target.id==='sector')selectSector(Number(e.target.value));});
  listen($('#next'),'click',()=>{const p=pages();if(state.paragraph<p.length-1){state.paragraph++;narrative();revealInstruction();persist();return;}if(!canAdvance())return;if(state.step==='4a')bridge.finish();else go(ORDER[ORDER.indexOf(state.step)+1]);});
  listen($('#previous'),'click',()=>{if(state.paragraph>0){state.paragraph--;narrative();persist();}else if(ORDER.indexOf(state.step)>0)go(ORDER[ORDER.indexOf(state.step)-1]);});
  listen($('#menu'),'click',bridge.menu);listen($('#dock-book'),'click',bridge.book);listen($('#reset'),'click',()=>bridge.research({focus:'all'}));listen($('#free-review'),'click',()=>{persist();bridge.explore();});listen($('#view-near'),'click',()=>bridge.research({focus:'near'}));listen($('#detail-close'),'click',()=>$('#detail').close());
  return {
    async begin(){[bundle,dialogue,cloudIndex]=await Promise.all([get('../assets/precomputed/ch5_bundle.json'),get('./ch5-dialogue.json'),get('../assets/precomputed/ch5_scan_traces.json')]);if(!alive)return;await bridge.view('tube');if(!alive)return;bridge.update({heater:true,accelerator:true,magnet:true,current:1.4,acceleratingVoltage:10,filamentVoltage:3.68,filamentCurrent:.599,actualPoint:true});bridge.research({enabled:true,focus:'all'});restoreScan();const savedTime=state.time;if(kind()==='wheel')await selectSector(state.sector);render();setSceneTrace();if(['trace','wheel'].includes(kind())){setTime(savedTime);persist();}if(['scan','closing'].includes(kind())&&(!rows.length||(state.scanPoints>29&&!savedScan())))scan();},
    suspend(){alive=false;stop();clearTimeout(debounce);clearTimeout(notify.timer);client.cancel();cloudAbort?.abort();abort.abort();$('#notice').hidden=true;$('#detail').close();},pick(){},getState:()=>structuredClone(state),
    getDebug:()=>({state:structuredClone(state),loading,preview:preview.length,rows:rows.map(r=>r.field_mT),field,error,failureDetail,playing,loadingWheel,trace:bundle?{zero:zero().flight_ns,tilt:tilt().flight_ns,perigee:tilt().perigee,pphiEnd:tilt().pphi_mm2_per_ns.at(-1)}:null,wheel:bundle?.wheels[state.pid].counts}),
  };
}
