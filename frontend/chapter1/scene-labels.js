import * as THREE from 'three';

const SPECS=[
 ['guardLeft','保护环 A₂ · 管座端','10 mm · 接 Uₐ⁺'],
 ['anode','中央阳极 A₁','15 mm · 1 kΩ 取样电阻'],
 ['guardRight','保护环 A₂ · 封顶端','10 mm · 接 Uₐ⁺'],
 ['filament','钨丝阴极 K–H','Ø 75 μm · 热电子发射'],
 ['glass','玻璃真空壳','保持真空，容纳同轴电极'],
 ['support','定心片与陶瓷杆','固定电极，保持同轴与绝缘'],
 ['tension','灯丝张紧弹簧','补偿热伸长，保持灯丝张紧'],
 ['base','管座与引出脚','固定管体，连接外部电路']
];
const PRIMARY=new Set(['guardLeft','anode','guardRight','filament']);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

export function createSceneLabels(container,{onHover,onPick}){
 const layer=document.createElement('div');layer.className='assembly-labels';layer.hidden=true;container.append(layer);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('assembly-leaders');layer.append(svg);
 const endpoints=[['K',-17.5],['H',17.5]].map(([name,x])=>{const el=document.createElementNS(svg.namespaceURI,'text');el.textContent=name;el.setAttribute('fill','#ffe1a1');el.setAttribute('font-size','13');el.setAttribute('text-anchor','middle');svg.append(el);return {el,x};});
 let hovered='',selected='';
 const cards=SPECS.map(([id,title,sub])=>{
  const el=document.createElement('button');el.className='assembly-card';el.dataset.structurePart=id;el.innerHTML=`<b>${title}</b><span>${sub}</span>`;layer.append(el);
  const line=document.createElementNS(svg.namespaceURI,'polyline'),dot=document.createElementNS(svg.namespaceURI,'circle');dot.setAttribute('r','2.8');svg.append(line,dot);
  el.onpointerenter=()=>onHover(id);el.onpointerleave=()=>onHover(null);el.onfocus=()=>onHover(id);el.onblur=()=>onHover(null);el.onclick=()=>onPick({part:id});
  return {id,el,line,dot};
 });
 const scale=document.createElement('div');scale.className='assembly-scale';scale.innerHTML='<i></i><span>10 mm · 管轴参考平面</span>';layer.append(scale);
 const legend=document.createElement('div');legend.className='assembly-legend';layer.append(legend);
 return {
  attachViewport(next){container=next;container.append(layer);},
  setVisible(v){layer.hidden=!v;},
  select(id){selected=id||'';},
  hover(id){hovered=id||'';layer.dataset.hover=hovered;for(const c of cards){c.el.classList.toggle('is-hover',c.id===id);c.line.style.opacity=id?(c.id===id?'.95':'.22'):'.68';c.dot.style.opacity=id?(c.id===id?'1':'.35'):'1';}},
  update(camera,group,anchors,power){
   const w=container.clientWidth,h=container.clientHeight;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);
   for(const {el,x} of endpoints){const p=group.localToWorld(new THREE.Vector3(x,0,0)).project(camera);el.setAttribute('x',(p.x+1)*w/2);el.setAttribute('y',(1-p.y)*h/2+20);el.style.cssText='paint-order:stroke;stroke:#07121d;stroke-width:3px;font-weight:bold';el.style.display=p.z>-1&&p.z<1?'':'none';}
   const cw=clamp(w*.21,162,194),gap=12,bottom=h-130;
   const projected=new Map();
   for(const [id,a] of anchors){const p=group.localToWorld(a.clone()).project(camera);projected.set(id,{x:(p.x+1)*w/2,y:(1-p.y)*h/2,z:p.z});}
   const core=cards.slice(0,3).filter(c=>projected.has(c.id)).sort((a,b)=>projected.get(a.id).x-projected.get(b.id).x);
   const center=core.reduce((sum,c)=>sum+projected.get(c.id).x,0)/Math.max(1,core.length);
   const span=core.length*cw+(core.length-1)*gap,left=clamp(center-span/2,12,w-span-12);
   const top=clamp(Math.min(...core.map(c=>projected.get(c.id).y))-126,22,bottom-150);
   const positions=new Map(core.map((c,i)=>[c.id,[left+i*(cw+gap),top]]));
   const filament=projected.get('filament');
   if(filament)positions.set('filament',[clamp(filament.x-cw/2,12,w-cw-12),clamp(filament.y+85,top+85,bottom-55)]);
   // Mechanical annotations appear with the corresponding selection or hover.
   const detail=hovered&&!PRIMARY.has(hovered)?hovered:selected&&!PRIMARY.has(selected)?selected:null;
   if(detail){const p=projected.get(detail);if(p){const beside=p.x<w/2?p.x-cw-32:p.x+32;positions.set(detail,[clamp(beside,12,w-cw-12),clamp(p.y+70,top+85,bottom-55)]);}}
   const occupied=[];
   for(const c of cards){
    const p=projected.get(c.id),pos=positions.get(c.id),visible=p&&pos&&p.z>-1&&p.z<1&&p.x>-20&&p.x<w+20&&p.y>-20&&p.y<h-65;
    c.el.hidden=!visible;c.line.style.display=c.dot.style.display=visible?'':'none';if(!visible)continue;
    c.el.style.width=cw+'px';let [x,y]=pos;const eh=c.el.offsetHeight;
    if(!PRIMARY.has(c.id))for(const b of occupied){if(x<b.x+cw+8&&x+cw+8>b.x&&y<b.y+b.height+8&&y+eh+8>b.y)y=clamp(b.y+b.height+12,22,bottom-eh);}
    occupied.push({x,y,height:eh});c.el.style.transform=`translate(${x}px,${y}px)`;
    const tx=clamp(p.x,x+12,x+cw-12),ty=p.y<y?y:y+eh,bend=ty+(p.y<y?-20:20);
    c.line.setAttribute('points',`${tx},${ty} ${tx},${bend} ${p.x},${p.y}`);c.dot.setAttribute('cx',p.x);c.dot.setAttribute('cy',p.y);
   }
   const a=group.localToWorld(new THREE.Vector3(-5,0,0)).project(camera),b=group.localToWorld(new THREE.Vector3(5,0,0)).project(camera);
   const length=Math.hypot((a.x-b.x)*w/2,(a.y-b.y)*h/2);scale.querySelector('i').style.width=Math.max(0,length)+'px';scale.hidden=length<12||length>w*.55;
   legend.innerHTML=(power.accelerator?'<span class="electric-key">→ E · 径向电场</span>':'')+(power.magnet&&(power.fieldMT??power.current)>0?'<span class="magnetic-key">→ B · 轴向磁场</span>':'')+(power.heater&&power.accelerator?'<span class="electron-key">● 电子轨迹 · 示意</span>':'');
  },dispose(){layer.remove();}
 };
}
