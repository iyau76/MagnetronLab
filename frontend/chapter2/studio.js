import {renderMath} from '../mathlite.js';
import {svgLabel} from '../chapter3/svg-tex.js';
const CURRENTS = [0.0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.4];
const CALIBRATION_DATA = {};
const MEANS = {};
const HOLES = [
  {id:0, code:'1', name:'左上'},
  {id:1, code:'2', name:'右上'},
  {id:2, code:'3', name:'中心 C', center:true},
  {id:3, code:'4', name:'左下'},
  {id:4, code:'5', name:'右下'},
];
const WIRE_MODES = [
  {id:'left',   title:'接入左线圈（单侧）', sub:'CH1⁺ → L⁺，L⁻ → CH1⁻', verdict:'只有左线圈通电，磁场主要集中在左侧线圈平面附近，到了中央管区就随距离迅速衰弱。'},
  {id:'right',  title:'接入右线圈（单侧）', sub:'CH1⁺ → R⁺，R⁻ → CH1⁻', verdict:'只有右线圈通电，磁场峰值偏在右侧，整个管区的轴向磁场左右很不对称。'},
  {id:'aiding', title:'双线圈串联顺接',     sub:'CH1⁺ → L⁺ → L⁻ → R⁺ → R⁻ → CH1⁻', verdict:'两线圈间距等于线圈半径且电流同向，它们在中央区域叠加出一段几乎平坦的匀强磁场高原。'},
  {id:'oppose', title:'双线圈串联反接',     sub:'CH1⁺ → L⁺ → L⁻ → R⁻ → R⁺ → CH1⁻', verdict:'右线圈电流反向，两个线圈在正中产生的轴向磁场大小相等、方向相反，中心合场强抵消为零。'},
];

const state = {
  stage: '2.1',
  measurementStarted: false,
  leftPanel: 'circuit',
  rightPanel: 'bz',
  wireMode: 'aiding',
  dRatio: 1.00,
  seenWire: new Set(['aiding']),
  showFieldLines: true,
  currentIdx: 3,
  meterOn: false,
  capRemoved: false,
  activeHole: null,
  measured: {},
  fitted: false,
  savedToBook: false,
  autoScanning: false,
};

const $ = s => document.querySelector(s);

let toastTimer = null;
function toast(msg){
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.hidden = true, 2600);
}

function calcBz(z, I, mode, dRatio = state.dRatio){
  const R = 113.5, d = R * dRatio;
  const fL = Math.pow(1 + Math.pow((z + d/2)/R, 2), -1.5);
  const fR = Math.pow(1 + Math.pow((z - d/2)/R, 2), -1.5);
  const scale = (4.231 * I) / (2 * Math.pow(0.8, 1.5));
  if(mode==='left') return scale * fL;
  if(mode==='right') return scale * fR;
  if(mode==='oppose') return scale * (fL - fR);
  return scale * (fL + fR);
}

function renderWireModes(){
  const host = $('#wire-modes');
  host.innerHTML = '';
  for(const m of WIRE_MODES){
    const btn = document.createElement('button');
    btn.className = 'wire-opt' + (state.wireMode===m.id ? ' is-selected' : '');
    btn.innerHTML = `<span class="wire-dot"></span><div><strong>${m.title}</strong><small class="mono">${m.sub}</small></div><span class="seen">${state.seenWire.has(m.id)?'✓':''}</span>`;
    btn.onclick = async()=>{
      changeGeometry();
      const token=serial;
      switching=true;
      state.wireMode = m.id;
      state.seenWire.add(m.id);
      render();
      await delay(260);
      if(token!==serial)return;
      switching=false;
      render();
    };
    host.appendChild(btn);
  }
  const cur = WIRE_MODES.find(m=>m.id===state.wireMode);
  if(state.wireMode === 'aiding'){
    if(Math.abs(state.dRatio - 1) <= 0.005){
      $('#wire-verdict').textContent = '两线圈间距等于线圈半径且电流同向，它们在中央区域叠加出一段几乎平坦的匀强磁场高原。';
    } else if(state.dRatio < 1){
      $('#wire-verdict').textContent = '两线圈靠得过近（d < R），中心叠加场强偏高且呈单峰凸起，35 mm 管区均匀度迅速变差。';
    } else {
      $('#wire-verdict').textContent = '两线圈拉得过远（d > R），两峰值相互分离，正中出现凹陷的双峰“马鞍谷”。';
    }
  } else {
    $('#wire-verdict').textContent = cur.verdict;
  }

  const mm = (113.5 * state.dRatio).toFixed(1);
  const isSnap = Math.abs(state.dRatio - 1) <= 0.005;
  $('#spacing-slider').value = state.dRatio.toFixed(2);
  $('#spacing-readout').textContent = `d = ${state.dRatio.toFixed(2)} R (${mm} mm)`;
  $('#btn-snap-dr').classList.toggle('is-snapped', isSnap);
  $('#btn-snap-dr').textContent = isSnap ? '◆ d = R 吸附中' : '↺ 吸附回 d = R';
}

function renderCircuitSVG(){
  const svg = $('#circuit-svg');
  const m = state.wireMode;
  const activeL = m !== 'right';
  const activeR = m !== 'left';
  const wireActive = '#e1b56e', wireRet = '#6eb4de';
  const strokeL = activeL ? '#d69755' : '#4a5a68';
  const strokeR = activeR ? (m==='oppose' ? '#70b3df' : '#d69755') : '#4a5a68';

  let paths = '';
  // Left coil at x=126, Right coil at x=258 => open air x=145..240 for clean center vector tag
  if(m==='left'){
    paths += `<path d="M56 54 V30 H126 V46" stroke="${wireActive}" stroke-width="2.3" fill="none"/>`;
    paths += `<path d="M126 100 V120 H56 V90" stroke="${wireRet}" stroke-width="2.3" fill="none"/>`;
  } else if(m==='right'){
    paths += `<path d="M56 54 V24 H258 V46" stroke="${wireActive}" stroke-width="2.3" fill="none"/>`;
    paths += `<path d="M258 100 V120 H56 V90" stroke="${wireRet}" stroke-width="2.3" fill="none"/>`;
  } else if(m==='aiding'){
    paths += `<path d="M56 54 V30 H126 V46" stroke="${wireActive}" stroke-width="2.3" fill="none"/>`;
    paths += `<path d="M126 100 V112 H152 V30 H258 V46" stroke="#c8cf92" stroke-width="2.2" fill="none"/>`;
    paths += `<path d="M258 100 V120 H56 V90" stroke="${wireRet}" stroke-width="2.3" fill="none"/>`;
  } else {
    paths += `<path d="M56 54 V30 H126 V46" stroke="${wireActive}" stroke-width="2.3" fill="none"/>`;
    paths += `<path d="M126 100 V110 H258 V100" stroke="#c8cf92" stroke-width="2.2" fill="none"/>`;
    paths += `<path d="M258 46 V22 H78 V120 H56 V90" stroke="${wireRet}" stroke-width="2.2" fill="none" stroke-dasharray="5 2"/>`;
  }

  const arrowDir = (x,y,up)=> up
    ? `<polygon points="${x},${y-6} ${x-4},${y+2} ${x+4},${y+2}" fill="#f0cf92"/>`
    : `<polygon points="${x},${y+6} ${x-4},${y-2} ${x+4},${y-2}" fill="#7cc0eb"/>`;

  svg.innerHTML = `
    <rect x="4" y="4" width="328" height="138" rx="5" fill="#0d1a26"/>
    ${paths}
    <line x1="40" y1="64" x2="72" y2="64" stroke="#f0d9b3" stroke-width="2.5"/>
    <line x1="47" y1="74" x2="65" y2="74" stroke="#f0d9b3" stroke-width="4.2"/>
    <line x1="56" y1="54" x2="56" y2="64" stroke="#f0d9b3" stroke-width="2"/>
    <line x1="56" y1="74" x2="56" y2="90" stroke="#f0d9b3" stroke-width="2"/>
    <text x="14" y="71" fill="#d6ac73" font-size="12" font-weight="700" font-family="Consolas">CH1</text>
    <text x="14" y="86" fill="#89a1b3" font-size="10.5" font-family="Consolas">${CURRENTS[state.currentIdx].toFixed(2)} A</text>
    <text x="62" y="58" fill="#f0c888" font-size="11" font-family="Consolas">+</text>
    <text x="62" y="88" fill="#7dc0e8" font-size="11" font-family="Consolas">−</text>

    <g>
      <rect x="112" y="46" width="28" height="54" rx="4" fill="#172b3a" stroke="${strokeL}" stroke-width="2"/>
      <path d="M118 53 C132 53,132 62,118 62 C132 62,132 71,118 71 C132 71,132 80,118 80 C132 80,132 89,118 89" stroke="${strokeL}" stroke-width="1.8" fill="none"/>
      <circle cx="126" cy="46" r="3.2" fill="#d97757"/><text x="135" y="44" fill="#d8b990" font-size="10" font-family="Consolas">L⁺</text>
      <circle cx="126" cy="100" r="3.2" fill="#5b96be"/><text x="135" y="106" fill="#9bc2db" font-size="10" font-family="Consolas">L⁻</text>
      <text x="126" y="135" text-anchor="middle" fill="${activeL?'#e8eef3':'#697c8c'}" font-size="11">左线圈</text>
      ${activeL ? arrowDir(103,72,false) : ''}
    </g>

    <g>
      <rect x="244" y="46" width="28" height="54" rx="4" fill="#172b3a" stroke="${strokeR}" stroke-width="2"/>
      <path d="M250 53 C264 53,264 62,250 62 C264 62,264 71,250 71 C264 71,264 80,250 80 C264 80,264 89,250 89" stroke="${strokeR}" stroke-width="1.8" fill="none"/>
      <circle cx="258" cy="46" r="3.2" fill="#5b96be"/><text x="275" y="44" fill="#9bc2db" font-size="10" font-family="Consolas">R⁺</text>
      <circle cx="258" cy="100" r="3.2" fill="#8fa3b3"/><text x="275" y="106" fill="#9bc2db" font-size="10" font-family="Consolas">R⁻</text>
      <text x="258" y="135" text-anchor="middle" fill="${activeR?'#e8eef3':'#697c8c'}" font-size="11">右线圈</text>
      ${activeR ? arrowDir(282,72, m==='oppose') : ''}
    </g>

    <!-- Clear air gap between coils (x=166..234, y=54..92) -->
    <g transform="translate(198,74)">
      <text x="0" y="-11" text-anchor="middle" fill="#8fa8bc" font-size="10">中轴磁场方向</text>
      ${m==='oppose'
        ? `<line x1="-22" y1="2" x2="22" y2="2" stroke="#62788a" stroke-dasharray="3 2"/><text x="0" y="14" text-anchor="middle" fill="#e6b66f" font-size="10.5" font-family="Consolas">B(0) = 0</text>`
        : `<line x1="-22" y1="2" x2="18" y2="2" stroke="#78c4eb" stroke-width="2.4"/><polygon points="24,2 15,-2.5 15,6.5" fill="#78c4eb"/><text x="0" y="15" text-anchor="middle" fill="#85d5c1" font-size="10" font-family="Consolas">B_z →</text>`
      }
    </g>
  `;
}

function renderBzChart(){
  const svg = $('#bz-svg');
  const I = CURRENTS[state.currentIdx];
  const m = state.wireMode;
  const dRat = state.dRatio;
  const halfD = 56.75 * dRat;
  const W=388, H=196, padL=40, padR=14, padT=26, padB=28;

  let peak = 0;
  for(let z=-150; z<=150; z+=5) peak = Math.max(peak, Math.abs(calcBz(z, I, m, dRat)));
  const xMin=-150, xMax=150;
  const yMin = (m==='oppose' ? -Math.max(1.8, peak*1.12) : -0.1);
  const yMax = (m==='oppose' ? Math.max(1.8, peak*1.12) : Math.max(2.65, peak*1.16));
  const mapX = z => padL + (z - xMin)/(xMax - xMin)*(W - padL - padR);
  const mapY = b => H - padB - (b - yMin)/(yMax - yMin)*(H - padT - padB);

  let pts = [];
  for(let z=-150; z<=150; z+=3){
    pts.push(`${mapX(z).toFixed(1)},${mapY(calcBz(z, I, m, dRat)).toFixed(1)}`);
  }
  const coilL = mapX(-halfD), coilR = mapX(halfD);
  const tubeL = mapX(-17.5), tubeR = mapX(17.5), a1L = mapX(-7.5), a1R = mapX(7.5);
  const yList = m==='oppose' ? [-1.5,-1,0,1,1.5] : (yMax > 2.8 ? [0,0.5,1.0,1.5,2.0,2.5,3.0] : [0,0.5,1.0,1.5,2.0]);

  let yTicks = '';
  for(const yv of yList){
    if(yv > yMax - 0.05) continue;
    const py = mapY(yv);
    yTicks += `<line x1="${padL}" y1="${py}" x2="${W-padR}" y2="${py}" stroke="${yv===0?'#486277':'#1c2e3e'}" stroke-width="${yv===0?1.3:1}"/>`;
    yTicks += `<text x="${padL-5}" y="${py+3.5}" text-anchor="end" fill="#8ba2b5" font-size="9.5" font-family="Consolas">${yv.toFixed(1)}</text>`;
  }
  let xTicks = '';
  for(const zv of [-120,-60,0,60,120]){
    const px = mapX(zv);
    xTicks += `<line x1="${px}" y1="${H-padB}" x2="${px}" y2="${H-padB+4}" stroke="#4e6579"/>`;
    xTicks += `<text x="${px}" y="${H-padB+14}" text-anchor="middle" fill="#8ba2b5" font-size="9.5" font-family="Consolas">${zv}</text>`;
  }

  const labelL = Math.abs(dRat-1)<=0.005 ? '左线圈 -R/2' : '左 -d/2';
  const labelR = Math.abs(dRat-1)<=0.005 ? '右线圈 +R/2' : '右 +d/2';
  const anchorL = coilL < padL + 66 ? 'start' : 'end';
  const xLabL = coilL + (anchorL==='start' ? 4 : -4);
  const anchorR = coilR > W - padR - 66 ? 'end' : 'start';
  const xLabR = coilR + (anchorR==='end' ? -4 : 4);

  svg.innerHTML = `
    <rect x="${padL}" y="${padT}" width="${W-padL-padR}" height="${H-padT-padB}" fill="#0a1621"/>
    <!-- 35 mm filament & anode collecting zone -->
    <rect x="${tubeL}" y="${padT}" width="${tubeR-tubeL}" height="${H-padT-padB}" fill="#75b6e618"/>
    <rect x="${a1L}" y="${padT}" width="${a1R-a1L}" height="${H-padT-padB}" fill="#d6ac732c"/>
    <text x="${mapX(0)}" y="${padT-13}" text-anchor="middle" fill="#f0d3a0" font-size="9.5">中央 A₁ (15 mm) · 全管收集域 35 mm</text>
    ${yTicks}
    ${xTicks}
    <line x1="${coilL}" y1="${padT}" x2="${coilL}" y2="${H-padB}" stroke="#cf8e55" stroke-dasharray="4 3" stroke-width="1.2"/>
    <line x1="${coilR}" y1="${padT}" x2="${coilR}" y2="${H-padB}" stroke="#cf8e55" stroke-dasharray="4 3" stroke-width="1.2"/>
    <text x="${xLabL}" y="${padT+12}" text-anchor="${anchorL}" fill="#cf9863" font-size="9.5">${labelL}</text>
    <text x="${xLabR}" y="${padT+12}" text-anchor="${anchorR}" fill="#cf9863" font-size="9.5">${labelR}</text>
    <polyline points="${pts.join(' ')}" fill="none" stroke="#75c5f0" stroke-width="2.4" stroke-linejoin="round"/>
    <circle cx="${mapX(0)}" cy="${mapY(calcBz(0,I,m,dRat))}" r="4" fill="#d6ac73" stroke="#0d1c29" stroke-width="1.5"/>
    <text x="${padL-5}" y="${padT-8}" text-anchor="end" fill="#9fb5c7" font-size="9.5" font-family="Consolas">mT</text>
    <text x="${W-padR}" y="${H-5}" text-anchor="end" fill="#9fb5c7" font-size="9.5" font-family="Consolas">z / mm</text>
  `;

  const b0 = calcBz(0, I, m, dRat);
  const b175 = calcBz(17.5, I, m, dRat);
  const bNeg175 = calcBz(-17.5, I, m, dRat);
  const spanUniformity = (halfSpan) => {
    let mn = Infinity, mx = -Infinity, sum = 0, n = 0;
    for(let z=-halfSpan; z<=halfSpan+1e-6; z+=0.5){
      const v = calcBz(z, I, m, dRat);
      mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; n++;
    }
    return Math.abs(sum)<1e-12?0:((mx - mn) / (sum / n)) * 100;
  };
  const stats = $('#bz-stats');
  if(m==='aiding'){
    const u35 = spanUniformity(17.5), u15 = spanUniformity(7.5);
    const fmt = v => v < 0.01 ? v.toFixed(3) : v.toFixed(2);
    stats.innerHTML = `<span>中心 <b class="mono">${b0.toFixed(3)} mT</b></span><span>35 mm 不均匀度 <strong>${fmt(u35)}%</strong>（A₁ ${fmt(u15)}%）</span>`;
  } else if(m==='oppose'){
    stats.innerHTML = `<span>中心 <b class="mono">0.000 mT</b></span><span>全管反转 <b class="mono">${bNeg175.toFixed(2)} → ${b175.toFixed(2)} mT</b></span>`;
  } else {
    const u35 = spanUniformity(17.5);
    stats.innerHTML = `<span>中心 <b class="mono">${b0.toFixed(3)} mT</b>（减半）</span><span>35 mm 管区落差 <strong>${u35.toFixed(1)}%</strong></span>`;
  }
}

function standardGeometry(){return state.wireMode==='aiding'&&Math.abs(state.dRatio-1)<.005;}
function allMeasured(){return [0.2,0.4,0.5,0.6,0.8,1,1.2,1.4].every(I=>(state.measured[String(I)]||[]).filter(x=>x!=null).length===5);}
function selectedFieldValue(){
 if(!state.meterOn||!state.capRemoved||state.activeHole==null||switching||!standardGeometry())return null;
 const I=CURRENTS[state.currentIdx];return I===0?-.19:CALIBRATION_DATA[I][state.activeHole];
}
function currentReading(){return probeReady?selectedFieldValue():null;}
function syncWorkstation(){
 if(!connected)return;
 const I=switching?0:CURRENTS[state.currentIdx];
 // The 3D instrument gates this value on its actual probe position. Read that same
 // readiness back before painting the HUD, including after skip or cap changes.
 const ready=host?.update({wireMode:state.wireMode,dRatio:state.dRatio,current:I,fast:state.autoScanning,exploring:state.leftPanel==='circuit',showFieldLines:state.showFieldLines,meterOn:state.meterOn,capRemoved:state.capRemoved,activeHole:state.activeHole,reading:selectedFieldValue(),measured:state.measured[String(I)]??[]});
 if(typeof ready==='boolean')probeReady=ready;
 host?.save(snapshot());
}

function renderCalibrationTable(){
  const tbody = $('#cal-table tbody');
  const curI = CURRENTS[state.currentIdx];
  tbody.innerHTML = '';
  for(const rowI of [0.2, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.4]){
    const k = String(rowI);
    const arr = state.measured[k] || [];
    const done = arr.filter(v=>v!=null).length === 5;
    const isCur = Math.abs(curI - rowI) < 1e-6;
    const tr = document.createElement('tr');
    tr.className = (isCur ? 'is-cur ' : '') + (done ? 'is-done' : '');
    let cells = `<td class="mono">${rowI.toFixed(2)}${rowI===0.5?'<span class="star-tag">★</span>':''}</td>`;
    for(let j=0;j<5;j++){
      const val = arr[j];
      const fresh = isCur && state.activeHole===j && val!=null;
      cells += `<td class="mono ${fresh?'is-fresh':''}">${val!=null ? val.toFixed(2) : '·'}</td>`;
    }
    cells += `<td class="mono">${done ? MEANS[rowI].toFixed(3) : '·'}</td>`;
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  }
}

function renderFitSVG(){
  const svg = $('#fit-svg');
  const W=388, H=198, padL=38, padR=24, padT=22, padB=40;
  const xMin=0, xMax=1.44, yMin=-0.6, yMax=6.5;
  const mapX = x => padL + (x - xMin)/(xMax - xMin)*(W - padL - padR);
  const mapY = y => H - padB - (y - yMin)/(yMax - yMin)*(H - padT - padB);

  let grid = '';
  for(const yv of [0,2,4,6]){
    const py = mapY(yv);
    grid += `<line x1="${padL}" y1="${py}" x2="${W-padR}" y2="${py}" stroke="${yv===0?'#486277':'#1c2e3e'}"/>`;
    grid += `<text x="${padL-5}" y="${py+3.5}" text-anchor="end" fill="#8ea4b6" font-size="12" font-family="Consolas">${yv}</text>`;
  }
  for(const xv of [0,0.4,0.8,1.2,1.4]){
    const px = mapX(xv);
    grid += `<line x1="${px}" y1="${padT}" x2="${px}" y2="${H-padB}" stroke="#192a39"/>`;
    grid += `<text x="${px}" y="${H-padB+13}" text-anchor="middle" fill="#8ea4b6" font-size="12" font-family="Consolas">${xv.toFixed(1)}</text>`;
  }

  let pointsSvg = '';
  for(const rowI of [0.2,0.4,0.5,0.6,0.8,1.0,1.2,1.4]){
    const arr = state.measured[String(rowI)] || [];
    const filled = arr.filter(v=>v!=null);
    if(!filled.length) continue;
    for(const v of filled){
      pointsSvg += `<circle cx="${mapX(rowI)}" cy="${mapY(v)}" r="2" fill="#84b8d9" opacity="0.48"/>`;
    }
    if(filled.length === 5){
      pointsSvg += `<circle cx="${mapX(rowI)}" cy="${mapY(MEANS[rowI])}" r="4.1" fill="#85d5c1" stroke="#0c1c28" stroke-width="1.2"/>`;
    }
  }

  let fitLineSvg = '';
  if(state.fitted){
    const k=state.fit?.slope??4.230907194994787,b0=state.fit?.intercept??-.18806673618352443,b02=k*.2+b0,b14=k*1.4+b0;
    const lx = mapX(0), ly = mapY(b0);
    fitLineSvg = `
      <line x1="${lx}" y1="${ly}" x2="${mapX(0.2)}" y2="${mapY(b02)}" stroke="#d6ac73" stroke-width="1.8" stroke-dasharray="4 3"/>
      <line x1="${mapX(0.2)}" y1="${mapY(b02)}" x2="${mapX(1.4)}" y2="${mapY(b14)}" stroke="#d6ac73" stroke-width="2.2"/>
      <circle cx="${lx}" cy="${ly}" r="4" fill="#eab364" stroke="#0b1721" stroke-width="1.4"/>
      <path d="M${lx+5} ${ly-3}L${lx+12} ${ly-19}" stroke="#d6ac73" fill="none"/>
      <rect x="${lx+9}" y="${ly-36}" width="111" height="19" rx="3" fill="#0a1621e0"/>
      <text x="${lx+13}" y="${ly-22}" fill="#f0cf95" font-size="12" font-family="Consolas">(0, −0.188 mT)</text>
    `;
  }

  svg.innerHTML = `
    <rect x="${padL}" y="${padT}" width="${W-padL-padR}" height="${H-padT-padB}" fill="#0a1621"/>
    ${grid}
    ${fitLineSvg}
    ${pointsSvg}
    <text x="${padL-4}" y="${padT-3}" text-anchor="end" fill="#9fb5c7" font-size="12" font-family="Consolas">B/mT</text>
    ${svgLabel(W-6,H-6,'I_M / A','text-anchor="end" fill="#9fb5c7" font-size="12"')}
  `;
}

let host=null,serial=0,pending=false,saving=false,switching=false,probeReady=false,connected=false;
const snapshot=()=>({...state,seenWire:[...state.seenWire],autoScanning:false});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function cancel(){serial++;pending=false;switching=false;saving=false;state.autoScanning=false;}
function cancelAndRender(){cancel();render();}
function changeGeometry(){cancel();state.activeHole=null;}
async function measure(holeIdx,token){
 const I=CURRENTS[state.currentIdx];
 probeReady=false;
 state.meterOn=true;state.capRemoved=true;state.activeHole=holeIdx;pending=true;
 render();
 // Commit only after the shared 3D probe has reached this hole and the cap is clear.
 while(connected&&token===serial&&!probeReady)await delay(40);
 if(!connected||token!==serial)return;
 // Let the learner read the settled value before recording it and moving on.
 render();
 await delay(state.autoScanning?450:120);
 if(!connected||token!==serial)return;
 if(I>0){state.measured[String(I)]??=[];state.measured[String(I)][holeIdx]=CALIBRATION_DATA[I][holeIdx];}
 pending=false;render();
}
async function pickHole(holeIdx){if(state.autoScanning||saving)return;cancel();if(!state.measurementStarted||!standardGeometry())startMeasurement();await measure(holeIdx,serial);}
function startMeasurement(){
 const first=!state.measurementStarted;cancel();state.measurementStarted=true;
 state.stage=state.stage==='2.3'||state.fitted||allMeasured()?'2.3':'2.2';
 state.wireMode='aiding';state.dRatio=1;if(first)state.currentIdx=3;
 state.leftPanel='instruments';state.rightPanel=isNarrow()?null:'records';render();
}
function meterHint(){
 if(pending)return probeReady?`正在读取孔位 ${state.activeHole+1} 的磁场…`:state.autoScanning?'正在采集，探头移向下一个测点…':'探头正在移向测点…';
 if(!standardGeometry())return '返回仪器控制后恢复标准接法与间距，继续标定。';
 if(state.savedToBook)return state.currentIdx===0?'标定已完成，励磁电流已归零。':'标定结果已存入讲义，请将励磁电流归零。';
 if(state.fitted)return '拟合已完成，可以存入讲义。';
 if(allMeasured())return '8 档数据已采齐，可以进行直线拟合。';
 if(!state.meterOn)return '点击任意孔位，开启特斯拉计并测量。';
 if(state.activeHole==null)return '选择一个孔位，将探头移入测量。';
 if(!state.capRemoved)return '拔下保护壳后读取磁场。';
 if(state.currentIdx===0)return '励磁电流已归零。';
 const value=currentReading();return value==null?'探头就位后显示读数。':`孔位 ${state.activeHole+1}：${value<0?'S':'N'} ${Math.abs(value).toFixed(2)} mT。`;
}

function renderInstrumentsLeft(){
  const I = CURRENTS[state.currentIdx];
  $('#ch1-slider').value = state.currentIdx;
  $('#ch1-readout').textContent = I.toFixed(2) + ' A';

  const detHost = $('#ch1-detents');
  detHost.innerHTML = '';
  CURRENTS.forEach((v, idx)=>{
    const btn = document.createElement('button');
    const done = (state.measured[String(v)] || []).filter(x=>x!=null).length === 5;
    btn.className = (idx===state.currentIdx ? 'is-cur ' : '') + (done ? 'is-done' : '');
    btn.textContent = v.toFixed(2);
    btn.onclick = ()=>{
      cancel();state.currentIdx = idx;
      if(v === 0 && state.fitted) state.stage = '2.3';
      render();
    };
    detHost.appendChild(btn);
  });

  const pwrBtn = $('#btn-meter-pwr');
  pwrBtn.textContent = state.meterOn ? '电源：开' : '电源：关';
  pwrBtn.className = 'pill-btn' + (state.meterOn ? ' is-on' : '');

  const capBtn = $('#btn-probe-cap');
  capBtn.textContent = state.capRemoved ? '保护壳：已拔下' : '保护壳：已套上';
  capBtn.className = 'pill-btn' + (state.capRemoved ? ' is-uncapped' : '');

  const lcdVal = $('#lcd-val'), lcdPol = $('#lcd-pol'), reading=currentReading();
  lcdVal.textContent=reading==null?'--.--':Math.abs(reading).toFixed(2);
  lcdVal.classList.toggle('is-off',!state.meterOn);
  lcdPol.textContent=reading==null?'--':reading<0?'S':'N';
  $('#meter-hint').textContent=meterHint();
  $('#lcd-probe-pos').textContent = state.activeHole===null
    ? '探头位置：台面待命支架'
    : `探头位置：孔位 ${HOLES[state.activeHole].code}（${HOLES[state.activeHole].name}）`;

  const grid = $('#plate-grid');
  grid.innerHTML = '';
  const curArr = state.measured[String(I)] || [];
  let cnt = 0;
  for(const h of HOLES){
    const has = curArr[h.id] != null;
    if(has) cnt++;
    const btn = document.createElement('button');
    btn.className = `hole-btn ${h.center?'center-hole':''} ${state.activeHole===h.id?'is-active':''} ${has?'is-measured':''}`;
    btn.innerHTML = `<span style="display:flex;align-items:center;gap:5px"><span class="hole-badge"></span>${h.code} ${h.name}</span><span class="mono" style="color:var(--teal);font-size:11px">${has?curArr[h.id].toFixed(2):'未测'}</span>`;
    btn.onclick = ()=> pickHole(h.id);
    grid.appendChild(btn);
  }
  $('#hole-progress').textContent = `${cnt} / 5`;

  const p05done = (state.measured['0.5'] || []).filter(v=>v!=null).length === 5;
  const all8done = [0.2,0.4,0.5,0.6,0.8,1.0,1.2,1.4].every(v => (state.measured[String(v)]||[]).filter(x=>x!=null).length === 5);

  const scanBtn = $('#btn-auto-scan');
  scanBtn.disabled = !p05done || all8done || state.autoScanning;
  scanBtn.textContent = all8done ? '✓ 全部 8 档电流已采完' : state.autoScanning ? '正在自动扫描各档…' : '▶ 自动采完其余 7 档电流';

  $('#btn-fit').disabled = !all8done || state.fitted;
  $('#btn-show-fit').hidden = !all8done || state.fitted;
  $('#btn-save-book').disabled = !state.fitted || state.savedToBook;
  $('#fit-eq').hidden = !state.fitted;
  $('#diag-card').hidden = !state.fitted;

  const canFinish = state.savedToBook && I === 0;
  $('#btn-finish-ch2').disabled = !canFinish;
  $('#finish-hint').hidden = !state.savedToBook || I === 0;
}

function renderPrinciple(){
 const m=state.wireMode,raw=String.raw;
 const left=raw`B_1(z+d/2)`,right=raw`B_1(z-d/2)`;
 $('#pair-description').textContent=m==='aiding'?'两线圈位于 −d/2 与 +d/2，同向电流的轴向磁场相加：':m==='oppose'?'以左线圈磁场方向为正，右线圈反接，两者相减：':'当前只接通一只线圈：';
 $('#pair-equation').innerHTML=raw`$$B_z(z)=${m==='left'?left:m==='right'?right:left+(m==='oppose'?'-':'+')+right}$$`;
 $('#symmetry-explanation').textContent=m==='aiding'?'同向叠加后关于中心偶对称，中心一、三阶导为零。再令二阶导为零，得到亥姆霍兹间距：':m==='oppose'?'反向叠加后关于中心奇对称，中心磁场为零，但一阶导不为零。磁场穿过中心时反向，形成梯度场。':'单侧磁场的对称中心在线圈自身的平面上，双线圈中央区域不再满足亥姆霍兹匀强条件。';
 $('#helmholtz-condition').hidden=m!=='aiding';
 renderMath($('#coil-principle'));
}
function render(){
  if(!connected)return;
  document.body.classList.toggle('has-left', Boolean(state.leftPanel));
  document.body.classList.toggle('has-right', Boolean(state.rightPanel));

  const leftEl = $('#left-drawer'), rightEl = $('#right-drawer');
  leftEl.hidden = !state.leftPanel;
  rightEl.hidden = !state.rightPanel;

  const is21 = state.leftPanel === 'circuit';
  $('#left-21').hidden = !is21; $('#foot-21').hidden = !is21;
  $('#left-22').hidden = is21;  $('#foot-22').hidden = is21;
  if(state.leftPanel==='circuit'){
    $('#left-title').textContent = '电路与结构'; $('#left-tag').textContent = '';
  } else if(state.leftPanel==='instruments'){
    $('#left-title').textContent = '仪器控制'; $('#left-tag').textContent = 'CH1 + 特斯拉计';
  }

  $('#right-21').hidden = state.rightPanel !== 'bz';
  $('#right-23').hidden = state.rightPanel !== 'records';
  if(state.rightPanel==='bz'){
    $('#right-title').textContent = '轴向磁场分布与原理'; $('#right-tag').textContent = '亥姆霍兹条件';
  } else if(state.rightPanel==='records'){
    $('#right-title').textContent = '标定记录与直线拟合'; $('#right-tag').textContent = '8 档 × 5 孔';
  }

  const narrow = window.innerWidth <= 1160;
  const leftShown = Boolean(state.leftPanel) && !(narrow && state.rightPanel);
  $('#dock-circuit').classList.toggle('active', leftShown && state.leftPanel==='circuit');
  $('#dock-inst').classList.toggle('active', leftShown && state.leftPanel==='instruments');
  $('#dock-rec').classList.toggle('active', state.rightPanel==='records');
  $('#dock-circuit').classList.toggle('suggested', state.stage==='entry');

  const I = CURRENTS[state.currentIdx];
  const hint = $('#task-hint');
  hint.classList.remove('is-warn','is-done');
  if(state.measurementStarted&&!standardGeometry()){
    $('#crumb-sub').textContent=state.stage==='2.3'?'2.3 标定记录与拟合':'2.2 特斯拉计五点测量';
    hint.textContent='接线与间距可继续探索。返回 [🎛️ 仪器控制] 恢复标准标定装置，接着测量。';
  } else if(state.stage==='entry'){
    $('#crumb-sub').textContent = '2.1 线圈接线与匀强场';
    hint.textContent = '当前任务：打开 [🔌 电路与结构]，切换线圈接法并开启磁感线，观察亥姆霍兹线圈怎样产生匀强磁场';
  } else if(state.stage==='2.1'){
    $('#crumb-sub').textContent = '2.1 线圈接线与匀强场';
    hint.textContent = '当前任务：对比单侧接线、串联顺接与串联反接下的 3D 磁感线与轴向分布，随后进入特斯拉计标定';
  } else if(state.savedToBook && I > 0){
    $('#crumb-sub').textContent = '2.3 拟合保存与降温归零';
    hint.classList.add('is-warn');
    hint.textContent = '当前任务：请将 CH1 励磁电流调回 0.00 A，避免线圈长时间通过大电流引发温升漂移';
  } else if(state.savedToBook && I === 0){
    $('#crumb-sub').textContent = '2.3 标定完成';
    hint.classList.add('is-done');
    hint.textContent = '当前任务：磁场标定已完成并归零！点击左下角 [磁场标定完成！开始正式磁截止实验 →] 进入下一章';
  } else if(state.fitted){
    $('#crumb-sub').textContent = '2.3 自动采集与直线拟合';
    hint.textContent = '当前任务：查看拟合方程与截距诊断卡，点击 [保存数据并存入讲义]';
  } else if([0.2,0.4,0.5,0.6,0.8,1.0,1.2,1.4].every(v=>(state.measured[String(v)]||[]).filter(x=>x!=null).length===5)){
    $('#crumb-sub').textContent = '2.3 自动采集与直线拟合';
    hint.textContent = '当前任务：8 档电流已采完，点击 [查看标定记录并拟合] 得到定标关系';
  } else if((state.measured['0.5']||[]).filter(x=>x!=null).length===5){
    $('#crumb-sub').textContent = '2.2–2.3 五点实测与扫描';
    hint.textContent = '当前任务：0.50 A 下 5 点已测完，点击 [▶ 自动采完其余 7 档电流]';
  } else {
    $('#crumb-sub').textContent = '2.2 特斯拉计五点测量';
    hint.textContent = '当前任务：在 0.50 A 下逐点点击透明板 5 个孔位，采完 5 个位置磁场读数';
  }

  $('#explore-current').textContent=I.toFixed(2)+' A';
  $('#bz-current').innerHTML=`<i>I</i><sub>M</sub> = ${I.toFixed(2)} A · 35 mm 管区`;
  $('#chk-field-lines').checked = state.showFieldLines;
  renderWireModes();
  renderCircuitSVG();
  renderBzChart();
  syncWorkstation();
  renderInstrumentsLeft();
  renderCalibrationTable();
  renderFitSVG();
  renderPrinciple();
  $('#scan-actions').hidden=!state.autoScanning;
  $('#btn-save-book').disabled=!state.fitted||state.savedToBook||saving;
  $('#ch1-slider').disabled=state.autoScanning;
  $('#btn-zero-current').disabled=state.autoScanning;
  $('#btn-meter-pwr').disabled=state.autoScanning;
  $('#btn-probe-cap').disabled=state.autoScanning;
  document.querySelectorAll('#ch1-detents button').forEach(b=>b.disabled=state.autoScanning);
  if(state.fit){$('#fit-eq .mono').innerHTML=`B(I<sub>M</sub>) = ${state.fit.slope.toFixed(3)} I<sub>M</sub> − ${Math.abs(state.fit.intercept).toFixed(3)} mT`;}
}


const isNarrow=()=>innerWidth<=1160;
const initialState=structuredClone(state);
window.initialize=(bridge,saved,calibration)=>{
 host=bridge;connected=true;probeReady=false;
 for(const row of calibration.points){const a=[...row.fields_mT].sort((a,b)=>b-a);CALIBRATION_DATA[row.current_A]=[a[1],a[2],a[0],a[3],a[4]];MEANS[row.current_A]=row.mean_mT;}
 for(const k of Object.keys(state))delete state[k];Object.assign(state,structuredClone(initialState));
 Object.assign(state,saved??{stage:'entry',leftPanel:null,rightPanel:null,showFieldLines:false});state.seenWire=new Set(saved?.seenWire??['aiding']);state.autoScanning=false;
 state.measurementStarted=Boolean(state.measurementStarted||['2.2','2.3'].includes(state.stage)||Object.keys(state.measured).length||state.fitted);
 if(state.measurementStarted)state.stage=state.stage==='2.3'||state.fitted||allMeasured()?'2.3':'2.2';
 if(!standardGeometry())state.activeHole=null;
 render();return document.querySelector('#scene');
};
window.suspend=()=>{cancel();host?.save(snapshot());connected=false;};
window.updateProbeReady=ready=>{if(!connected||probeReady===ready)return;probeReady=ready;render();};
window.scenePick=tag=>{if(tag.hole!=null)pickHole(tag.hole);else if(tag.control==='circuit')$('#dock-circuit').click();else if(tag.control==='cap'){cancel();state.capRemoved=!state.capRemoved;render();}else startMeasurement()};
window.getState=()=>({...snapshot(),autoScanning:state.autoScanning});
$('#btn-auto-scan').insertAdjacentHTML('afterend','<div id="scan-actions" hidden><button id="pause-scan">暂停采集</button><button id="skip-scan">跳过动画直接填满</button></div>');
$('#dock-circuit').onclick=()=>{cancel();if(!state.measurementStarted)state.stage='2.1';state.leftPanel=state.leftPanel==='circuit'&&!(isNarrow()&&state.rightPanel)?null:'circuit';if(isNarrow())state.rightPanel=null;else if(state.rightPanel&&!state.measurementStarted)state.rightPanel='bz';render();};
$('#dock-inst').onclick=()=>{if(state.leftPanel==='instruments'&&!(isNarrow()&&state.rightPanel)){state.leftPanel=null;render();}else startMeasurement();};
$('#btn-show-fit').onclick=()=>{state.rightPanel='records';if(isNarrow())state.leftPanel=null;render();requestAnimationFrame(()=>$('#right-23').scrollIntoView({block:'start',behavior:'smooth'}));};
$('#dock-rec').onclick=()=>{state.rightPanel=state.rightPanel==='records'?null:'records';if(isNarrow()&&state.rightPanel)state.leftPanel=null;render();};
$('#dock-book').onclick=()=>{cancel();render();host.book();};
$('#btn-back-ch1').onclick=()=>{cancel();host.back();};
$('#hud .icon-btn').onclick=()=>{cancelAndRender();host.menu();};
$('#btn-view-bench').onclick=$('#btn-reset-cam').onclick=()=>host.reset();
$('#close-left').onclick=()=>{state.leftPanel=null;render();};$('#close-right').onclick=()=>{state.rightPanel=null;render();};
$('#chk-field-lines').onchange=e=>{state.showFieldLines=e.target.checked;render();};
$('#btn-open-bz').onclick=()=>{state.rightPanel=state.rightPanel==='bz'?null:'bz';if(isNarrow()&&state.rightPanel)state.leftPanel=null;render();};
$('#spacing-slider').oninput=e=>{changeGeometry();let v=+e.target.value;state.dRatio=Math.abs(v-1)<=.04?1:v;render();};$('#btn-snap-dr').onclick=()=>{changeGeometry();state.dRatio=1;render();};
$('#btn-goto-22').onclick=startMeasurement;
$('#ch1-slider').oninput=e=>{cancel();state.currentIdx=+e.target.value;render();};$('#btn-zero-current').onclick=()=>{cancel();state.currentIdx=0;render();};
$('#btn-meter-pwr').onclick=()=>{cancel();state.meterOn=!state.meterOn;render();};$('#btn-probe-cap').onclick=()=>{cancel();state.capRemoved=!state.capRemoved;render();};
$('#pause-scan').onclick=()=>{cancel();render();};
$('#skip-scan').onclick=()=>{cancel();state.measurementStarted=true;state.stage='2.3';for(const [I,arr] of Object.entries(CALIBRATION_DATA))state.measured[I]=[...arr];state.currentIdx=8;state.activeHole=2;state.meterOn=state.capRemoved=true;render();};
$('#btn-auto-scan').onclick=async()=>{if(state.autoScanning||pending||saving)return;cancel();const token=serial;state.autoScanning=true;state.stage='2.3';state.wireMode='aiding';state.dRatio=1;render();for(const I of [.2,.4,.6,.8,1,1.2,1.4]){for(let h=0;h<5;h++){if(token!==serial)return;if(state.measured[String(I)]?.[h]!=null)continue;state.currentIdx=CURRENTS.indexOf(I);await measure(h,token);}}if(token===serial){state.autoScanning=false;render();}};
$('#btn-fit').onclick=()=>{const rows=Object.entries(state.measured).filter(([I,a])=>a.filter(x=>x!=null).length===5).map(([I,a])=>[+I,a.reduce((s,v)=>s+v,0)/5]);if(rows.length!==8)return;const xm=rows.reduce((s,r)=>s+r[0],0)/8,ym=rows.reduce((s,r)=>s+r[1],0)/8,slope=rows.reduce((s,[x,y])=>s+(x-xm)*(y-ym),0)/rows.reduce((s,[x])=>s+(x-xm)**2,0);const intercept=ym-slope*xm,r2=1-rows.reduce((s,[x,y])=>s+(y-slope*x-intercept)**2,0)/rows.reduce((s,[x,y])=>s+(y-ym)**2,0);state.fit={slope,intercept,r2,rows};state.fitted=true;state.stage='2.3';render();};
$('#btn-save-book').onclick=async()=>{
 if(saving||!state.fit||state.savedToBook)return;
 saving=true;
 const token=serial,src=$('#fit-eq').getBoundingClientRect(),dst=$('#dock-book').getBoundingClientRect(),fly=document.createElement('div');
 fly.className='fly-thumb mono';fly.textContent='磁场标定已存入讲义';fly.style.left=src.left+'px';fly.style.top=src.top+'px';document.body.appendChild(fly);
 // Saving is complete before its visual acknowledgement; navigation cannot undo it.
 state.savedToBook=true;host.saveBook(state.fit);render();
 try{await fly.animate([{transform:'none',opacity:1},{transform:`translate(${(dst.x-src.x)*.5}px,${(dst.y-src.y)*.5-100}px) scale(.7)`,opacity:.9},{transform:`translate(${dst.x-src.x}px,${dst.y-src.y}px) scale(.1)`,opacity:0}],{duration:700,easing:'ease-in-out'}).finished;}
 finally{fly.remove();if(token===serial){saving=false;if(connected){state.rightPanel=null;render();$('#dock-book').animate([{background:'#927044'},{background:'transparent'}],{duration:800});}}}
};
$('#btn-finish-ch2').onclick=()=>{if(state.savedToBook&&state.currentIdx===0){cancel();host.finish(false);}};$('#btn-skip-ch2').onclick=()=>{cancel();host.finish(true);};
window.addEventListener('keydown',e=>{if(e.key==='Escape'){cancel();if(state.rightPanel)state.rightPanel=null;else state.leftPanel=null;render();}});
window.addEventListener('resize',()=>{if(connected)render();});

const sceneHelp = matchMedia('(pointer:coarse)');
function updateSceneHelp(){
  $('#scene-note').textContent = sceneHelp.matches
    ? '单指拖动旋转 · 双指捏合缩放 · 点击测点孔位移动探头'
    : '拖动旋转 · 滚轮缩放 · 点击测点移动探头';
}
sceneHelp.addEventListener('change',updateSceneHelp);
updateSceneHelp();
