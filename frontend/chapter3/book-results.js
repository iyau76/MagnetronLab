// New results extend the supplied six-page handout; its original prose stays intact.
import { renderMath, latexToMathML } from '../mathlite.js';
import { svgTex } from './svg-tex.js';
const $ = (s) => document.querySelector(s);
const colors = { 4: '#287bab', 6: '#298977', 8: '#a56d29', 10: '#bd5d3e' };
const methods = { tangent: '平台切线交点', steepest: '最陡斜率中点', halfmax: '50% 半高点' };
function axes(xLabel, yLabel, size=10) {
  return `<g fill="#53616b" font-size="${size}"><path d="M38 38V150H350" fill="none" stroke="#7b8892"/><text x="4" y="12">${svgTex(yLabel)}</text><text x="275" y="174">${svgTex(xLabel)}</text></g>`;
}
function curvesSVG(curves, cal) {
  let g = axes('I_M / A', 'I_{A1} / μA');
  if (cal) {
    g += `<path d="M38 30H350" stroke="#a0a9ac"/><text x="350" y="27" text-anchor="end" fill="#617987" font-size="10">B / mT</text>`;
    for (const i of [0.4, 0.8, 1.2])
      g += `<path d="M${38 + (i / 1.45) * 312} 30v-4" stroke="#617987"/><text x="${38 + (i / 1.45) * 312}" y="24" fill="#617987" font-size="11" text-anchor="middle">${Math.max(0, cal.slope * i + cal.intercept).toFixed(1)}</text>`;
  }
  for (const y of [0, 10, 20])
    g += `<path d="M38 ${150 - (y / 27) * 90}H350" stroke="#dcd7cc"/><text x="13" y="${154 - (y / 27) * 90}" font-size="10" fill="#63717b">${y}</text>`;
  for (const x of [0, 0.4, 0.8, 1.2, 1.4])
    g += `<text x="${38 + (x / 1.45) * 312}" y="164" font-size="10" fill="#63717b" text-anchor="middle">${x}</text>`;
  for (const [v, c] of Object.entries(curves))
    g += `<path d="${c.points.map(([x, y], i) => `${i ? 'L' : 'M'}${38 + (x / 1.45) * 312} ${150 - (y / 27) * 90}`).join(' ')}" fill="none" stroke="${colors[v]}" stroke-width="2"/><text x="${45 + [4, 6, 8, 10].indexOf(+v) * 62}" y="49" font-size="11" fill="${colors[v]}">${v} V</text>`;
  return `<svg viewBox="0 0 370 180" aria-label="已采集的磁截止曲线">${g}</svg>`;
}
function fitSVG(f) {
  const x = (u) => 38 + (u / 11.5) * 312,
    y = (b) => 150 - (b / 25) * 125;
  let g = axes('U_a / V', 'B_c^2 / mT^2', 12);
  for (const v of [0, 10, 20])
    g += `<text x="13" y="${y(v) + 4}" font-size="13" fill="#63717b">${v}</text><path d="M38 ${y(v)}H350" stroke="#dcd7cc"/>`;
  for (const v of [0, 2, 4, 6, 8, 10])
    g += `<text x="${x(v)}" y="164" text-anchor="middle" font-size="13" fill="#63717b">${v}</text>`;
  g += `<path d="M${x(f.u0)} ${y(0)}L${x(10.5)} ${y(f.slope * 10.5 + f.b)}" stroke="#a8732f" stroke-width="2" fill="none"/>`;
  for (const r of f.items) g += `<circle cx="${x(r.U)}" cy="${y(r.bc ** 2)}" r="4" fill="${colors[r.V]}"/>`;
  g += `<path d="M${x(f.u0)} 150V184H${x(f.u0) + 22}" fill="none" stroke="#935d2a"/><circle cx="${x(f.u0)}" cy="150" r="3.5" fill="#fffdf7" stroke="#935d2a"/><text x="${x(f.u0) + 27}" y="188" font-size="11" fill="#935d2a">${svgTex(`U_0 = ${f.u0.toFixed(2)} V`)}</text>`;
  return `<svg viewBox="0 0 370 205" aria-label="临界磁场平方对电压的拟合">${g}</svg>`;
}
const tex = (s) => latexToMathML(s);
function fitText(f) {
  return `<div class="result-equation">${tex(String.raw`B_c^2=${f.slope.toFixed(3)}(U_a-${f.u0.toFixed(2)})\text{ mT}^2`)}<br>${tex(String.raw`e/m=${(f.em / 1e11).toFixed(3)}\times10^{11}\text{ C/kg}`)}</div><p>相对参考值 ${f.relPct.toFixed(2).replace('-','−')}%　·　${tex(`R^2=${f.r2.toFixed(5)}`)}</p>`;
}
function facts(r) {
  const a = r.curves[10];
  return `<div class="case-facts"><p><b>截止前，中央阳极的收集电流先升高。</b></p><p>10 V 档由零场 ${a.zb.toFixed(2)} μA 升至 ${a.peakI.toFixed(2)} μA，增加约 ${a.peakPct.toFixed(2)}%，随后才陡降。</p><p>为什么截止前，收集电流反而会上升呢？是发射增强了吗？</p></div>`;
}

export function installChapter3Results() {
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = '../chapter3/book-results.css';
  document.head.append(style);
  const tab = document.createElement('button');
  tab.className = 'spread-tab';
  tab.dataset.spread = '3';
  tab.hidden = true;
  tab.innerHTML = '<span class="num">P7–P8</span> 破案手账';
  $('.spread-tabs').append(tab);
  const old = $('.locked-bookmark'),
    bookmark = document.createElement('button');
  bookmark.className = old.className;
  bookmark.id = 'case-bookmark';
  bookmark.type = 'button';
  bookmark.disabled = true;
  bookmark.innerHTML = old.innerHTML;
  old.replaceWith(bookmark);
  bookmark.dataset.goto = '3';
  const spread = document.createElement('div');
  spread.className = 'spread case-spread';
  spread.dataset.spread = '3';
  spread.innerHTML = `<section class="page left"><div class="page-running-head"><span>实验记录 · 破案手账</span><span class="folio">P7</span></div><div class="page-body"><h2 class="section-title">截止前，收集电流为何上升？</h2><div id="case-curves"></div><div id="case-facts"></div><p class="case-caption" id="case-method"></p></div><div class="page-footer"><button class="btn-paper" data-goto="2">← 上一页</button><span>7 / 8</span></div></section>
 <section class="page right"><div class="page-running-head"><span>测量记录与检验思路</span><span class="folio">P8</span></div><div class="page-body"><h2 class="section-title">比荷测量记录</h2><div class="case-fit"><div id="case-fit-chart"></div><div id="case-fit-result"></div></div><label class="case-note"><b>我对截止前上升的观察</b><textarea id="case-observation" placeholder="回看曲线，写下你注意到的变化。"></textarea></label><label class="case-note"><b>我的解释与下一步检验</b><textarea id="case-explanation" placeholder="收集电流为什么上升？可以改变什么条件来检验？"></textarea></label></div><div class="page-footer"><span>笔记随实验进度保存</span><button class="btn-paper" id="case-close">合上讲义 →</button></div></section>`;
  $('.paper-stack').append(spread);
  let result = null;
  return {
    isUnlocked: () => !!result?.anomaliesConfirmed,
    connect({ goalData, notesStore, onClose }) {
      const empty = [1, 2, 3].map((i) => {
        const card = $(`[data-goal="${i}"]`);
        return {
          i,
          render: goalData[i].render,
          preview: card.querySelector('.goal-ghost-preview').innerHTML,
          tag: card.querySelector('.tag').textContent,
          hint: card.querySelector('.goal-card-head span:last-child').textContent,
        };
      });
      for (const [id, key] of [
        ['case-observation', 'anomaly'],
        ['case-explanation', 'cause'],
      ])
        $('#' + id).oninput = (e) => (notesStore[key] = e.target.value);
      $('#case-close').onclick = onClose;
      function restore(r) {
        result = r ?? null;
        tab.hidden = !result?.anomaliesConfirmed;
        bookmark.disabled = !result?.anomaliesConfirmed;
        bookmark.classList.toggle('unlocked', !bookmark.disabled);
        bookmark.title = bookmark.disabled ? '第三章登记反常后解锁' : '打开破案手账';
        bookmark.innerHTML = bookmark.disabled
          ? '<span class="lock-dot"></span><span>第 7 页起：破案手账 · 随实验进展解锁</span>'
          : '<span>第 7 页起：破案手账 →</span>';
        for (const e of empty) {
          const card = $(`[data-goal="${e.i}"]`);
          goalData[e.i].render = e.render;
          card.querySelector('.goal-ghost-preview').innerHTML = e.preview;
          card.querySelector('.tag').textContent = e.tag;
          card.querySelector('.goal-card-head span:last-child').textContent = e.hint;
        }
        if (!result) return;
        const set = (i, preview, render, label) => {
          const c = $(`[data-goal="${i}"]`);
          c.querySelector('.goal-ghost-preview').innerHTML = preview;
          c.querySelector('.tag').textContent = label;
          c.querySelector('.goal-card-head span:last-child').textContent = '查看实验记录 ↗';
          goalData[i].render = render;
        };
        const graph = curvesSVG(result.curves, result.calibration);
        if (Object.keys(result.curves).length)
          set(
            1,
            graph,
            () =>
              `<div class="book-result">${graph}<p>${Object.keys(result.curves).length} 档已采集 · ${methods[result.cutoffMethod]}</p></div>`,
            '已采图',
          );
        if (result.fit) {
          const f = result.fit;
          set(
            2,
            `<div class="result-equation">${tex(String.raw`e/m=${(f.em / 1e11).toFixed(3)}\times10^{11}`)}<br><small>C/kg · ${f.relPct.toFixed(2).replace('-','−')}%</small><br><small>${tex(String.raw`U_0=${f.u0.toFixed(2)}\text{ V}`)}</small></div>`,
            () =>
              `<div class="book-result">${fitSVG(f)}${fitText(f)}<p>${methods[result.cutoffMethod]} · ${result.voltageMode === 'actual' ? '实测' : '标称'} ${tex('U_a')}</p></div>`,
            '已测量',
          );
        }
        if (result.anomaliesConfirmed && result.fit && result.curves[10]) {
          $('#case-curves').innerHTML = graph;
          $('#case-facts').innerHTML = facts(result);
          $('#case-fit-chart').innerHTML = fitSVG(result.fit);
          $('#case-fit-result').innerHTML = fitText(result.fit);
          $('#case-method').textContent =
            `${methods[result.cutoffMethod]} · ${result.voltageMode === 'actual' ? '实测' : '标称'}电压 · 已扣除灯丝半压降作理想对照`;
          set(
            3,
            '<div class="result-equation">截止前，收集电流上升<br>是发射增强了吗？</div>',
            () => `<div class="case-goal-facts">${facts(result)}</div>${empty[2].render()}`,
            '已记录观察',
          );
        }
        renderMath(spread);
      }
      return {
        restore,
        syncNotes() {
          for (const [id, key] of [
            ['case-observation', 'anomaly'],
            ['case-explanation', 'cause'],
          ])
            $('#' + id).value = notesStore[key];
        },
      };
    },
  };
}
