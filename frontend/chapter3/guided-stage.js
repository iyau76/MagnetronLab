import { DIALOGUE } from './story-text.js';
const raw = String.raw;
export const STEPS = [
  { id: '0a', stage: 'sweep', text: DIALOGUE[0], focus: '#scene', hint: '正式实验：采集四档磁截止曲线' },
  {
    id: '0b',
    stage: 'sweep',
    text: DIALOGUE[1],
    focus: '#left-drawer',
    hint: '由控制程序逐点扫场、记录读数',
  },
  {
    id: '0c',
    stage: 'sweep',
    text: DIALOGUE[2],
    focus: '#sweep-program',
    wait: 'first',
    hint: '先点击 10 V 档自动扫场',
  },
  {
    id: '1',
    stage: 'sweep',
    text: DIALOGUE[3],
    focus: '#scan-card',
    wait: 'curves',
    hint: '采齐其余加速电压的曲线',
  },
  {
    id: '2a',
    stage: 'analysis',
    text: DIALOGUE[4],
    focus: '#btn-calc-single',
    wait: 'single',
    hint: '按讲义处理四条曲线',
  },
  { id: '2b', stage: 'analysis', text: DIALOGUE[5], focus: '#em-table', hint: '比较四档单点比荷' },
  {
    id: '3',
    stage: 'analysis',
    text: DIALOGUE[6],
    focus: '#btn-plot-scatter',
    wait: 'scatter',
    hint: raw`绘制 $B_c^2-U_a$ 散点图`,
  },
  {
    id: '4a',
    stage: 'analysis',
    text: DIALOGUE[7],
    focus: '#btn-run-fit',
    wait: 'fit',
    hint: '拟合直线，查看斜率与截距',
  },
  {
    id: '4b',
    stage: 'analysis',
    text: DIALOGUE[8],
    focus: '#fit-card',
    hint: raw`横轴截距 $U_0=2.18\text{ V}$ 从哪里来？`,
  },
  {
    id: '5a',
    stage: 'bench',
    text: DIALOGUE[9],
    focus: '#scene',
    wait: 'found',
    hint: '点击台面上的仪器，顺着连线查找',
  },
  {
    id: '5found',
    stage: 'bench',
    text: raw`找到了！**CH3** 正稳定加着 $U_f = 3.68\text{ V}$ 的加热压降。可加热电流是在灯丝两头之间流的，它凭什么会从径向加速电压 $U_a$ 里扣掉大约 $2\text{ V}$？我们顺着 $\mathrm{CH2}^-$ 接线贴近灯丝看一看。`,
    focus: '#scene',
    hint: '查看 CH3 读数，沿 CH2 负端找到 H',
  },
  {
    id: '5b',
    stage: 'potential',
    text: raw`回顾第一章接线图——$\mathrm{CH2}^-$ 只接在灯丝 $\mathrm{H}$ 端，整根灯丝从 $0\text{ V}$ 一路升到 $+3.68\text{ V}$。`,
    focus: '#potential-card',
    wait: 'probe',
    hint: '点选 H 端、中点或 K 端，比较加速压差',
  },
  {
    id: '5c',
    stage: 'potential',
    text: raw`沿灯丝发出的电子平均起飞电位高了 **$U_f / 2 \approx 1.84\text{ V}$**，有效压差只有 **$U_{\mathrm{eff}} \approx U_a - U_f / 2$**！现在点击右侧按钮代入重新核验。`,
    focus: '#potential-card',
    wait: 'corrected',
    hint: '用灯丝平均电位重新核验比荷',
  },
  {
    id: '6',
    stage: 'analysis',
    text: DIALOGUE[16],
    focus: '#analysis-summary',
    hint: '比较修正前后的四档结果',
  },
  {
    id: '7a',
    stage: 'cliffhanger',
    text: DIALOGUE[17],
    focus: '#ideal-card',
    hint: '回看实测曲线与理想趋势',
  },
  {
    id: '7b',
    stage: 'cliffhanger',
    text: DIALOGUE[18],
    focus: '#bump-card',
    wait: 'complete',
    hint: '截止前，收集电流为什么反而上升？',
  },
];
export const DETECTIVE = {
  resistor: DIALOGUE[10],
  meter: DIALOGUE[10],
  standby: DIALOGUE[11],
  magnet: DIALOGUE[12],
  coils: DIALOGUE[12],
  accelerator: DIALOGUE[13],
  tube: DIALOGUE[14],
};
export const stepFor = (id) => STEPS.find((s) => s.id === id) ?? STEPS[0];
export function fulfilled(step, s) {
  const n = Object.values(s.swept ?? {}).filter((x) => x.done).length;
  return (
    {
      first: !!s.swept?.[10]?.done,
      curves: n === 4,
      single: s.singleCalcDone,
      scatter: s.scatterDone,
      fit: s.fitDone,
      found: s.heaterFound,
      probe: s.probeCompared,
      corrected: s.ueffVerified,
      complete: s.anomaliesLocked,
    }[step.wait] ?? !step.wait
  );
}
export function frontierStep(s) {
  const n = Object.values(s.swept ?? {}).filter((x) => x.done).length;
  if (!n) return '0c';
  if (n < 4) return '1';
  if (!s.singleCalcDone) return '2a';
  if (!s.scatterDone) return '3';
  if (!s.fitDone) return '4a';
  if (!s.heaterFound) return '5a';
  if (!s.probeCompared) return '5b';
  if (!s.ueffVerified) return '5c';
  return s.anomaliesLocked ? '7b' : '7a';
}
export function restoredStory(saved, state) {
  return {
    guide: saved.guideEnabled ?? !state.anomaliesLocked,
    step: saved.guideStep ?? (Object.values(state.swept).some((x) => x.done) ? frontierStep(state) : '0a'),
    manualLayout: !!saved.manualLayout,
    stageLayout: saved.stageLayout ?? 'sweep',
  };
}
