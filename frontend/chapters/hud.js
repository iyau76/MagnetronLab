// Shared chapter-4–6 HUD: progress ticks, task hint, layout mode and the clue board.
const $=s=>document.querySelector(s);
const CRUMBS={4:['01 装置','02 标定','03 磁截止'],5:['01 装置','02 标定','03 磁截止','04 消融'],6:['01 装置','02 标定','03 磁截止','04 消融','05 对称']};
export function setChapterHeading(chapter,title){
  const line=$('.crumb-line');if(!line)return;
  line.innerHTML=(CRUMBS[chapter]??[]).map(s=>`<span>${s}</span><i>›</i>`).join('')+`<strong id="chapter-title"></strong>`;
  $('#chapter-title').textContent=title;
}
export function setProgress(order,step,names={}){
  const el=$('#story-progress');if(!el)return;const index=order.indexOf(step);
  el.innerHTML=order.map((s,i)=>`<i class="${i<index?'done':i===index?'current':''}" title="${names[s]??''}"></i>`).join('');
}
export function setHint(text=''){const el=$('#task-hint');if(!el)return;el.textContent=text;el.classList.toggle('empty',!text);}
export function setLayout(name){
  if(document.body.dataset.layout!==name){
    document.body.classList.remove('plot-expanded');
    const expand=$('#chart-expand');if(expand){expand.textContent='放大图表';expand.setAttribute('aria-pressed','false');}
  }
  document.body.dataset.layout=name;
}
export function setWait(text=''){const el=$('#dialog-wait');if(el)el.textContent=text;}
export function setDrawer(open){document.body.classList.toggle('has-right',open);$('#dock-analysis')?.classList.toggle('active',open);}

// Status words are fixed to the four used across the casebook.
const STATUS={open:['待查','open'],partial:['部分解释','partial'],solved:['已解释','solved'],field:['待实物检验','field']};
const CLUES=[
  ['截止前隆起',(c,s)=>c===4?(s<4?'open':s<12?'partial':'solved'):'solved','10 V 截止前 A₁ 抬高 +2.03%'],
  ['高场长尾',(c,s)=>c<5||(c===5&&s<4)?'open':'partial','5.73 mT 实测仍余 A₁ 8.97% · A₂ 16.26%'],
  ['零场分配比',(c,s)=>c<6||(c===6&&s<2)?'open':'solved','实测 A₂/A₁ ≈ 0.816，均匀发射模型 1.307'],
  ['比荷偏低',(c,s)=>c<6||(c===6&&s<4)?'open':'partial','斜率比荷 −9.66%，截距 2.18 V 已由压降解释'],
  ['端口边缘场',(c,s)=>c===6&&s>=4?'field':null,'有限开口场使 A₂ 反超，需实物端盖数据'],
];
export function renderClues(chapter,stepIndex){
  const el=$('#clues');if(!el)return;
  el.innerHTML='<h2>线索看板</h2>'+CLUES.map(([name,rule,detail])=>{const k=rule(chapter,stepIndex);if(!k)return'';const [word,cls]=STATUS[k];return `<div class="clue ${cls}"><b>${name}</b><span class="chip">${word}</span><small>${detail}</small></div>`;}).join('');
}
export function bindShell(){
  const expand=document.createElement('button');expand.id='chart-expand';expand.textContent='放大图表';
  expand.setAttribute('aria-pressed','false');$('#analysis-close')?.before(expand);
  expand.addEventListener('click',()=>{const on=document.body.classList.toggle('plot-expanded');expand.textContent=on?'还原':'放大图表';expand.setAttribute('aria-pressed',String(on));});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('plot-expanded')){document.body.classList.remove('plot-expanded');expand.textContent='放大图表';expand.setAttribute('aria-pressed','false');}});
  const dock=$('#dock-clues'),drawer=$('#dock-analysis');
  dock?.addEventListener('click',()=>{const c=$('#clues');c.hidden=!c.hidden;dock.classList.toggle('active',!c.hidden);});
  drawer?.addEventListener('click',()=>setDrawer(!document.body.classList.contains('has-right')));
  $('#analysis-close')?.addEventListener('click',()=>setDrawer(false));
}

// Explicit story navigation reveals the instruction after mobile layout settles.
export function revealInstruction(){
  if(!matchMedia('(max-width: 900px)').matches)return;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const instruction=document.querySelector('#conversation');
    if(instruction&&!instruction.hidden)instruction.scrollIntoView({block:'start',behavior:'instant'});
  }));
}
