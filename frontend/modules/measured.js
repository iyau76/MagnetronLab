const DATA_URL = new URL('../assets/measurements.json', import.meta.url);
const COLORS = {A1:'#176f73', A2:'#ae6536', sum:'#66538b'};
const LABELS = {A1:'中央阳极 A₁', A2:'两保护环 A₂', sum:'总收集 A₁ + A₂'};
const FIELD = {A1:'physical_A1_current_uA', A2:'physical_A2_current_uA', sum:'physical_sum_current_uA'};
const mean = values => values.reduce((s,v)=>s+v,0)/values.length;
const f = (value,digits=3) => Number.isFinite(value) ? value.toFixed(digits) : '—';
const safe = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function unpackAsset(asset){
  const unpack = table => table.rows.map(row=>Object.fromEntries(asset.columns.map((key,i)=>[key,row[i]])));
  return {asset, magnetic:unpack(asset.magnetic_scan), voltage:unpack(asset.voltage_scan),baselines:new Map()};
}

export function selectRows(data,{mode='magnetic',voltage=10,direction='both'}={}){
  if(mode==='voltage')return data.voltage.filter(r=>r.record_role==='target'&&(direction==='both'||r.direction===direction));
  return data.magnetic.filter(r=>r.nominal_voltage_V===+voltage&&['up','down'].includes(r.record_role)&&(direction==='both'||r.record_role===direction));
}

export function measurementBaseline(data,row){
  const key=row.run_id==='2377'?`${row.run_id}/${row.direction}/${row.voltage_index}`:row.run_id;
  if(data.baselines.has(key))return data.baselines.get(key);
  const source = row.run_id==='2377' ? data.voltage : data.magnetic;
  const baseline = source.filter(r=>r.run_id===row.run_id&&(row.run_id==='2377'
    ? r.record_role==='zero'&&r.direction===row.direction&&r.voltage_index===row.voltage_index
    : r.record_role==='zero_before'));
  const result={A1_uA:mean(baseline.map(r=>r[FIELD.A1])),A2_uA:mean(baseline.map(r=>r[FIELD.A2])),sum_uA:mean(baseline.map(r=>r[FIELD.sum])),
    source:{run_id:row.run_id,source_records:baseline.map(r=>r.source_csv_record),record_role:row.run_id==='2377'?'zero':'zero_before',
      direction:row.run_id==='2377'?row.direction:null,voltage_index:row.run_id==='2377'?row.voltage_index:null},
    description:row.run_id==='2377'?'同电压、同方向的零励磁均值':'本轮 zero_before 均值'};
  data.baselines.set(key,result);return result;
}
export function zeroBaseline(data,row,channel){return measurementBaseline(data,row)[channel+'_uA'];}

function measurementAxis(row,state){
  if(state.mode==='voltage')return state.axis==='set'?row.accelerating_set_V:row.accelerating_actual_V;
  return state.axis==='set'?row.excitation_set_mA/1000:state.axis==='field'?state.slope*row.excitation_actual_A+state.intercept:row.excitation_actual_A;
}
function measurementAxisLabel(state){return state.mode==='voltage'?(state.axis==='set'?'设定':'实际')+'加速电压 / V':state.axis==='field'?'主标定换算磁场 / mT':(state.axis==='set'?'设定':'实际')+'励磁电流 / A';}

export function measurementConditions(data,state){
  const rows=selectRows(data,state),selected=rows[state.selected],original=data.asset.calibration;
  const range=key=>[Math.min(...rows.map(r=>r[key])),Math.max(...rows.map(r=>r[key]))];
  const voltageScan=state.mode==='voltage';
  return {
    实验类型:voltageScan?'2377 固定励磁扫电压':'固定电压扫励磁',
    加速电压_V:selected.accelerating_actual_V,
    当前点:{run_id:selected.run_id,source_csv_record:selected.source_csv_record,
      实际加速电压_V:selected.accelerating_actual_V,设定加速电压_V:selected.accelerating_set_V,
      实际励磁电流_A:selected.excitation_actual_A,设定励磁电流_A:selected.excitation_set_mA/1000,
      方向:voltageScan?selected.direction:selected.record_role},
    当前显示的扫描:{变量:voltageScan?'加速电压':'励磁电流',方向:state.direction,记录数:rows.length,
      实际加速电压范围_V:range('accelerating_actual_V'),
      ...(voltageScan?{设定加速电压范围_V:range('accelerating_set_V'),流程:'访问每个电压工作点前回零，再进入高场测量'}:{标称加速电压_V:selected.nominal_voltage_V}),
      实际励磁电流范围_A:range('excitation_actual_A')},
    方向:state.direction,横轴:measurementAxisLabel(state),归一化:state.normalized,
    通道:[...state.channels].map(k=>LABELS[k]),原始记录:selected,
    标定:{来源:original.source,斜率_mT每A:state.slope,截距_mT:state.intercept},
    数据SHA256:(voltageScan?data.asset.voltage_scan:data.asset.magnetic_scan).sha256,
  };
}

export function explorationFromMeasurement(data,state){
  const plotted=selectRows(data,state),r=plotted[state.selected],original=data.asset.calibration;
  const source={run_id:r.run_id,source_csv_record:r.source_csv_record,calibration_id:original.id,
    calibration_slope_mT_per_A:state.slope,calibration_intercept_mT:state.intercept,
    accelerating_actual_V:r.accelerating_actual_V,accelerating_set_V:r.accelerating_set_V,
    scan_mode:state.mode,scan_direction:state.mode==='voltage'?r.direction:r.record_role};
  const referenceRows=state.mode==='magnetic'?selectRows(data,{voltage:r.nominal_voltage_V,direction:state.direction==='down'?'down':'up'}):plotted.filter(p=>p.accelerating_set_V===r.accelerating_set_V);
  return {anode_V:r.accelerating_actual_V,filament_V:r.CH3_voltage_V,field_mT:Math.max(0,state.slope*r.excitation_actual_A+state.intercept),source,
    reference:{title:`实测 ${state.mode==='magnetic'?r.nominal_voltage_V:r.accelerating_set_V} V · ${r.run_id}`,source,
      baseline:measurementBaseline(data,r),
      rows:referenceRows.map(p=>({field_mT:state.slope*p.excitation_actual_A+state.intercept,A1_uA:p.physical_A1_current_uA,
        A2_uA:p.physical_A2_current_uA,sum_uA:p.physical_sum_current_uA,source_csv_record:p.source_csv_record}))}};
}

export function measurementCsv(data,state){
  const asset=data.asset,rows=selectRows(data,state),voltageScan=state.mode==='voltage';
  const extra=['display_x','display_A1','display_A2','display_sum','display_x_label','normalized','calibration_slope_mT_per_A','calibration_intercept_mT','source_sha256'];
  const hashes=(voltageScan?asset.voltage_scan:asset.magnetic_scan).raw_source_hashes;
  const exported=rows.map(r=>[...asset.columns.map(k=>r[k]),measurementAxis(r,state),
    ...['A1','A2','sum'].map(c=>state.normalized?r[FIELD[c]]/zeroBaseline(data,r,c):r[FIELD[c]]),
    measurementAxisLabel(state),state.normalized,state.slope,state.intercept,hashes[r.run_id]]);
  return {filename:`实测_${voltageScan?'2377扫压4至10V':rows[0].nominal_voltage_V+'V扫励磁'}_${state.direction}.csv`,
    text:[asset.columns.concat(extra),...exported].map(r=>r.map(csvCell).join(',')).join('\r\n')};
}

export function steepestCutoff(rows,{lower_A=-Infinity,upper_A=Infinity}={}){
  const eligible = rows.filter(r=>r.is_forward_cutoff_fit_point);
  let best=null;
  for(let i=1;i<eligible.length;i++){
    const a=eligible[i-1],b=eligible[i];
    if(a.excitation_actual_A<lower_A||b.excitation_actual_A>upper_A)continue;
    const width=b.excitation_actual_A-a.excitation_actual_A;
    if(width<=0)continue;
    const slope=(b.physical_A1_current_uA-a.physical_A1_current_uA)/width;
    if(slope<0&&(!best||slope<best.slope_uA_per_A))best={current_A:(a.excitation_actual_A+b.excitation_actual_A)/2,
      lower_A:a.excitation_actual_A,upper_A:b.excitation_actual_A,slope_uA_per_A:slope,
      source_records:[a.source_csv_record,b.source_csv_record],method:'原始相邻点最大负斜率中点（未平滑）'};
  }
  return best;
}

export function fitChargeMass(cutoffs,{slope_mT_per_A,intercept_mT,radius_mm=4.55}){
  const points=cutoffs.map(c=>({...c,field_mT:slope_mT_per_A*c.current_A+intercept_mT,
    effective_voltage_V:c.accelerating_V-c.filament_V/2}));
  if(points.length<2)return null;
  const x=points.map(p=>p.effective_voltage_V), y=points.map(p=>p.field_mT**2);
  const mx=mean(x),my=mean(y),xx=x.reduce((s,v)=>s+(v-mx)**2,0);
  if(xx===0)return null;
  const slope=y.reduce((s,v,i)=>s+(x[i]-mx)*(v-my),0)/xx;
  const intercept=my-slope*mx, residual=y.reduce((s,v,i)=>s+(v-slope*x[i]-intercept)**2,0);
  const total=y.reduce((s,v)=>s+(v-my)**2,0);
  return {points,slope_mT2_per_V:slope,intercept_mT2:intercept,r_squared:1-residual/total,
    charge_mass_C_kg:8/(slope*1e-6*(radius_mm*1e-3)**2),radius_mm,
    formula:'$e/m = 8/[r_a^2\\cdot d(B_c^2)/d(U_a-U_f/2)]$，细阴极长同轴近似；$B_c^2$–有效电压自由截距拟合'};
}

function download(name,text,type='text/csv;charset=utf-8'){
  const url=URL.createObjectURL(new Blob(['\ufeff',text],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function csvCell(value){return '"'+String(value??'').replaceAll('"','""')+'"';}

export async function mountMeasured(container,{onRecord,onExplore}={}){
  const abort=new AbortController();
  container.classList.add('measured-workspace');
  container.innerHTML='<p class="mw-loading" role="status">正在载入真实实验记录…</p>';
  let asset;
  try {const response=await fetch(DATA_URL,{signal:abort.signal});if(!response.ok)throw Error(`数据文件 ${response.status}`);asset=await response.json();}
  catch(error){container.innerHTML=`<p role="alert">真实数据未载入：${safe(error.message)}。请通过实验室启动器打开程序。</p>`;return {destroy(){abort.abort();container.replaceChildren();}};}
  const data=unpackAsset(asset), original=asset.calibration;
  const state={mode:'magnetic',voltage:10,direction:'both',axis:'actual',normalized:false,channels:new Set(['A1','A2','sum']),selected:0,
    pickMode:false,picks:[],cutoffs:{},method:'steepest',lower:0,upper:1.5,
    slope:original.slope_mT_per_A,intercept:original.intercept_mT,radius:4.55};
  for(const voltage of [4,6,8,10]){
    const rows=selectRows(data,{voltage,direction:'up'}), found=steepestCutoff(rows);
    state.cutoffs[voltage]={...found,voltage,accelerating_V:mean(rows.map(r=>r.accelerating_actual_V)),filament_V:mean(rows.map(r=>r.CH3_voltage_V))};
  }
  const current=state.cutoffs[10];state.lower=current.current_A-.08;state.upper=current.current_A+.08;
  container.innerHTML=`
    <header class="mw-heading"><p class="mw-eyebrow">真实记录 · 2026 年 9 月 11 日</p>
      <h2>真实曲线不会在截止处突然归零</h2>
      <dl class="mw-spec">
        <div><dt>已知</dt><dd>理想曲线是阶跃：低于截止全部收集，一到截止立刻归零。</dd></div>
        <div><dt>本步要得到</dt><dd>用真实扫描指出理想模型漏掉的几段，并说清证据在哪一条记录里。</dd></div>
      </dl>
      <button type="button" data-action="explore">带当前条件去研究模型 →</button></header>
    <p class="mw-route-note" data-route-notice role="status" hidden></p>
    <section class="mw-step">
      <h3 class="mw-step-title"><span class="step-number">1</span>先看这条曲线</h3>
      <div class="mw-mode" role="group" aria-label="实测实验类型"><button type="button" data-mode="magnetic" aria-pressed="true">固定电压 · 扫励磁</button><button type="button" data-mode="voltage" aria-pressed="false">固定励磁 · 扫电压</button></div>
      <div class="mw-controls mw-controls-primary">
        <label data-magnetic>加速电压<select data-control="voltage"><option value="4">4 V · 9588</option><option value="6">6 V · 8764</option><option value="8">8 V · 3847</option><option value="10" selected>10 V · 0114</option></select></label>
      </div>
      <div class="mw-legend" role="group" aria-label="显示电流通道">${Object.keys(FIELD).map(k=>`<label style="--channel:${COLORS[k]}"><input type="checkbox" data-channel="${k}" checked><span></span>${LABELS[k]}</label>`).join('')}<small>实线：正扫　虚线：反扫</small></div>
      <div class="mw-chart-card"><div class="mw-chart-title"><h4 data-view-title></h4><span data-count></span></div>
        <svg class="mw-chart" data-chart viewBox="0 0 900 400" role="img" aria-label="实测电流曲线，可点击曲线选择一条原记录"></svg>
        <p class="mw-caption" data-chart-note></p>
      </div>
      <details class="mw-more"><summary>换一种画法：扫描方向、横坐标、纵坐标</summary>
        <div class="mw-controls">
          <label>扫描方向<select data-control="direction"><option value="both">正扫与反扫</option><option value="up">正扫</option><option value="down">反扫</option></select></label>
          <label>横坐标<select data-control="axis"><option value="actual">实际励磁电流 / A</option><option value="set">设定励磁电流 / A</option><option value="field">标定换算磁场 / mT</option></select></label>
          <label>纵坐标<select data-control="normalization"><option value="raw">原始物理电流 / μA</option><option value="normalized">相对零励磁归一化</option></select></label>
        </div>
        <p class="mw-caption">换成设定励磁作横轴，可以直接看到限压之后设定还在加、实际却停住的那一段。</p>
      </details>
    </section>
    <section class="mw-step">
      <h3 class="mw-step-title"><span class="step-number">2</span>逐条读数</h3>
      <div class="mw-readout-picker"><label>拖动选择一条原记录<input data-control="record" type="range" min="0" max="1" value="0" aria-label="选择原始记录"></label><span data-record-label></span></div>
      <div class="mw-readout" data-readout aria-live="polite"></div>
    </section>
    <section class="mw-step">
      <h3 class="mw-step-title"><span class="step-number">3</span>三个可以直接核对的事实</h3>
      <div class="mw-evidence-grid">
      <article><span class="mw-kicker">01 · 电子分配</span><h4>中央的隆起伴随保护环减少</h4><div data-bump></div><button type="button" data-action="bump">定位 10 V 隆起记录</button></article>
      <article><span class="mw-kicker">02 · 设定与实际</span><h4>末端设定增加，实际励磁会停滞</h4><p>6 V 的励磁设定从 1.44 到 1.50 A，实际约从 1.422 到 1.420 A，电源读回约 59.996 V。换成设定励磁作横轴，这一段就被拉成平台。</p><button type="button" data-action="limit">对照 6 V 末端</button></article>
      <article><span class="mw-kicker">03 · 模型与实测</span><h4>历史模型与实测对照</h4><p>${safe(asset.model_comparison.result)}</p><details><summary>查看这次模型核查条件</summary><p>${safe(asset.model_comparison.conditions)}</p></details></article>
      </div>
    </section>
    <details class="mw-step mw-fold"><summary><span class="step-number">4</span>同一工作点下，两路差多少</summary>
      <p class="mw-caption">零场取各轮 zero_before 均值；高场取正扫实际励磁 1.398 A 的原记录。合流是两路总收集，不是直接测得的阴极发射电流。</p>
      <div class="mw-table-scroll" data-comparison></div>
    </details>
    <section class="mw-step" data-magnetic>
      <h3 class="mw-step-title"><span class="step-number">5</span>从截止算比荷<button type="button" data-action="pick">在曲线上点选区间两端</button></h3>
      <p>真实曲线的截止不是唯一清晰的一点：换一种取法，比荷就换一个数。先选判据，再比较结果。</p>
      <div class="mw-controls"><label>判据<select data-control="method"><option value="steepest">区间内最大负斜率中点</option><option value="interval">所选截止区间中点</option></select></label><label>区间左端 / 实际 A<input type="number" step="0.01" min="0" max="1.5" data-control="lower"></label><label>区间右端 / 实际 A<input type="number" step="0.01" min="0" max="1.5" data-control="upper"></label><button type="button" data-action="cutoff">应用到当前电压</button></div>
      <p class="mw-caption" data-pick-note></p>
      <details><summary>方法、几何与磁场标定参数</summary><p>默认最大负斜率：对相邻原始点计算 ΔI₍A₁₎/ΔI₍励磁₎，取最负区间的横坐标中点，未平滑。区间法取两端中点；半区间宽度只表示选点范围，不是统计标准不确定度。两者都不同于原报告的平滑切线交点。</p><div class="mw-controls"><label>阳极内半径 / mm<input type="number" min="1" max="20" step="0.01" data-control="radius" value="4.55"></label><label>磁场斜率 / mT·A⁻¹<input type="number" step="0.001" data-control="slope" value="${original.slope_mT_per_A}"></label><label>磁场截距 / mT<input type="number" step="0.001" data-control="intercept" value="${original.intercept_mT}"></label><button type="button" data-action="restore">恢复主用标定</button></div><p>拟合 Bc² = 斜率 × (Ua − Uf/2) + 截距，再用 e/m = 8 / (阳极半径² × 斜率)，磁场换算成 T。半径取参数卡内径 9.0–9.2 mm 的中值。采用细阴极、长同轴近似；电压与灯丝压降取本轮正扫平均。保护环端部收集不满足这套条件，所以主通道用中央。</p></details>
      <div class="mw-table-scroll" data-cutoff-table></div><div class="mw-fit-result" data-fit></div><div class="mw-actions"><button type="button" data-action="save-fit">保存方法与比荷到笔记</button><button type="button" data-action="export-fit">导出截止与拟合 CSV</button></div>
    </section>
    <section class="mw-step">
      <h3 class="mw-step-title"><span class="step-number">6</span>留下自己的判断</h3>
      <label>我观察到什么？<textarea data-observation rows="2" placeholder="例如：中央增加时，保护环是否也增加？请注明所选记录或区间。"></textarea></label><label>这支持什么解释，还需要测什么？<textarea data-conclusion rows="2" placeholder="把观察与解释分开，也可以记录尚未解决的问题。"></textarea></label><div class="mw-actions"><button type="button" data-action="record">保存观察到实验笔记</button><button type="button" data-action="export">导出当前曲线 CSV</button><span data-notice role="status"></span></div>
    </section>
    <details class="mw-provenance"><summary>数据来源、磁场标定与实验身份</summary><p>${safe(asset.identity.instrument)}；${safe(asset.identity.channel_mapping)} 名义取样电阻均为 1000 Ω，因此 1 mV 对应 1 μA。</p><p>4 V 使用 9588（当次 CH2 实际约 3.993 V）；6 V 为 8764；8 V 为 3847；10 V 为 0114。10 V 反扫及 4 V 反扫在通信超时前结束，未补画缺失的点。本页不包含 A₂ 反接的 5234。</p><p>${safe(asset.identity.sampling)} ${safe(asset.identity.power_status)}</p><p>${safe(asset.identity.voltage_scan)} ${safe(original.explanation)} 仅 0.2–1.4 A 为标定实测范围。</p><p>曲线按原采集顺序连线，未平滑、未扣背景。归一化：四电压除以本轮 zero_before 均值；2377 除以同电压、同方向的零励磁均值。两只保护环合计为 A₂。</p><div class="mw-table-scroll" data-calibration></div><p class="mw-file">主数据：${safe(asset.magnetic_scan.source)}<br>扫压：${safe(asset.voltage_scan.source)}<br>标定：${safe(original.source)}，${original.sheet} ${original.current_cells} / ${original.field_cells}</p></details>`;

  const $=selector=>container.querySelector(selector);
  let plotted=[],scale=null,lastFit=null;
  function axisValue(row){return measurementAxis(row,state);}
  function yValue(row,channel){const value=row[FIELD[channel]];return state.normalized?value/zeroBaseline(data,row,channel):value;}
  function xLabel(){return measurementAxisLabel(state);}
  function draw(){
    plotted=selectRows(data,state);state.selected=Math.min(state.selected,plotted.length-1);
    const chart=$('[data-chart]'),width=Math.max(300,Math.round(chart.clientWidth)),right=width-28;
    chart.setAttribute('viewBox',`0 0 ${width} 400`);
    const channels=[...state.channels],xs=plotted.map(axisValue),ys=plotted.flatMap(r=>channels.map(c=>yValue(r,c)));
    const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(0,...ys),ymax=ys.length?Math.max(1e-6,...ys)*1.06:1;
    const px=x=>58+(x-xmin)/(xmax-xmin||1)*(right-58),py=y=>338-(y-ymin)/(ymax-ymin||1)*300;
    scale={px,py};
    let content=`<title>${safe(xLabel())}与两路收集电流，按原记录顺序</title>`;
    for(let i=0;i<=5;i++){const y=ymin+(ymax-ymin)*i/5,x=xmin+(xmax-xmin)*i/5;content+=`<path class="mw-grid" d="M58 ${py(y)}H${right}"/><text x="48" y="${py(y)+4}" text-anchor="end">${f(y,state.normalized?2:1)}</text><text x="${px(x)}" y="359" text-anchor="middle">${f(x,2)}</text>`;}
    content+=`<text x="${(58+right)/2}" y="388" text-anchor="middle">${xLabel()}</text><text x="58" y="20">${state.normalized?'相对零励磁电流':'电流 / μA'}</text>`;
    if(state.mode==='magnetic'){
      const cut=state.cutoffs[state.voltage],xc=state.axis==='field'?state.slope*cut.current_A+state.intercept:cut.current_A;
      if(xc>=xmin&&xc<=xmax)content+=`<path d="M${px(xc)} 36V338" stroke="#667477" stroke-dasharray="3 5"/><text x="${px(xc)+5}" y="44">中央判据${state.axis==='set'?'（实际 A 位置参照）':''}</text>`;
    }
    for(const direction of ['up','down']){
      const rows=plotted.filter(r=>(state.mode==='voltage'?r.direction:r.record_role)===direction);
      for(const channel of channels){content+=`<path d="${rows.map((r,i)=>(i?'L':'M')+f(px(axisValue(r)),2)+' '+f(py(yValue(r,channel)),2)).join(' ')}" fill="none" stroke="${COLORS[channel]}" stroke-width="2" ${direction==='down'?'stroke-dasharray="5 4"':''}/>`;
        content+=rows.map(r=>`<circle cx="${px(axisValue(r))}" cy="${py(yValue(r,channel))}" r="1.7" fill="${COLORS[channel]}"/>`).join('');}
    }
    const selected=plotted[state.selected];
    if(selected)for(const channel of channels)content+=`<circle cx="${px(axisValue(selected))}" cy="${py(yValue(selected,channel))}" r="5.5" fill="white" stroke="${COLORS[channel]}" stroke-width="2"/>`;
    $('[data-chart]').innerHTML=content;
    $('[data-view-title]').textContent=state.mode==='voltage'?'2377 · 4–10 V 扫压，每次访问前回零':`${state.voltage} V · ${asset.identity.run_voltage?Object.keys(asset.identity.run_voltage).find(k=>asset.identity.run_voltage[k]===state.voltage):''} 原始扫描`;
    $('[data-count]').textContent=`${plotted.length} 条记录 · 点击曲线读数`;
    $('[data-control="record"]').max=plotted.length-1;$('[data-control="record"]').value=state.selected;
    $('[data-chart-note]').textContent=state.mode==='voltage'?'高场实际励磁均为 1.398 A；同一电压的重复点全部保留。访问各电压之间回零，未持续保持高场。':state.axis==='field'?'磁场由主标定自由截距直线换算。0.2 A 以下和 1.4 A 以上属于外推；零励磁负值不是测得的背景场。':'按采集顺序连线。末端实际励磁停滞或回落保留下来；切换设定横轴可比较显示效果。';
    if(selected)readout(selected);
  }
  function readout(row){
    $('[data-record-label]').textContent=`${row.run_id} · 原记录 ${row.source_csv_record} · ${row.record_role}${row.direction?' / '+row.direction:''}${state.mode==='voltage'?` · 当前设定 ${row.accelerating_set_V} V / 实际 ${f(row.accelerating_actual_V)} V`:''}`;
    const quantities=[['实际励磁',`${f(row.excitation_actual_A)} A`],['设定励磁',`${f(row.excitation_set_mA/1000)} A`],['CH1 电压',`${f(row.CH1_voltage_V)} V`],['实际加速',`${f(row.accelerating_actual_V)} V`],['灯丝压降',`${f(row.CH3_voltage_V)} V`],['标定磁场',`${f(state.slope*row.excitation_actual_A+state.intercept)} mT`],['中央 A₁',`${f(row.physical_A1_current_uA)} μA`],['保护环 A₂',`${f(row.physical_A2_current_uA)} μA`],['总收集',`${f(row.physical_sum_current_uA)} μA`]];
    $('[data-readout]').innerHTML=`<div class="mw-values">${quantities.map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('')}</div><p>距本轮开始 ${f(row.elapsed_s,2)} s；A₁ ${safe(row.A1_time.split('T')[1])}，A₂ ${safe(row.A2_time.split('T')[1])}。${row.near_60V_limit_inferred?'电源接近 60 V 限压阈值。':''}${!row.within_measured_field_calibration_range?'该点磁场属标定区间外推。':''} 实际励磁在设定 1.46 A 处见顶 1.443 A，设定继续加到 1.50 A 反而降到 1.441 A，读回电压贴近量程：恒压段。1.44 A 之前实际跟随设定，是恒流段。热模型先前算出的转折点也是 1.44 A。</p>`;
  }
  function fit(){
    lastFit=fitChargeMass(Object.values(state.cutoffs),{slope_mT_per_A:state.slope,intercept_mT:state.intercept,radius_mm:state.radius});
    $('[data-cutoff-table]').innerHTML=`<table><thead><tr><th>电压</th><th>中央截止 / A</th><th>方法</th><th>采用区间 / A</th><th>Bc / mT</th><th>Ua−Uf/2 / V</th></tr></thead><tbody>${lastFit.points.map(p=>`<tr><td>${p.voltage} V</td><td>${f(p.current_A,4)}</td><td>${safe(p.method)}</td><td>${f(p.lower_A)}–${f(p.upper_A)}</td><td>${f(p.field_mT)}</td><td>${f(p.effective_voltage_V)}</td></tr>`).join('')}</tbody></table>`;
    $('[data-fit]').innerHTML=`<div><span>四电压自由截距拟合 · 中央通道</span><strong>${f(lastFit.charge_mass_C_kg/1e11,4)} × 10¹¹ C/kg</strong></div><p>Bc² = ${f(lastFit.slope_mT2_per_V,6)} × (Ua−Uf/2) ${lastFit.intercept_mT2<0?'−':'+'} ${f(Math.abs(lastFit.intercept_mT2),6)}，单位 mT²；R² = ${f(lastFit.r_squared,6)}。选点方法与几何假设都会改变结果；R² 高只表示这四点接近直线。</p>`;
  }
  function renderComparison(){
    const rows=[4,6,8,10].map(voltage=>{
      const all=data.magnetic.filter(r=>r.nominal_voltage_V===voltage),zero=all.filter(r=>r.record_role==='zero_before'),high=all.find(r=>r.record_role==='up'&&Math.abs(r.excitation_actual_A-1.398)<1e-6);
      return `<tr><td>${voltage} V</td><td>${f(mean(zero.map(r=>r.physical_A1_current_uA)))}</td><td>${f(mean(zero.map(r=>r.physical_A2_current_uA)))}</td><td>${f(high.physical_A1_current_uA)}</td><td>${f(high.physical_A2_current_uA)}</td><td>${high.run_id} / ${high.source_csv_record}</td></tr>`;
    });
    $('[data-comparison]').innerHTML=`<table><thead><tr><th>加速电压</th><th>零场中央 / μA</th><th>零场保护环 / μA</th><th>高场中央 / μA</th><th>高场保护环 / μA</th><th>高场原记录</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
    const up=selectRows(data,{voltage:10,direction:'up'}),a=up.find(r=>Math.abs(r.excitation_actual_A-.299)<1e-6),b=up.find(r=>Math.abs(r.excitation_actual_A-.939)<1e-6);
    const delta=key=>b[key]-a[key];
    $('[data-bump]').innerHTML=`<p>10 V 实际励磁 ${f(a.excitation_actual_A)} → ${f(b.excitation_actual_A)} A：中央 +${f(delta(FIELD.A1))} μA，保护环 ${f(delta(FIELD.A2))} μA，总收集 ${f(delta(FIELD.sum))} μA。</p><p class="mw-caption">0114 原记录 ${a.source_csv_record} 与 ${b.source_csv_record}。这支持收集重新分配；灯丝梯度的因果对照在模型中检验。</p>`;
    $('[data-calibration]').innerHTML=`<table><thead><tr><th>工作表行</th><th>实际励磁 / A</th><th>5 个空间读数 / mT</th><th>平均 / mT</th></tr></thead><tbody>${original.points.map(p=>`<tr><td>${p.workbook_row}</td><td>${p.current_A}</td><td>${p.fields_mT.join('，')}</td><td>${f(p.mean_mT)}</td></tr>`).join('')}</tbody></table><p>原始拟合：B/mT = ${f(original.slope_mT_per_A,9)} × I/A ${f(original.intercept_mT,9)}，R² = ${f(original.r_squared,6)}。</p>`;
  }
  function sync(){
    container.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===state.mode)));
    container.querySelectorAll('[data-magnetic]').forEach(el=>el.hidden=state.mode!=='magnetic');
    $('[data-control="voltage"]').value=state.voltage;$('[data-control="direction"]').value=state.direction;
    const axis=$('[data-control="axis"]');
    axis.innerHTML=state.mode==='voltage'?'<option value="actual">实际加速电压 / V</option><option value="set">设定加速电压 / V</option>':'<option value="actual">实际励磁电流 / A</option><option value="set">设定励磁电流 / A</option><option value="field">标定换算磁场 / mT</option>';
    axis.value=state.axis;$('[data-control="lower"]').value=f(state.lower,3);$('[data-control="upper"]').value=f(state.upper,3);
    draw();fit();
  }
  function record(type,title,observations,conclusion,conditions){
    if(onRecord){onRecord({type,title,conditions,observations,conclusion});$('[data-notice]').textContent='已保存到实验笔记。';}
    else {download('实验观察.json',JSON.stringify({type,title,conditions,observations,conclusion},null,2),'application/json;charset=utf-8');$('[data-notice]').textContent='已导出观察记录。';}
  }
  function conditions(){return measurementConditions(data,state);}
  container.addEventListener('change',event=>{
    const t=event.target;
    if(t.dataset.channel){if(t.checked)state.channels.add(t.dataset.channel);else state.channels.delete(t.dataset.channel);draw();return;}
    const key=t.dataset.control;if(!key)return;
    if(key==='voltage'){state.voltage=+t.value;state.selected=0;const c=state.cutoffs[state.voltage];state.lower=c.current_A-.08;state.upper=c.current_A+.08;sync();return;}
    if(key==='direction'||key==='axis'){state[key]=t.value;state.selected=0;draw();}
    if(key==='normalization'){state.normalized=t.value==='normalized';draw();}
    if(['method','lower','upper'].includes(key))state[key]=key==='method'?t.value:+t.value;
    if(['radius','slope','intercept'].includes(key)){
      if(!Number.isFinite(+t.value)||t.value===''||(key!=='intercept'&&+t.value<=0)){t.value=state[key];return;}
      state[key]=+t.value;fit();draw();
    }
  },{signal:abort.signal});
  container.addEventListener('input',event=>{
    const key=event.target.dataset.control,value=event.target.valueAsNumber;
    if(['lower','upper'].includes(key))state[key]=value;
    if(['radius','slope','intercept'].includes(key)&&Number.isFinite(value)&&(key==='intercept'||value>0)){
      state[key]=value;fit();draw();
    }
  },{signal:abort.signal});
  $('[data-control="record"]').addEventListener('input',event=>{state.selected=+event.target.value;draw();},{signal:abort.signal});
  $('[data-chart]').addEventListener('click',event=>{
    const svg=$('[data-chart]'),point=new DOMPoint(event.clientX,event.clientY).matrixTransform(svg.getScreenCTM().inverse());
    let nearest=0,distance=Infinity;
    plotted.forEach((r,i)=>{const dx=scale.px(axisValue(r))-point.x,dy=Math.min(...[...state.channels].map(c=>Math.abs(scale.py(yValue(r,c))-point.y)));const d=dx*dx+dy*dy;if(d<distance){distance=d;nearest=i;}});
    state.selected=nearest;
    if(state.pickMode){state.picks.push(plotted[nearest].excitation_actual_A);if(state.picks.length===2){[state.lower,state.upper]=state.picks.sort((a,b)=>a-b);state.pickMode=false;state.picks=[];$('[data-pick-note]').textContent='区间已选好。选择判据，然后点击“应用到当前电压”。';sync();}else $('[data-pick-note]').textContent='已选第一端，请再点选另一端。';}
    draw();
  },{signal:abort.signal});
  container.addEventListener('click',event=>{
    const t=event.target.closest('button');if(!t)return;
    if(t.dataset.mode){state.mode=t.dataset.mode;state.axis='actual';state.selected=0;state.pickMode=false;sync();return;}
    const action=t.dataset.action;
    if(action==='explore')onExplore?.(explorationFromMeasurement(data,state));
    if(action==='bump'){state.mode='magnetic';state.voltage=10;state.direction='up';state.axis='actual';state.selected=selectRows(data,state).findIndex(r=>Math.abs(r.excitation_actual_A-.939)<1e-6);sync();}
    if(action==='limit'){state.mode='magnetic';state.voltage=6;state.direction='up';state.axis='set';state.selected=selectRows(data,state).length-1;sync();}
    if(action==='record')record('measured-observation','真实实验观察',$('[data-observation]').value,$('[data-conclusion]').value,conditions());
    if(action==='export'){const exported=measurementCsv(data,state);download(exported.filename,exported.text);}
    if(action==='pick'){state.pickMode=true;state.picks=[];$('[data-pick-note]').textContent='请在上方曲线依次点选区间的两端。选点使用对应的实际励磁值。';$('[data-chart]').scrollIntoView({behavior:'smooth',block:'center'});}
    if(action==='cutoff'){
      state.lower=$('[data-control="lower"]').valueAsNumber;state.upper=$('[data-control="upper"]').valueAsNumber;
      if(!(state.lower>=0&&state.upper>state.lower&&state.upper<=1.6)){$('[data-pick-note]').textContent='区间右端应大于左端，且位于 0–1.6 A 内。';return;}
      let result;
      if(state.method==='steepest')result=steepestCutoff(selectRows(data,{voltage:state.voltage,direction:'up'}),{lower_A:state.lower,upper_A:state.upper});
      else {const eligible=selectRows(data,{voltage:state.voltage,direction:'up'}).filter(r=>r.is_forward_cutoff_fit_point&&r.excitation_actual_A>=state.lower&&r.excitation_actual_A<=state.upper);if(eligible.length>=2)result={current_A:(state.lower+state.upper)/2,lower_A:state.lower,upper_A:state.upper,source_records:eligible.map(r=>r.source_csv_record),slope_uA_per_A:null,method:'用户截止区间中点'};}
      if(!result){$('[data-pick-note]').textContent='这个区间没有足够的有效正扫下降点。扩大区间，或重新选择截止附近。';return;}
      state.cutoffs[state.voltage]={...state.cutoffs[state.voltage],...result};$('[data-pick-note]').textContent=`已更新 ${state.voltage} V 中央判据。区间与方法已保留，可和其余三个电压一起导出。`;fit();draw();
    }
    if(action==='restore'){state.slope=original.slope_mT_per_A;state.intercept=original.intercept_mT;$('[data-control="slope"]').value=state.slope;$('[data-control="intercept"]').value=state.intercept;fit();draw();}
    if(action==='save-fit')record('measured-charge-mass','中央通道比荷估算',`${lastFit.points.length} 个电压，e/m=${lastFit.charge_mass_C_kg} C/kg，R²=${lastFit.r_squared}`,$('[data-conclusion]').value,{...conditions(),拟合:lastFit,截止定义:Object.values(state.cutoffs)});
    if(action==='export-fit'){
      const columns=['voltage_V','actual_accelerating_V','filament_V','effective_voltage_V','cutoff_actual_A','interval_low_A','interval_high_A','method','source_records','cutoff_B_mT','calibration_slope_mT_per_A','calibration_intercept_mT','radius_mm','fit_slope_mT2_per_V','fit_intercept_mT2','fit_R2','charge_mass_C_kg'];
      const rows=lastFit.points.map(p=>[p.voltage,p.accelerating_V,p.filament_V,p.effective_voltage_V,p.current_A,p.lower_A,p.upper_A,p.method,p.source_records.join('|'),p.field_mT,state.slope,state.intercept,state.radius,lastFit.slope_mT2_per_V,lastFit.intercept_mT2,lastFit.r_squared,lastFit.charge_mass_C_kg]);
      download('中央截止与比荷_方法记录.csv',[columns,...rows].map(r=>r.map(csvCell).join(',')).join('\r\n'));
    }
  },{signal:abort.signal});
  renderComparison();sync();
  let chartWidth=0;
  const resize=new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(width>0&&width!==chartWidth){chartWidth=width;draw();}});resize.observe($('.mw-chart-card'));
  return {
    setVoltage(voltage){
      if(![4,6,8,10].includes(Number(voltage))){$('[data-route-notice]').textContent=`${voltage} V 暂无对应实测；现有记录为 4、6、8、10 V，当前选择保持不变。`;$('[data-route-notice]').hidden=false;return false;}
      $('[data-route-notice]').hidden=true;
      state.mode='magnetic';state.voltage=Number(voltage);state.axis='actual';state.direction='both';state.selected=0;
      const cutoff=state.cutoffs[state.voltage];state.lower=cutoff.current_A-.08;state.upper=cutoff.current_A+.08;sync();return true;
    },
    destroy(){resize.disconnect();abort.abort();container.replaceChildren();container.classList.remove('measured-workspace');},
    getState(){return {...state,fit:lastFit};}
  };
}
