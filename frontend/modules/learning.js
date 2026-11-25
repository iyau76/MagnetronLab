import { criticalFieldMilliTesla, chargeToMass, idealCurrent, idealTrajectory, ELECTRON_CHARGE_TO_MASS } from './ideal-physics.js';

const STAGES = [
  ['apparatus', '认识装置', '分清三路电源与两路电流'],
  ['principle', '作出预测', '把临界轨迹与截止联系起来'],
  ['calibration', '标定磁场', '从励磁电流得到磁场'],
  ['measurement', '测量比荷', '扫描、判断截止、重复测量'],
  ['reality', '走向真实', '带着自己的预测进入探索'],
];
const GEOMETRY = { anodeRadiusMm: 4.55, filamentRadiusUm: 37.5 };
const INSTRUMENT = { slopeMTPerA: 4.23, interceptMT: 0.015, readingResolutionMT: 0.001 };
const DRAFT_KEY='magnetron-learning-draft-v1';
const DRAFT_FIELDS=['stage','part','heater','accelerator','magnet','voltageV','fieldMT','prediction','predictionSubmitted','predictionVoltage','predictions','calCurrent','calRows','calibration','measurementCurrent','scanStep','scans','results','selectedLower','selectedUpper','serial','note'];
const fmt = (value, digits = 3) => Number(value).toFixed(digits);
const esc = text => String(text).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const button = (action, label, kind = '', attrs = '') => `<button type="button" class="ll-btn ${kind}" data-action="${action}" ${attrs}>${label}</button>`;
const fitLine = rows => {
  const n = rows.length, mx = rows.reduce((s, p) => s + p.x, 0) / n, my = rows.reduce((s, p) => s + p.y, 0) / n;
  const xx = rows.reduce((s,p) => s + (p.x-mx)**2,0), xy = rows.reduce((s,p) => s + (p.x-mx)*(p.y-my),0);
  if (!xx) return null;
  const slope = xy / xx, intercept = my - slope*mx;
  const residuals = rows.map(p => p.y - slope*p.x - intercept), residualRMS = Math.sqrt(residuals.reduce((s,r)=>s+r*r,0)/n);
  return { slope, intercept, residualRMS, n };
};

function plot({ rows = [], xMax = 1.6, yMax = 7, xLabel, yLabel, line, lines = [], highlight, pointClick = false }) {
  const w=600,h=240,l=58,r=22,t=18,b=42,pw=w-l-r,ph=h-t-b;
  const sx=x=>l+x/xMax*pw, sy=y=>t+ph-y/yMax*ph;
  let body='';
  for(let i=0;i<=4;i++){
    const x=l+pw*i/4,y=t+ph*i/4;
    body+=`<path d="M ${x} ${t} V ${t+ph} M ${l} ${y} H ${l+pw}" class="ll-gridline"/><text x="${x}" y="${h-26}" text-anchor="middle">${fmt(xMax*i/4, xMax>20?0:2)}</text><text x="${l-9}" y="${y+4}" text-anchor="end">${fmt(yMax*(1-i/4),yMax>20?0:1)}</text>`;
  }
  body+=`<svg x="${l}" y="${t}" width="${pw}" height="${ph}" viewBox="${l} ${t} ${pw} ${ph}" overflow="hidden">`;
  if(highlight) body+=`<rect x="${sx(highlight[0])}" y="${t}" width="${Math.max(1,sx(highlight[1])-sx(highlight[0]))}" height="${ph}" class="ll-interval"/>`;
  if(line) lines=[...lines,{points:[{x:0,y:line.intercept},{x:xMax,y:line.slope*xMax+line.intercept}],color:'#cb8c42'}];
  for(const curve of lines) body+=`<polyline points="${curve.points.map(p=>`${sx(p.x)},${sy(p.y)}`).join(' ')}" fill="none" stroke="${curve.color||'#277b79'}" stroke-width="2" ${curve.dashed?'stroke-dasharray="6 5"':''}/>`;
  body+=rows.map((p,i)=>`<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="${pointClick?5:4}" fill="${p.color||'#277b79'}" ${pointClick?`data-action="select-point" data-index="${i}" tabindex="0" role="button" aria-label="记录 ${i+1}：${fmt(p.x)}，${fmt(p.y)}"`:''}><title>${fmt(p.x,4)} · ${fmt(p.y,4)}</title></circle>`).join('');
  body+='</svg>';
  return `<svg class="ll-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(yLabel)}与${esc(xLabel)}关系图">${body}<text x="${l+pw/2}" y="${h-5}" text-anchor="middle">${xLabel}</text><text transform="translate(15 ${t+ph/2}) rotate(-90)" text-anchor="middle">${yLabel}</text></svg>`;
}

// 接线图：教科书画法。标准元件符号（电源＝长短线、取样电阻＝矩形、电压表＝圆圈）、
// 正交导线、实心结点；电流方向另加箭头。几何与真实接线一致：CH3 跨 K–H，
// CH1 驱动线圈，CH2 正端经两段 1 kΩ 取样电阻接到 A₁ 与 A₂、负端接 H。
function schematic(state){
  const live=['heater','accelerator','magnet'].filter(key=>state[key]).join(' ');
  return `<svg class="ll-schematic" viewBox="0 0 840 520" data-part="${state.part}" data-live="${live}" role="img" aria-label="磁控二极管接线图：三路电源、两段 1 kΩ 取样电阻与两块电压表"><defs><pattern id="llHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#a9b5ad" stroke-width="1.3"/></pattern></defs><rect class="ll-coil" x="50" y="118" width="30" height="96" fill="url(#llHatch)"/><rect class="ll-coil" x="50" y="266" width="30" height="96" fill="url(#llHatch)"/><rect class="ll-coil" x="206" y="118" width="30" height="96" fill="url(#llHatch)"/><rect class="ll-coil" x="206" y="266" width="30" height="96" fill="url(#llHatch)"/><rect class="ll-envelope" x="85" y="95" width="120" height="290" rx="60"/><path class="ll-part lead-heater" d="M145 118 V362"/><rect class="ll-part lead-guard" x="122" y="135" width="8" height="45"/><rect class="ll-part lead-guard" x="160" y="135" width="8" height="45"/><rect class="ll-part lead-anode" x="122" y="210" width="8" height="60"/><rect class="ll-part lead-anode" x="160" y="210" width="8" height="60"/><rect class="ll-part lead-guard" x="122" y="300" width="8" height="45"/><rect class="ll-part lead-guard" x="160" y="300" width="8" height="45"/><path class="ll-wire lead-guard-wire" d="M168 157 L300 157"/><path class="ll-wire lead-anode-wire" d="M168 240 L300 240"/><path class="ll-wire " d="M168 322 L262 322 L262 157"/><circle class="ll-junction" cx="262" cy="157" r="3.2"/><path class="ll-wire circ circ-heater" d="M145 118 L145 58 L30 58 L30 236"/><g class="ll-source circ-heater"><path d="M11 236 H49"/><path d="M21 252 H39"/></g><path class="ll-wire circ circ-heater circ-accelerator" d="M30 252 L30 430 L700 430"/><path class="ll-wire circ circ-heater" d="M145 430 L145 362"/><circle class="ll-junction" cx="145" cy="430" r="3.2"/><path class="ll-wire circ circ-accelerator" d="M300 157 L330 157"/><path class="ll-wire circ circ-accelerator" d="M386 157 L500 157 L500 240"/><path class="ll-wire circ circ-accelerator" d="M300 240 L330 240"/><path class="ll-wire circ circ-accelerator" d="M386 240 L500 240"/><circle class="ll-junction" cx="500" cy="240" r="3.2"/><path class="ll-arrow" d="M304 152 L314 157 L304 162"/><path class="ll-arrow" d="M304 235 L314 240 L304 245"/><rect class="ll-res" x="330" y="147.5" width="56" height="19"/><path class="ll-wire " d="M344 157 L344 110"/><path class="ll-wire " d="M372 157 L372 110"/><path class="ll-wire " d="M344 110 L352 110"/><path class="ll-wire " d="M372 110 L364 110"/><circle class="ll-meter" cx="358" cy="110" r="14"/><text class="ll-meter-label" x="358" y="115" text-anchor="middle">V</text><circle class="ll-junction" cx="344" cy="157" r="3.2"/><circle class="ll-junction" cx="372" cy="157" r="3.2"/><rect class="ll-res" x="330" y="230.5" width="56" height="19"/><path class="ll-wire " d="M344 240 L344 193"/><path class="ll-wire " d="M372 240 L372 193"/><path class="ll-wire " d="M344 193 L352 193"/><path class="ll-wire " d="M372 193 L364 193"/><circle class="ll-meter" cx="358" cy="193" r="14"/><text class="ll-meter-label" x="358" y="198" text-anchor="middle">V</text><circle class="ll-junction" cx="344" cy="240" r="3.2"/><circle class="ll-junction" cx="372" cy="240" r="3.2"/><path class="ll-wire circ circ-accelerator" d="M500 240 L700 240 L700 264"/><g class="ll-source circ-accelerator"><path d="M681 264 H719"/><path d="M691 280 H709"/></g><path class="ll-wire circ circ-accelerator" d="M700 280 L700 430"/><path class="ll-wire circ circ-magnet" d="M65 118 L65 40 L336 40"/><g class="ll-source circ-magnet"><path d="M336 21 V59"/><path d="M352 31 V49"/></g><path class="ll-wire circ circ-magnet" d="M352 40 L221 40 L221 118"/><path class="ll-arrow" d="M144 35 L154 40 L144 45"/><text class="ll-sym" x="149" y="112" text-anchor="start">K</text><text class="ll-sym" x="149" y="378" text-anchor="start">H</text><text class="ll-sym" x="292" y="151" text-anchor="start">A₂</text><text class="ll-sym" x="292" y="234" text-anchor="start">A₁</text><text class="ll-note" x="178" y="86" text-anchor="middle">真空二极管</text><text class="ll-note" transform="translate(108 250) rotate(-90)" text-anchor="middle">灯丝（直径放大）</text><text class="ll-sym" x="394" y="142" text-anchor="start">R₂ 1 kΩ</text><text class="ll-sym" x="394" y="225" text-anchor="start">R₁ 1 kΩ</text><text class="ll-note" x="394" y="190" text-anchor="start">1 mV ↔ 1 μA</text><text class="ll-note" x="312" y="146" text-anchor="start">I_A2</text><text class="ll-note" x="312" y="229" text-anchor="start">I_A1</text><text class="ll-note" x="160" y="30" text-anchor="start">I_M</text><text class="ll-note" transform="translate(18 244) rotate(-90)" text-anchor="middle">CH3 灯丝电源</text><text class="ll-note" x="712" y="300" text-anchor="start">CH2 加速电源</text><text class="ll-note" x="344" y="16" text-anchor="middle">CH1 励磁电源 · 线圈</text><text class="ll-note" transform="translate(36 96) rotate(-90)" text-anchor="middle">亥姆霍兹线圈对</text><text class="ll-note" x="44" y="236" text-anchor="middle">＋</text><text class="ll-note" x="44" y="256" text-anchor="middle">−</text><text class="ll-note" x="676" y="264" text-anchor="middle">＋</text><text class="ll-note" x="676" y="284" text-anchor="middle">−</text></svg>`;
}

const PARTS = {
  heater: ['灯丝与加热', '灯丝电源加在 K、H 两端，把阴极烧热，电子才能逸出。它决定电子的来源。'],
  accelerator: ['加速电源', '正端经两段取样电阻接到 A₁、A₂，负端接 H。它决定电子打到阳极时的能量。'],
  magnet: ['线圈与励磁', '励磁电源只给线圈供电，产生沿管轴的磁场。励磁电流与收集电流是两条不同的回路。'],
  anode: ['中央阳极 A₁', '中间那段金属筒收集到的电子形成中央电流。电流由 1 kΩ 取样电阻上的电压换算，1 mV 对应 1 μA。'],
  guard: ['保护环 A₂', '两端的两段金属筒与中央同电势，也收集电子；它们让中央区域更接近长同轴结构。图中两块表的读数是两路的合计。'],
};

// 每一步都按同一套说法交代清楚：已知什么、这一步要得到什么、什么算完成。
const brief=(kicker,title,known,goal)=>`<header class="ll-brief"><p class="ll-kicker">${kicker}</p><h2>${title}</h2><dl class="ll-spec"><div><dt>已知</dt><dd>${known}</dd></div><div><dt>本步要得到</dt><dd>${goal}</dd></div></dl></header>`;
const check=(met,text,label,action='next')=>`<footer class="ll-check"><span class="ll-check-mark ${met?'is-met':''}" aria-hidden="true">${met?'✓':'○'}</span><p>${text}</p>${button(action,label,'ll-primary')}</footer>`;

export function mountLearning(container, { onRecord = () => {}, onExplore = () => {}, onMeasured = () => {}, onStageChange = () => {} } = {}) {
  const state={ stage:'apparatus', part:'heater', heater:false, accelerator:false, magnet:false, voltageV:10, fieldMT:0, prediction:'', predictionSubmitted:false, predictions:{}, calCurrent:0, calRows:[], calibration:null, measurementCurrent:0, scanStep:0.05, scans:[], results:[], selectedLower:'', selectedUpper:'', feedback:'', auto:false, serial:0, note:'', trajectoryCache:null, destroyed:false };
  const savedDraft=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
  if(savedDraft?.version===1){for(const field of DRAFT_FIELDS)if(Object.hasOwn(savedDraft.state,field))state[field]=savedDraft.state[field];}
  let timer=null, frame=null, draftTimer=null;
  container.classList.add('learning-lab');
  function persistDraft(){
    clearTimeout(draftTimer);draftTimer=null;
    const values=Object.fromEntries(DRAFT_FIELDS.filter(field=>state[field]!==undefined).map(field=>[field,state[field]]));
    localStorage.setItem(DRAFT_KEY,JSON.stringify({version:1,savedAt:new Date().toISOString(),state:values}));
  }
  function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(persistDraft,160);}
  const parameters=()=>({...GEOMETRY,voltageV:state.voltageV});
  const fieldTrue=current=>INSTRUMENT.slopeMTPerA*current+INSTRUMENT.interceptMT;
  const calibrationReading=current=>Math.round((fieldTrue(current)+0.003*Math.sin((state.calRows.length+1)*2.39996323))*1000)/1000;
  const fieldFromCalibration=current=>state.calibration ? state.calibration.slope*current+state.calibration.intercept : INSTRUMENT.slopeMTPerA*current;
  const relevantRows=()=>state.scans.filter(p=>p.voltageV===state.voltageV);
  const emit=(type,title,conditions,observations,conclusion='')=>onRecord({type,title,conditions,observations,conclusion});
  const stopAuto=()=>{clearTimeout(timer);timer=null;state.auto=false;};
  const hint=(text,good=false)=>`<div class="ll-feedback ${good?'is-good':''}" role="status">${text}</div>`;
  const conditions=()=>({...parameters(),source:'虚拟理想实验',assumptions:['阴极等电势','电子零初速','轴向均匀磁场','无限长同轴近似'],calibration:state.calibration?{...state.calibration}:'出厂标称斜率 4.23 mT/A（未计入恒定场分量）'});
  function selectVoltage(voltage){
    state.predictions[state.voltageV]={value:state.prediction,submitted:state.predictionSubmitted};
    state.voltageV=voltage;
    const saved=state.predictions[voltage];
    state.prediction=saved?.value??'';state.predictionSubmitted=saved?.submitted??false;
    state.predictionVoltage=state.predictionSubmitted?voltage:undefined;
  }
  function predictionHistory(){
    const entries={...state.predictions,[state.voltageV]:{value:state.prediction,submitted:state.predictionSubmitted}};
    return Object.entries(entries).filter(([,p])=>p.submitted).map(([voltage,p])=>({voltageV:Number(voltage),fieldMT:Number(p.value)}));
  }
  function learningEvidence(){
    return {voltageV:state.voltageV,prediction:state.predictionSubmitted?{voltageV:state.voltageV,fieldMT:Number(state.prediction)}:null,
      predictions:predictionHistory(),results:state.results.map(p=>({...p})),note:state.note};
  }

  function stageApparatus(){
    const ready=state.heater&&state.accelerator&&state.magnet;
    return brief('01 · 认识装置','三路电源，两块表：搞清它们在数什么',
      '灯丝是唯一的发射源，外筒是唯一的归宿。但这台仪器没有把所有收集到的电子混在一起数。',
      '顺着导线看清楚：加速电压加在哪两端？两块毫伏表又分别在替哪段金属算账？')
    +`<div class="ll-two-col"><section class="ll-card"><div class="ll-card-head"><h3>接线图</h3><span class="ll-tag">点下面的部件，图中对应位置会亮</span></div>${schematic(state)}<div class="ll-part-tabs">${Object.entries(PARTS).map(([key,[title]])=>button('part',title,state.part===key?'is-active':'',`data-value="${key}"`)).join('')}</div></section>
    <section class="ll-card ll-reading"><span class="ll-step-label">这一路在做什么</span><h3>${PARTS[state.part][0]}</h3><p>${PARTS[state.part][1]}</p><div class="ll-rule"></div><h3>接通看变化</h3><div class="ll-toggle-list">${[['heater','加热灯丝'],['accelerator','施加加速电压'],['magnet','接通励磁']].map(([key,label])=>`<label><input type="checkbox" data-field="${key}" ${state[key]?'checked':''}/><span>${label}</span><small>${state[key]?'已开启':'已关闭'}</small></label>`).join('')}</div>${hint(!state.heater?'灯丝冷了。没有热发射，哪一路都没有电子可数。':!state.accelerator?'灯丝发热，电子离开金属表面——可外筒还没有拉力，它们只在阴极附近打转，两块表都是 0。':!state.magnet?'电场建立起来了：电子被拉向外筒，中央 A₁ 与保护环 A₂ 同时读到电流，收集通道就此打开。':'轴向磁场建立。电子的路径开始在横截面里弯曲——第一个分水岭到了。',ready)}</section></div>`
    +check(ready,'三路都能说出接在哪两个电极之间。','理解理想情况 →');
  }

  function trajectoryView(){
    const key=`${state.voltageV}/${state.fieldMT}`;
    if(state.trajectoryCache?.key!==key)state.trajectoryCache={key,result:idealTrajectory({...parameters(),fieldMT:state.fieldMT})};
    const result=state.trajectoryCache.result,scale=25,cx=168,cy=150;
    const points=result.points.map(p=>`${cx+p.xMm*scale},${cy-p.yMm*scale}`).join(' ');
    const last=result.points.at(-1), outcome=result.outcome==='anode'?'到达阳极':result.outcome==='turning'?'先发生径向转折':'尚未到达阳极';
    return `<svg class="ll-orbit" viewBox="0 0 336 320" role="img" aria-label="电子横截面轨迹：${outcome}"><circle cx="${cx}" cy="${cy}" r="${GEOMETRY.anodeRadiusMm*scale}" fill="#eef5ef" stroke="#72998e" stroke-width="6"/><circle cx="${cx}" cy="${cy}" r="3.7" fill="#d7a055"/><path d="M 270 164 H 231 M 231 164 l 9 -5 M 231 164 l 9 5" stroke="#9b7455" fill="none" stroke-width="2"/><text x="241" y="151">E</text><circle cx="44" cy="304" r="9" fill="none" stroke="#738e98"/><circle cx="44" cy="304" r="2" fill="#738e98"/><text x="60" y="309">B 出纸面</text><polyline points="${points}" fill="none" stroke="#27817b" stroke-width="2.5"/>${last?`<circle cx="${cx+last.xMm*scale}" cy="${cy-last.yMm*scale}" r="5" fill="#d79c42"/>`:''}<text x="168" y="308" text-anchor="middle">${outcome} · 阴极尺寸放大标记</text></svg>`;
  }

  function stagePrinciple(){
    const bc=criticalFieldMilliTesla(parameters()),current=idealCurrent({...parameters(),fieldMT:state.fieldMT,emissionUA:30});
    const predicted=Number(state.prediction), error=state.prediction!==''?Math.abs(predicted-bc)/bc:Infinity;
    return brief('02 · 理想图景','磁场多大时，电子到不了阳极？',
      '电子由灯丝发出，阳极的正电压把它拉过去。',
      '在纸面上先建一个毫无瑕疵的理想世界：算出一个截止磁场，并且知道它随加速电压怎么变。')
    +`<div class="ll-principle-grid"><section class="ll-card"><div class="ll-card-head"><h3>横截面轨迹</h3><span class="ll-tag">零初速 · 均匀磁场</span></div>${trajectoryView()}<div class="ll-readouts"><div><span>磁场</span><strong>${fmt(state.fieldMT,2)}<small> mT</small></strong></div><div><span>理想收集电流</span><strong>${fmt(current,0)}<small> μA</small></strong></div></div><label class="ll-field">加速电压 U <output>${fmt(state.voltageV,1)} V</output><input type="range" min="4" max="12" step="2" value="${state.voltageV}" data-field="voltageV"/></label><label class="ll-field">轴向磁场 B <output>${fmt(state.fieldMT,2)} mT</output><input type="range" min="0" max="6.5" step="0.01" value="${state.fieldMT}" data-field="fieldMT"/></label><div class="ll-action-row">${button('field-zero','无磁场')}${button('field-critical','临界轨迹')}${button('field-above','超过截止')}</div></section>
    <section class="ll-card ll-reading"><span class="ll-step-label">先看两条法则</span><h3>电场给能量，磁场只改方向</h3><div class="ll-equation">$$m\\,\\frac{dv}{dt}=-e\\,(E+v\\times B)$$</div><p>洛伦兹力始终垂直于速度，对电子不做功。在理想的冷电子世界里，规则极其干脆：初速为零，阴极没有压降。磁场差一丝一毫，电子就全数撞上阳极；磁场刚过临界线，哪怕只大一点点，电子也只能贴着阳极内侧掠过、折返。这是一条没有过渡的突变台阶——先记住它完美的样子。</p>
    ${plot({xMax:6.5,yMax:36,xLabel:'磁场 B / mT',yLabel:'理想电流 / μA',lines:[{points:[{x:0,y:30},{x:bc,y:30},{x:bc,y:0},{x:6.5,y:0}]},{points:[{x:bc,y:0},{x:bc,y:36}],color:'#b57a2e',dashed:true}],rows:[{x:state.fieldMT,y:current,color:'#cf9142'}]})}
    <details><summary>从临界轨迹推出比荷公式</summary><p>阳极半径 rₐ=${GEOMETRY.anodeRadiusMm} mm，阴极半径 r_f=${GEOMETRY.filamentRadiusUm} μm。角动量关系给出临界到达时的切向速度，与能量 eU 联立：</p><div class="ll-equation">$$\\frac{e}{m}=\\frac{8Ur_a^2}{B_c^2\\,(r_a^2-r_f^2)^2}$$</div><p>当 $r_f\\ll r_a$ 时可简写为 $\\dfrac{e}{m}\\approx\\dfrac{8U}{B_c^2r_a^2}$。公式里 B 用 T、半径用 m，比荷单位 C/kg。作预测可用公认值 1.75882 × 10¹¹ C/kg；正式测量用你自己记录的截止区间反求。</p></details>
    <label class="ll-field">你预测的截止磁场 / mT <input type="number" min="0" max="10" step="0.01" value="${state.prediction}" data-field="prediction" placeholder="先算一遍，或按临界轨迹估一个"/></label>${button('submit-prediction','保存并检验预测','ll-primary')}${state.predictionSubmitted?hint(`你的预测 ${fmt(predicted,3)} mT，理想临界值 ${fmt(bc,3)} mT。${error<0.05?'两者同量级——你已经能在纸面上把这个理想世界搭起来。接下来去真实实验台上看看，磁场是不是真能这么听话。':'差得还有点远。先检查单位：B 用 T、半径用 m。'}`,error<0.05):''}</section></div>`
    +check(state.predictionSubmitted,'预测与临界轨迹算出的 B_c 同量级。','去标定磁场 →');
  }

  function stageCalibration(){
    const reading=calibrationReading(state.calCurrent),fit=state.calibration;
    return `${brief('03 · 标定','电源显示安培，公式要特斯拉','磁场由励磁电流产生，两者的关系要自己测出来。','一条 B = a·I_M + b 关系式，后面每条读数都用它换算。')}<div class="ll-two-col"><section class="ll-card"><div class="ll-card-head"><h3>励磁电源与高斯计</h3><span class="ll-tag">虚拟仪器 · 微小读数扰动</span></div><div class="ll-instrument"><span>励磁电源 · 恒流</span><strong>${fmt(state.calCurrent,3)} <small>A</small></strong><span>高斯计 · 探头位置固定</span><strong>${fmt(reading,3)} <small>mT</small></strong></div><label class="ll-field">设置励磁电流 I_M / A<input type="range" min="0" max="1.6" step="0.1" value="${state.calCurrent}" data-field="calCurrent"/></label><div class="ll-action-row">${button('cal-record','记录此点','ll-primary')}${button('cal-series','采集 9 个标定点')}${button('cal-clear','清空')}</div><p class="ll-fine">零励磁也要记一点：这台教学仪器有恒定轴向场。</p><details><summary>这台教学仪器怎样产生场与读数？</summary><p>作用于电子的场真值为 B / mT = 4.23 × I_M / A + 0.015。其中 0.015 mT 是教学模型预设的恒定轴向场，会参与洛伦兹力计算；它不是高斯计的零点偏移。</p><p>高斯计在真值上叠加幅度为 0.003 mT 的确定性读数扰动，再按 0.001 mT 分辨率取整。扰动按记录序号变化，重新开始同一序列会得到相同读数，不表示仪表随时间漂移。拟合截距估计恒定场分量，同时受到有限读数扰动影响。</p><p>真实实验的主标定未测零励磁点，其负截距只是外推结果；不能把这里预设的已知恒定场用于解释那份实测截距。</p></details>${state.feedback?hint(esc(state.feedback)):''}</section><section class="ll-card"><h3>磁场标定图</h3>${plot({rows:state.calRows.map(p=>({x:p.currentA,y:p.fieldReadMT})),line:fit,xMax:1.6,yMax:7,xLabel:'励磁电流 I_M / A',yLabel:'磁感应强度 B / mT'})}${button('cal-fit','用记录拟合标定关系','ll-primary')}${fit?`<div class="ll-result"><span>你的标定关系</span><strong>B / mT = ${fmt(fit.slope,5)} × I_M / A ${fit.intercept>=0?'+':'−'} ${fmt(Math.abs(fit.intercept),5)}</strong><p>${fit.n} 个记录 · 残差均方根 ${fmt(fit.residualRMS,4)} mT。接下来每个电流读数会通过这条关系换算为磁场。</p></div>`:hint('至少取 3 个不同电流点，覆盖范围越宽越好。')}</section></div>${table(['序号','励磁电流 / A','高斯计读数 / mT','读数时间'],state.calRows.map((p,i)=>[i+1,fmt(p.currentA,3),fmt(p.fieldReadMT,3),p.time.slice(11,19)]),'尚未记录。先调节电流并记录读数。')}${check(!!fit,'至少三个点、含零点，拟合出斜率。','开始扫描 →')}`;
  }

  function table(headers,rows,empty='还没有记录。') {
    return `<div class="ll-table-wrap"><table class="ll-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(v=>`<td>${v}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}" class="ll-empty">${empty}</td></tr>`}</tbody></table></div>`;
  }

  function stageMeasurement(){
    const rows=relevantRows(),nonzero=rows.filter(p=>p.anodeUA>0),zero=rows.filter(p=>p.anodeUA===0);
    const sorted=[...rows].sort((a,b)=>a.currentA-b.currentA),lastResult=state.results.find(p=>p.voltageV===state.voltageV);
    const selectedLow=rows.find(p=>String(p.index)===String(state.selectedLower)),selectedHigh=rows.find(p=>String(p.index)===String(state.selectedUpper));
    const multiFit=state.results.length>=3?fitLine(state.results.map(p=>({x:p.voltageV,y:p.criticalFieldMT**2}))):null;
    const displayCurrent=idealCurrent({...parameters(),fieldMT:fieldTrue(state.measurementCurrent),emissionUA:30});
    return `${brief('04 · 测量','固定电压，找到电流消失的位置','你有标定关系，也知道截止对应哪条轨迹。','每个加速电压下的截止区间，以及由它算出的比荷。')}<div class="ll-two-col"><section class="ll-card"><div class="ll-card-head"><h3>扫描控制台</h3><span class="ll-tag">理想收集 · 30 μA 发射</span></div><label class="ll-field">固定加速电压 / V<select data-field="measurementVoltage" ${state.auto?'disabled':''}>${[4,6,8,10,12].map(v=>`<option value="${v}" ${state.voltageV===v?'selected':''}>${v} V</option>`).join('')}</select></label><div class="ll-readouts"><div><span>励磁电流 I_M</span><strong>${fmt(state.measurementCurrent,3)}<small> A</small></strong></div><div><span>阳极收集电流</span><strong>${fmt(displayCurrent,1)}<small> μA</small></strong></div></div><p class="ll-fine">基础模型不分收集段，这里是理想长同轴阳极的全部收集。</p><label class="ll-field">设置励磁电流 / A<input type="number" min="0" max="1.6" step="0.005" value="${fmt(state.measurementCurrent,3)}" data-field="measurementCurrent" ${state.auto?'disabled':''}/></label><label class="ll-field">自动扫描间隔 / A<select data-field="scanStep" ${state.auto?'disabled':''}>${[0.1,0.05,0.02].map(v=>`<option value="${v}" ${state.scanStep===v?'selected':''}>${v}</option>`).join('')}</select></label><div class="ll-action-row">${button('scan-record','记录此点','ll-primary',state.auto?'disabled':'')}${button(state.auto?'scan-stop':'scan-auto',state.auto?'停止扫描':'自动扫描 0–1.6 A')}${button('scan-clear','清除此电压', '',state.auto?'disabled':'')}</div><div class="ll-progress"><i style="width:${state.auto?state.measurementCurrent/1.6*100:rows.length?100:0}%"></i></div><p class="ll-fine">${state.calibration?`使用你的标定：斜率 ${fmt(state.calibration.slope,5)} mT/A。`:'还没标定，暂用出厂斜率 4.23 mT/A。'} 每条记录都保存当时的标定。</p></section><section class="ll-card"><div class="ll-card-head"><h3>${state.voltageV} V · 你的扫描记录</h3><span class="ll-tag">${rows.length} 个点</span></div>${plot({rows:sorted.map(p=>({x:p.currentA,y:p.anodeUA})),xMax:1.6,yMax:36,xLabel:'励磁电流 I_M / A',yLabel:'阳极电流 / μA',lines:sorted.length?[{points:sorted.map(p=>({x:p.currentA,y:p.anodeUA})),color:'#b1cbc3'}]:[],highlight:selectedLow&&selectedHigh?[selectedLow.currentA,selectedHigh.currentA]:null})}<p class="ll-fine">连线只是读图辅助；截止夹在上下界之间，缩小间隔能夹得更紧。</p><div class="ll-bound-grid"><label class="ll-field">下界：仍收集电子<select data-field="selectedLower"><option value="">选择记录</option>${nonzero.map(p=>`<option value="${p.index}" ${String(state.selectedLower)===String(p.index)?'selected':''}>${fmt(p.currentA,3)} A · ${fmt(p.fieldCalibratedMT,3)} mT</option>`).join('')}</select></label><label class="ll-field">上界：已无收集<select data-field="selectedUpper"><option value="">选择记录</option>${zero.map(p=>`<option value="${p.index}" ${String(state.selectedUpper)===String(p.index)?'selected':''}>${fmt(p.currentA,3)} A · ${fmt(p.fieldCalibratedMT,3)} mT</option>`).join('')}</select></label></div>${button('calculate','用这个截止区间计算比荷','ll-primary')}${lastResult?`<div class="ll-result"><span>${state.voltageV} V · 本次计算</span><strong>e/m = ${fmt(lastResult.chargeToMass/1e11,5)} × 10¹¹ C/kg</strong><p>B_c 取区间中点 ${fmt(lastResult.criticalFieldMT,4)} mT；仅由截止区间得到 ${fmt(lastResult.ratioLow/1e11,4)}–${fmt(lastResult.ratioHigh/1e11,4)} × 10¹¹ C/kg。与公认值相差 ${fmt(lastResult.relativeErrorPercent,2)}%。</p></div>`:''}</section></div>${state.feedback?hint(esc(state.feedback)):''}
    <details class="ll-card ll-raw"><summary>查看当前电压的原始扫描记录（${rows.length} 条）</summary>${table(['序号','I_M / A','换算 B / mT','I_A / μA','当时标定斜率 / (mT/A)'],rows.map(p=>[p.index,fmt(p.currentA,3),fmt(p.fieldCalibratedMT,4),fmt(p.anodeUA,2),fmt(p.calibrationSlope,5)]))}</details>
    <section class="ll-card ll-multi"><div class="ll-card-head"><h3>改变电压重复，检查同一个比荷</h3><span class="ll-tag">${state.results.length} 组独立截止判断</span></div>${table(['加速电压 / V','截止区间 / mT','区间中点 / mT','比荷 / (10¹¹ C/kg)'],state.results.map(p=>[p.voltageV,`${fmt(p.fieldLowerMT,3)}–${fmt(p.fieldUpperMT,3)}`,fmt(p.criticalFieldMT,4),fmt(p.chargeToMass/1e11,5)]),'建议至少测 4、8、12 V 三个电压。')}${state.results.length>=2?plot({rows:state.results.map(p=>({x:p.voltageV,y:p.criticalFieldMT**2})),xMax:14,yMax:30,xLabel:'加速电压 U / V',yLabel:'截止磁场平方 B_c² / mT²',line:multiFit}):''}${multiFit&&multiFit.slope>0?`<p class="ll-fit-summary">由 ${multiFit.n} 组截止中点拟合：B_c² / mT² = ${fmt(multiFit.slope,5)} × U / V ${multiFit.intercept>=0?'+':'−'} ${fmt(Math.abs(multiFit.intercept),5)}。斜率给出 e/m = <strong>${fmt(chargeToMass({...GEOMETRY,voltageV:1,criticalFieldMT:Math.sqrt(multiFit.slope)})/1e11,5)} × 10¹¹ C/kg</strong>。</p><p class="ll-fine">这里允许截距自由拟合，用来检查有限扫描步长与标定偏差。截止区间仅反映扫描分辨率，不是包含尺寸、标定等来源的完整不确定度。</p>`:''}</section>${check(state.results.length>0,'换一个电压重复，两次算出同一个比荷。','看看真实实验 →')}`;
  }

  function stageReality(){
    return `${brief('05 · 走向真实','真实曲线不会突然降到零','理想曲线是阶跃，你已经会从扫描里取截止、算比荷。','一个能被检验的下一步问题。')}<div class="ll-three-col"><section class="ll-card"><span class="ll-big-number">01</span><h3>电子去了哪里？</h3><p>中央电流先升一段。是总收集变多了，还是分配在变？两路一起看才有答案。</p></section><section class="ll-card"><span class="ll-big-number">02</span><h3>截止为什么有宽度？</h3><p>固定几何、平均加速电势差和发射源强，只改温度，比较曲线宽度；再单独开关灯丝电势梯度。</p></section><section class="ll-card"><span class="ll-big-number">03</span><h3>尾部可以被解释吗？</h3><p>先看励磁电源的实际电流，再动对准角度。能造出尾流，不等于解释了实测尾流。</p></section></div><section class="ll-card ll-reflection"><div><h3>带走你的基准</h3><p>你已记录 ${state.calRows.length} 个标定读数、${state.scans.length} 个扫描点，完成 ${state.results.length} 个电压下的比荷计算。</p><p>先打开真实数据，看同一电压下的中央与保护环；再把实测记录带进研究模型。长尾仍是开放问题。</p><details><summary>为什么理想页与研究页不能直接当作单因素对照？</summary><p>理想页采用零初速、无限长同轴结构，不区分轴向收集；研究页同时加入热初速、有限轴向边界与中央/保护环分段，默认还有灯丝电势梯度。因此两页曲线的差异不能单独归因于热初速。</p><p>当前研究模型温度可调 1500–2400 K，没有零初速开关。温度对照请保留同一几何、电压、场扫描和发射源强；梯度对照另行进行，关闭梯度时保持平均加速电势差与温度不变。这里源强独立给定，改变温度只改变初速度分布，不自动增加发射电流。</p></details><label class="ll-field">先写下一个可被检验的预测或下一项测量<textarea data-field="note" rows="4" placeholder="例如：若只是中央与保护环重新分配，中央隆起时保护环应如何变化？">${esc(state.note)}</textarea></label><div class="ll-action-row">${button('save-note','保存我的问题')}${button('export','导出原始记录')}${button('explore','直接进入研究模型')}</div>${state.feedback?hint(esc(state.feedback)):''}</div><div class="ll-reflection-side"><span class="ll-step-label">从现象走向证据</span><p>一个好的解释要说清</p><ol><li>改变了哪个物理条件</li><li>预测哪个可测量会怎么变</li><li>什么结果会让你放弃它</li></ol></div></section>${check(!!state.note.trim(),'写下一个预测，并说明什么结果会推翻它。','先看真实数据 →','measured')}`;
  }

  function render(){
    if(state.destroyed)return;
    scheduleDraft();
    const stageIndex=STAGES.findIndex(([key])=>key===state.stage), active=STAGES[stageIndex];
    container.innerHTML=`<div class="ll-shell"><nav class="ll-stage-nav" aria-label="引导实验步骤">${STAGES.map(([key,title],index)=>`<button type="button" data-action="stage" data-value="${key}" class="${key===state.stage?'is-active':''}" ${key===state.stage?'aria-current="step"':''}><span>${String(index+1).padStart(2,'0')}</span>${title}</button>`).join('')}</nav><div class="ll-stage-meta"><span>${active[2]}</span><span>第 ${stageIndex+1} / ${STAGES.length} 步 · 可自由切换</span></div>${({apparatus:stageApparatus,principle:stagePrinciple,calibration:stageCalibration,measurement:stageMeasurement,reality:stageReality}[state.stage])()}<div class="ll-footer"><span>学习草稿自动保存在此浏览器 · 等电势阴极 · 零初速 · 理想同轴模型</span>${button('export','导出实验记录')}</div></div>`;
  }

  function setStage(stage){
    const aliases={intro:'apparatus',theory:'principle',prediction:'principle',calibrate:'calibration',measure:'measurement',experiment:'measurement',explore:'reality'};
    const next=typeof stage==='number'?STAGES[stage]?.[0]:(aliases[stage]||stage);
    if(!STAGES.some(([key])=>key===next))return;
    stopAuto();state.stage=next;state.feedback='';render();onStageChange(next);
  }

  function addCalibrationPoint(current){
    state.calRows.push({currentA:current,fieldReadMT:calibrationReading(current),fieldTrueMT:fieldTrue(current),time:new Date().toISOString()});
    state.calibration=null;
  }

  function recordScan(){
    const c=state.calibration||{slope:INSTRUMENT.slopeMTPerA,intercept:0};
    const row={index:++state.serial,voltageV:state.voltageV,currentA:state.measurementCurrent,fieldCalibratedMT:fieldFromCalibration(state.measurementCurrent),fieldTrueMT:fieldTrue(state.measurementCurrent),anodeUA:idealCurrent({...parameters(),fieldMT:fieldTrue(state.measurementCurrent),emissionUA:30}),calibrationSlope:c.slope,calibrationIntercept:c.intercept,time:new Date().toISOString()};
    state.scans.push(row);
    const rows=relevantRows(),low=rows.filter(p=>p.anodeUA>0).sort((a,b)=>b.fieldCalibratedMT-a.fieldCalibratedMT)[0], high=rows.filter(p=>p.anodeUA===0).sort((a,b)=>a.fieldCalibratedMT-b.fieldCalibratedMT)[0];
    if(low)state.selectedLower=low.index;if(high)state.selectedUpper=high.index;
    return row;
  }

  function finishScanRecord(title){
    const rows=relevantRows();
    emit('ideal-scan',title,conditions(),{points:rows.map(p=>({...p})),completeRange:rows.some(p=>p.currentA===0)&&rows.some(p=>p.currentA>=1.6)},'从记录中选择截止两侧的点，再计算比荷。');
  }

  function autoTick(){
    if(!state.auto||state.destroyed)return;
    recordScan();render();
    if(state.measurementCurrent>=1.6){stopAuto();state.feedback=`${state.voltageV} V 正向扫描完成。已预选最接近截止的两侧记录，你也可以手动改选或补测更小间隔。`;finishScanRecord(`${state.voltageV} V 理想扫描`);render();return;}
    state.measurementCurrent=Math.min(1.6,Math.round((state.measurementCurrent+state.scanStep)*1000)/1000);
    timer=setTimeout(autoTick,100);
  }

  function exportCSV(){
    const rows=[['记录类型','时间UTC','电压V','励磁电流A','高斯计读数mT','标定换算磁场mT','阳极电流uA','标定斜率mT每A','标定截距mT','仿真真值磁场mT','截止下界mT','截止上界mT','比荷C每kg','备注']];
    for(const p of state.calRows)rows.push(['虚拟标定',p.time,'',p.currentA,p.fieldReadMT,'','','','',p.fieldTrueMT,'','','','仿真场=4.23I+0.015mT；读数另加0.003mT确定性扰动并按0.001mT取整；非真实实验数据']);
    for(const p of state.scans)rows.push(['虚拟理想扫描',p.time,p.voltageV,p.currentA,'',p.fieldCalibratedMT,p.anodeUA,p.calibrationSlope,p.calibrationIntercept,p.fieldTrueMT,'','','','阳极半径4.55mm；阴极半径50um；零初速；发射30uA']);
    for(const p of state.results)rows.push(['截止区间计算',p.time,p.voltageV,'','','','','','', '',p.fieldLowerMT,p.fieldUpperMT,p.chargeToMass,'以区间中点计算；不确定度尚未包含几何与标定']);
    for(const p of predictionHistory())rows.push(['学生预测',new Date().toISOString(),p.voltageV,'','','','','','','','','','',`截止预测 ${p.fieldMT} mT`]);
    if(state.note)rows.push(['学生问题',new Date().toISOString(),'','','','','','','','','','','',state.note]);
    const csv='\uFEFF'+rows.map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`磁控二极管_引导实验_${new Date().toISOString().slice(0,10)}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function onClick(event){
    const target=event.target.closest('[data-action]');if(!target||!container.contains(target))return;
    const action=target.dataset.action;
    if(action==='stage')return setStage(target.dataset.value);
    if(action==='next')return setStage(STAGES.findIndex(([key])=>key===state.stage)+1);
    if(action==='part')state.part=target.dataset.value;
    if(action==='field-zero')state.fieldMT=0;
    if(action==='field-critical')state.fieldMT=criticalFieldMilliTesla(parameters());
    if(action==='field-above')state.fieldMT=Math.min(6.5,criticalFieldMilliTesla(parameters())*1.15);
    if(action==='submit-prediction'){
      if(state.prediction===''||!Number.isFinite(Number(state.prediction))||Number(state.prediction)<=0){state.feedback='请输入一个正的截止磁场预测值。';const input=container.querySelector('[data-field="prediction"]');input.setCustomValidity(state.feedback);input.reportValidity();return;}
      state.predictionSubmitted=true;state.predictionVoltage=state.voltageV;
      emit('prediction',`${state.voltageV} V 截止预测`,conditions(),{predictedFieldMT:Number(state.prediction),idealCriticalFieldMT:criticalFieldMilliTesla(parameters())},'比较自己的截止预测与理想临界轨迹。');
    }
    if(action==='cal-record'){addCalibrationPoint(state.calCurrent);state.feedback=`已记录 ${fmt(state.calCurrent,1)} A。改变电流后继续记录。`;}
    if(action==='cal-series'){state.calRows=[];for(let i=0;i<=8;i++)addCalibrationPoint(i*0.2);state.calCurrent=1.6;state.feedback='9 个电流点已采集。点击拟合，估计斜率与恒定场分量。';}
    if(action==='cal-clear'){state.calRows=[];state.calibration=null;state.feedback='已清空标定记录，旧扫描记录仍保留当时的标定。';}
    if(action==='cal-fit'){
      if(new Set(state.calRows.map(p=>p.currentA)).size<3){state.feedback='请先记录至少 3 个不同电流点，包含零点和较高电流更便于判断。';}
      else{state.calibration=fitLine(state.calRows.map(p=>({x:p.currentA,y:p.fieldReadMT})));state.feedback='标定已保存，下一步扫描将使用这条换算关系。';emit('calibration','虚拟磁场标定',{source:'教学虚拟仪器',...INSTRUMENT}, {records:state.calRows.map(p=>({...p})),fit:{...state.calibration}},`B/mT=${state.calibration.slope}×I_M/A+${state.calibration.intercept}`);}
    }
    if(action==='scan-record'){const row=recordScan();emit('ideal-measurement',`${state.voltageV} V 单点读数`,conditions(),{...row},'');}
    if(action==='scan-auto'){stopAuto();state.measurementCurrent=0;state.feedback='正在逐点扫描，随时可以停止；已记录的点会保留。';state.auto=true;autoTick();return;}
    if(action==='scan-stop'){stopAuto();state.feedback='扫描已停止，已采集记录仍可用于分析或导出。';finishScanRecord(`${state.voltageV} V 手动停止扫描`);}
    if(action==='scan-clear'){state.scans=state.scans.filter(p=>p.voltageV!==state.voltageV);state.results=state.results.filter(p=>p.voltageV!==state.voltageV);state.selectedLower='';state.selectedUpper='';state.feedback='已清除此电压的扫描与计算，其余电压不受影响。';}
    if(action==='calculate'){
      const low=state.scans.find(p=>String(p.index)===String(state.selectedLower)),high=state.scans.find(p=>String(p.index)===String(state.selectedUpper));
      if(!low||!high||low.voltageV!==state.voltageV||high.voltageV!==state.voltageV||low.fieldCalibratedMT<=0||low.fieldCalibratedMT>=high.fieldCalibratedMT){state.feedback='请选择同一电压下、磁场递增的两条记录：下界仍有电流，上界已经无电流。';}
      else{
        const field=(low.fieldCalibratedMT+high.fieldCalibratedMT)/2,q=chargeToMass({...parameters(),criticalFieldMT:field});
        const result={...parameters(),fieldLowerMT:low.fieldCalibratedMT,fieldUpperMT:high.fieldCalibratedMT,criticalFieldMT:field,chargeToMass:q,ratioLow:chargeToMass({...parameters(),criticalFieldMT:high.fieldCalibratedMT}),ratioHigh:chargeToMass({...parameters(),criticalFieldMT:low.fieldCalibratedMT}),relativeErrorPercent:100*(q/ELECTRON_CHARGE_TO_MASS-1),time:new Date().toISOString()};
        state.results=state.results.filter(p=>p.voltageV!==state.voltageV);state.results.push(result);state.results.sort((a,b)=>a.voltageV-b.voltageV);
        state.feedback='已保存这组结果。可以在截止附近补测，或换一个加速电压重复扫描。';emit('charge-to-mass',`${state.voltageV} V 比荷计算`,conditions(),{lowerRecord:{...low},upperRecord:{...high},result},`e/m=${q} C/kg；截止取区间中点。`);
      }
    }
    if(action==='export'){exportCSV();return;}
    if(action==='save-note'){if(state.note.trim()){emit('question','我的下一项实验',conditions(),{calibrationPoints:state.calRows.length,scanPoints:state.scans.length,results:state.results.map(p=>({...p}))},state.note.trim());state.feedback='你的问题已保存到实验记录。';}else state.feedback='先写下一个预测或希望补测的量。';}
    if(action==='measured'){stopAuto();onMeasured(learningEvidence());return;}
    if(action==='explore'){stopAuto();onExplore({learning:learningEvidence()});return;}
    render();
  }

  function onInput(event){
    const input=event.target,field=input.dataset.field;if(!field)return;
    if(field==='note'){state.note=input.value;scheduleDraft();return;}
    if(field==='prediction'){state.prediction=input.value;state.predictionSubmitted=false;input.setCustomValidity('');scheduleDraft();return;}
    if(input.type==='checkbox'){state[field]=input.checked;render();return;}
    if(field==='selectedLower'||field==='selectedUpper'){state[field]=input.value;render();return;}
    const value=Number(input.value);if(input.value===''||!Number.isFinite(value))return;
    if(field==='measurementVoltage'){selectVoltage(value);state.selectedLower='';state.selectedUpper='';state.feedback='';render();return;}
    if(field==='measurementCurrent'){state.measurementCurrent=Math.max(0,Math.min(1.6,value));scheduleDraft();if(event.type==='change')render();return;}
    if(field==='scanStep'){state.scanStep=value;scheduleDraft();return;}
    if(field==='voltageV')selectVoltage(value);else state[field]=value;
    scheduleDraft();
    if(event.type==='change'){render();return;}
    // Keep the range element mounted while the pointer is dragging it.
    // Only the linked scene, graph and readouts need a new frame.
    cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
      if(state.destroyed)return;
      const output=input.closest('label')?.querySelector('output');
      if(output)output.textContent=field==='voltageV'?`${fmt(value,1)} V`:`${fmt(value,2)} mT`;
      if(state.stage==='calibration'){
        const display=container.querySelector('.ll-instrument');
        display.innerHTML=`<span>励磁电源 · 恒流</span><strong>${fmt(state.calCurrent,3)} <small>A</small></strong><span>高斯计 · 探头位置固定</span><strong>${fmt(calibrationReading(state.calCurrent),3)} <small>mT</small></strong>`;
      }
      if(state.stage==='principle'){
        container.querySelector('.ll-orbit').outerHTML=trajectoryView();
        const current=idealCurrent({...parameters(),fieldMT:state.fieldMT,emissionUA:30}),bc=criticalFieldMilliTesla(parameters());
        container.querySelector('.ll-readouts').innerHTML=`<div><span>磁场</span><strong>${fmt(state.fieldMT,2)}<small> mT</small></strong></div><div><span>理想收集电流</span><strong>${fmt(current,0)}<small> μA</small></strong></div>`;
        container.querySelector('.ll-chart').outerHTML=plot({xMax:6.5,yMax:36,xLabel:'磁场 B / mT',yLabel:'理想电流 / μA',lines:[{points:[{x:0,y:30},{x:bc,y:30},{x:bc,y:0},{x:6.5,y:0}]}],rows:[{x:state.fieldMT,y:current,color:'#cf9142'}]});
      }
    });
  }
  container.addEventListener('click',onClick);container.addEventListener('input',onInput);container.addEventListener('change',onInput);
  const onVisibility=()=>{if(document.hidden){if(state.auto){stopAuto();state.feedback='页面转入后台，扫描已暂停；已采集记录保留。';render();}persistDraft();}};
  document.addEventListener('visibilitychange',onVisibility);
  window.addEventListener('pagehide',persistDraft);
  render();
  onStageChange(state.stage);
  return {setStage,destroy(){persistDraft();state.destroyed=true;stopAuto();cancelAnimationFrame(frame);container.removeEventListener('click',onClick);container.removeEventListener('input',onInput);container.removeEventListener('change',onInput);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',persistDraft);container.innerHTML='';container.classList.remove('learning-lab');}};
}
