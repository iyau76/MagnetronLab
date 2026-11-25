import {renderPanel} from './interaction.js';
import {renderMath} from '../mathlite.js';
import {PhysicsClient,modelParameters} from './physics-client.js';
import {curveChart,mapChart,traceChart,COLORS,esc} from './charts.js';
import {measuredCurves,radialMaxima,traceIndex,transferDifference,cutoffPosition} from './model-math.js';
import {setProgress,setHint,setLayout,setWait,renderClues,setDrawer,revealInstruction} from './hud.js';

const HINTS={'0a':'回看第三章留下的疑点：截止前，中央阳极电流反而抬高','0b':'先押一注：单独留下哪一项，隆起还会出现？','1a':'00 · 两项都关：冷电子、平均工作点','1b':'分别单开 10 与 01，比较格内读数','1c':'两项同时打开：看「截止前局部放大」与 11 格','1d':'消融回答了“谁缺一不可”，接下来进管内看“为什么”','2a':'先认准极性：H 端 0 V，K 端 +3.68 V','2b':'蓝点：从 K 侧起飞、却落进中央阳极的电子','3a':'盯住峰顶放大带：每一圈的外极值怎样爬升','4a':'同一初态，只把灯丝换成本地等势','4b':'向 H 侧漂移，加速压差逐圈变大','5a':'在实验台上接通保护环 A₂ 的取样电阻与毫伏表','5b':'切到「与零场之差」，核对一升一降','6b':'高场端：零倾角模型已归零，实测仍拖着尾巴'};
const NAMES={'0a':'疑点','0b':'预测','1a':'00','1b':'10 / 01','1c':'11','1d':'进管','2a':'截止区','2b':'落点账','3a':'#6413','4a':'反事实','4b':'漂移','5a':'接保护环','5b':'一升一降','6b':'长尾'};
const FOCUS=new Set(['0a','0b','1a','1b','1c','1d','2b','5b','6b']);

const $=s=>document.querySelector(s);
const ORDER=['0a','0b','1a','1b','1c','1d','2a','2b','3a','4a','4b','5a','5b','6b'];
const ACTIONS={'0a':'先做一个直觉判断 →','0b':'开始 2×2 消融','1a':'下一步：分别单开测试','1b':'同时打开两个开关！','1c':'追问机制：为什么合在一起就抬高了？','1d':'剥开外壳，进入管内','2a':'查看电子真实落点账','2b':'锁定典型跨区电子 #6413','3a':'连续播放 4 次折返','4a':'继续看第 2 步：为什么越飞越远？','4b':'回到桌面，用保护环实测验明真伪','5a':'开启双通道对比曲线','5b':'记录第四章定案，全档自由复核','6b':'进入第五章 · 对称性的破缺与长尾 →'};
const COMBOS=[['cold',false,'00','两项都关','#b4c3cd'],['full',false,'10','仅开热初速',COLORS.thermal],['cold',true,'01','仅开灯丝压降',COLORS.gradient],['full',true,'11','两项都开',COLORS.full]];
const WINDOWS={4:[1.35,1.75],6:[2.45,2.85],8:[3.25,3.65],10:[3.85,4.15]};
const markdown=s=>esc(s).replace(/\*\*([\s\S]+?)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
const button=(id,text,attrs='')=>`<button data-do="${id}" ${attrs}>${text}</button>`;
const signed=v=>(v>0?'+':'')+v;

export function createChapter4(bridge,saved,asset,calibration) {
  const state={step:'0a',paragraph:0,voltage:10,field:4,prediction:null,seen:[],connected:false,delta:false,completed:false,view:'bench',pid:6413,time:0,counterEnabled:false,...saved};
  if(!ORDER.includes(state.step))state.step='0a';
  const measured=measuredCurves(asset,calibration),client=new PhysicsClient();
  let bundle,dialogue,alive=true,generation=0,trace=null,counter=null,mapping=null,zeroMap=null,rows=[],shown=new Map(),loading=false,playing=false,raf=0,lastFrame=0,near=false;
  const mapCache=new Map();const interaction=new AbortController();
  const listen=(el,event,fn)=>el.addEventListener(event,fn,{signal:interaction.signal});
  const persist=()=>bridge.save({...state,seen:[...state.seen]},state.completed?{completed:true,prediction:state.prediction,connected:state.connected,delta:state.delta}:null);
  const showNotice=text=>{$('#notice').textContent=text;$('#notice').hidden=false;clearTimeout(showNotice.timer);showNotice.timer=setTimeout(()=>$('#notice').hidden=true,4500);};
  const kind=()=>['2a','2b'].includes(state.step)?'map':['3a','4a','4b'].includes(state.step)?'trace':['5a','5b','6b'].includes(state.step)?'dual':'ablation';
  const presetKey=(launch,gradient)=>`${state.voltage}:${launch}:${+gradient}`;
  const parameters=()=>modelParameters(state.voltage,bundle.zero_measured[state.voltage].emission_uA,{field_mT:state.field});
  const emission=()=>bundle.zero_measured[state.voltage].emission_uA;
  const request=async url=>{const r=await fetch(url);if(!r.ok)throw new Error('该组数据暂时未能载入，请重试。');return r.json();};
  const getMap=async field=>{const key=`${state.voltage}:${field.toFixed(6)}`,file=bundle.maps[key];if(!file)throw new Error('此磁场的粒子映射需要运行计算服务。');if(!mapCache.has(file))mapCache.set(file,request('../assets/precomputed/'+file));return mapCache.get(file);};
  function paragraphs() {
    if(state.review){
      if(kind()==='trace'&&trace)return [`当前复核 $${state.voltage}\\ \\mathrm{V}$、$${state.field.toFixed(3)}\\ \\mathrm{mT}$ 下的 #${state.pid}。它从 $z_0=${trace.points[0][2].toFixed(2)}\\ \\mathrm{mm}$ 出发，经过 ${trace.radial_bounces} 次折返，在 ${trace.flight_ns.toFixed(2)} ns 后${trace.region==='central'?'抵达中央阳极':'结束飞行'}。拖动时间条，比较半径与轴向位置的变化。`];
      if(kind()==='map')return [`在 $${state.voltage}\\ \\mathrm{V}$ 下复核电子落点。移动磁场滑块，比较各段收集电极的变化；蓝点表示从 $K$ 侧出发、跨区进入中央阳极的电子。`];
      if(kind()==='ablation')return [`在 $${state.voltage}\\ \\mathrm{V}$ 下重新组合热初速与灯丝压降。每组曲线都按各自的零场收集电流归一化，可以直接比较截止前的细小变化。`];
    }
    if(kind()==='trace'&&trace&&(state.pid!==6413||state.voltage!==10))return [`当前选中 #${state.pid}：起点 $z_0=${trace.points[0][2].toFixed(2)}\\ \\mathrm{mm}$，${trace.radial_bounces} 次折返，飞行 ${trace.flight_ns.toFixed(2)} ns。播放或拖动时间条，对照它的径向折返与轴向迁移。${counter?`本地等势对照保留相同初态，在 ${counter.flight_ns.toFixed(2)} ns 后${counter.outcome===0?'返回灯丝':'结束飞行'}；可以在图中比较两条轨迹。`:''}`];
    let p=dialogue.steps[state.step]??[];
    if(state.step==='1a')p=[p.join('').split('（*出图后*）')[loading?0:1]??p[0]];
    // Commentary on a result waits until that result is on screen.
    if(state.step==='1b'&&!canAdvance())return ['分别单开「10 · 仅热初速」与「01 · 仅灯丝压降」：单独留下一项，截止前的隆起还在不在？'];
    if(state.step==='1c'&&loading)return ['两个开关同时打开，曲线正在生长……'];
    if(state.step==='5b')p=state.voltage===4?[p.at(-1).replace(/^\*（若切到.*?\）\*\s*/, '')]:p.slice(0,1);
    // Preserve every word, while giving longer authored paragraphs readable pages.
    const limit=innerWidth<1360?170:210,out=[];
    for(const raw of p){const sentences=raw.match(/[^。！？]+[。！？]?/g)??[raw];let page='',bold=false;
      for(const sentence of sentences){if(page.length+sentence.length>limit&&page){const open=(page.match(/\*\*/g)??[]).length%2;out.push(page+(open?'**':''));page=(open?'**':'')+sentence;}else page+=sentence;}
      if(page)out.push(page);
    }
    return out.length?out:[''];
  }
  function canAdvance() {
    if(loading)return false;
    if(kind()==='trace'&&!trace)return false;
    if(state.step==='0b')return state.prediction!==null;
    if(state.step==='1b')return ['full:0','cold:1'].every(c=>state.seen.includes(`${state.voltage}:${c}`));
    if(state.step==='4a')return !!counter;
    if(state.step==='5a')return state.connected;
    if(state.step==='5b')return state.delta;
    return true;
  }
  function renderDialogue() {
    const p=paragraphs();state.paragraph=Math.min(state.paragraph,p.length-1);
    $('#dialogue').innerHTML=`<p>${markdown(p[state.paragraph])}</p>`;renderMath($('#dialogue'));
    $('#dialog-page').textContent=p.length>1?`${state.paragraph+1} / ${p.length}`:'';
    $('#next').textContent=state.paragraph<p.length-1?'继续 →':ACTIONS[state.step];
    $('#next').disabled=state.paragraph<p.length-1?false:!canAdvance();
    $('#previous').disabled=state.step==='0a'&&state.paragraph===0;
    const blocked=state.paragraph===p.length-1&&!canAdvance();
    setWait(!blocked?'':loading?'计算中…':{'0b':'选一项直觉后继续','1b':'两组单开都完成后继续','5a':'接通保护环后继续','5b':'切到「与零场之差」后继续','4a':'正在计算本地等势对照…'}[state.step]??'');
  }
  // ---- Focus-card content: the main curve, a dedicated zoom (never an overlapping inset) and the working column.
  const card=(title,note,svg,hot=false)=>`<figure class="chart-card ${hot?'hot':''}"><div class="chart-bar"><strong>${title}</strong><span>${note}</span></div>${svg}</figure>`;
  const nearestRow=(rows,B)=>rows.reduce((a,b)=>Math.abs(b.field_mT-B)<Math.abs(a.field_mT-B)?b:a);
  function ablationSeries(V){
    const meas=measured[V],series=[{points:meas.rows.map(r=>[r.field_mT,100*r.A1_uA/meas.zero.A1_uA]),color:'#f0a57a',width:2.4}],legend=[['实测','#f0a57a']];
    for(const [key,rs] of shown){if(!key.startsWith(V+':')||!rs.length)continue;const c=COMBOS.find(([l,g])=>key===presetKey(l,g));const zero=bundle.ablations[key].rows[0].A1_uA;series.push({points:rs.map(r=>[r.field_mT,100*r.A1_uA/zero]),color:c?.[4]??'#d9a4d6',width:c?.[2]==='11'?2.6:2,dash:'7 4'});legend.push([c?`${c[2]} ${c[3]}`:'轴向初速',c?.[4]??'#d9a4d6']);}
    return {series,legend};
  }
  function cellValue(key){const rs=bundle.ablations[key]?.rows;if(!rs)return null;const r=nearestRow(rs,bundle.representatives[state.voltage].field_mT);return 100*r.A1_uA/rs[0].A1_uA-100;}
  function matrix(){
    const rep=bundle.representatives[state.voltage].field_mT;
    const cell=(launch,grad,code,label)=>{const key=presetKey(launch,grad),seen=state.seen.includes(key),running=loading&&state.runningKey===key,v=seen?cellValue(key):null;
      return button('ablation',`<i>${code} · ${label}</i><b>${running?'计算中':v===null?'—':signed(v.toFixed(2))+'%'}</b>`,`data-launch="${launch}" data-gradient="${+grad}" class="${seen?'done':''} ${seen&&code==='11'&&v>.5?'peak':''} ${running?'running':''}"`);};
    return `<div class="matrix"><span></span><span class="axis">灯丝压降 关</span><span class="axis">灯丝压降 开</span><span class="axis row">热初速 关</span>${cell('cold',false,'00','冷基准')}${cell('cold',true,'01','仅压降')}<span class="axis row">热初速 开</span>${cell('full',false,'10','仅热初速')}${cell('full',true,'11','两项都开')}</div><p class="matrix-note">格内：$B=${rep.toFixed(2)}\\ \\mathrm{mT}$ 处 $A_1$ 相对零场的变化</p>`;
  }
  function ablationSide(){
    let html='';
    if(state.step==='0a'){const m=measured[state.voltage],w=WINDOWS[state.voltage],peak=m.rows.filter(r=>r.field_mT>=w[0]&&r.field_mT<=w[1]).reduce((a,b)=>a.A1_uA>b.A1_uA?a:b);
      html=`<h2>第三章留下的疑点</h2><div class="evidence">${state.voltage} V 实测，截止之前<br>中央阳极在 $${peak.field_mT.toFixed(3)}\\ \\mathrm{mT}$ 抬高到零场的 <b>${(100*peak.A1_uA/m.zero.A1_uA).toFixed(2)}%</b>。</div><p class="small-note">两个候选来源都已在第三章纳入模型：$2000\\ \\mathrm{K}$ 的热初速，与灯丝两端 $3.68\\ \\mathrm{V}$ 的压降。</p>`;}
    else if(state.step==='0b'){html='<h2>保留你的直觉，随后对照</h2><div class="diagnoses">'+['只开“热初速”，就足以在截止前把电流抬高','只开“灯丝压降”，就足以把不同位置电子叠出峰值','两个条件都没法单独制造隆起，必须联手才行','两个开关加起来也做不出来，另有未知因素'].map((text,i)=>button('predict',`${'ABCD'[i]} · ${text}`,`data-value="${i}" aria-pressed="${state.prediction===i}"`)).join('')+'</div>'+button('skip-predict','跳过，直接做消融 →','class="text-button"');}
    else{
      html='<h2>热初速 × 灯丝压降</h2>'+matrix();
      if(loading)html+=`<div class="progress-track"><i style="width:${rows.length/(bundle.ablations[state.runningKey]?.rows.length??1)*100}%"></i></div><div class="button-row">${button('finish-scan','立即显示完整曲线')}</div>`;html+=`<details><summary>加做：仅轴向热初速</summary><p class="small-note">只保留轴向热初速，观察电子在不同收集区之间的迁移。</p>${button('axial','轴向热初速 + 灯丝压降')}</details>`;
      if(state.prediction!==null)html+=`<p class="small-note">你先前的直觉：${'ABCD'[state.prediction]}${['1c','1d'].includes(state.step)?' · 对照四格读数，判断是否改变？':''}</p>`;
      if(state.completed)html+=voltageButtons()+reviewLinks();
    }
    return `<div class="focus-side">${html}</div>`;
  }
  function ablationFocus(preserveSide=false){
    const V=state.voltage,{series,legend}=ablationSeries(V),w=WINDOWS[V],m=measured[V];
    const inWin=series.flatMap(s=>s.points.filter(p=>p[0]>=w[0]&&p[0]<=w[1]&&p[1]>98).map(p=>p[1]));
    const ymax=Math.max(102.5,Math.ceil((Math.max(...inWin,100)+.6)*2)/2),marks=[];
    const peak=m.rows.filter(r=>r.field_mT>=w[0]&&r.field_mT<=w[1]).reduce((a,b)=>a.A1_uA>b.A1_uA?a:b);
    marks.push({x:peak.field_mT,y:100*peak.A1_uA/m.zero.A1_uA,label:`实测 +${(100*peak.A1_uA/m.zero.A1_uA-100).toFixed(2)}% · ${peak.A1_uA.toFixed(2)} μA`,color:'#f2c073',anchor:'end',r:7});
    const full=presetKey('full',true);if(state.seen.includes(full)){const rep=bundle.representatives[V].field_mT,v=cellValue(full);marks.push({x:rep,y:100+v,label:`11 · ${signed(v.toFixed(2))}%`,color:COLORS.full,anchor:'end',dy:28});}
    const main=curveChart(series,{y:[0,110],ylabel:'I_{A1}/I_{A1}(0) / %',window:w,height:430,yticks:[0,20,40,60,80,100]});
    const zoom=curveChart(series,{x:w,y:[98.5,ymax],ylabel:'I_{A1}/I_{A1}(0) / %',height:430,marks});
    const html=`<div class="focus-grid three">${card(`${V} V · 中央阳极 $A_1$`,'实线：实测　虚线：模型',main)}${card('截止前局部放大',`$${w[0]}$–$${w[1]}\\ \\mathrm{mT}$ · 即第三章的 $I_M\\approx${((w[0]+.188)/4.231).toFixed(2)}$–$${((w[1]+.188)/4.231).toFixed(2)}\\ \\mathrm{A}$`,zoom,state.seen.includes(full))}${ablationSide()}</div>`;
    if(preserveSide&&$('#chart .focus-side')){
      const template=document.createElement('template');template.innerHTML=html;
      const oldCards=$('#chart').querySelectorAll('.chart-card'),newCards=template.content.querySelectorAll('.chart-card');
      oldCards.forEach((node,i)=>node.replaceWith(newCards[i]));
    }else renderPanel($('#chart'),html);
    return legend;
  }
  function dualFocus(){
    const V=state.voltage,meas=measured[V],keys=state.connected?['A1','A2','sum']:['A1'],isEnding=state.step==='6b';
    const series=keys.map(c=>({points:meas.rows.map(r=>[r.field_mT,r[c+'_uA']-(state.delta?meas.zero[c+'_uA']:0)]),color:COLORS[c],width:c==='sum'?2.8:2}));
    const model=bundle.ablations[presetKey('full',true)].rows;
    if(isEnding)for(const [key,color] of [['A1_uA',COLORS.A1],['A2_uA',COLORS.A2]])series.push({points:model.map(r=>[r.field_mT,r[key]]),color,dash:'7 4',opacity:.85});
    const main=curveChart(series,{y:state.delta?[-meas.zero.sum_uA*1.05,2]:[0,meas.zero.sum_uA*1.1],ylabel:state.delta?'\\Delta I / \\mu\\mathrm{A}':'I / \\mu\\mathrm{A}',window:V===10?[0,3.870]:null,cursor:state.field,height:430});
    let zoom,title,note;
    if(isEnding){const end=meas.rows.at(-1);title='高场端局部放大';note='模型虚线已贴地';zoom=curveChart(series,{x:[5.0,5.8],y:[0,7],ylabel:'I / \\mu\\mathrm{A}',height:430,marks:[{x:end.field_mT,y:end.A1_uA,label:`A₁ ${end.A1_uA.toFixed(3)} μA`,color:COLORS.A1,anchor:'end'},{x:end.field_mT,y:end.A2_uA,label:`A₂ ${end.A2_uA.toFixed(3)} μA`,color:COLORS.A2,anchor:'end'},{x:5.735,y:0,label:'模型 0.000',color:'#c9d3da',anchor:'end',dy:-8}]});}
    else if(state.delta){const r=meas.rows[nearestMeasured()],peak=meas.rows.reduce((a,b)=>a.A1_uA>b.A1_uA?a:b);title='一升一降的对照窗口';note=`光标 $${r.field_mT.toFixed(3)}\\ \\mathrm{mT}$`;
      zoom=curveChart(series,{x:[Math.max(0,peak.field_mT-.65),peak.field_mT+.08],y:[-.6,.6],ylabel:'\\Delta I / \\mu\\mathrm{A}',cursor:state.field,height:430,marks:['A1','A2','sum'].map((c,i)=>({x:r.field_mT,y:r[c+'_uA']-meas.zero[c+'_uA'],label:`${c==='sum'?'Σ':c==='A1'?'A₁':'A₂'} ${signed((r[c+'_uA']-meas.zero[c+'_uA']).toFixed(3))}`,color:COLORS[c],anchor:'end',dy:[-9,16,-9][i]}))});}
    else{const w=WINDOWS[V];title='截止前局部放大';note='物理电流';const vals=series.flatMap(s=>s.points.filter(p=>p[0]>=w[0]-.3&&p[0]<=w[1]).map(p=>p[1]));zoom=curveChart(series,{x:[w[0]-.3,w[1]],y:[Math.floor(Math.min(...vals)*.98),Math.ceil(Math.max(...vals)*1.02)],ylabel:'I / \\mu\\mathrm{A}',cursor:state.field,height:430});}
    renderPanel($('#chart'),`<div class="focus-grid three">${card(state.delta?'与零场之差':'双通道实测收集电流',isEnding?'实线：实测　虚线：零倾角模型（零场分配差异留待第六章）':V===10?'阴影：截止起始前':'',main)}${card(title,note,zoom,state.delta||isEnding)}<div class="focus-side">${dualSide()}</div></div>`);
    const legend=keys.map(c=>[c==='sum'?'两路之和':c==='A1'?'中央阳极 A₁':'保护环 A₂',COLORS[c]]);
    if(isEnding)legend.push(['虚线：零倾角模型','#c9d3da']);
    return legend;
  }
  function dualSide(){
    let html=`<div class="segmented">${button('physical','物理电流',`aria-pressed="${!state.delta}"`)}${button('delta','与零场之差 ΔI',`aria-pressed="${state.delta}" ${state.connected?'':'disabled'}`)}</div>`;
    if(!state.connected)html+=`<div class="button-row">${button('connect','接通保护环监测','class="primary"')}</div>`;else if(state.step==='5a')html+=`<div class="evidence">保护环已接入 $1\\ \\mathrm{k}\\Omega$ 取样电阻与上排毫伏表。</div>`;
    html+=voltageButtons();
    html+=`<div class="control-row"><label for="measured-field">实测磁场</label><input id="measured-field" type="range" min="0" max="${measured[state.voltage].rows.length-1}" value="${nearestMeasured()}"><output>${state.field.toFixed(3)} mT</output></div>`;
    if(state.delta&&state.connected){const m=measured[state.voltage],r=m.rows[nearestMeasured()];html+=`<div class="transfer"><div class="gain"><small>$\\Delta A_1$ / μA</small><strong>${signed((r.A1_uA-m.zero.A1_uA).toFixed(3))}</strong></div><div><small>$\\Delta A_2$ / μA</small><strong>${signed((r.A2_uA-m.zero.A2_uA).toFixed(3))}</strong></div><div><small>两路之和 / μA</small><strong>${signed((r.sum_uA-m.zero.sum_uA).toFixed(3))}</strong></div></div>`;}
    if(state.step==='6b'){const m=measured[state.voltage],end=m.rows.at(-1);html+=`<div class="evidence">高场末端，实测仍保留 $A_1$ ${(100*end.A1_uA/m.zero.A1_uA).toFixed(2)}% 与 $A_2$ ${(100*end.A2_uA/m.zero.A2_uA).toFixed(2)}% 的收集电流；同轴热模型的两路均已归零。</div>`;}
    if(state.completed)html+=reviewLinks();
    return html;
  }
  function mapSide(){
    const fields=Object.keys(bundle.maps).filter(key=>key.startsWith(state.voltage+':')).map(k=>Number(k.split(':')[1])).sort((a,b)=>a-b);
    let html=`<div class="control-row"><label for="map-field">磁场 $B$</label><input id="map-field" type="range" min="0" max="${fields.length-1}" step="1" value="${Math.max(0,fields.indexOf(state.field))}"><output>${state.field.toFixed(3)} mT</output></div>`;
    if(mapping&&zeroMap){const d=transferDifference(zeroMap,mapping);html+=`<h2>中央阳极的进出账（与零场比）</h2><div class="transfer"><div><small>$H \\to A_1$</small><strong>${signed(d.H)}</strong></div><div><small>$A_1$ 留存变化</small><strong>${signed(d.central)}</strong></div><div class="gain"><small>$K \\to A_1$</small><strong>${signed(d.K)}</strong></div></div><p class="net">中央阳极净增 <b>${signed(d.net)} 颗 · ${signed(d.percent.toFixed(2))}%</b></p>`;}
    html+=`<div class="button-row">${button('representative',`跟踪 #${bundle.representatives[state.voltage].particle_id}`)}${state.voltage===10?button('other-particle','#2907 · 8 次折返'):''}</div><p class="small-note">也可以直接点选图中任一颗蓝色跨区电子。</p>`;
    return html;
  }
  const reviewLinks=()=>`<div class="button-row review-links">${[['1a','消融'],['2a','落点流'],['3a','单电子'],['5b','双通道']].map(([s,t])=>button('review',t,`data-step="${s}"`)).join('')}</div>`;
  function plot(preserveSide=false) {
    const k=kind(),V=state.voltage,meas=measured[V];let legend=[];
    const focus=k==='ablation'||(k==='dual'&&['5b','6b'].includes(state.step));
    $('#voltage-badge').textContent=`${V} V`;
    if(k==='ablation'){
      $('#chart-title').textContent=state.step==='0a'||state.step==='0b'?'截止前的隆起：从实测出发':'控制变量消融 · 中央阳极收集电流';
      legend=ablationFocus(preserveSide);
    }else if(k==='map'){
      $('#chart-title').textContent='起飞位置 → 收集位置';
      const map=mapping?mapChart(mapping,V,state.field,state.pid):'<p class="small-note">正在载入粒子落点…</p>';
      renderPanel($('#chart'),FOCUS.has(state.step)?`<div class="focus-grid two map-focus">${card(`${V} V · $B=${state.field.toFixed(3)}\\ \\mathrm{mT}$ 全部 8192 颗电子`,'蓝点：从 K 侧起飞、落进中央阳极',map,true)}<div class="focus-side">${mapSide()}${state.completed?voltageButtons()+reviewLinks():''}</div></div>`:map);
      legend=[['跨区进入中央阳极',COLORS.A1],['就近收集',COLORS.full],['其他落点','#8d9da9']];
    }else if(k==='trace'){
      $('#chart-title').textContent=`#${state.pid} · 折返与轴向迁移`;
      renderPanel($('#chart'),trace?traceChart(trace,counter,state.time):'<p class="small-note">正在读取电子轨迹…</p>');
      legend=[['保留灯丝电势梯度',COLORS.A1],...(counter?[['本地等势对照','#ff9a5a']]:[]),['峰顶外极值',COLORS.full]];
    }else if(focus){
      $('#chart-title').textContent=state.step==='6b'?'截止之后：高场余流':'保护环与中央阳极：一升一降';
      legend=dualFocus();
    }else{
      $('#chart-title').textContent='双通道实测收集电流';
      const keys=state.connected?['A1','A2','sum']:['A1'];const series=keys.map(c=>({points:meas.rows.map(r=>[r.field_mT,r[c+'_uA']]),color:COLORS[c],width:c==='sum'?2.8:2}));
      renderPanel($('#chart'),curveChart(series,{y:[0,meas.zero.sum_uA*1.1],ylabel:'I / \\mu\\mathrm{A}',window:V===10?[0,3.870]:null,cursor:state.field}));
      legend=keys.map(c=>[c==='sum'?'两路之和':c==='A1'?'中央阳极 A₁':'保护环 A₂',COLORS[c]]);
    }
    $('#legend').innerHTML=legend.map(([label,color])=>`<span style="--color:${color}">${label}</span>`).join('');
    renderMath($('#chart'));
  }
  function voltageButtons(){return `<div class="button-row" aria-label="加速电压">${[4,6,8,10].map(V=>button('voltage',`${V} V`,`data-voltage="${V}" aria-pressed="${V===state.voltage}"`)).join('')}</div>`;}
  function controls() {
    const k=kind();let html='';
    if(k==='ablation'||(k==='dual'&&['5b','6b'].includes(state.step))){renderPanel($('#controls'),'');return;}
    if(k==='map'){
      if(FOCUS.has(state.step)){renderPanel($('#controls'),'');return;}
      html=mapSide();
    }else if(false){
      const fields=Object.keys(bundle.maps).filter(key=>key.startsWith(state.voltage+':')).map(k=>Number(k.split(':')[1])).sort((a,b)=>a-b);
      html=`<div class="control-row"><label for="map-field">磁场 $B$</label><input id="map-field" type="range" min="0" max="${fields.length-1}" step="1" value="${Math.max(0,fields.indexOf(state.field))}"><output>${state.field.toFixed(3)} mT</output></div>`;
      if(mapping&&zeroMap){const d=transferDifference(zeroMap,mapping);html+=`<div class="transfer"><div><small>$H \\to A_1$</small><strong>${signed(d.H)}</strong></div><div><small>$A_1$ 留存变化</small><strong>${signed(d.central)}</strong></div><div class="gain"><small>$K \\to A_1$</small><strong>${signed(d.K)}</strong></div></div><p class="net">与零场相比：中央阳极净增 <b>${signed(d.net)} 颗 · ${signed(d.percent.toFixed(2))}%</b></p>`;}
      html+=`<div class="button-row">${button('representative',`跟踪 #${bundle.representatives[state.voltage].particle_id}`)}${state.voltage===10?button('other-particle','#2907 · 8 次折返'):''}</div><p class="small-note">也可以直接点选图中任一颗蓝色跨区电子。</p>`;
    }else if(k==='trace'){
      html=trace?`<div class="trace-stats"><span>飞行 <b>${trace.flight_ns.toFixed(2)} ns</b></span><span>折返 <b>${trace.radial_bounces} 次</b></span><span>到达 <b>${trace.region==='central'?'中央阳极':trace.region}</b></span></div><div class="control-row"><label for="trace-time">时间</label><input id="trace-time" type="range" min="0" max="${trace.flight_ns}" step="0.01" value="${state.time}"><output id="time-output">${state.time.toFixed(2)} ns</output></div><div class="button-row">${button('play',playing?'暂停':'▶ 播放')}${button('first-peak','首次极值')}${button('next-peak','下一圈 →')}${state.voltage===10?button('other-particle',state.pid===2907?'换看 #6413':'换看 #2907'):''}</div>`:'';
      if(['4a','4b'].includes(state.step)||state.completed)html+=`<label class="switch"><input id="counterfactual" type="checkbox" ${counter?'checked':''}>反事实：关梯度，取本地等势 $U_{\\mathrm{loc}}$</label>`;
      if(counter)html+=`<div class="evidence">本地压差 ${counter.U_loc?.toFixed(3)??'—'} V · ${counter.radial_bounces} 次折返 · ${counter.flight_ns.toFixed(2)} ns 后${counter.outcome===0?'返回灯丝':counter.region==='central'?'到达中央阳极':'结束飞行'}</div>`;
      if(state.step==='4b'&&trace)html+=`<details><summary>展开积分账</summary><p class="small-note">$W_r = ${trace.radial_work_eV.toFixed(3)}\\ \\mathrm{eV}$，$W_z = ${trace.axial_work_eV.toFixed(3)}\\ \\mathrm{eV}$。沿实际轨迹分别积分径向与轴向电场做功。</p></details>`;
    }else html=dualSide();
    if(state.completed&&k!=='dual')html+=voltageButtons()+reviewLinks();
    renderPanel($('#controls'),html);renderMath($('#controls'));
  }
  function nearestMeasured(){const a=measured[state.voltage].rows;return a.reduce((best,r,i)=>Math.abs(r.field_mT-state.field)<Math.abs(a[best].field_mT-state.field)?i:best,0);}
  function power(measurement=false) {
    if(measurement){const r=measured[state.voltage].rows[nearestMeasured()];bridge.update({heater:true,accelerator:true,magnet:true,current:r.im,coilVoltage:r.v1,reading:r.A1_uA,guardEnabled:state.connected,guardReading:r.A2_uA,acceleratingVoltage:r.ua,filamentVoltage:r.uf,filamentCurrent:r.if,fieldMT:r.field_mT,actualPoint:true});}
    else bridge.update({heater:true,accelerator:true,magnet:true,current:(state.field+.188)/4.231,coilVoltage:40*(state.field+.188)/4.231,reading:measured[state.voltage].rows[nearestMeasured()].A1_uA,guardEnabled:state.connected,acceleratingVoltage:state.voltage,filamentVoltage:3.68,filamentCurrent:.599,fieldMT:state.field,actualPoint:true});
  }
  function stageText(){
    const k=kind();$('#phase').textContent={ablation:'控制变量消融',map:'落点流与截止区',trace:'单电子微观追踪',dual:'双通道实测验证'}[k];
    $('#view-bench').setAttribute('aria-pressed',state.view==='bench');$('#view-tube').setAttribute('aria-pressed',state.view==='tube');$('#view-near').hidden=state.view!=='tube';
    $('#stage-caption').innerHTML=state.view==='tube'?`<span>$H$ 端 · 0 V</span>　→　<span>$K$ 端 · +3.68 V</span><br><span class="small-note">$+z$ 指向 $K$ 端${k==='map'?` · 首飞截止区：$z > ${cutoffPosition(state.field,state.voltage).toFixed(2)}\\ \\mathrm{mm}$`:''}</span>`:'';renderMath($('#stage-caption'));
    if(k==='trace'&&trace){const p=trace.points[traceIndex(trace,state.time)];$('#scene-readout').innerHTML=`<div><small>飞行时间</small><strong>${state.time.toFixed(2)} ns</strong></div><div><small>半径 r</small><strong>${p[3].toFixed(3)} mm</strong></div><div><small>轴向位置 z</small><strong>${p[2].toFixed(2)} mm</strong></div>`;}
    else if(k==='dual'){const r=measured[state.voltage].rows[nearestMeasured()];$('#scene-readout').innerHTML=`<div><small>中央阳极 · mV</small><strong>${r.A1_uA.toFixed(3)}</strong></div><div><small>保护环 · mV</small><strong>${state.connected?r.A2_uA.toFixed(3):'----'}</strong></div>`;}
    else $('#scene-readout').innerHTML='';
  }
  function render(){if(!alive||!bundle)return;document.body.dataset.kind=kind();
    setLayout(FOCUS.has(state.step)?'focus':'scene');setProgress(ORDER,state.step,NAMES);renderClues(4,state.completed?ORDER.length-1:ORDER.indexOf(state.step));
    setHint(state.review?'自由复核：切换电压，或回到任一环节':HINTS[state.step]);
    plot();controls();renderDialogue();stageText();$('#free-review').hidden=!state.completed;$('#free-review').textContent='自由复核';}
  async function view(mode,{focus=true}={}){
    state.view=mode;const token=generation;
    if(mode==='bench')bridge.research({enabled:false});
    await bridge.view(mode);
    if(!alive||token!==generation)return;
    if(mode==='tube')bridge.research({enabled:true,cutoff:[state.field,state.voltage,3.68],trace:kind()==='trace'?trace:null,counter,time:state.time,...(focus?{focus:'all'}:{})});
    power(kind()==='dual');stageText();persist();
  }
  function scan(launch,gradient) {
    const key=presetKey(launch,gradient),preset=bundle.ablations[key];loading=true;rows=[];state.runningKey=key;shown.set(key,rows);render();
    client.scan(preset.params,{preset,onPreview:()=>{},onRow:(row)=>{rows.push(row);plot(true);const i=$('.progress-track i');if(i)i.style.width=100*rows.length/preset.rows.length+'%';},onDone:()=>{loading=false;if(!state.seen.includes(key))state.seen.push(key);render();persist();},onError:error=>{loading=false;showNotice(error.message);render();}});
  }
  async function loadMap(){const token=++generation;loading=true;renderDialogue();try{const [m,z]=await Promise.all([getMap(state.field),getMap(0)]);if(!alive||token!==generation)return;mapping=m;zeroMap=z;bridge.research({cutoff:[state.field,state.voltage,3.68]});}catch(e){showNotice(e.message);}finally{if(token===generation){loading=false;render();}}}
  async function loadTrace(pid=state.pid,{first=false}={}) {
    const token=++generation;state.pid=pid;loading=true;trace=null;counter=null;render();
    const key=`${state.voltage}:${state.field.toFixed(6)}:${pid}`;
    try{const result=bundle.traces[key]??await client.trace(parameters(),pid);if(!alive||token!==generation)return;trace=result.trace??result;state.time=first?trace.points[radialMaxima(trace)[0]??0][4]:Math.min(state.time,trace.flight_ns);bridge.research({trace,time:state.time});}
    catch(e){showNotice('这颗电子需要计算服务。可选择右侧已备好的代表电子。');}
    finally{if(token===generation){loading=false;render();}}
  }
  async function localCounter(on){
    if(!trace)return;state.counterEnabled=on;if(!on){counter=null;bridge.research({trace,counter:null,time:state.time});render();persist();return;}
    const token=++generation;loading=true;renderDialogue();
    try{const key=`${state.voltage}:${state.field.toFixed(6)}:${state.pid}:local`,result=bundle.traces[key]??await client.localTrace(parameters(),trace.initial_state);if(!alive||token!==generation)return;counter=result.trace??result;counter.U_loc??=parameters().anode_V-parameters().filament_V*(trace.initial_state[2]/(parameters().length_mm*1e-3)+.5);bridge.research({trace,counter,time:state.time});}
    catch(e){showNotice(e.message);}finally{if(token===generation){loading=false;render();persist();}}
  }
  function stopPlayback(){playing=false;cancelAnimationFrame(raf);const button=$('[data-do="play"]');if(button)button.textContent='▶ 播放';}
  function setTime(t){if(!trace)return;state.time=Math.min(trace.flight_ns,Math.max(0,t));bridge.research({time:state.time});plot();stageText();const slider=$('#trace-time');if(slider)slider.value=state.time;const out=$('#time-output');if(out)out.textContent=state.time.toFixed(2)+' ns';}
  function play(advance=false){
    if(!trace)return;if(playing){stopPlayback();controls();return;}playing=true;if(state.time>=trace.flight_ns-.001)setTime(0);const from=state.time,start=performance.now(),duration=8000*(trace.flight_ns-from)/trace.flight_ns;controls();
    const tick=now=>{if(!playing||!alive)return;const u=Math.min(1,(now-start)/duration);if(now-lastFrame>35||u===1){setTime(from+(trace.flight_ns-from)*u);lastFrame=now;}if(u<1)raf=requestAnimationFrame(tick);else{playing=false;controls();persist();if(advance&&state.step==='3a')enter('4a');}};raf=requestAnimationFrame(tick);
  }
  async function enter(step,{restore=false}={}){
    generation++;stopPlayback();client.cancel();loading=false;state.step=step;setDrawer(true);if(!restore)state.paragraph=0;render();persist();
    if(['1a','1c'].includes(step)){scan(step==='1a'?'cold':'full',step==='1c');await view('bench');}
    else if(['2a','2b'].includes(step)){if(step==='2a'&&!restore){state.field=bundle.representatives[state.voltage].field_mT;state.pid=bundle.representatives[state.voltage].particle_id;}await loadMap();await view('tube');}
    else if(step==='3a'){if(!restore){const rep=bundle.representatives[state.voltage];state.field=rep.field_mT;state.pid=rep.particle_id;}await loadTrace(state.pid,{first:!restore});await view('tube');}
    else if(['4a','4b'].includes(step)){if(!trace)await loadTrace();await view('tube',{focus:restore});if(step==='4a'||state.counterEnabled)await localCounter(true);if(step==='4b'&&trace)setTime(trace.flight_ns);}
    else if(['5a','5b','6b'].includes(step)){if(step==='5b'&&!restore)state.field=3.870;if(step==='6b'){state.completed=true;state.field=5.735;state.delta=false;}await view('bench');power(true);if(step==='5a'&&!state.connected)bridge.focus('standby');persist();render();}
    else {await view('bench');render();}
    if(!restore)revealInstruction();
  }
  async function advance(){
    const p=paragraphs();if(state.paragraph<p.length-1){state.paragraph++;renderDialogue();revealInstruction();persist();return;}
    if(!canAdvance())return;
    if(state.step==='3a'){if(state.time>=trace.flight_ns-.001)await enter('4a');else play(true);return;}
    if(state.step==='6b'){bridge.finish();return;}
    await enter(ORDER[ORDER.indexOf(state.step)+1]);
  }
  async function action(target){
    const id=target.dataset.do;
    if(id==='predict'){state.prediction=Number(target.dataset.value);render();persist();}
    if(id==='skip-predict')enter('1a');
    if(id==='ablation')scan(target.dataset.launch,Boolean(Number(target.dataset.gradient)));
    if(id==='axial')scan('axial',true);
    if(id==='finish-scan')client.finish();
    if(id==='representative'){const rep=bundle.representatives[state.voltage];state.pid=rep.particle_id;state.field=rep.field_mT;await enter('3a',{restore:true});}
    if(id==='other-particle'){state.pid=state.pid===2907?6413:2907;state.field=state.pid===2907?4.075:4;state.step='3a';state.paragraph=0;await loadTrace(state.pid,{first:true});await view('tube');persist();}
    if(id==='play')play();
    if(id==='first-peak'){stopPlayback();setTime(trace.points[radialMaxima(trace)[0]][4]);controls();}
    if(id==='next-peak'){stopPlayback();const i=radialMaxima(trace).find(i=>trace.points[i][4]>state.time+.001)??trace.points.length-1;setTime(trace.points[i][4]);controls();}
    if(id==='connect'){state.connected=true;power(true);bridge.focus('standby');render();persist();}
    if(id==='delta'||id==='physical'){state.delta=id==='delta';render();persist();}
    if(id==='review'){state.review=true;await enter(target.dataset.step);}
    if(id==='voltage'){state.voltage=Number(target.dataset.voltage);state.paragraph=0;if(kind()==='map'||kind()==='trace'){const rep=bundle.representatives[state.voltage];state.field=rep.field_mT;state.pid=rep.particle_id;await enter(kind()==='map'?'2a':'3a');}else if(kind()==='ablation'){shown.clear();scan('full',true);}else{const a=measured[state.voltage].rows,peak=a.reduce((best,r,i)=>r.A1_uA>a[best].A1_uA?i:best,0);state.field=state.step==='6b'?a.at(-1).field_mT:a[Math.max(0,peak-3)].field_mT;power(true);render();}persist();}
  }
  listen($('#next'),'click',advance);
  listen($('#previous'),'click',()=>{if(state.paragraph>0){state.paragraph--;renderDialogue();persist();}else enter(ORDER[Math.max(0,ORDER.indexOf(state.step)-1)]);});
  listen($('#analysis'),'click',e=>{const b=e.target.closest('[data-do]');if(b&&!b.disabled)action(b).catch(e=>showNotice(e.message));});
  listen($('#analysis'),'input',e=>{if(e.target.id==='trace-time'){stopPlayback();setTime(Number(e.target.value));persist();}if(e.target.id==='map-field'){const a=Object.keys(bundle.maps).filter(k=>k.startsWith(state.voltage+':')).map(k=>Number(k.split(':')[1])).sort((a,b)=>a-b);state.field=a[Number(e.target.value)];e.target.nextElementSibling.textContent=state.field.toFixed(3)+' mT';loadMap();persist();}if(e.target.id==='measured-field'){state.field=measured[state.voltage].rows[Number(e.target.value)].field_mT;power(true);plot();stageText();controls();persist();}});
  listen($('#analysis'),'change',e=>{if(e.target.id==='counterfactual')localCounter(e.target.checked);});
  const particleClick=async e=>{const node=e.target.closest('[data-particle]');if(!node)return;state.step='3a';state.paragraph=0;await loadTrace(Number(node.dataset.particle),{first:true});await view('tube');persist();};
  listen($('#chart'),'click',particleClick);listen($('#chart'),'keydown',e=>{if(e.key==='Enter')particleClick(e);});
  listen($('#dock-book'),'click',bridge.book);listen($('#menu'),'click',bridge.menu);listen($('#reset'),'click',()=>state.view==='tube'?bridge.research({focus:'all'}):bridge.reset());
  listen($('#view-bench'),'click',()=>view('bench'));listen($('#view-tube'),'click',()=>view('tube'));listen($('#view-near'),'click',()=>{near=!near;bridge.research({focus:near?'near':'all'});$('#view-near').textContent=near?'标准全景':'阳极近壁放大';});
  listen($('#free-review'),'click',()=>{state.review=true;enter('1a');});
  listen($('#detail-close'),'click',()=>$('#detail').close());
  return {
    async begin(){[bundle,dialogue]=await Promise.all([request('../assets/precomputed/ch4_baseline.json'),request('./ch4-dialogue.json')]);if(!alive)return;for(const key of state.seen)if(bundle.ablations[key])shown.set(key,bundle.ablations[key].rows);await enter(state.step,{restore:true});},
    suspend(){alive=false;generation++;client.cancel();stopPlayback();interaction.abort();clearTimeout(showNotice.timer);bridge.research({enabled:false});},
    getState:()=>structuredClone(state),
    getDebug:()=>({state:structuredClone(state),loading,playing,map:mapping?{field:mapping.row.field_mT,particles:mapping.particles.length,transfer:zeroMap?transferDifference(zeroMap,mapping):null}:null,trace:trace?{pid:state.pid,flight_ns:trace.flight_ns,bounces:trace.radial_bounces}:null,counter:counter?{flight_ns:counter.flight_ns,bounces:counter.radial_bounces,params:counter.request_params}:null,rows:rows.map(r=>r.field_mT)}),
    pick:tag=>{if(state.step==='5a'&&(tag.part==='standby'||tag.lead==='L4'))action({dataset:{do:'connect'}});},
  };
}
