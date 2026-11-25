import {installSixthNotebook} from './notebook6.js';
import {renderMath} from '../mathlite.js';
import {curveChart} from './charts.js';
import {symmetryChart,fateWheel} from './charts5.js';
import {measuredCurves} from './model-math.js';

// Progressive pages extend the user's original facing-page book.
export function installResearchNotebook() {
  let state=null,bundlePromise=null,fifthPromise=null;
  const oldPage=document.querySelector('.case-spread .page.right');
  const oldBody=oldPage.querySelector('.page-body'),oldFooter=oldPage.querySelector('.page-footer');
  const researchBody=document.createElement('div');researchBody.className='page-body research-book-body';researchBody.hidden=true;oldBody.after(researchBody);
  const footer=document.createElement('div');footer.className='page-footer';footer.hidden=true;footer.innerHTML='<span>消融与实测对照</span><button class="btn-paper" data-goto="4">微观证据 →</button>';oldFooter.after(footer);
  const tab=document.createElement('button');tab.className='spread-tab';tab.dataset.spread='4';tab.hidden=true;tab.innerHTML='<span class="num">P9</span> 微观证据';document.querySelector('.spread-tabs').append(tab);
  const spread=document.createElement('div');spread.className='spread research-spread';spread.dataset.spread='4';spread.innerHTML=`<section class="page left"><div class="page-running-head"><span>跨区延迟收集 · 单电子核验</span><span class="folio">P9</span></div><div id="micro-notebook" class="page-body research-book-body"></div><div class="page-footer"><button class="btn-paper" data-goto="3">← 消融与实测</button><span>微观轨迹记录</span></div></section><section class="page right"><div class="page-running-head"><span>下一项检验</span></div><div class="page-body research-next"><h2 class="section-title">高磁场下的残余电流</h2><p>在 $5.735\\ \\mathrm{mT}$，零倾角热模型的两路收集电流均已归零。实测在相邻磁场处仍保留 $A_1$ 的 $8.97\\%$ 与 $A_2$ 的 $16.26\\%$。</p><p>是什么让电子穿过了同轴磁场下的截止势垒？</p><p class="research-await">后续记录随实验进展写入。</p></div><div class="page-footer"><button class="btn-paper" id="research-book-close">合上讲义 →</button></div></section>`;document.querySelector('.paper-stack').append(spread);
  const style=document.createElement('style');style.textContent=`.case-spread [hidden],.research-spread [hidden],.spread-tab[hidden]{display:none!important}.research-book-body{display:flex;flex-direction:column;gap:12px}.research-book-body .section-title{font-size:clamp(21px,1.8vw,29px);margin-bottom:0}.research-book-body p{font-size:clamp(13px,1.02vw,16px);line-height:1.8;margin:0}.research-book-body svg.chart{width:100%;min-height:0;max-height:42%;flex:1}.research-book-body svg text{font:12px Consolas,"Microsoft YaHei";fill:#40515d}.research-book-body .gridline{stroke:#bdc5c7;stroke-width:.6;fill:none}.research-book-body .boundary{stroke:#a47435;stroke-dasharray:4 4;fill:none}.research-book-body .cursor{stroke:#b37530;stroke-dasharray:4 4}.research-book-body .inset-bg{fill:#e9e5da;stroke:#b8b5ad}.ablation-notebook svg text{font-size:14px}.research-ledger-facts{padding-top:9px;border-top:1px solid #c9bfaf}.research-ledger-facts p{font-size:12px;line-height:1.7;margin:3px 0}.research-book-key{padding:12px;border-left:3px solid #b57c34;background:#eee7d9;color:#24394a}.research-next{display:flex;flex-direction:column;justify-content:center;gap:20px}.research-await{color:#8d8b80;font-size:13px}.research-fit-record{font-size:13px}.research-fit-record svg{max-height:180px;width:100%}.research-fit-record summary{cursor:pointer;color:#7f5b2f}.research-fit-record .result-equation{font-size:14px}`;document.head.append(style);
  const tailPage=spread.querySelector('.page.right'),tailOriginal=tailPage.innerHTML;
  const tab5=document.createElement('button');tab5.className='spread-tab';tab5.dataset.spread='5';tab5.hidden=true;tab5.innerHTML='<span class="num">P11</span> 方位角筛选';document.querySelector('.spread-tabs').append(tab5);
  const spread5=document.createElement('div');spread5.className='spread research-spread';spread5.dataset.spread='5';spread5.innerHTML='<section class="page left"><div class="page-running-head"><span>对称破缺 · 发射方位</span><span class="folio">P11</span></div><div id="wheel-notebook" class="page-body research-book-body"></div><div class="page-footer"><button class="btn-paper" data-goto="4">← 角动量证据</button><span>72 方位对照</span></div></section><section class="page right"><div class="page-running-head"><span>最后的账目</span></div><div class="page-body research-next"><h2 class="section-title">零场下的收集份额</h2><p>保护环总长 20 mm，中央阳极长 15 mm。均匀发射模型在零磁场下给出 $A_2/A_1=1.307$，实测约为 0.81。</p><p>两端和中段的灯丝，会发出同样多的热电子吗？</p><p class="research-await">综合实验的记录将在这里接续。</p></div><div class="page-footer"><button class="btn-paper" id="fifth-book-close">合上讲义 →</button></div></section>';document.querySelector('.paper-stack').append(spread5);
  const sixth=installSixthNotebook({spread5,tab5});
  function renderFifth(bundle){
    if(!state?.chapter5Result?.completed)return;
    tab.innerHTML='<span class="num">P9–10</span> 微观证据';
    tailPage.querySelector('.page-running-head').innerHTML='<span>正则角动量与近地点</span><span class="folio">P10</span>';
    const body=tailPage.querySelector('.page-body');body.className='page-body research-book-body';
    body.innerHTML=`<h2 class="section-title">同一初态的两种命运</h2>${symmetryChart(bundle.traces['3415:0'],bundle.traces['3415:8'],{mode:'both',time:29.21}).replaceAll('#8ccbe4','#22627b').replaceAll('#f1b575','#b86b2c')}<p>蓝线为同轴磁场，橙线为 $8^\\circ$ 倾角。#3415 的径向折返由 27 次变为 4 次，飞行时间由 198.71 ns 变为 29.21 ns。</p><div class="research-book-key"><p>横向磁场使 $P_\\varphi$ 随时间改变。倾角轨迹的近地点逐次向外迁移，最后进入中央阳极。</p></div>`;
    tailPage.querySelector('.page-footer').innerHTML='<span>正则角动量的破缺</span><button class="btn-paper" data-research-goto="5">方位角筛选 →</button>';
    document.querySelector('#wheel-notebook').innerHTML=`<h2 class="section-title">横向磁场选出了哪些方位？</h2>${fateWheel(bundle.wheels['3415'],3415,0)}<p>保持同一颗电子的初能、径向和轴向速度，每次将初态绕管轴旋转 $5^\\circ$。</p><div class="research-book-key"><p>72 个方位：5 个回灯丝，27 个到中央阳极，2 个到保护环，38 个飞出端面。</p></div><p>横向磁场具有确定方向。不同发射方位所受角向力矩不同，最终只有一部分被阳极收集。有效倾角为高场长尾提供了直接的微观机制。</p>`;
    renderMath(tailPage);renderMath(spread5);
  }
  document.addEventListener('click',e=>{const b=e.target.closest('[data-research-goto]');if(b)document.querySelector(`.spread-tab[data-spread="${b.dataset.researchGoto}"]`).click();});
  function render([bundle,asset]) {
    if(!state?.chapter4Result?.completed)return;
    const combos=[['cold',0,'#72828d'],['full',0,'#2d8976'],['cold',1,'#9870ab'],['full',1,'#b67d31']];
    const series=combos.map(([launch,gradient,color])=>{const r=bundle.ablations[`10:${launch}:${gradient}`].rows;return {points:r.map(p=>[p.field_mT,100*p.A1_uA/r[0].A1_uA]),color};});
    const tr=bundle.traces['10:4.000000:6413'],counter=bundle.traces['10:4.000000:6413:local'];
    const radial=[{points:tr.points.map(p=>[p[4],p[3]]),color:'#22627b'},{points:counter.points.map(p=>[p[4],p[3]]),color:'#b86b2c',dash:true}];
    researchBody.classList.add('ablation-notebook');
    researchBody.innerHTML=`<h2 class="section-title">热初速与灯丝压降的共同作用</h2>${curveChart(series,{height:250,y:[0,105],ylabel:'I_{A1}/I_{A1}(0) / %',inset:{x:[3.85,4.15],y:[98.8,102],label:'截止前放大'}})}<p>灰：冷电子、平均电势；绿：仅热初速；紫：仅灯丝压降；赭：两项都开。四组总发射相同，只有两项共同作用时出现约 $1.25\\%$ 的隆起。</p>${curveChart(radial,{height:250,x:[0,47],y:[0,4.55],xlabel:'t / \\mathrm{ns}',ylabel:'#6413: r / \\mathrm{mm}'})}<p>蓝线：${tr.radial_bounces} 次折返，${tr.flight_ns.toFixed(2)} ns 后进入中央阳极。橙色虚线：保持同一初态，改为本地等势 $U_{\\mathrm{loc}}=${counter.U_loc.toFixed(3)}\\ \\mathrm{V}$，只折返 ${counter.radial_bounces} 次、${counter.flight_ns.toFixed(2)} ns 后撞回灯丝。</p>`;
    const measured=measuredCurves(asset,state.calibrationResult??state.calibrationHandoff)[10];
    const delta=measured.rows.filter(r=>r.field_mT<=4).map(r=>[r.field_mT,r.A1_uA-measured.zero.A1_uA,r.A2_uA-measured.zero.A2_uA,r.sum_uA-measured.zero.sum_uA]);
    const comparison=[['#22627b',1],['#b86b2c',2],['#526068',3]].map(([color,i])=>({color,points:delta.map(r=>[r[0],r[i]])}));
    const micro=document.querySelector('#micro-notebook');
    micro.closest('.page').querySelector('.page-running-head').innerHTML='<span>分段收集 · 双通道实测检验</span><span class="folio">P9</span>';
    micro.innerHTML=`<h2 class="section-title">中央阳极增收的电子来自哪里？</h2>${curveChart(comparison,{x:[0,4],y:[-.5,.5],ylabel:'\\Delta I / \\mu\\mathrm{A}'})}<p>蓝：中央阳极；橙：合并保护环；灰：两路之和。均减去自身零场读数。</p><div class="research-book-key"><p>$10\\ \\mathrm{V}$，$B=3.870\\ \\mathrm{mT}$：</p><p>$\\Delta A_1=+0.320\\ \\mu\\mathrm{A}$</p><p>$\\Delta A_2=-0.315\\ \\mu\\mathrm{A}$</p><p>$\\Delta(A_1+A_2)=+0.005\\ \\mu\\mathrm{A}$</p></div><p>保护环同步下跌，两路之和几乎不变。测量结果与固定发射下的落点重分配吻合：热初速提供跨区速度，灯丝电势梯度使迁移后可获得的加速压差增大。</p>`;
    footer.firstElementChild.textContent='消融与本地等势对照';footer.querySelector('button').textContent='双通道实测 →';
    micro.closest('.page').querySelector('.page-footer').innerHTML='<button class="btn-paper" data-goto="3">← 消融与反事实</button><span>收集增加与发射增强的区分</span>';
    renderMath(researchBody);renderMath(spread);
  }
  return {
    maxSpread:()=>state?.chapter6Result?.completed?6:state?.chapter5Result?.completed?5:state?.chapter4Result?.completed?4:state?.chapter3Result?.anomaliesConfirmed?3:2,
    connect(onClose){document.addEventListener('click',e=>{if(e.target.closest('#research-book-close,#fifth-book-close,#sixth-book-close'))onClose();});},
    restore(next){
      state=next;sixth.restore(next);const unlocked=!!state.chapter4Result?.completed,fifth=!!state.chapter5Result?.completed;tab.hidden=!(unlocked||fifth||sixth.unlocked);tab5.hidden=!(fifth||sixth.unlocked);oldBody.hidden=unlocked;oldFooter.hidden=unlocked;researchBody.hidden=!unlocked;footer.hidden=!unlocked;
      if(!fifth){tailPage.innerHTML=tailOriginal;tab.innerHTML='<span class="num">P9</span> 微观证据';renderMath(tailPage);}
      if(unlocked){document.querySelector('.spread-tab[data-spread="3"]').hidden=false;const bookmark=document.querySelector('#case-bookmark');bookmark.disabled=false;bookmark.classList.add('unlocked');bookmark.innerHTML='<span>第 7 页起：破案手账 →</span>';}
      let fit=document.querySelector('.research-fit-record');
      if(unlocked&&state.chapter3Result?.fit){if(!fit){fit=document.createElement('details');fit.className='research-fit-record';document.querySelector('.case-spread .page.left .page-body').append(fit);}fit.innerHTML='<summary>比荷测量记录</summary>'+document.querySelector('#case-fit-chart').innerHTML+document.querySelector('#case-fit-result').innerHTML;fit.hidden=false;}else if(fit)fit.hidden=true;
      if(unlocked){bundlePromise??=Promise.all(['../assets/precomputed/ch4_baseline.json','../assets/measurements.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw new Error('实验手账数据未能载入');return r.json();})));bundlePromise.then(render).catch(()=>{researchBody.innerHTML='<p>实验记录暂时未能载入，请合上后重新打开讲义。</p>';});}
      if(fifth){fifthPromise??=fetch('../assets/precomputed/ch5_bundle.json').then(r=>{if(!r.ok)throw new Error('第五章记录未能载入');return r.json();});fifthPromise.then(renderFifth).catch(()=>{document.querySelector('#wheel-notebook').textContent='实验记录暂时未能载入，请重新打开讲义。';});}
      const left=document.querySelector('.case-spread .page.left .page-body');let empty=left.querySelector('.research-no-measurement');if(!empty){empty=document.createElement('p');empty.className='research-no-measurement';empty.textContent='尚未完成第三章的数据处理。完成扫场与拟合后，测量结果会写入这一页。';left.append(empty);}empty.hidden=!!state.chapter3Result?.fit;
      const micro=document.querySelector('#micro-notebook');if(!unlocked)micro.innerHTML='<h2 class="section-title">跨区延迟收集</h2><p>完成第四章的轨迹核验后，这里会记录 #6413 与本地等势对照。</p>';
      let ledger=left.querySelector('.research-ledger-facts');
      if(!ledger){ledger=document.createElement('div');ledger.className='research-ledger-facts';left.append(ledger);}
      ledger.hidden=!sixth.unlocked;
      if(sixth.unlocked){const fit=state.chapter3Result?.fit;ledger.innerHTML=`<p><b>后续核验记录</b></p><p>高场余流：中央阳极 8.97%，保护环 16.26%。</p><p>四档拟合：$U_0=${(fit?.u0??2.177087).toFixed(2)}\\ \\mathrm{V}$，比荷偏差 ${(fit?.relPct??-9.65738).toFixed(2)}%。</p><p>零场分配、截止前隆起与高场长尾的模型检验见 P8–P14。</p>`;renderMath(ledger);}
    },
  };
}
