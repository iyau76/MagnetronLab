import { svgLabel as label } from './svg-tex.js';
const ink = '#a5bdce',
  grid = '#203746',
  gold = '#e3bb7e';
function axes({
  W,
  H,
  L = 56,
  R = 24,
  T = 38,
  B = 52,
  xMax,
  yMax,
  xTicks,
  yTicks,
  xTitle,
  yTitle,
  xMin = 0,
  yMin = 0,
  fontSize = 12,
  titleSize = 13,
}) {
  const x = (v) => L + ((v - xMin) / (xMax - xMin)) * (W - L - R),
    y = (v) => H - B - ((v - yMin) / (yMax - yMin)) * (H - T - B);
  let g = '';
  for (const v of yTicks)
    g +=
      `<path d="M${L} ${y(v)}H${W - R}" stroke="${grid}"/>` +
      label(L - 10, y(v) + 4, v, `text-anchor="end" fill="${ink}" font-size="${fontSize}"`);
  for (const v of xTicks)
    g +=
      `<path d="M${x(v)} ${T}V${H - B}" stroke="${grid}" stroke-opacity=".6"/>` +
      label(x(v), H - B + 23, v, `text-anchor="middle" fill="${ink}" font-size="${fontSize}"`);
  g +=
    `<path d="M${L} ${T}V${H - B}H${W - R}" fill="none" stroke="#617d90"/>` +
    label(L, 20, yTitle, `fill="${ink}" font-size="${titleSize}"`) +
    label(W - R, H - 8, xTitle, `text-anchor="end" fill="${ink}" font-size="${titleSize}"`);
  return { x, y, g, L, R, T, B, W, H };
}
const path = (points, x, y, xi = 1, yi = 6) =>
  points.map((p, i) => `${i ? 'L' : 'M'}${x(p[xi]).toFixed(2)} ${y(p[yi]).toFixed(2)}`).join(' ');
export function nearestCurvePoint(points, count, fraction, bPhys, axis) {
  const max = axis === 'B' ? bPhys(1.45) : 1.45;
  let best = 0,
    dist = Infinity;
  for (let i = 0; i < count; i++) {
    const d = Math.abs((axis === 'B' ? bPhys(points[i][1]) : points[i][1]) / max - fraction);
    if (d < dist - 1e-12) {
      dist = d;
      best = i;
    }
  }
  return best;
}
export function createCharts({
  state,
  DATA,
  VOLTS,
  V_COLORS,
  GEOM,
  $,
  bPhys,
  analyzeVoltage,
  fitRegression,
  idealIM_fromU,
}) {
  function renderCurves() {
    const isB = state.xAxisUnit === 'B';
    const a = axes({
      W: 520,
      H: 330,
      xMax: isB ? bPhys(1.45) : 1.45,
      yMax: 27,
      xTicks: isB ? [0, 1, 2, 3, 4, 5] : [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4],
      yTicks: [0, 5, 10, 15, 20, 25],
      xTitle: isB ? 'B / mT' : 'I_M / A',
      yTitle: 'I_{A1} / μA',
    });
    const x = (i) => a.x(isB ? bPhys(i) : i);
    let g = a.g;
    for (const v of VOLTS) {
      const sw = state.swept[v],
        cnt = state.running?.v === v ? state.running.cursor + 1 : (sw?.count ?? 0),
        sel = v === state.selectedV,
        col = V_COLORS[v];
      if (!cnt && state.running?.v !== v) continue;
      if (sel)
        g += `<path d="M${a.L} ${a.y(DATA[v].zb_a1)}H${a.W - a.R}" stroke="${col}" opacity=".5" stroke-dasharray="5 5"/>`;
      if (cnt)
        g += `<path d="${path(DATA[v].pts.slice(0, cnt), x, a.y)}" fill="none" stroke="${col}" stroke-width="${sel ? 2.5 : 1.7}" opacity="${sel ? 1 : 0.62}" stroke-linejoin="round"/>`;
      if (sw?.done && sel && state.showTangent && state.singleCalcDone) {
        const r = analyzeVoltage(v);
        g +=
          `<path d="M${x(r.ic)} ${a.y(r.zb)}L${x(r.xZeroCross)} ${a.y(0)}" stroke="#e7edf0" stroke-dasharray="5 4" fill="none"/><path d="M${x(r.ic)} ${a.y(r.zb)}V${a.y(0)}" stroke="${gold}" stroke-dasharray="3 4"/><circle cx="${x(r.ic)}" cy="${a.y(r.zb)}" r="5" fill="${col}" stroke="white"/>` +
          label(
            x(r.ic) - 8,
            a.y(r.zb) + 20,
            `I_c = ${r.ic.toFixed(3)} A`,
            `text-anchor="end" fill="${gold}" font-size="12"`,
          );
      }
    }
    const count = state.running?.cursor + 1 || state.swept[state.selectedV]?.count || 0,
      i = state.hoverIdx ?? state.scrubIdx ?? (count ? count - 1 : null);
    if (i != null && i < count) {
      const p = DATA[state.selectedV].pts[i];
      g += `<path d="M${x(p[1])} ${a.T}V${a.y(0)}" stroke="#ffffff40"/><circle cx="${x(p[1])}" cy="${a.y(p[6])}" r="4" fill="${gold}" stroke="white"/>`;
    }
    $('#scan-svg').innerHTML = g;
  }
  function renderConstruction() {
    const c = state.construction ?? { v: state.selectedV, phase: state.singleCalcDone ? 3 : 0 },
      r = analyzeVoltage(c.v),
      a = axes({
        W: 700,
        H: 400,
        xMax: 1.45,
        yMax: 27,
        xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4],
        yTicks: [0, 5, 10, 15, 20, 25],
        xTitle: 'I_M / A',
        yTitle: 'I_{A1} / μA',
      });
    let g = a.g;
    for (const v of VOLTS)
      g += `<path d="${path(DATA[v].pts, a.x, a.y)}" fill="none" stroke="${V_COLORS[v]}" stroke-width="${v === c.v ? 2.6 : 1.3}" opacity="${v === c.v ? 1 : 0.24}"/>`;
    if (c.phase >= 1)
      g +=
        `<path d="M${a.L} ${a.y(r.zb)}H${a.W - a.R}" stroke="${gold}" stroke-width="1.5" stroke-dasharray="7 4"/>` +
        label(74, a.y(r.zb) + 22, `零场平台 ${r.zb.toFixed(2)} μA`, `fill="${gold}" font-size="14"`);
    if (c.phase >= 2)
      g += `<path d="M${a.x(r.ic - 0.015)} ${a.y(r.zb - r.slopeSeg * 0.015)}L${a.x(r.xZeroCross)} ${a.y(0)}" stroke="#e9f1f5" stroke-width="1.7" stroke-dasharray="6 4" fill="none"/><circle cx="${a.x(r.xm)}" cy="${a.y(r.ym)}" r="5" fill="#e9f1f5"/>`;
    if (c.phase >= 3)
      g +=
        `<path d="M${a.x(r.ic)} ${a.y(r.zb)}V${a.y(0)}" stroke="${gold}" stroke-dasharray="4 4"/><circle cx="${a.x(r.ic)}" cy="${a.y(r.zb)}" r="7" fill="#101e2b" stroke="${gold}" stroke-width="2.5"/>` +
        label(
          a.x(r.ic) - 12,
          228,
          `I_c = ${r.ic.toFixed(3)} A`,
          `text-anchor="end" fill="${gold}" font-size="15"`,
        ) +
        label(
          a.x(r.ic) - 12,
          255,
          `B_c = ${r.bc.toFixed(3)} mT`,
          `text-anchor="end" fill="${gold}" font-size="15"`,
        );
    $('#construction-svg').innerHTML = g;
    $('#construction-label').textContent =
      `${c.v} V · ${['待作图', '零场平台', '最陡下降段切线', '平台与切线交点'][c.phase]}`;
  }
  function renderFit() {
    const f = fitRegression(),
      a = axes({
        W: 700,
        H: 460,
        L: 66,
        R: 30,
        T: 40,
        B: 85,
        xMax: 11,
        yMax: 25,
        xTicks: [0, 2, 4, 6, 8, 10],
        yTicks: [0, 5, 10, 15, 20, 25],
        xTitle: 'U_a / V',
        yTitle: 'B_c^2 / mT^2',
      });
    let g = a.g;
    if (state.fitDone) {
      const kt = 8 / (GEOM.em_codata * 1e-6 * GEOM.G_m2);
      g +=
        `<path d="M${a.x(0)} ${a.y(0)}L${a.x(10.8)} ${a.y(kt * 10.8)}" stroke="#75b6e6" stroke-dasharray="7 5" opacity=".55" fill="none"/>` +
        label(a.x(10.6), a.y(kt * 10.6) - 12, '过原点的理想参考线', 'text-anchor="end" fill="#75b6e6" font-size="13"');
      g += `<path d="M${a.x(f.u0)} ${a.y(0)}L${a.x(4)} ${a.y(4 * f.slope + f.b)}" fill="none" stroke="${gold}" stroke-width="2" stroke-dasharray="5 4"/><path d="M${a.x(4)} ${a.y(4 * f.slope + f.b)}L${a.x(10.5)} ${a.y(10.5 * f.slope + f.b)}" stroke="${gold}" stroke-width="2.5" fill="none"/>`;
      g +=
        `<circle cx="${a.x(f.u0)}" cy="${a.y(0)}" r="7" stroke="${gold}" stroke-width="2.5" fill="#0c1b28"/><path d="M${a.x(f.u0)} ${a.y(0) + 10}V${a.y(0) + 48}H${a.x(f.u0) + 35}" fill="none" stroke="${gold}"/>` +
        label(a.x(f.u0) + 43, a.y(0) + 53, `U_0 = ${f.u0.toFixed(2)} V`, `fill="${gold}" font-size="18"`);
    }
    for (const r of f.items)
      g +=
        `<circle cx="${a.x(r.U)}" cy="${a.y(r.bc ** 2)}" r="5.5" fill="${V_COLORS[r.V]}" stroke="#fff8"/>` +
        label(a.x(r.U) + 12, a.y(r.bc ** 2) - 13, `${r.U} V`, `fill="${V_COLORS[r.V]}" font-size="14"`);
    $('#fit-svg').innerHTML = g;
    $('#fit-status').textContent = state.fitDone ? `R² = ${f.r2.toFixed(5)}` : '四档实测点';
  }
  function renderIdeal() {
    const compact = innerWidth <= 1060,
      fullH = compact ? 330 : 390,
      bumpH = compact ? 300 : 390;
    $('#ideal-svg').setAttribute('viewBox', `0 0 650 ${fullH}`);
    $('#bump-svg').setAttribute('viewBox', `0 0 480 ${bumpH}`);
    const a = axes({
      W: 650,
      H: fullH,
      xMax: 1.45,
      yMax: 27,
      xTicks: compact ? [0, 0.4, 0.8, 1.2, 1.4] : [0, 0.2, 0.4, 0.6, 0.8, 1, 1.2, 1.4],
      yTicks: [0, 5, 10, 15, 20, 25],
      xTitle: 'I_M / A',
      yTitle: 'I_{A1} / μA',
      fontSize: compact ? 17 : 12,
      titleSize: compact ? 18 : 13,
    });
    let g = a.g;
    for (const v of state.idealFocus10 ? [10] : VOLTS) {
      const r = analyzeVoltage(v),
        col = V_COLORS[v],
        ic = idealIM_fromU(v - DATA[v].zb_uf / 2);
      g += `<path d="M${a.x(0)} ${a.y(r.zb)}H${a.x(ic)}V${a.y(0)}H${a.x(1.4)}" stroke="${col}" opacity=".5" stroke-width="1.6" stroke-dasharray="7 5" fill="none"/><path d="${path(DATA[v].pts, a.x, a.y)}" fill="none" stroke="${col}" stroke-width="2.5"/>`;
    }
    const r = analyzeVoltage(10),
      xmin = 0.78,
      xmax = 1.06,
      ymin = 23.8,
      ymax = 25.2;
    g +=
      `<rect x="${a.x(xmin)}" y="${a.y(ymax)}" width="${a.x(xmax) - a.x(xmin)}" height="${a.y(ymin) - a.y(ymax)}" fill="#d6ac731f" stroke="${gold}" stroke-dasharray="4 3"/><path d="M${a.x(1.02)} ${a.y(25.4)}V${a.y(21.5)}H${a.x(1.33)}" stroke="${gold}" fill="none"/>` +
      label(a.x(1.34), a.y(21.5) + 18, '局部放大 ↗', `text-anchor="end" fill="${gold}" font-size="12"`);
    $('#ideal-svg').innerHTML = g;
    $('#ideal-title').textContent = state.idealFocus10 ? '10 V · 完整扫场' : '四档 · 完整扫场';
    const b = axes({
      W: 480,
      H: bumpH,
      L: 65,
      T: 38,
      R: 26,
      B: 52,
      xMin: xmin,
      xMax: xmax,
      yMin: ymin,
      yMax: ymax,
      xTicks: [0.8, 0.9, 1, 1.05],
      yTicks: [23.8, 24.2, 24.6, 25],
      xTitle: 'I_M / A',
      yTitle: 'I_{A1} / μA',
      fontSize: compact ? 16 : 12,
      titleSize: compact ? 17 : 13,
    });
    let z =
      b.g +
      `<defs><clipPath id="bump-clip"><rect x="65" y="38" width="389" height="${bumpH - 90}"/></clipPath></defs><g clip-path="url(#bump-clip)"><path d="M65 ${b.y(r.zb)}H454" fill="none" stroke="#8eb4ce" stroke-width="1.3" stroke-dasharray="6 5"/><path d="${path(DATA[10].pts, b.x, b.y)}" fill="none" stroke="${V_COLORS[10]}" stroke-width="3"/>`;
    z +=
      `<ellipse class="bump-ring" cx="${b.x(r.peakIM)}" cy="${b.y(r.peakI)}" rx="18" ry="21" fill="none" stroke="${gold}" stroke-width="2"/><circle cx="${b.x(r.peakIM)}" cy="${b.y(r.peakI)}" r="4" fill="${gold}"/></g>` +
      label(
        80,
        b.y(r.zb) + 22,
        `零场 ${r.zb.toFixed(2)} μA`,
        `fill="#8eb4ce" font-size="${compact ? 17 : 12}"`,
      ) +
      label(
        b.x(r.peakIM) - 26,
        b.y(r.peakI) - 16,
        `${r.peakI.toFixed(2)} μA`,
        `text-anchor="end" fill="${gold}" font-size="${compact ? 20 : 14}"`,
      );
    $('#bump-svg').innerHTML = z;
    $('#bump-percent').textContent = `10 V · +${r.peakPct.toFixed(2)}%`;
  }
  return { renderCurves, renderConstruction, renderFit, renderIdeal };
}
