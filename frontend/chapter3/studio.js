import {
  VOLTS,
  V_COLORS,
  GEOM,
  loadSweepData,
  resolveCalibration,
  physicalField,
  linearField,
  analyzeVoltage as analyze,
  fitRegression as regress,
  idealCurrentForVoltage,
} from './cutoff-math.js';
import { SweepStreamEngine } from './sweep-stream.js';
import { createCharts, nearestCurvePoint } from './charts.js';
import { STEPS, DETECTIVE, stepFor, fulfilled, frontierStep, restoredStory } from './guided-stage.js';
import { potentialDiagram } from './potential-diagram.js';
import { renderMath } from '../mathlite.js';
const $ = (s) => document.querySelector(s),
  raw = String.raw;
const defaults = {
  viewMode: 'bench',
  tubeUseUeff: false,
  leftOpen: true,
  rightOpen: false,
  activeTab: 'curves',
  selectedV: 10,
  playbackSpeed: 1,
  showTangent: false,
  cutoffMethod: 'tangent',
  voltageMode: 'nominal',
  xAxisUnit: 'IM',
  singleCalcDone: false,
  scatterDone: false,
  fitDone: false,
  ueffVerified: false,
  idealFocus10: true,
  anomaliesLocked: false,
  p6GuessIdx: null,
  swept: {},
  scrubIdx: null,
  hoverIdx: null,
  running: null,
  batchQueue: [],
  guide: true,
  step: '0a',
  manualLayout: false,
  stageLayout: 'sweep',
  heaterFound: false,
  probeCompared: false,
  probe: 'H',
  compareThree: false,
  potentialOpen: false,
  detectiveMsg: '',
  construction: null,
  processing: false,
};
const state = structuredClone(defaults);
let host,
  asset,
  DATA = {},
  CAL,
  charts,
  connected = false,
  lastPointKey = '',
  constructionToken = 0,
  viewToken = 0,
  lastPanel = 'right',
  spotFrame = 0,
  dialogueKey = '';
const doneCount = () => VOLTS.filter((v) => state.swept[v]?.done).length,
  narrow = () => innerWidth <= 1060;
const bPhys = (i) => physicalField(i, CAL),
  analyzeVoltage = (v) => analyze(DATA, v, CAL),
  fitRegression = () => regress(DATA, CAL);
const signed = (v, d = 3) => (v < 0 ? '−' : '+') + ' ' + Math.abs(v).toFixed(d);
const equation = () => raw`$B = ${CAL.slope.toFixed(3)} I_M ${signed(CAL.intercept)}\text{ mT}$`;
const html = (text) => text.replace(/`/g, '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
function setHTML(el, value) {
  if (el.dataset.content !== value) {
    el.dataset.content = value;
    el.innerHTML = value;
    renderMath(el);
  }
}
function stage() {
  if (state.guide) {
    if (['0a', '0b', '0c', '1'].includes(state.step)) return '3.1';
    if (['2a', '2b', '3'].includes(state.step)) return '3.2';
    if (['4a', '4b', '5a', '5found', '5b', '5c'].includes(state.step)) return '3.3';
    return '3.4';
  }
  return state.ueffVerified ? '3.4' : state.fitDone ? '3.3' : doneCount() === 4 ? '3.2' : '3.1';
}
function snapshot() {
  const f = state.fitDone ? fitRegression() : null;
  return {
    version: 2,
    stage: stage(),
    selectedVoltage: state.selectedV,
    sweptVoltages: structuredClone(state.swept),
    singleCalcDone: state.singleCalcDone,
    scatterDone: state.scatterDone,
    fittedRegression: f
      ? {
          done: true,
          ...f,
          slope_mT2_per_V: f.slope,
          intercept_mT2: f.b,
          u0_V: f.u0,
          em_C_per_kg: f.em,
          relErrorPct: f.relPct,
          dropVerified: state.ueffVerified,
        }
      : { done: false, dropVerified: false },
    anomaliesConfirmed: state.anomaliesLocked,
    bumpRecorded: state.anomaliesLocked,
    completed: state.anomaliesLocked,
    cutoffMethod: 'tangent',
    voltageMode: 'nominal',
    showTangentOverlay: state.showTangent,
    idealUseUeff: state.tubeUseUeff,
    xAxisUnit: state.xAxisUnit,
    playbackSpeed: state.playbackSpeed,
    inspectedPointIdx: state.scrubIdx,
    activeTab: state.activeTab,
    viewMode: state.viewMode,
    leftOpen: state.leftOpen,
    rightOpen: state.rightOpen,
    idealFocus10: state.idealFocus10,
    guideEnabled: state.guide,
    guideStep: state.step,
    manualLayout: state.manualLayout,
    stageLayout: state.stageLayout,
    heaterFound: state.heaterFound,
    probeCompared: state.probeCompared,
    probe: state.probe,
    potentialOpen: state.potentialOpen,
    calibration: { ...CAL },
  };
}
function archive() {
  return {
    version: 2,
    calibration: { ...CAL },
    curves: Object.fromEntries(
      VOLTS.filter((v) => state.swept[v]?.done).map((v) => [
        v,
        { points: DATA[v].pts.map((p) => [p[1], p[6]]), ...analyzeVoltage(v) },
      ]),
    ),
    fit: state.fitDone ? fitRegression() : null,
    dropVerified: state.ueffVerified,
    bumpRecorded: state.anomaliesLocked,
    anomaliesConfirmed: state.anomaliesLocked,
    cutoffMethod: 'tangent',
    voltageMode: 'nominal',
  };
}
function save() {
  if (connected) host.save(snapshot(), archive());
}
function activeWorkingPoint() {
  const v = state.selectedV,
    d = DATA[v],
    count = state.running?.v === v ? state.running.cursor + 1 : (state.swept[v]?.count ?? 0),
    idx = state.scrubIdx ?? (count ? count - 1 : null),
    p = idx == null ? null : d.pts[idx];
  return {
    v,
    idx,
    isZb: idx == null,
    imAct_A: p?.[1] ?? 0,
    v1_V: p?.[2] ?? 0,
    uaAct_V: p?.[3] ?? d.zb_ua,
    uf_V: p?.[4] ?? d.zb_uf,
    if_A: p?.[5] ?? d.zb_if,
    a1_uA: p?.[6] ?? d.zb_a1,
    bPhys_mT: bPhys(p?.[1] ?? 0),
  };
}
let queued = false;
const stream = new SweepStreamEngine({
  onCommit(point, index, token) {
    if (!connected || state.running?.token !== token) return;
    state.running.phase = 'pts';
    state.running.cursor = index;
    // Keep an already acquired curve and its unlocked analyses while a replacement grows.
    if (!state.swept[state.running.v]?.done) state.swept[state.running.v] = { count: index + 1, done: false };
    if (!stream.instant) render();
    else if (!queued) {
      queued = true;
      queueMicrotask(() => {
        queued = false;
        render();
      });
    }
  },
  onDone(token) {
    if (state.running?.token !== token) return;
    const v = state.running.v;
    state.swept[v] = { count: DATA[v].pts.length, done: true, ...analyzeVoltage(v) };
    state.running = null;
    const next = state.batchQueue.shift();
    if (next != null) {
      render();
      queueMicrotask(() => {
        if (connected && stream.runToken === token) startSweep(next, true);
      });
      return;
    }
    if (state.guide && state.step === '0c') goStep('1');
    else if (state.guide && state.step === '1' && doneCount() === 4) goStep('2a');
    else render();
  },
});
function stopRunning() {
  stream.cancel();
  state.running = null;
  state.batchQueue = [];
  state.hoverIdx = null;
}
function selectVoltage(v) {
  if (!voltageSelectable(v)) return;
  stopRunning();
  state.selectedV = v;
  state.scrubIdx = null;
  lastPointKey = '';
  render();
}
function voltageSelectable(v) {
  return !(state.guide && ['0a', '0b', '0c'].includes(state.step) && v !== 10);
}
function voltageStatus(v) {
  const run = state.running?.v === v ? state.running : null;
  const count = run ? run.cursor + 1 : state.swept[v]?.count ?? 0;
  if (run) return `${run.paused ? '已暂停' : '采集中'} ${count}/71`;
  if (state.swept[v]?.done) return '已采集';
  return count ? `已暂停 ${count}/71` : '未采集';
}
function startSweep(v, batch = false) {
  if (!voltageSelectable(v)) return;
  if (!batch) state.batchQueue = [];
  state.selectedV = v;
  state.scrubIdx = state.hoverIdx = null;
  const startIndex = state.swept[v]?.done ? 0 : state.swept[v]?.count ?? 0;
  if (!state.swept[v]?.done) state.swept[v] = { count: startIndex, done: false };
  state.activeTab = 'curves';
  if (!state.manualLayout) {
    state.stageLayout = 'sweep';
    state.rightOpen = true;
    state.leftOpen = !narrow();
  }
  const token = stream.start({
    total: DATA[v].pts.length,
    startIndex,
    intervalMs: 42 / state.playbackSpeed,
    delayMs: 450,
  });
  state.running = { v, token, phase: startIndex ? 'pts' : 'zb', cursor: startIndex - 1, paused: false };
  DATA[v].pts.forEach((p, i) => stream.push(i, p, token));
  render();
}
function startBatch() {
  state.batchQueue = [10, 8, 6, 4].filter((v) => !state.swept[v]?.done);
  const next = state.batchQueue.shift();
  if (next != null) startSweep(next, true);
}
function pauseOrResume() {
  if (!state.running) return;
  if (state.running.paused) stream.resume();
  else stream.pause();
  state.running.paused = stream.paused;
  render();
}
function applyLayout(step) {
  state.stageLayout = step.stage;
  state.potentialOpen = step.stage === 'potential';
  if (step.stage === 'sweep') {
    state.leftOpen = true;
    state.rightOpen = ['0c', '1'].includes(step.id);
    if (narrow() && state.rightOpen) state.rightOpen = false;
    if (narrow() && step.id === '1') {
      state.leftOpen = false;
      state.rightOpen = true;
    }
  } else if (step.stage === 'analysis' || step.stage === 'cliffhanger') {
    state.leftOpen = false;
    state.rightOpen = true;
  } else state.leftOpen = state.rightOpen = false;
}
function goStep(id, { restore = false } = {}) {
  stopRunning();
  const request = ++viewToken;
  state.step = id;
  state.detectiveMsg = '';
  $('#scene-hover').hidden = true;
  const s = stepFor(id);
  if (['0a', '0b', '0c', '1', '7a', '7b'].includes(id)) {
    state.selectedV = 10;
    state.scrubIdx = null;
  }
  if (s.stage === 'sweep') state.activeTab = 'curves';
  if (restore) state.manualLayout = false;
  if (state.guide && !state.manualLayout) applyLayout(s);
  if (s.stage === 'analysis') state.activeTab = 'fit';
  if (s.stage === 'cliffhanger') state.activeTab = 'ideal';
  if (id === '5a') {
    state.selectedV = 10;
    state.scrubIdx = 0;
    state.viewMode = 'bench';
    host.view('bench').then(() => { if (connected && request === viewToken) host.focus('investigation'); });
  }
  if (id === '5found') {
    state.viewMode = 'bench';
    host.view('bench').then(() => { if (connected && request === viewToken) host.focus('heater'); });
  }
  if (id === '5b') {
    state.probe = 'H';
    state.compareThree = false;
    host.focus('L4');
  }
  if (id === '5c') {
    state.probe = 'middle';
    state.compareThree = true;
  }
  if (s.stage !== 'potential' && id !== '5found') state.potentialOpen = false;
  render();
}
function nextStep() {
  const s = stepFor(state.step);
  if (s.wait && !fulfilled(s, state)) return;
  const i = STEPS.indexOf(s);
  if (i < STEPS.length - 1) goStep(STEPS[i + 1].id);
  else { state.guide = false; state.manualLayout = true; render(); }
}
function manualLayout() {
  state.manualLayout = true;
  state.stageLayout = 'sweep';
  state.potentialOpen = false;
}
function openPanel(side) {
  const wasVisible = !$('#' + side + '-drawer').hidden;
  lastPanel = side;
  manualLayout();
  const key = side + 'Open';
  state[key] = !wasVisible;
  if (narrow() && state[key]) state[side === 'left' ? 'rightOpen' : 'leftOpen'] = false;
  render();
}
function showTab(tab, { manual = false } = {}) {
  if (manual) {
    lastPanel = 'right';
    manualLayout();
    state.rightOpen = true;
    if (narrow()) state.leftOpen = false;
  }
  state.activeTab = tab;
  render();
}
function toggleGuide() {
  stopRunning();
  viewToken++;
  state.guide = !state.guide;
  state.detectiveMsg = '';
  if (state.guide) goStep(frontierStep(state));
  else {
    state.manualLayout = true;
    render();
  }
}
function render() {
  if (!connected) return;
  const body = document.body;
  // Narrow screens expose one drawer without erasing the user's wider layout.
  const bothNarrow = narrow() && state.leftOpen && state.rightOpen;
  const leftVisible = state.leftOpen && (!bothNarrow || lastPanel === 'left');
  const rightVisible = state.rightOpen && (!bothNarrow || lastPanel === 'right');
  body.classList.toggle('has-left', leftVisible);
  body.classList.toggle('has-right', rightVisible);
  body.classList.toggle('guided', state.guide);
  body.classList.toggle('manual-layout', state.manualLayout);
  body.dataset.stage = state.stageLayout;
  body.dataset.step = state.step;
  $('#left-drawer').hidden = !leftVisible;
  $('#right-drawer').hidden = !rightVisible;
  $('#potential-card').hidden = !state.potentialOpen;
  $('#dock-left').classList.toggle('active', leftVisible);
  $('#dock-right').classList.toggle('active', rightVisible);
  for (const v of ['bench', 'tube']) $('#btn-view-' + v).classList.toggle('active', state.viewMode === v);
  $('#tube-hud-chip').hidden = state.viewMode !== 'tube';
  $('#tube-rcut-info').hidden = state.viewMode !== 'tube';
  $('#tube-pot-ua').hidden = $('#tube-pot-ueff').hidden = !state.ueffVerified;
  $('#tube-pot-ua').classList.toggle('active', !state.tubeUseUeff);
  $('#tube-pot-ueff').classList.toggle('active', state.tubeUseUeff);
  setHTML($('#cal-summary'), `${stage()} · ${equation()}`);
  $('#cal-summary').title = CAL.skipped ? '采用实验室提供的磁场标定关系；可在“接线与标定关系”中查看' : '采用第二章保存的磁场标定关系';
  setHTML($('#task-hint'), state.guide ? stepFor(state.step).hint : '自由探索 · 点选曲线回看测点，用底栏收起图谱可观察实验台与管内');
  $('#guide-toggle').textContent = state.guide ? '跳过引导' : '恢复引导';
  $('#restore-layout').hidden = !state.manualLayout || !state.guide;
  $('#compact-sweep').hidden = !state.running || leftVisible;
  $('#compact-count').textContent =
    `${state.selectedV} V · ${state.running ? state.running.cursor + 1 : 0}/71`;
  $('#compact-pause').textContent = state.running?.paused ? '继续' : '暂停';
  renderLeft();
  renderRight();
  if (state.potentialOpen) renderPotential();
  renderDialogue();
  syncScene();
  renderMath(document.body);
  save();
  scheduleSpot();
}
function renderLeft() {
  const n = doneCount();
  $('#volt-progress-txt').textContent = `已采集 ${n} / 4 档`;
  if (!$('#volt-grid').children.length)
    for (const v of VOLTS) {
      const b = document.createElement('button');
      b.className = 'volt-btn';
      b.dataset.voltage = v;
      b.innerHTML = `<span class="v-num mono">${v} V</span><small></small>`;
      b.onclick = () => selectVoltage(v);
      $('#volt-grid').append(b);
    }
  for (const b of $('#volt-grid').children) {
    const v = +b.dataset.voltage,
      done = state.swept[v]?.done;
    b.disabled = !voltageSelectable(v);
    b.className = 'volt-btn' + (state.selectedV === v ? ' is-active' : '') + (done ? ' is-done' : '');
    b.querySelector('small').textContent = voltageStatus(v);
  }
  const count =
    state.running?.v === state.selectedV
      ? state.running.cursor + 1
      : (state.swept[state.selectedV]?.count ?? 0);
  $('#sweep-count-lbl').textContent = `${count} / 71`;
  $('#sweep-progress').style.width = (count / 71) * 100 + '%';
  $('#sweep-status-lbl').textContent = state.running
    ? state.running.paused
      ? '已暂停'
      : state.running.phase === 'zb'
        ? '记录零场基准…'
        : '逐点采集…'
    : state.swept[state.selectedV]?.done
      ? '采集完成'
      : count ? '已暂停，可继续采集' : '待命';
  $('#btn-run-sweep').textContent = state.running
    ? state.running.paused
      ? '▶ 继续扫场'
      : 'Ⅱ 暂停扫场'
    : `${state.swept[state.selectedV]?.done ? '↻ 重新扫场' : count ? '▶ 继续扫场' : '▶ 自动扫场'} (${state.selectedV} V)`;
  $('#spd-skip').disabled = !state.running;
  for (const speed of [1, 3]) $('#spd-' + speed).classList.toggle('is-on', state.playbackSpeed === speed);
  $('#btn-sweep-rest').hidden = !n || n === 4 || !!state.running;
  $('#btn-sweep-rest').textContent = `连续采集其余 ${4 - n} 档 →`;
  const p = activeWorkingPoint();
  $('#m-ch1-i').textContent = p.imAct_A.toFixed(3) + ' A';
  $('#m-ch1-vb').textContent = `${p.v1_V.toFixed(2)} V · ${p.bPhys_mT.toFixed(2)} mT`;
  $('#m-ch2-u').textContent = p.uaAct_V.toFixed(3) + ' V';
  $('#m-ch2-nom').textContent = `标称 ${p.v} V 档`;
  $('#m-ch3-u').textContent = p.uf_V.toFixed(3) + ' V';
  $('#m-ch3-i').textContent = p.if_A.toFixed(3) + ' A 恒定加热';
  $('#m-a1-mv').innerHTML = `${p.a1_uA.toFixed(2)}<span class="vfd-unit">mV</span>`;
  $('#scrub-badge').textContent = state.scrubIdx != null ? `回放测点 ${state.scrubIdx + 1}` : '当前读数';
}
function renderRight() {
  const n = doneCount();
  for (const b of document.querySelectorAll('.stage-tab')) {
    b.classList.toggle('is-active', b.dataset.tab === state.activeTab);
    b.disabled =
      b.dataset.tab === 'fit'
        ? n < 4 && !state.singleCalcDone
        : b.dataset.tab === 'ideal'
          ? !state.ueffVerified
          : false;
  }
  for (const tab of ['curves', 'fit', 'ideal']) $('#tab-' + tab).hidden = state.activeTab !== tab;
  if (state.activeTab === 'curves') {
    charts.renderCurves();
    $('#btn-tog-tangent').hidden = !state.singleCalcDone;
    $('#btn-tog-tangent').classList.toggle('is-on', state.showTangent);
    $('#axis-im').classList.toggle('active', state.xAxisUnit === 'IM');
    $('#axis-b').classList.toggle('active', state.xAxisUnit === 'B');
    $('#ic-strip').innerHTML = VOLTS.map((v) => {
      const done = state.swept[v]?.done,
        r = done ? analyzeVoltage(v) : null;
      return `<button class="ic-chip${state.selectedV === v ? ' is-focus' : ''}" data-curve="${v}" ${voltageSelectable(v) ? '' : 'disabled'}><b style="color:${V_COLORS[v]}">${v} V</b><span>${voltageStatus(v)}</span>${done && state.singleCalcDone ? `<small>$B_c=${r.bc.toFixed(2)}$ mT</small>` : ''}</button>`;
    }).join('');
    $('#ic-strip')
      .querySelectorAll('button')
      .forEach((b) => (b.onclick = () => selectVoltage(+b.dataset.curve)));
    $('#tab1-note').textContent = state.running
      ? '曲线与台面仪表正在同步采集。'
      : n
        ? '点击曲线可回看任一测点，按左右方向键逐点查看。'
        : '由零场开始，观察收集电流随励磁电流的变化。';
    $('#btn-process-entry').hidden = n < 4;
    $('#btn-curves-rest').hidden = !n || n === 4 || !!state.running || !$('#left-drawer').hidden;
    $('#btn-curves-rest').textContent = `连续采集其余 ${4 - n} 档 →`;
  } else if (state.activeTab === 'fit') renderFit();
  else {
    charts.renderIdeal();
    $('#btn-ideal-scope').textContent = state.idealFocus10 ? '全部四档' : '只看 10 V';
    renderGuess();
    $('#btn-right-next').textContent = state.anomaliesLocked ? '打开第四章入口 →' : '写入讲义 · 进入第四章 →';
  }
}
function renderFit() {
  const f = fitRegression(),
    corrected = state.ueffVerified && (!state.guide || ['6', '7a', '7b'].includes(state.step));
  $('#analysis-title').textContent = corrected ? '灯丝电位修正后的四档比荷' : '四档截止点与单点比荷';
  setHTML(
    $('#single-formula'),
    raw`$\frac{e}{m}=\frac{8${corrected ? 'U_{\\mathrm{eff}}' : 'U_a'}}{B_c^2 R_a^2(1-r_c^2/R_a^2)^2}$`.replace(
      '\\\\mathrm',
      '\\mathrm',
    ),
  );
  $('#th-em-mode').textContent = corrected ? '修正后比荷' : '单点比荷';
  $('#em-table tbody').innerHTML = f.items
    .map((r) => {
      const val = corrected ? r.emUeff : r.emNaive,
        rel = 100 * (val / GEOM.em_codata - 1),
        shown =
          state.singleCalcDone ||
          (state.processing && VOLTS.indexOf(r.V) < VOLTS.indexOf(state.construction?.v));
      return `<tr><td style="color:${V_COLORS[r.V]}">${r.V}</td><td>${shown ? r.bc.toFixed(3) : '—'}</td><td>${shown ? (val / 1e11).toFixed(3) : '—'}</td><td class="${Math.abs(rel) > 12 ? 'delta-bad' : 'delta-ok'}">${shown ? (rel > 0 ? '+' : '') + rel.toFixed(1) + '%' : '—'}</td></tr>`;
    })
    .join('');
  $('#btn-calc-single').hidden = state.singleCalcDone;
  $('#btn-calc-single').disabled = state.processing;
  $('#btn-calc-single').textContent = state.processing ? '正在绘制平台与切线…' : '按讲义处理四条曲线 →';
  $('#btn-plot-scatter').hidden = !state.singleCalcDone || state.scatterDone;
  $('#btn-run-fit').hidden = !state.scatterDone || state.fitDone;
  $('#paradox-actions').hidden = state.singleCalcDone && state.scatterDone && state.fitDone;
  $('#construction-panel').hidden = state.scatterDone;
  $('#fit-card').hidden = !state.scatterDone;
  $('#fit-eq-box').hidden = !state.fitDone || corrected;
  if (state.scatterDone) charts.renderFit();
  else charts.renderConstruction();
  if (state.fitDone)
    setHTML(
      $('#fit-eq-box'),
      raw`<span>$B_c^2=${f.slope.toFixed(3)}(U_a-${f.u0.toFixed(2)})\text{ mT}^2$</span><small>斜率对应 $e/m=${(f.em / 1e11).toFixed(3)}\times10^{11}\text{ C/kg}$</small>`,
    );
  $('#btn-investigate').hidden = state.guide || !state.fitDone || corrected;
  $('#btn-compare').hidden = state.guide || !corrected;
  $('#correction-result').hidden = !corrected;
  if (corrected)
    setHTML(
      $('#correction-result'),
      raw`$U_{\mathrm{eff}}\approx U_a-U_f/2$<br>四档结果收拢到 $1.66\sim1.89\times10^{11}\text{ C/kg}$。`,
    );
}
function renderGuess() {
  const names = [
    '陡直台阶图',
    'S 形曲线',
    'S 形曲线但尾部抬高',
    '截止前有隆起、无拖尾',
    '截止前有隆起、尾部缓降',
    '截止前有隆起且尾部突然变直',
  ];
  $('#p6-recall').textContent =
    state.p6GuessIdx == null
      ? ''
      : '实验前，你在讲义中选择了「' + (names[state.p6GuessIdx] ?? '已记录的曲线') + '」。现在可以对照看看。';
}
function renderPotential() {
  const mean = state.step === '5c' || (!state.guide && state.ueffVerified);
  $('#potential-svg').setAttribute('viewBox', mean ? '0 0 1320 320' : '0 0 960 320');
  $('#potential-svg').innerHTML = potentialDiagram(state.probe, mean);
  $('#probe-options')
    .querySelectorAll('[data-probe]')
    .forEach((b) => b.classList.toggle('active', b.dataset.probe === state.probe));
  const phi = { H: 0, middle: 1.84, K: 3.68 }[state.probe],
    name = { H: 'H 端', middle: '中点', K: 'K 端' }[state.probe];
  setHTML(
    $('#potential-readout'),
    state.compareThree
      ? raw`<div class="triple"><div>H 端 · 起飞电位 $0\text{ V}$<strong>$10-0=10.00\text{ V}$</strong></div><div>中点 · 起飞电位 $1.84\text{ V}$<strong>$10-1.84=8.16\text{ V}$</strong></div><div>K 端 · 起飞电位 $3.68\text{ V}$<strong>$10-3.68=6.32\text{ V}$</strong></div></div>`
      : raw`<span>${name}发出的电子 · 起飞电位 $${phi.toFixed(2)}\text{ V}$</span><strong>$10.00-${phi.toFixed(2)}=${(10 - phi).toFixed(2)}\text{ V}$</strong>`,
  );
  $('#potential-mean').hidden = !mean;
  $('#btn-apply-ueff').hidden = !mean;
  $('#probe-mean').hidden = state.guide || !state.probeCompared || mean;
  if (mean)
    setHTML(
      $('#potential-mean'),
      raw`沿灯丝平均：$\langle\varphi_f\rangle=U_f/2=1.84\text{ V}$，$U_{\mathrm{eff}}\approx10.00-1.84=8.16\text{ V}$。`,
    );
  $('#potential-svg')
    .querySelectorAll('[data-probe]')
    .forEach((e) => {
      e.onclick = () => probe(e.dataset.probe);
      e.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          probe(e.dataset.probe);
        }
      };
    });
}
function probe(id) {
  state.probe = id;
  state.probeCompared = id !== 'H' || state.probeCompared;
  render();
}
function renderDialogue() {
  const s = stepFor(state.step),
    text = state.detectiveMsg || s.text;
  $('#dialogue-wrap').hidden = !state.guide;
  $('#spotlight').hidden = !state.guide || !!state.running;
  setHTML($('#dialogue-text'), html(text));
  $('#dlg-prev').disabled = state.step === '0a';
  $('#dlg-next').hidden = !!s.wait && !fulfilled(s, state);
  $('#dlg-next').textContent =
    state.step === '5found'
      ? '沿接线看电位 →'
      : state.step === '5b'
        ? '看三点的平均电位 →'
        : state.step === '7b'
          ? '继续探索'
          : '继续 →';
  const waits = {
    first: '点击自动扫场',
    curves: '采齐四档曲线',
    single: '绘制平台、切线与交点',
    scatter: '先绘制四个点',
    fit: '点击拟合直线',
    found: '点击真实台面仪器',
    probe: '点选灯丝位置',
    corrected: '代入有效电压',
    complete: '将观察写入讲义',
  };
  $('#dialogue-wait').textContent = s.wait && !fulfilled(s, state) ? waits[s.wait] : '';
  $('#story-progress').innerHTML = Array.from(
    { length: 8 },
    (_, i) =>
      `<i class="${i < parseInt(state.step) ? 'done' : i === parseInt(state.step) ? 'current' : ''}"></i>`,
  ).join('');
  const key = state.step + text + state.guide;
  if (dialogueKey !== key) {
    dialogueKey = key;
    requestAnimationFrame(updateStorySpace);
  }
}
function updateStorySpace() {
  document.body.style.setProperty(
    '--story-space',
    state.guide ? $('#dialogue-wrap').offsetHeight + 78 + 'px' : '78px',
  );
  scheduleSpot();
}
new ResizeObserver(updateStorySpace).observe($('#dialogue-wrap'));
function scheduleSpot() {
  cancelAnimationFrame(spotFrame);
  const until = performance.now() + 550;
  function frame() {
    updateSpot();
    if (performance.now() < until) spotFrame = requestAnimationFrame(frame);
  }
  spotFrame = requestAnimationFrame(frame);
}
function updateSpot() {
  if (!state.guide || state.manualLayout || !connected) return;
  const s = stepFor(state.step);
  let target = $(s.focus);
  if (s.wait && fulfilled(s, state)) {
    const fallback = {
      first: '#scan-card',
      curves: '#scan-card',
      single: '#em-table',
      scatter: '#fit-card',
      fit: '#fit-card',
    };
    target = $(fallback[s.wait] ?? s.focus);
  }
  // The object being discussed stays lit together with the next meaningful action.
  if (state.processing) target = $('#construction-panel');
  if (state.step === '4a') target = $('#fit-card');
  if (!target || !target.getClientRects().length) target = $('#scene');
  const bottom = innerHeight - (state.guide ? $('#dialogue-wrap').offsetHeight + 78 : 80);
  // A scrolled-out control must not illuminate unrelated content underneath it.
  const visibleRect = (e) => {
    if (!e?.getClientRects().length) return null;
    const q = e.getBoundingClientRect();
    let left = Math.max(4, q.left - 6), top = Math.max(70, q.top - 6),
      right = Math.min(innerWidth - 4, q.right + 6), end = Math.min(bottom, q.bottom + 6);
    for (let p = e.parentElement; p; p = p.parentElement) {
      const style = getComputedStyle(p), r = p.getBoundingClientRect();
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {left = Math.max(left,r.left);right = Math.min(right,r.right);}
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {top = Math.max(top,r.top);end = Math.min(end,r.bottom);}
    }
    return right > left && end > top ? {left,top,right,bottom:end} : null;
  };
  const mainRect = visibleRect(target) ?? visibleRect($('#scene'));
  if (!mainRect) return;
  Object.assign($('#spotlight-hole').style, {
    left: mainRect.left + 'px',
    top: mainRect.top + 'px',
    width: mainRect.right - mainRect.left + 'px',
    height: mainRect.bottom - mainRect.top + 'px',
  });
  const extra =
    state.step === '1'
      ? [$('#btn-sweep-rest'), $('#btn-curves-rest')]
      : state.step === '4a'
        ? [$('#btn-run-fit')]
        : state.step === '7b'
          ? [$('#btn-right-next')]
          : [];
  const rects = [mainRect, ...extra.filter(e => !target.contains(e)).map(visibleRect).filter(Boolean)];
  const rectPath = q => `M${q.left} ${q.top}H${q.right}V${q.bottom}H${q.left}Z`;
  $('#spotlight-dim').setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`);
  $('#spotlight-dim path').setAttribute(
    'd',
    `M0 66H${innerWidth}V${innerHeight}H0Z` +
      rects.map(rectPath).join(''),
  );
}
function syncScene() {
  const p = activeWorkingPoint(),
    key = JSON.stringify([p, state.tubeUseUeff]);
  if (key !== lastPointKey) {
    lastPointKey = key;
    const orbit = host.update({
      ...p,
      trajectoryVoltage: Math.max(0, p.uaAct_V - (state.tubeUseUeff ? p.uf_V / 2 : 0)),
    });
    if (orbit)
      $('#tube-rcut-info').textContent =
        orbit.outcome === 'turning' ? `最远 ${orbit.finalRadiusMm.toFixed(2)} mm` : '到达阳极 · 4.55 mm';
  }
  $('#restore-latest').hidden = state.scrubIdx == null;
  $('#scene-status-txt').textContent =
    `${p.v} V · ${p.imAct_A.toFixed(3)} A · ${p.bPhys_mT.toFixed(2)} mT · ${p.a1_uA.toFixed(2)} mV`;
}
function setView(view) {
  viewToken++;
  manualLayout();
  state.viewMode = view;
  host.view(view);
  render();
}
function inspect(i) {
  if (state.running) return;
  const n = state.swept[state.selectedV]?.count ?? 0;
  if (!n) return;
  state.scrubIdx = Math.max(0, Math.min(n - 1, i));
  render();
}
function eventIndex(e) {
  const svg = e.currentTarget;
  const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const fraction = (point.x - 56) / (520 - 56 - 24);
  return nearestCurvePoint(
    DATA[state.selectedV].pts,
    state.swept[state.selectedV]?.count ?? 0,
    fraction,
    bPhys,
    state.xAxisUnit,
  );
}
$('#scan-svg').onpointermove = (e) => {
  if (state.running || !state.swept[state.selectedV]?.count) return;
  const i = eventIndex(e),
    p = DATA[state.selectedV].pts[i];
  state.hoverIdx = i;
  charts.renderCurves();
  const tip = $('#scan-tip'),
    r = $('#scan-card').getBoundingClientRect();
  tip.hidden = false;
  tip.textContent = `${p[1].toFixed(3)} A · ${bPhys(p[1]).toFixed(2)} mT · ${p[6].toFixed(2)} μA`;
  tip.style.left = Math.max(6, Math.min(e.clientX - r.left + 12, r.width - tip.offsetWidth - 6)) + 'px';
  tip.style.top = Math.max(42, Math.min(e.clientY - r.top + 12, r.height - tip.offsetHeight - 6)) + 'px';
};
$('#scan-svg').onpointerleave = () => {
  state.hoverIdx = null;
  $('#scan-tip').hidden = true;
  if (connected) charts.renderCurves();
};
$('#scan-svg').onclick = (e) => inspect(eventIndex(e));
$('#scan-svg').onkeydown = (e) => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    inspect(
      e.key === 'Home' ? 0 : e.key === 'End' ? 70 : (state.scrubIdx ?? 70) + (e.key === 'ArrowLeft' ? -1 : 1),
    );
  }
};
async function processCurves() {
  if (state.processing || doneCount() < 4) return;
  state.processing = true;
  state.activeTab = 'fit';
  const token = ++constructionToken;
  for (const v of VOLTS)
    for (const phase of [1, 2, 3]) {
      if (token !== constructionToken || !connected) return;
      state.construction = { v, phase };
      render();
      await new Promise((r) =>
        setTimeout(r, matchMedia('(prefers-reduced-motion:reduce)').matches ? 60 : 420),
      );
    }
  if (token !== constructionToken || !connected) return;
  state.processing = false;
  state.singleCalcDone = true;
  state.showTangent = true;
  if (state.guide && state.step === '2a') goStep('2b');
  else render();
}
function processEntry() {
  state.activeTab = 'fit';
  if (state.guide) goStep('2a');
  else {
    state.stageLayout = 'analysis';
    state.leftOpen = false;
    state.rightOpen = true;
    render();
  }
}
function showPotential() {
  if (state.guide) goStep('5a');
  else {
    state.potentialOpen = true;
    state.heaterFound = true;
    state.step = '5b';
    state.leftOpen = state.rightOpen = false;
    render();
  }
}
function applyUeff() {
  state.ueffVerified = state.tubeUseUeff = true;
  state.potentialOpen = false;
  state.activeTab = 'fit';
  if (state.guide) goStep('6');
  else {
    state.stageLayout = 'analysis';
    state.leftOpen = false;
    state.rightOpen = true;
    render();
  }
}
function recordBump() {
  state.anomaliesLocked = true;
  state.guide = false;
  state.manualLayout = true;
  render();
  host.finish();
}
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($('#toast').hidden = true), 3000);
}
function openReference() {
  const rows = ['tangent', 'steepest', 'halfmax']
      .map((method, i) => {
        const f = regress(DATA, CAL, method);
        return `<tr><td>${['平台切线交点', '最陡斜率中点', '50% 半高点'][i]}</td><td>${f.u0.toFixed(3)}</td><td>${(f.em / 1e11).toFixed(3)}</td></tr>`;
      })
      .join(''),
    actual = regress(DATA, CAL, 'tangent', 'actual');
  $('#modal-title').textContent = '标定与口径';
  $('#modal-body').innerHTML =
    raw`<h4>磁场标定关系</h4><p>${equation()}</p><p>线性标定区间 $0.20\sim1.40\text{ A}$。零电流处磁场取 $0.00\text{ mT}$。</p><h4>中央阳极单路测量</h4><p>中央阳极 $A_1$ 经 $1\text{ k}\Omega$ 取样电阻接入下排数字毫伏表，$1\text{ mV}$ 对应 $1\,\mu\text{A}$ 收集电流。保护环直接接 $U_a^+$，上排表待机。加速电源 $\mathrm{CH2}^-$ 接灯丝 H 端。</p><h4>截止判据对照</h4><table><thead><tr><th>判据</th><th>$U_0$/V</th><th>$e/m$ / $10^{11}\text{ C/kg}$</th></tr></thead><tbody>${rows}</tbody></table><p>主流程采用零场平台与最陡下降段切线的交点。改用实测加速电压作横轴，切线法拟合得到 $U_0=${actual.u0.toFixed(3)}\text{ V}$。</p><h4>几何参数</h4><p>中央阳极 $15\text{ mm}$，两侧保护环各 $10\text{ mm}$；阳极内半径 $R_a=4.55\text{ mm}$，灯丝半径 $r_c=37.5\,\mu\text{m}$。</p>`;
  renderMath($('#modal-body'));
  $('#modal').hidden = false;
  $('#close-modal').focus();
}
$('#dock-left').onclick = () => openPanel('left');
$('#dock-right').onclick = () => openPanel('right');
for (const side of ['left', 'right'])
  $('#close-' + side).onclick = () => {
    manualLayout();
    state[side + 'Open'] = false;
    render();
  };
$('#btn-view-bench').onclick = () => setView('bench');
$('#btn-view-tube').onclick = () => setView('tube');
$('#btn-reset-cam').onclick = () => host.reset();
$('#tube-zoom-orbit').onclick = () => host.orbit();
$('#tube-pot-ua').onclick = () => {
  state.tubeUseUeff = false;
  render();
};
$('#tube-pot-ueff').onclick = () => {
  state.tubeUseUeff = true;
  render();
};
$('#restore-latest').onclick = () => {
  state.scrubIdx = null;
  render();
};
$('#btn-run-sweep').onclick = () => (state.running ? pauseOrResume() : startSweep(state.selectedV));
$('#btn-sweep-rest').onclick = startBatch;
$('#btn-curves-rest').onclick = startBatch;
for (const speed of [1, 3])
  $('#spd-' + speed).onclick = () => {
    state.playbackSpeed = speed;
    stream.setSpeed(speed);
    render();
  };
$('#spd-skip').onclick = $('#compact-finish').onclick = () => stream.finish();
$('#compact-pause').onclick = pauseOrResume;
document.querySelectorAll('.stage-tab').forEach(
  (b) =>
    (b.onclick = () => {
      if (!b.disabled) showTab(b.dataset.tab, { manual: true });
    }),
);
$('#btn-tog-tangent').onclick = () => {
  state.showTangent = !state.showTangent;
  render();
};
$('#axis-im').onclick = () => {
  state.xAxisUnit = 'IM';
  render();
};
$('#axis-b').onclick = () => {
  state.xAxisUnit = 'B';
  render();
};
$('#btn-process-entry').onclick = processEntry;
$('#btn-calc-single').onclick = processCurves;
$('#btn-plot-scatter').onclick = () => {
  state.scatterDone = true;
  if (state.guide && state.step === '3') goStep('4a');
  else render();
};
$('#btn-run-fit').onclick = () => {
  state.fitDone = true;
  if (state.guide && state.step === '4a') goStep('4b');
  else render();
};
$('#btn-investigate').onclick = showPotential;
$('#btn-compare').onclick = () => {
  if (state.guide) goStep('7a');
  else {
    state.activeTab = 'ideal';
    state.stageLayout = 'cliffhanger';
    state.leftOpen = false;
    state.rightOpen = true;
    render();
  }
};
$('#btn-ideal-scope').onclick = () => {
  state.idealFocus10 = !state.idealFocus10;
  render();
};
$('#btn-right-next').onclick = recordBump;
$('#probe-options')
  .querySelectorAll('[data-probe]')
  .forEach((b) => (b.onclick = () => probe(b.dataset.probe)));
$('#probe-compare').onclick = () => {
  state.probeCompared = true;
  state.compareThree = true;
  render();
};
$('#probe-mean').onclick = () => {
  state.step = '5c';
  state.compareThree = true;
  render();
};
$('#potential-close').onclick = () => {
  manualLayout();
  render();
};
$('#btn-apply-ueff').onclick = applyUeff;
$('#dlg-next').onclick = nextStep;
$('#dlg-prev').onclick = () => goStep(STEPS[Math.max(0, STEPS.findIndex((s) => s.id === state.step) - 1)].id);
$('#dlg-skip').onclick = $('#guide-toggle').onclick = toggleGuide;
$('#restore-layout').onclick = () => goStep(state.step, { restore: true });
$('#dock-ref').onclick = $('#btn-open-ref').onclick = openReference;
$('#close-modal').onclick = () => ($('#modal').hidden = true);
$('#modal').onclick = (e) => {
  if (e.target === $('#modal')) $('#modal').hidden = true;
};
$('#dock-book').onclick = () => {
  if (state.running && !state.running.paused) pauseOrResume();
  save();
  host.book();
};
$('#main-menu').onclick = () => {
  if (state.running && !state.running.paused) pauseOrResume();
  host.menu();
};
$('#btn-back-ch1').onclick = () => host.back(1);
$('#btn-back-ch2').onclick = () => host.back(2);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal').hidden) {
    $('#modal').hidden = true;
    return;
  }
  if (
    state.guide &&
    [' ', 'Enter'].includes(e.key) &&
    !e.target.closest('button,input,textarea,select,svg,math') &&
    $('#modal').hidden
  ) {
    e.preventDefault();
    nextStep();
  }
});
document.addEventListener('scroll', scheduleSpot, {capture:true, passive:true});
window.addEventListener('resize', () => {
  if (!connected) return;
  if (narrow() && state.leftOpen && state.rightOpen && !state.manualLayout)
    state[state.running || state.step === '1' ? 'leftOpen' : 'rightOpen'] = false;
  render();
  updateStorySpace();
});
window.initialize = (bridge, saved, measurements, calibration, guess) => {
  viewToken++;
  host = bridge;
  asset = measurements;
  DATA = loadSweepData(asset);
  CAL = resolveCalibration(asset, calibration);
  stream.cancel();
  constructionToken++;
  Object.assign(state, structuredClone(defaults));
  const s = saved ?? {};
  Object.assign(state, {
    selectedV: s.selectedVoltage ?? 10,
    swept: structuredClone(s.sweptVoltages ?? {}),
    singleCalcDone: !!s.singleCalcDone,
    scatterDone: !!(s.scatterDone || s.fittedRegression?.done),
    fitDone: !!s.fittedRegression?.done,
    ueffVerified: !!s.fittedRegression?.dropVerified,
    anomaliesLocked: !!(s.bumpRecorded ?? s.anomaliesConfirmed),
    showTangent: s.showTangentOverlay ?? false,
    tubeUseUeff: s.idealUseUeff ?? false,
    xAxisUnit: s.xAxisUnit ?? 'IM',
    playbackSpeed: s.playbackSpeed ?? 1,
    scrubIdx: s.inspectedPointIdx ?? null,
    activeTab: s.activeTab ?? 'curves',
    viewMode: s.viewMode ?? 'bench',
    leftOpen: s.leftOpen ?? true,
    rightOpen: s.rightOpen ?? false,
    idealFocus10: s.idealFocus10 ?? true,
    p6GuessIdx: guess ?? null,
    heaterFound: !!(s.heaterFound || s.fittedRegression?.dropVerified),
    probeCompared: !!(s.probeCompared || s.fittedRegression?.dropVerified),
    probe: s.probe ?? 'H',
    potentialOpen: s.potentialOpen ?? false,
  });
  Object.assign(state, restoredStory(s, state));
  if (state.guide && ['0a', '0b', '0c', '7a', '7b'].includes(state.step)) state.selectedV = 10;
  state.compareThree = state.step === '5c';
  charts = createCharts({
    state,
    DATA,
    VOLTS,
    V_COLORS,
    GEOM,
    $,
    bPhys,
    analyzeVoltage,
    fitRegression,
    idealIM_fromU: (u) => idealCurrentForVoltage(u, CAL),
  });
  connected = true;
  lastPointKey = '';
  dialogueKey = '';
  if (state.guide && !state.manualLayout) applyLayout(stepFor(state.step));
  if (stepFor(state.step).stage === 'analysis' && state.guide) state.activeTab = 'fit';
  if (stepFor(state.step).stage === 'cliffhanger' && state.guide) state.activeTab = 'ideal';
  render();
  return $('#scene');
};
window.suspend = () => {
  viewToken++;
  stopRunning();
  constructionToken++;
  state.processing = false;
  save();
  connected = false;
};
window.scenePick = (tag) => {
  const id = tag.part ?? tag.lead;
  if (!id) return;
  if (state.guide && ['5a', '5found'].includes(state.step)) {
    if (id === 'heater') {
      state.heaterFound = true;
      goStep('5found');
      return;
    }
    state.detectiveMsg = DETECTIVE[id] ?? DETECTIVE.accelerator;
    host.highlight(id);
    render();
    return;
  }
  if (id === 'tube') setView('tube');
  else host.focus(id === 'power' ? 'magnet' : id);
};
window.sceneHover = (text, id) => {
  const el = $('#scene-hover');
  el.hidden = !text || !state.guide || state.step !== '5a';
  el.textContent = text;
};
window.updateGuess = (guess) => {
  state.p6GuessIdx = guess;
  if (connected) {
    renderGuess();
    save();
  }
};
window.getState = () => snapshot();
window.getDebug = () => ({
  workingPoint: activeWorkingPoint(),
  running: state.running ? { ...state.running } : null,
  runToken: stream.runToken,
  nextCommitIdx: stream.nextCommitIdx,
  fit: state.fitDone ? fitRegression() : null,
  step: state.step,
  guide: state.guide,
  manualLayout: state.manualLayout,
  stageLayout: state.stageLayout,
  processing: state.processing,
});
