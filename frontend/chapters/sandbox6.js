import {renderPanel,fieldGrid} from './interaction.js';
import {renderMath} from '../mathlite.js';
import {PhysicsClient,modelParameters,weightedRow,MODEL_GEOMETRY} from './physics-client.js';
import {multiCurve,CHANNELS,FREE_FATES,freeMapChart,freeTraceChart} from './charts6.js';
import {curveChart,esc} from './charts.js';
import {measuredCurves,traceIndex} from './model-math.js';
import {VOLTS,modelFit} from './math6.js';
import {loadSweepData,resolveCalibration,analyzeVoltage,GEOM} from '../chapter3/cutoff-math.js';
import {setHint,setProgress,setLayout} from './hud.js';
const $=s=>document.querySelector(s);
const btn=(a,t,attr='')=>`<button data-free="${a}" ${attr}>${t}</button>`;
const CHALLENGES=[
 ['热能撞墙测试','保持同轴磁场，将温度从 2000 K 提到 2400 K，比较 5.735 mT 的高场电流。'],
 ['等温阴极对照','把灯丝压降降至 0 V，比较截止前隆起。再做四档扫描，检查横轴截距的变化。'],
 ['内径公差敏感度','分别采用 4.50 / 4.60 mm 的阳极内半径，保留两条曲线，比较截止位置与比荷。'],
 ['拆开 H / K 两路','同轴磁场、端冷系数 0.76。展开 H / K，寻找 4.425 mT 附近的单侧回弹。'],
 ['有限开口边缘场','比较 0° / 7° / 10° 的开放薄壳模型，再改变端面边界；同时检查保护环反超和中央阳极高场回升。'],
 ['记录自己的发现','自由组合参数，把曲线与参数记入手账，重新导出完整报告。'],
];
const EDGE_NAMES={open:'开放薄壳口',flange:'0.5 mm 内翻边',seam:'0.5 mm 极间窄缝',kill:'口部即逃逸'};
const CHAIN_HINT='① 曲线上点选磁场 → ② 落点映射中点选电子 → ③ 3D 与 r(t)、z(t) 同步追踪';
/* The free bench is a simulator, not a narrated beat: one chain links every view.
   I–B curve (choose B) → all-electron landing map at that B (choose an electron) → its 3D path, r(t), z(t) on one clock. */
export function createSandbox({bridge,asset,bundle,anchors,calibration,deck,profile,saved,onSave,exitLabel='← 返回报告归档',onExit,onExport}){
  const initial=modelParameters(10,bundle.zero_measured[10].emission_uA,{tilt_deg:8,emission_profile:'cooled_ends',end_cooling_eta:.76,field_mT:5.735,field_max_mT:5.735,accuracy:'statistical'});
  const state={tab:'core',edge:false,edge_boundary:'open',channels:['A1_uA','A2_uA'],normalized:true,mode:'scan',scanPoints:'auto',comparisonIndex:-1,records:[],retained:[],challenge:null,notes:'',pick:null,...saved,params:{...initial,...saved?.params}};
  const abort=new AbortController(),listen=(el,event,fn)=>el.addEventListener(event,fn,{signal:abort.signal}),client=new PhysicsClient(),measured=measuredCurves(asset,calibration);
  const left=$('#left-panel');
  let alive=true,edgeBundle,rows=[],preview=[],busy=false,error='',timer=0,generation=0,status='',fit=null,pointFit=null,quadRows={},lastParams=null,fieldResidual=null;
  let full=false,fullBtn=null,fullBar=null,mapToggle=null,fitted=false;
  let selectedB=null,mapping=null,mapBusy=false,mapError='',mapToken=0,mapAbort=null,trace=null,traceBusy=false,traceToken=0,traceAbort=null,traceError='',traceParams=null,time=0,playing=false,raf=0,lastTick=0,follow=false;
  const persist=()=>onSave();
  const activeComparison=()=>state.retained[state.comparisonIndex<0?state.retained.length-1:state.comparisonIndex];
  const number=(name,label,min,max,step,unit='')=>`<label class="free-number"><span>${label}</span><input type="number" data-param="${name}" value="${Number(Number(state.params[name]).toFixed(4))}" min="${min}" max="${max}" step="${name==='emission_uA'?'any':step}" ${state.edge&&Object.hasOwn(MODEL_GEOMETRY,name)?'disabled':''}><small>${unit}</small></label>`;
  const digits=step=>step<1?step<.1?(step<.01?3:2):1:0;
  const slider=(name,label,min,max,step,unit='')=>`<label class="free-slider"><span>${label}</span><input type="range" data-param="${name}" value="${Number(Number(state.params[name]).toFixed(4))}" min="${min}" max="${max}" step="${step}"><output>${Number(state.params[name]).toFixed(digits(step))} ${unit}</output></label>`;
  const runParams=()=>lastParams??state.params;
  function preset(p=state.params){
    if(p.anode_V!==10&&state.edge)return null;
    if(p.temperature_K!==2000||p.filament_V!==3.68||!p.gradient||p.launch_mode!=='full'||p.accuracy!=='statistical'||Object.entries(MODEL_GEOMETRY).some(([k,v])=>p[k]!==v))return null;
    if(state.scanPoints!=='auto')return null;
    let source;
    if(state.edge){const tag=state.edge_boundary==='open'?`open_t${p.tilt_deg}_n${p.tilt_deg===0?4096:8192}`:{kill:'open_t10_kill',flange:'flange05_t10',seam:'seam05_t10'}[state.edge_boundary];source=edgeBundle.scans[tag];if(!source||source.params.tilt_deg!==p.tilt_deg||p.particles!==source.params.particles||p.field_max_mT!==6)return null;}
    else{source=bundle.scans[`${p.anode_V}:${p.tilt_deg}`];if(!source||p.particles!==8192||p.field_max_mT!==5.735)return null;}
    const e=p.emission_profile==='cooled_ends'?p.end_cooling_eta:0;
    let rr=source.rows.map((r,i)=>({...weightedRow(r,source.moments[i],e,p.emission_uA),particles:source.params.particles}));
    if(!state.edge&&p.anode_V===10&&p.tilt_deg===0)rr.push(...anchors.anchors.map(a=>weightedRow(a.row,a.moments,e,p.emission_uA)));
    rr.sort((a,b)=>a.field_mT-b.field_mT);rr=rr.map((r,i)=>({...r,field_idx:i,pending_fraction:r.fractions[4]}));
    return {params:p,rows:rr};
  }
  function niceParams(p=runParams()){return `${p.anode_V} V · ${p.temperature_K} K · ${p.tilt_deg}° · η=${(p.emission_profile==='cooled_ends'?p.end_cooling_eta:0).toFixed(2)} · ${p.particles} 粒子`;}
  function markDirty(){fit=null;quadRows={};pointFit=null;error='';clearTimeout(timer);client.cancel();generation++;busy=false;status='参数已改变，准备计算…';updateStatus();timer=setTimeout(()=>run(state.mode),180);persist();}
  function pointAnalysis(){pointFit=null;if(state.edge||rows.length<3||rows[0].field_mT>0)return;
    const V=state.params.anode_V,d=loadSweepData(asset),cal=resolveCalibration(asset,calibration),base=d[10];
    const pts=rows.map(r=>[0,(r.field_mT-cal.intercept)/cal.slope,0,V,state.params.filament_V,0,r.A1_uA]);
    const key=10,copy={[key]:{...base,zb_a1:rows[0].A1_uA,zb_uf:state.params.filament_V,pts}};
    if(rows.at(-1).A1_uA<rows[0].A1_uA*.7){const f=analyzeVoltage(copy,key,cal);if(Number.isFinite(f.bc)&&f.bc>0)pointFit=f;}
  }
  // ---- ① current curve (bottom of the centre column)
  const narrowChart = matchMedia("(max-width: 540px)");
  listen(narrowChart, "change", () => { if (rows.length) curve(); });
  function curve(){
    const p=runParams(),m=(!state.edge&&VOLTS.includes(p.anode_V))?measured[p.anode_V]:state.edge?measured[10]:null;
    deck.hidden=false;profile.hidden=true;
    const body=rows.length>1?multiCurve(rows,m,{ynorm:state.normalized,channels:state.channels,compare:activeComparison()?.rows??null,width:narrowChart.matches?400:760,height:296,selectedB,pick:true})
      :rows.length?`<div class="point-results"><h2>${rows[0].field_mT.toFixed(3)} mT 单点读数</h2>${CHANNELS.filter(([k])=>state.channels.includes(k)).map(([k,n,c])=>`<div><span>${n}</span><strong style="color:${c}">${rows[0][k].toFixed(4)} μA</strong></div>`).join('')}</div>`:'<p class="free-empty">调整参数后，曲线会从低磁场开始生长。</p>';
    deck.innerHTML=`<div class="free-chart-toolbar"><b><span class="step-no">①</span>${state.edge?'有限开口边缘场 · 电流曲线':'电流曲线'}<small>点选曲线上任一磁场，查看该磁场下全体电子的落点</small></b><div class="button-row">${btn('normalize',state.normalized?'相对电流 %':'物理电流 μA')}${btn('retain','保留对照',rows.length?'':'disabled')}${btn('record','记入手账',rows.length&&!busy?'':'disabled')}</div></div><div class="free-plot">${body}</div>${rows.length>1?`<div class="free-field-picker"><button data-free="field-prev" aria-label="前一个磁场点">− 一档</button><label>磁场 <output id="field-selection">${(selectedB??rows[0].field_mT).toFixed(3)} mT</output><input id="free-field-index" aria-label="选择磁场点" type="range" min="0" max="${rows.length-1}" step="1" value="${Math.max(0,rows.findIndex(r=>r.field_mT===nearestField(selectedB??0)))}" ${busy?'disabled':''}></label><button data-free="field-next" aria-label="后一个磁场点">+ 一档</button></div>`:''}${selectedB!==null?`<div class="free-next">${btn('show-map',`查看 ${selectedB.toFixed(3)} mT 的电子落点 →`)}</div>`:''}<div class="free-foot"><div class="free-channels">${CHANNELS.map(([key,label,color])=>`<label style="color:${color}"><input type="checkbox" data-channel="${key}" ${state.channels.includes(key)?'checked':''}>${label}</label>`).join('')}</div>${state.retained.length?`<label class="comparison-choice">对照 <select id="comparison-choice">${state.retained.map((r,i)=>`<option value="${i}" ${r===activeComparison()?'selected':''}>${i+1}. ${esc(r.label)}</option>`).join('')}</select>${btn('remove-comparison','移除')}</label>`:''}<span id="free-status" role="status"></span><span class="free-current-params">${esc(niceParams())}${m&&!state.edge?' · 实线：实测 · 虚线：模型':' · 虚线：模型'}${state.retained.length?` · 点线：${esc(activeComparison()?.label??'')}`:''}</span></div><div class="free-progress"><i style="width:${busy?Math.min(99,rows.length/(state.params.fields_mT?.length??29)*100):100}%"></i></div>`;
    renderMath(deck);updateStatus();
  }
  // ---- ② landing map and ③ one electron (right column)
  function chain(){
    const p=runParams();let html='';if(mapToggle){mapToggle.hidden=state.edge;mapToggle.textContent=state.mapCollapsed?'展开映射':'收起映射';}
    if(state.edge){
      const tr=edgeBundle.traces;
      html=`<figure class="chart-card"><div class="chart-bar"><strong><span class="step-no">②</span>全体电子落点</strong><span>有限开口场</span></div><div class="edge-boundary-note">有限开口场由独立求解器计算，目前提供五通道电流与未终止权重；逐粒子落点映射尚未导出。下面是 10 V、4.400 mT、10° 下的代表电子 #4571：同一初态在解析场中越口离开，在有限开口场中折返后由 K 环收集。</div><div class="button-row">${btn('edge-trace','有限开口场 · #4571',`aria-pressed="${state.pick!=='analytic'}"`)}${btn('edge-trace-analytic','解析场 · #4571',`aria-pressed="${state.pick==='analytic'}"`)}${btn('edge-detail','开口附近的轴向电场 ↗')}</div></figure>`;
      html+=traceCard(p,`#4571 · ${state.pick==='analytic'?'解析场':'有限开口场'}`);
    }else{
      const row=mapping?.row;
      html=`<figure class="chart-card map-card" ${state.mapCollapsed?'hidden':''}><div class="chart-bar"><strong><span class="step-no">②</span>全体电子落点 ${selectedB!==null?`· $B=${selectedB.toFixed(3)}\\ \\mathrm{mT}$`:''}</strong><span>${mapBusy?'正在积分 '+p.particles+' 颗电子…':row?`${p.particles} 颗 · 点选一颗电子`:''}</span></div>`;
      html+='<div class="map-content">';
      html+=mapping?fateBar(row)+freeMapChart(mapping,p,selectedB,trace?.particle_id??null)+transferNote(mapping)
        :'<div class="fate-bar"></div><div class="fate-key"></div><svg class="chart free-map" viewBox="0 0 540 346" aria-hidden="true"></svg><p class="small-note transfer-line"></p>';
      if(!mapping)html+=`<div class="loading-slot">${mapError?esc(mapError):mapBusy?'正在计算落点…':'在电流曲线上点选一个磁场。'}${mapError?btn('retry-map','重试'):''}</div>`;
      html+='</div>'+ (trace?`<div class="free-next">${btn('show-electron',`在管内看 #${trace.particle_id} →`)}</div>`:'')+'</figure>'+traceCard(p,trace?`#${trace.particle_id}`:'');
    }
    $('#chart-title').textContent='落点映射 → 单电子追踪';$('#voltage-badge').textContent=`${p.anode_V} V · ${p.tilt_deg}°`;
    renderPanel($('#chart'),`<div class="chain">${html}</div>`);$('#legend').innerHTML='';$('#controls').innerHTML='';renderMath($('#chart'));
  }
  function fateBar(row){if(!row)return '';let x=0;return `<div class="fate-bar">${row.fractions.map((f,i)=>{const s=`<i style="left:${x*100}%;width:${f*100}%;background:${FREE_FATES[i][1]}" title="${FREE_FATES[i][0]} ${(100*f).toFixed(1)}%"></i>`;x+=f;return s;}).join('')}</div><div class="fate-key">${row.fractions.map((f,i)=>f>0.0005||i<4?`<span><b style="background:${FREE_FATES[i][1]}"></b>${FREE_FATES[i][0]} ${(100*f).toFixed(1)}%</span>`:'').join('')}</div>`;}
  function transferNote(m){const t=m.transfer_counts;if(!t)return '';return `<p class="small-note transfer-line">中央阳极收到：来自 H 侧 <b>${t[0][1]}</b> · 本区 <b>${t[1][1]}</b> · 来自 K 侧 <b>${t[2][1]}</b> 颗</p>`;}
  function traceCard(p,label){
    let html=`<figure class="chart-card trace-card"><div class="chart-bar"><strong><span class="step-no">③</span>单电子追踪 ${label}</strong><span>${traceBusy?'正在积分轨迹…':trace?`${FREE_FATES[trace.outcome]?.[0]??''} · ${trace.flight_ns.toFixed(2)} ns · ${trace.radial_bounces??'—'} 次折返`:''}</span></div>`;
    html+='<div class="trace-content">';
    if(!trace){html+=`<div id="free-trace-plot"><svg class="chart free-trace" viewBox="0 0 540 300" aria-hidden="true"></svg></div><div class="control-row"></div><div class="button-row"></div><div class="loading-slot">${traceError?esc(traceError):mapBusy?'等待落点计算…':traceBusy?'正在计算轨迹…':'在落点映射中点选一颗电子。'}${traceError?btn('retry-trace','重试'):''}</div></div></figure>`;return html;}
    html+=`<div id="free-trace-plot">${freeTraceChart(trace,p,time)}</div><div class="control-row"><label for="free-time">时间</label><input id="free-time" type="range" min="0" max="${trace.flight_ns}" step="0.01" value="${time}"><output id="free-time-out">${time.toFixed(2)} ns</output></div><div class="button-row">${btn('play',playing?'暂停':'▶ 播放')}${btn('trace-end','看完整轨迹')}${btn('follow',follow?'回到全景':'镜头跟随电子')}</div></div></figure>`;
    return html;
  }
  function updateStatus(){const el=$('#free-status');if(el)el.textContent=error||status;const fitEl=$('#free-fit');if(fitEl)fitEl.innerHTML=fit?`四档拟合：$U_0=${fit.u0.toFixed(3)}\\ \\mathrm{V}$<br>$e/m$ 偏差 ${fit.relPct>0?'+':''}${fit.relPct.toFixed(2)}%`:pointFit?`本档切线截止场 $B_c=${pointFit.bc.toFixed(3)}\\ \\mathrm{mT}$<br><small>完成四档复核后显示截距与比荷。</small>`:'<small>完成四档复核后显示截距与比荷。</small>';if(fitEl)renderMath(fitEl);}
  function controls(){
    $('#phase').textContent='开放探索 · 全自由度实验台';$('#chapter-title').textContent='06 全自由度实验台';$('#free-review').hidden=true;
    let html=`<h2 class="left-title">实验参数</h2><nav class="free-tabs">${[['core','基本参数'],['advanced','几何与精度'],['challenges','开放问题'],['records','我的记录']].map(([id,n])=>btn('tab',n,`data-tab="${id}" aria-pressed="${state.tab===id}"`)).join('')}</nav>`;
    const p=state.params;
    if(state.tab==='core')html+=`<div class="free-controls">${slider('temperature_K','灯丝温度 $T$',1500,2400,25,'K')}${slider('anode_V','阳极电压 $U_a$',3,14,.1,'V')}<div class="button-row compact">${VOLTS.map(V=>btn('voltage',`${V} V`,`data-value="${V}"`)).join('')}</div>${slider('filament_V','灯丝压降 $U_f$',0,5,.05,'V')}<label class="switch"><input id="free-gradient" type="checkbox" ${p.gradient?'checked':''}>沿灯丝电势梯度</label>${slider('tilt_deg','有效倾角 $\\theta$',-25,25,.5,'°')}<div class="button-row compact">${[0,5,7,8,10].map(t=>btn('angle',`${t}°`,`data-value="${t}"`)).join('')}</div>${slider('end_cooling_eta','端冷系数 $\\eta$',0,1,.01)}${slider('field_mT','选定磁场 $B$',0,8,.025,'mT')}${slider('field_max_mT','扫描上限',4,8,.1,'mT')}</div><div class="free-run-row">${btn('scan','扫描曲线',state.mode==='scan'?'class="primary"':'')}${btn('point','只算选定磁场',state.mode==='point'?'class="primary"':'')}${btn('finish','立即完成',busy?'':'disabled')}</div><div class="edge-toggle"><label><input id="edge-switch" type="checkbox" ${state.edge?'checked':''}>考虑电场边缘效应 <small>实验功能</small></label>${state.edge?`<select id="edge-boundary" aria-label="端面边界">${Object.entries(EDGE_NAMES).map(([k,n])=>`<option value="${k}" ${k===state.edge_boundary?'selected':''}>${n}</option>`).join('')}</select>`:''}</div>`;
    if(state.tab==='advanced')html+=`<label class="select-row">扫描工作点<select id="scan-points">${[['auto','自动 · 沿用现有工作点'],[29,'29 点 · 快速预览'],[61,'61 点 · 加密'],[121,'121 点 · 精细']].map(([n,t])=>`<option value="${n}" ${String(state.scanPoints)===String(n)?'selected':''}>${t}</option>`).join('')}</select></label><p class="free-density-note">加密后重新计算各磁场点，细看截止区与高场尾部。</p><div class="advanced-grid">${number('anode_radius_mm','阳极内半径 $r_a$',3,7,.05,'mm')}${number('filament_radius_um','灯丝半径 $r_f$',25,100,2.5,'μm')}${number('length_mm','总发射域长 $L$',10,60,1,'mm')}${number('central_mm','中央收集段长',2,59,1,'mm')}${number('emission_uA','总发射电流',1,100,.1,'μA')}</div><div class="button-row">${[4.5,4.55,4.6].map(r=>btn('radius',`${r.toFixed(2)} mm`,`data-value="${r}" ${state.edge?'disabled':''}`)).join('')}${btn('geometry','恢复标准几何')}</div><label class="select-row">初速分布<select data-param="launch_mode">${[['full','三维热初速'],['axial','仅轴向热初速'],['cold','冷电子']].map(([v,n])=>`<option value="${v}" ${v===p.launch_mode?'selected':''}>${n}</option>`).join('')}</select></label><label class="select-row">发射分布<select data-param="emission_profile"><option value="uniform" ${p.emission_profile==='uniform'?'selected':''}>均匀发射</option><option value="cooled_ends" ${p.emission_profile==='cooled_ends'?'selected':''}>两端冷却</option></select></label><label class="select-row">统计粒子数<select data-param="particles">${[1024,4096,8192,32768].map(n=>`<option ${p.particles===n?'selected':''}>${n}</option>`).join('')}</select></label><label class="select-row">积分精度<select data-param="accuracy"><option value="statistical" ${p.accuracy==='statistical'?'selected':''}>统计精度</option><option value="reference" ${p.accuracy==='reference'?'selected':''}>高精度复核</option></select></label><p class="small-note">${state.edge?'边缘场采用标准几何，保持端面与独立求解器一致。':'两侧保护环平分中央收集段以外的长度。总发射域长与真实灯丝有效热长度分别定义。'}</p>${btn('audit','按当前条件做四档复核',state.edge?'disabled':'')}<div id="free-fit" class="small-note"></div>`;
    if(state.tab==='challenges')html+=`<div class="free-challenge-list">${CHALLENGES.map(([t,d],i)=>btn('challenge',`<b>${i+1}. ${t}</b><small>${d}</small>`,`data-index="${i}" aria-pressed="${state.challenge===i}"`)).join('')}</div>`;
    if(state.tab==='records')html+=`<div class="button-row">${btn('json','导出 JSON',rows.length?'':'disabled')}${btn('csv','导出 CSV',rows.length?'':'disabled')}${btn('html','完整 HTML 报告')}</div><label class="reflection">观察与解释<textarea id="free-notes" placeholder="记录你改变了什么，曲线发生了什么变化。">${esc(state.notes)}</textarea></label><div class="record-list">${state.records.length?state.records.map((r,i)=>`<div><b>${i+1}. ${esc(r.label)}</b><p>${r.edge?EDGE_NAMES[r.edge_boundary]:'解析圆柱势'} · ${r.rows.length} 个场点</p>${btn('restore', '恢复这组实验',`data-index="${i}"`)}</div>`).join(''):'还没有记录。计算后点「记入手账」，可连同参数保留当前曲线。'}</div>`;
    html+=`<div class="free-bottom">${btn('stop','停止计算',busy?'':'disabled')}${btn('exit',exitLabel)}</div>`;renderPanel(left,html);renderMath(left);updateStatus();
  }
  function hud(){
    setLayout('sandbox');setProgress(['curve','map','trace'],trace?'trace':mapping?'map':'curve',{curve:'① 电流曲线',map:'② 落点映射',trace:'③ 单电子'});
    setHint(busy?`正在计算 · ${status}`:CHAIN_HINT);
  }
  function benchRow(){const p=runParams(),B=selectedB??p.field_mT;return mapping?.row??rows.reduce((a,r)=>!a||Math.abs(r.field_mT-B)<Math.abs(a.field_mT-B)?r:a,null);}
  function benchPower(){
    const p=runParams(),B=selectedB??p.field_mT,r=benchRow(),current=Math.max(0,(B+.188)/4.231);
    bridge.update({heater:true,accelerator:true,magnet:B>0,current,coilVoltage:40*current,reading:r?.A1_uA??0,guardEnabled:true,guardReading:r?.A2_uA??0,acceleratingVoltage:p.anode_V,filamentVoltage:p.filament_V,filamentCurrent:.599,fieldMT:B,actualPoint:true});
  }
  function stageInfo(){
    const p=state.view==='bench'?runParams():(traceParams??runParams());
    if(state.view==='bench'){const B=selectedB??p.field_mT,r=benchRow();$('#stage-caption').innerHTML=`<b>实验台视角</b> · 台面仪表显示当前参数下的模拟读数<br><span class="small-note">励磁 $I_M=${Math.max(0,(B+.188)/4.231).toFixed(3)}\\ \\mathrm{A}$ → $B=${B.toFixed(3)}\\ \\mathrm{mT}$ · $U_a=${p.anode_V.toFixed(2)}\\ \\mathrm{V}$ · 中央阳极 ${r?r.A1_uA.toFixed(3):'—'} μA · 保护环 ${r?r.A2_uA.toFixed(3):'—'} μA</span>`;renderMath($('#stage-caption'));$('#scene-readout').innerHTML='';updateFullBar();return;}
    $('#stage-caption').innerHTML=trace?`<b>③ #${trace.particle_id??'4571'}</b> · ${FREE_FATES[trace.outcome]?.[0]??''} · $B=${(traceParams?.field_mT??selectedB??p.field_mT).toFixed(3)}\\ \\mathrm{mT}$ · $\\theta=${p.tilt_deg}^\\circ$${state.edge?' · 归档对照':''}<br><span class="small-note">$H$ 端 0 V → $K$ 端 +${p.filament_V.toFixed(2)} V · 蓝色箭头为磁场方向</span>`:`<span class="small-note">在右侧落点映射中点选电子，轨迹在此显示</span>`;renderMath($('#stage-caption'));
    if(trace){const q=trace.points[traceIndex(trace,time)];$('#scene-readout').innerHTML=`<div><small>飞行时间</small><strong>${time.toFixed(2)} ns</strong></div><div><small>半径 r</small><strong>${q[3].toFixed(3)} mm</strong></div><div><small>轴向位置 z</small><strong>${q[2].toFixed(2)} mm</strong></div>`;}else $('#scene-readout').innerHTML='';
    updateFullBar();
  }
  function renderAll(){hud();curve();chain();stageInfo();}
  function scene3d(){
    const p=traceParams??runParams();
    if(state.view==='bench'){benchPower();return;}
    bridge.research({enabled:true,geometry:p,trace:trace??null,traceOptions:{color:0x8ed7f5},time,field:selectedB!==null||trace?{B:traceParams?.field_mT??selectedB??p.field_mT,theta:p.tilt_deg}:null,cooling:p.emission_profile==='cooled_ends'&&p.end_cooling_eta>0?p.end_cooling_eta:null,cutoff:[0,p.anode_V,p.filament_V]});
    if(!fitted){fitted=true;bridge.research({focus:'all'});}
  }
  // ---- chain actions
  function invalidateSelection(){
    stopPlay();mapAbort?.abort();traceAbort?.abort();mapToken++;traceToken++;
    mapBusy=false;traceBusy=false;mapping=null;trace=null;traceParams=null;mapError='';traceError='';time=0;
    bridge.research({trace:null,follow:false});
  }
  function selectField(B,{auto=true,pid=null,at=null}={}){
    const previousPid=pid??trace?.particle_id??state.selection?.pid;
    invalidateSelection();selectedB=B;state.params.field_mT=B;
    state.selection={B,pid:previousPid??null,time:at};
    if(state.edge){curve();edgeTrace(state.pick==='analytic'?'analytic':'finite');persist();return;}
    const token=++mapToken;mapAbort=new AbortController();mapBusy=true;
    const p={...runParams(),field_mT:B,fields_mT:null,progressive:false};scene3d();stageInfo();hud();curve();chain();
    client.json('/particles',{signal:mapAbort.signal,body:{params:p}}).then(m=>{if(!alive||token!==mapToken)return;mapping=m;mapBusy=false;
      const keep=m.particles.find(q=>q[0]===previousPid&&q[1]!==null);
      if(auto)pickElectron(keep?previousPid:representative(m),{at});else{chain();hud();}persist();
    }).catch(e=>{if(e.name==='AbortError'||token!==mapToken||!alive)return;mapBusy=false;mapError='落点计算未完成：'+e.message;chain();hud();});
  }
  function representative(m){
    const c=runParams().central_mm/2,ps=m.particles.filter(q=>q[3]===1&&q[1]!==null);
    const cross=ps.filter(q=>Math.abs(q[1])>c).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
    return (cross[Math.floor(cross.length/3)]??ps[0]??m.particles.find(q=>q[3]===2)??m.particles.find(q=>q[1]!==null))?.[0]??0;
  }
  function pickElectron(pid,{at=null}={}){
    if(mapBusy||!mapping)return;
    stopPlay();traceAbort?.abort();traceAbort=new AbortController();const token=++traceToken;
    traceBusy=true;traceError='';trace=null;traceParams=null;time=0;state.pick=pid;state.selection={B:selectedB,pid,time:at};
    bridge.research({trace:null,follow:false});chain();stageInfo();
    const p={...runParams(),field_mT:selectedB??runParams().field_mT,fields_mT:null,progressive:false};
    client.json('/trace',{signal:traceAbort.signal,body:{params:p,particle_id:pid,include_zero_field:false}}).then(r=>{
      if(!alive||token!==traceToken)return;
      trace=r.trace??r;trace.particle_id=pid;traceParams=p;traceBusy=false;
      time=at===null?trace.flight_ns:Math.min(trace.flight_ns,Math.max(0,at));
      state.selection={B:selectedB,pid,time};scene3d();chain();stageInfo();hud();persist();
      if(follow)bridge.research({focus:'near',follow:true});
    }).catch(e=>{if(e.name==='AbortError'||token!==traceToken||!alive)return;traceBusy=false;traceError='轨迹计算失败：'+e.message;chain();});
  }
  function edgeTrace(kind='finite'){
    stopPlay();state.pick=kind==='analytic'?'analytic':'finite';const t=edgeBundle.traces[kind];
    trace={...t,particle_id:4571,outcome:t.outcome??(kind==='finite'?2:3)};
    traceParams={...modelParameters(10,runParams().emission_uA),field_mT:4.4,tilt_deg:10};
    time=trace.flight_ns;scene3d();chain();stageInfo();hud();
  }
  function setTime(t){if(!trace)return;time=Math.max(0,Math.min(trace.flight_ns,t));state.selection={B:selectedB,pid:trace.particle_id,time};bridge.research({time});const plot=$('#free-trace-plot');if(plot)plot.innerHTML=freeTraceChart(trace,traceParams??runParams(),time);const s=$('#free-time');if(s)s.value=time;const o=$('#free-time-out');if(o)o.textContent=time.toFixed(2)+' ns';const fs=$('#full-time');if(fs)fs.value=time;const fo=$('#full-time-out');if(fo)fo.textContent=time.toFixed(2)+' ns';stageInfo();}
  function stopPlay(){playing=false;cancelAnimationFrame(raf);document.querySelectorAll('[data-free="play"]').forEach(b=>b.textContent='▶ 播放');updateFullBar();}
  // ---- 3D fullscreen and lab view
  function updateFullBar(){
    if(!fullBar)return;fullBar.hidden=!full;if(!full)return;
    const tube=state.view==='tube'&&trace;
    const sig=`${tube?1:0}:${trace?.particle_id}:${trace?.flight_ns}:${playing}`;
    if(fullBar.dataset.sig!==sig){fullBar.dataset.sig=sig;
      renderPanel(fullBar,(tube?`${btn('play',playing?'暂停':'▶ 播放')}<input id="full-time" type="range" min="0" max="${trace.flight_ns}" step="0.01" value="${time}" aria-label="飞行时间"><output id="full-time-out">${time.toFixed(2)} ns</output>${btn('follow',follow?'回到全景':'镜头跟随')}`:`<span class="full-note">${state.view==='bench'?'实验台视角 · 仪表随选定磁场更新':'在落点映射中点选电子后可在此播放'}</span>`)+btn('full','退出全屏 (Esc)'));}
  }
  function setFull(on){full=on;document.body.classList.toggle('stage-full',full);if(fullBtn)fullBtn.textContent=full?'退出全屏':'⛶ 3D 全屏';fullBar.dataset.sig='';updateFullBar();}
  async function setView(mode){
    if(state.view===mode)return;state.view=mode;stopPlay();
    $('#view-bench').setAttribute('aria-pressed',mode==='bench');$('#view-tube').setAttribute('aria-pressed',mode==='tube');
    if(mode==='bench'){
      $('#stage-caption').textContent='正在载入实验台与仪表…';
      try{await bridge.view('bench');}
      catch{
        if(!alive||state.view!=='bench')return;
        await setView('tube');
        $('#stage-caption').textContent='实验台载入失败，点上方“实验台”可重试。';
        return;
      }
      if(!alive||state.view!=='bench')return;
      bridge.research({enabled:false,follow:false});benchPower();
    }
    else{await bridge.view('tube');if(!alive||state.view!=='tube')return;scene3d();bridge.research({focus:follow?'near':'all',follow});}
    fullBar.dataset.sig='';stageInfo();persist();
  }
  function play(){if(!trace)return;if(playing){stopPlay();chain();return;}if(time>=trace.flight_ns-.01)setTime(0);playing=true;chain();lastTick=0;const dur=Math.min(12000,Math.max(5000,trace.flight_ns*60));
    const loop=now=>{if(!alive||!playing)return;if(lastTick&&now-lastTick>30){setTime(time+(now-lastTick)*trace.flight_ns/dur);lastTick=now;}else if(!lastTick)lastTick=now;if(time>=trace.flight_ns){stopPlay();chain();}else raf=requestAnimationFrame(loop);};raf=requestAnimationFrame(loop);}
  async function run(mode='scan'){
    clearTimeout(timer);client.cancel();const token=++generation;state.mode=mode;error='';preview=[];rows=[];busy=true;pointFit=null;
    const p=structuredClone(state.params);p.edge_boundary=state.edge_boundary;lastParams=p;
    let pre=preset(p);if(mode==='point'&&pre){const row=pre.rows.find(r=>Math.abs(r.field_mT-p.field_mT)<1e-9);pre=row?{rows:[{...row,field_idx:0}]}:null;}
    p.fields_mT=pre?.rows.map(r=>r.field_mT)??fieldGrid(p.field_max_mT,state.scanPoints);state.params.fields_mT=p.fields_mT;
    status='正在准备'+(mode==='point'?'单点计算…':'扫描…');invalidateSelection();renderAll();controls();
    client.scan(p,{preset:pre,endpoint:(state.edge?'/edge':'')+(mode==='point'?'/point':'/scan'),onPreview:rr=>{preview=rr;status=`1024 粒子预览已完成，正在补齐 ${p.particles} 粒子`;updateStatus();},onRow:r=>{if(token!==generation)return;rows.push(r);status=`${mode==='point'?'单点':'扫描'}：${r.field_mT.toFixed(3)} mT · ${rows.length}/${mode==='point'?1:p.fields_mT.length}`;curve();},onDone:()=>{if(token!==generation)return;busy=false;preview=[];status=`已完成 · ${rows.length} 个场点`;pointAnalysis();controls();afterRun();persist();},onProgress:s=>{if(s.field_residual)fieldResidual=s.field_residual;},onError:e=>{if(token!==generation)return;busy=false;error='这次计算未完成：'+e.message;curve();controls();hud();}});persist();
  }
  function afterRun({restore=false}={}){hud();curve();const selected=restore?state.selection:null;const target=selected?.B??(rows.length===1?rows[0].field_mT:state.params.field_mT);selectField(target,{pid:selected?.pid??null,at:selected?.time??null});}
  const nearestField=B=>rows.reduce((a,r)=>Math.abs(r.field_mT-B)<Math.abs(a-B)?r.field_mT:a,rows[0]?.field_mT??B);
  async function audit(){
    if(state.edge)return;client.cancel();const token=++generation;busy=true;error='';fit=null;quadRows={};state.tab='advanced';controls();
    for(const V of VOLTS){if(!alive||token!==generation)return;const p={...state.params,anode_V:V,emission_uA:bundle.zero_measured[V].emission_uA},pre=preset(p),result=[];p.fields_mT=pre?.rows.map(r=>r.field_mT)??fieldGrid(p.field_max_mT,state.scanPoints);status=`四档复核：${V} V`;updateStatus();let failure;
      await new Promise(resolve=>client.scan(p,{preset:pre,onRow:r=>result.push(r),onDone:resolve,onError:e=>{failure=e;resolve();}}));if(!alive||token!==generation)return;if(failure){error=failure.message;break;}quadRows[V]=result;
    }
    if(Object.keys(quadRows).length===4){fit=modelFit(asset,quadRows,calibration);if(fit){const a=state.params.anode_radius_mm*1e-3,r=state.params.filament_radius_um*1e-6,g=a*a*(1-(r/a)**2)**2;fit.em*=GEOM.G_m2/g;fit.relPct=100*(fit.em/GEOM.em_codata-1);}status='四档切线复核完成';}
    busy=false;controls();updateStatus();hud();persist();
  }
  function download(kind){const data={schema:1,model:state.edge?'finite_open_shell':'analytic_cylinder',edge_boundary:state.edge?state.edge_boundary:null,params:lastParams,rows,notes:state.notes,fit,created:new Date().toISOString()};let text,type;
    if(kind==='json'){text=JSON.stringify(data,null,2);type='application/json';}else{const keys=['field_mT','A1_uA','A2_uA','A2_H_uA','A2_K_uA','sum_uA','pending_fraction'];text=keys.join(',')+'\n'+rows.map(r=>keys.map(k=>k==='pending_fraction'?r.fractions[4]:r[k]).join(',')).join('\n');type='text/csv;charset=utf-8';}
    const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download='磁截止自由实验_'+Date.now()+'.'+kind;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function edgeDetail(){const p=edgeBundle.profile,tr=edgeBundle.traces;$('#detail-body').innerHTML='<h2>开口附近的轴向电场与电子折返</h2><div class="edge-detail-grid"><section>'+curveChart([{points:p.points,color:'#87cef0'},{points:p.points.map(([z])=>[z,p.analytic_V_per_mm]),color:'#eead76',dash:true}],{x:[0,20],y:[-.65,.1],xlabel:'z / \\mathrm{mm}',ylabel:'\\partial\\varphi/\\partial z / (\\mathrm{V/mm})'})+`<p>$r=1\\ \\mathrm{mm}$：蓝线为有限开口场，橙色虚线为解析场。外端附近梯度变号，电子的轴向加速方向随之改变。</p></section><section>`+curveChart(Object.entries(tr).map(([key,t])=>({points:t.points.map(p=>[p[4],p[2]]),color:key==='finite'?'#87cef0':'#eead76',dash:key==='analytic'})),{x:[0,75],y:[0,20],xlabel:'t / \\mathrm{ns}',ylabel:'z / \\mathrm{mm}'})+`<p><b>同一初态 #4571</b><br>解析场：${tr.analytic.flight_ns.toFixed(2)} ns 越口离开；有限开口场：${tr.finite.flight_ns.toFixed(2)} ns 滞留折返，最后由 K 环收集。</p></section></div><p class="small-note">有限场轨迹使用独立细网格高精度复算。</p>`;renderMath($('#detail-body'));$('#detail').showModal();}
  function challenge(i){state.challenge=i;if(i===5){state.tab='records';controls();return;}
    Object.assign(state.params,initial);state.edge=i===4;state.edge_boundary='open';state.channels=['A1_uA','A2_uA'];
    if(i===0)Object.assign(state.params,{temperature_K:2400,tilt_deg:0});if(i===1)Object.assign(state.params,{filament_V:0,tilt_deg:0});if(i===2){state.tab='advanced';state.params.anode_radius_mm=4.5;}if(i===3){state.params.tilt_deg=0;state.params.field_mT=4.425;state.channels.push('A2_H_uA','A2_K_uA');}if(i===4){state.params.tilt_deg=7;state.params.field_max_mT=6;state.params.field_mT=4.5;state.channels.push('A2_H_uA','A2_K_uA');}controls();run('scan');}
  listen(document,'click',e=>{
    const pickRect=e.target.closest('.pickable [data-field]');if(pickRect&&!busy){selectField(Number(pickRect.dataset.field));controls();return;}
    const dot=e.target.closest('.free-map [data-pid]');if(dot&&!mapBusy){pickElectron(Number(dot.dataset.pid));return;}
    const map = e.target.closest('svg.free-map');
    if (map && !mapBusy && e.pointerType === 'touch') {
      const transform = map.getScreenCTM();
      if (!transform) return;
      const tap = new DOMPoint(e.clientX,e.clientY).matrixTransform(transform.inverse());
      let nearest = null, distance = (12 / transform.a) ** 2;
      for (const point of map.querySelectorAll('circle[data-pid]')) {
        const d = (point.cx.baseVal.value - tap.x) ** 2 + (point.cy.baseVal.value - tap.y) ** 2;
        if (d < distance) { nearest = point; distance = d; }
      }
      if (nearest) pickElectron(Number(nearest.dataset.pid));
      return;
    }
    const b=e.target.closest('[data-free]');if(!b||b.disabled)return;const a=b.dataset.free;
    if(a==='show-map'){state.mapCollapsed=false;chain();}
    if(a==='show-electron')setView('tube');
    if(a==='field-prev'||a==='field-next'){const i=rows.findIndex(r=>r.field_mT===nearestField(selectedB??0));const j=Math.max(0,Math.min(rows.length-1,i+(a==='field-next'?1:-1)));if(!busy&&rows[j])selectField(rows[j].field_mT);}
    if(a==='tab'){state.tab=b.dataset.tab;controls();persist();}if(a==='scan'||a==='point')run(a);if(a==='finish')client.finish();if(a==='stop'){client.cancel();generation++;busy=false;status='已停止，保留已完成场点';curve();controls();hud();}
    if(a==='normalize'){state.normalized=!state.normalized;curve();persist();}if(a==='retain'){state.retained.push({label:niceParams(),rows:structuredClone(rows),params:lastParams});state.retained=state.retained.slice(-3);state.comparisonIndex=state.retained.length-1;curve();persist();}
    if(a==='record'){state.records.push({label:niceParams(),params:structuredClone(lastParams),rows:structuredClone(rows),edge:state.edge,edge_boundary:state.edge_boundary,traceKind:state.pick,scanPoints:state.scanPoints,selection:{B:selectedB,pid:trace?.particle_id??null,time},view:state.view});state.records=state.records.slice(-12);state.tab='records';controls();persist();}
    if(a==='restore'){const r=state.records[Number(b.dataset.index)];clearTimeout(timer);state.params={...r.params};state.selection=r.selection??null;state.scanPoints=r.scanPoints??'auto';state.pick=r.traceKind??null;state.edge=r.edge;state.edge_boundary=r.edge_boundary;rows=structuredClone(r.rows);lastParams={...r.params};state.mode=rows.length===1?'point':'scan';client.cancel();generation++;busy=false;fit=null;pointAnalysis();status='已恢复记录';controls();afterRun({restore:true});if(r.view&&r.view!==state.view)setView(r.view);persist();}
    if(a==='voltage'){state.params.anode_V=Number(b.dataset.value);state.params.emission_uA=bundle.zero_measured[b.dataset.value].emission_uA;controls();markDirty();}if(a==='angle'){state.params.tilt_deg=Number(b.dataset.value);if(state.edge)state.params.particles=state.params.tilt_deg===0?4096:8192;controls();markDirty();}
    if(a==='radius'){state.params.anode_radius_mm=Number(b.dataset.value);controls();markDirty();}if(a==='geometry'){Object.assign(state.params,MODEL_GEOMETRY);controls();markDirty();}if(a==='audit')audit();if(a==='challenge')challenge(Number(b.dataset.index));if(a==='edge-detail')edgeDetail();if(a==='json'||a==='csv')download(a);if(a==='html')onExport();if(a==='exit')onExit();
    if(a==='remove-comparison'){state.retained.splice(state.comparisonIndex<0?state.retained.length-1:state.comparisonIndex,1);state.comparisonIndex=-1;curve();persist();}if(a==='retry-map')selectField(selectedB);if(a==='retry-trace')pickElectron(state.pick);
    if(a==='play')play();if(a==='trace-end'){stopPlay();setTime(trace?.flight_ns??0);chain();}if(a==='follow'){follow=!follow;if(state.view==='tube')bridge.research({focus:follow?'near':'all',follow});chain();fullBar.dataset.sig='';updateFullBar();}
    if(a==='full')setFull(!full);if(a==='map-toggle'){state.mapCollapsed=!state.mapCollapsed;chain();persist();}
    if(a==='edge-trace')edgeTrace('finite');if(a==='edge-trace-analytic')edgeTrace('analytic');
  });
  listen(left,'input',e=>{const target=e.target;if(target.id==='scan-points'){state.scanPoints=target.value==='auto'?'auto':Number(target.value);state.mode='scan';markDirty();return;}if(target.id==='free-notes'){state.notes=target.value;persist();return;}const key=target.dataset.param;if(key){if(target.type==='number'&&!target.checkValidity())return;state.params[key]=['launch_mode','emission_profile','accuracy'].includes(key)?target.value:Number(target.value);if(key==='length_mm')state.params.central_mm=Math.min(state.params.central_mm,state.params.length_mm-1);if(key==='central_mm'&&state.params.central_mm>=state.params.length_mm){state.params.central_mm=state.params.length_mm-1;target.value=state.params.central_mm;}
      if(target.type==='range')target.nextElementSibling.textContent=Number(target.value).toFixed(digits(Number(target.step)))+' '+(target.nextElementSibling.textContent.split(' ')[1]??'');
      if(key==='anode_V'&&bundle.zero_measured[target.value])state.params.emission_uA=bundle.zero_measured[target.value].emission_uA;
      // Choosing B on a finished scan is a selection, not a new calculation.
      if(key==='field_mT'&&state.mode==='scan'&&rows.length>1&&!busy){clearTimeout(timer);persist();return;}
      markDirty();}
    if(target.id==='free-gradient'){state.params.gradient=target.checked;markDirty();}
    if(target.id==='edge-switch'){state.edge=target.checked;if(state.edge){Object.assign(state.params,MODEL_GEOMETRY,{anode_V:10,field_max_mT:6,particles:state.params.tilt_deg===0?4096:8192});}else state.params.field_max_mT=5.735;controls();markDirty();}
    if(target.id==='edge-boundary'){state.edge_boundary=target.value;controls();markDirty();}
  });
  listen(left,'change',e=>{if(e.target.dataset.param==='field_mT'&&state.mode==='scan'&&rows.length>1&&!busy){const B=nearestField(state.params.field_mT);if(B!==selectedB)selectField(B);}});
  listen($('#chart'),'input',e=>{if(e.target.id==='free-time'){stopPlay();setTime(Number(e.target.value));}});
  listen(document,'input',e=>{if(e.target.id==='full-time'){stopPlay();setTime(Number(e.target.value));}});
  listen(document,'keydown',e=>{if(e.key==='Escape'&&full)setFull(false);});
  listen(document,'change',e=>{if(['free-time','full-time'].includes(e.target.id))persist();});
  listen($('#view-bench'),'click',()=>setView('bench'));listen($('#view-tube'),'click',()=>setView('tube'));
  listen(deck,'change',e=>{if(e.target.id==='comparison-choice'){state.comparisonIndex=Number(e.target.value);curve();persist();return;}const key=e.target.dataset.channel;if(key){state.channels=e.target.checked?[...state.channels,key]:state.channels.filter(k=>k!==key);curve();persist();}});
  listen(deck,'input',e=>{if(e.target.id==='free-field-index'){const r=rows[Number(e.target.value)];if(r)$('#field-selection').textContent=r.field_mT.toFixed(3)+' mT';}});
  listen(deck,'change',e=>{if(e.target.id==='free-field-index'&&!busy){const r=rows[Number(e.target.value)];if(r&&r.field_mT!==selectedB)selectField(r.field_mT);}});
  listen(deck,'keydown',e=>{if(e.target.id==='free-field-index'||!rows.length||busy||!['ArrowLeft','ArrowRight'].includes(e.key))return;const i=rows.findIndex(r=>r.field_mT===nearestField(selectedB??0));const j=Math.max(0,Math.min(rows.length-1,i+(e.key==='ArrowRight'?1:-1)));selectField(rows[j].field_mT);});
  return {async begin(){
      document.body.dataset.kind='sandbox';left.hidden=false;deck.tabIndex=0;state.view='tube';
      mapToggle=document.createElement('button');mapToggle.id='map-toggle';mapToggle.dataset.free='map-toggle';$('#voltage-badge').before(mapToggle);
      fullBtn=document.createElement('button');fullBtn.id='stage-full';fullBtn.dataset.free='full';fullBtn.textContent='⛶ 3D 全屏';$('#reset').before(fullBtn);
      fullBar=document.createElement('div');fullBar.id='full-bar';fullBar.hidden=true;$('#stage').append(fullBar);
      const r=await fetch('../assets/precomputed/ch6_edge_bundle.json',{signal:abort.signal});if(!r.ok)throw Error('边缘场对照数据载入失败');edgeBundle=await r.json();if(!alive)return;state.tab=state.tab??'core';
      $('#view-bench').hidden=false;$('#view-tube').hidden=false;$('#view-near').hidden=true;$('#view-tube').setAttribute('aria-pressed','true');$('#view-bench').setAttribute('aria-pressed','false');await bridge.view('tube');bridge.research({enabled:true,cooling:null,trace:null,population:[],focus:'all'});
      const pre=preset();
      if(saved?.lastRows?.length&&saved.lastParams){rows=structuredClone(saved.lastRows);lastParams=structuredClone(saved.lastParams);state.params={...state.params,...lastParams};fit=saved.fit??null;status='已恢复上次实验';pointAnalysis();controls();afterRun({restore:true});}
      else if(pre&&state.mode==='scan'){rows=pre.rows;lastParams=structuredClone(state.params);status='预计算对照已就绪';pointAnalysis();controls();afterRun();}
      else{controls();await run(state.mode);}persist();},
    suspend(){alive=false;generation++;stopPlay();document.body.classList.remove('stage-full');fullBtn?.remove();fullBar?.remove();mapToggle?.remove();if(state.view==='bench'){state.view='tube';bridge.view('tube').then(()=>bridge.research({enabled:true,focus:'all'}));}clearTimeout(timer);client.cancel();mapAbort?.abort();traceAbort?.abort();abort.abort();left.hidden=true;left.innerHTML='';$('#chart').innerHTML='';$('#scene-readout').innerHTML='';bridge.research({trace:null,field:null,follow:false,geometry:null,cutoff:[0,10,3.68]});delete document.body.dataset.kind;},
    getState:()=>structuredClone({...state,selection:{B:selectedB,pid:trace?.particle_id??state.selection?.pid??null,time},lastRows:rows,lastParams,fit}),
    getDebug:()=>({params:structuredClone(state.params),rows:rows.length,fields:rows.map(r=>r.field_mT),busy,error,preview:preview.length,status,edge:state.edge,fit,pointFit,fieldResidual,selectedB,view:state.view,full,mapping:mapping?{particles:mapping.particles.length,row:mapping.row}:null,mapBusy,mapError,traceError,scanPoints:state.scanPoints,traceParams,trace:trace?{pid:trace.particle_id,outcome:trace.outcome,flight_ns:trace.flight_ns,points:trace.points.length}:null,traceBusy,time})};
}
