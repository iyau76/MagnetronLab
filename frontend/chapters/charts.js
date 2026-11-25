import {smoothPath} from './curve-path.js';
import {svgLabel} from '../chapter3/svg-tex.js';
import {PLOT,coldField,cutoffPosition,radialMaxima} from './model-math.js';
export const COLORS={A1:'#87cef0',A2:'#eead76',sum:'#d3dce2',cold:'#8b9da9',thermal:'#76c7b4',gradient:'#c6b3ed',full:'#f2c073'};
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let serial=0;
const num=x=>Math.abs(x)<1e-9?'0':Number(x.toFixed(3)).toString();
// Round-number ticks (1, 2, 2.5, 5 × 10^k) inside the domain; endpoints stay as plotted limits.
export function niceTicks(lo,hi,target=5){
  const span=hi-lo;if(!(span>0))return [lo];
  const mag=10**Math.floor(Math.log10(span/target)),step=[1,2,2.5,5,10,20].map(f=>f*mag).find(s=>span/s<=target+1.5);
  const out=[];for(let v=Math.ceil((lo-1e-9)/step)*step;v<=hi+1e-9;v+=step)out.push(Math.abs(v)<step*1e-6?0:Number(v.toPrecision(10)));
  return out;
}
export const path=(points,x,y)=>points.filter(p=>Number.isFinite(p[0])&&Number.isFinite(p[1])).map((p,i)=>(i?'L':'M')+x(p[0]).toFixed(2)+','+y(p[1]).toFixed(2)).join(' ');
export const scales=([x0,x1],[y0,y1],box)=>({x:v=>box.left+(v-x0)/(x1-x0)*(box.right-box.left),y:v=>box.bottom-(v-y0)/(y1-y0)*(box.bottom-box.top)});
export function grid(xdomain,ydomain,box,{xlabel='B / \\mathrm{mT}',ylabel='I / \\mu\\mathrm{A}',xticks=null,yticks=null,xTickLabels=true,xTarget=5,yTarget=4}={}) {
  const {x,y}=scales(xdomain,ydomain,box);let s=`<rect class="plot-frame" fill="none" x="${box.left}" y="${box.top}" width="${box.right-box.left}" height="${box.bottom-box.top}"/>`;
  for(const xv of xticks??niceTicks(...xdomain,xTarget)){s+=`<path class="gridline" d="M${x(xv)},${box.top}V${box.bottom}"/>`;if(xTickLabels)s+=svgLabel(x(xv),box.bottom+17,num(xv),'text-anchor="middle" class="tick"');}
  for(const yv of yticks??niceTicks(...ydomain,yTarget))s+=`<path class="gridline" d="M${box.left},${y(yv)}H${box.right}"/>`+svgLabel(box.left-7,y(yv)+4,num(yv),'text-anchor="end" class="tick"');
  if(ylabel)s+=svgLabel(box.left,box.top-9,ylabel,'class="axis-label"');
  if(xlabel&&xTickLabels)s+=svgLabel(box.right,box.bottom+34,xlabel,'text-anchor="end" class="axis-label"');
  return s;
}
export function lines(series,domains,box,id) {
  const {x,y}=scales(...domains,box);
  return `<defs><clipPath id="${id}"><rect x="${box.left}" y="${box.top-1}" width="${box.right-box.left}" height="${box.bottom-box.top+2}"/></clipPath></defs><g clip-path="url(#${id})">`+series.map(s=>`<path d="${(s.smooth?smoothPath:path)(s.points,x,y)}" fill="none" stroke="${s.color}" stroke-width="${s.width??2}" ${s.dash?`stroke-dasharray="${typeof s.dash==='string'?s.dash:'6 4'}"`:''} opacity="${s.opacity??1}" stroke-linejoin="round"/>`).join('')+'</g>';
}
// marks: [{x,y,label,color,anchor}] annotate key readings; the inset sits in the empty lower-left of falling curves.
export function curveChart(series,{x=[0,5.8],y=[0,50],xlabel,ylabel,window=null,inset=null,cursor=null,height=310,width=540,marks=[],yticks=null,xticks=null,box:customBox=null,aria='电流与磁场曲线',cls=''}={}) {
  const id='plot-'+serial++,box=customBox??{left:PLOT.left,right:width-26,top:PLOT.top,bottom:height-48};let body=grid(x,y,box,{xlabel,ylabel,yticks,xticks});
  const sc=scales(x,y,box);
  if(window)body+=`<rect x="${sc.x(window[0])}" y="${box.top}" width="${sc.x(window[1])-sc.x(window[0])}" height="${box.bottom-box.top}" fill="#dfb36a" opacity=".08"/>`;
  body+=lines(series,[x,y],box,id);
  if(cursor!==null)body+=`<path class="cursor" d="M${sc.x(cursor)},${box.top}V${box.bottom}"/>`;
  body+=markLayer(marks,sc);
  if(inset){
    const w=box.right-box.left,h=box.bottom-box.top,b={left:box.left+46,right:box.left+w*.5,top:box.top+h*.44,bottom:box.bottom-26},isc=scales(inset.x,inset.y,b);
    body+=`<rect class="inset-bg" x="${b.left-40}" y="${b.top-22}" width="${b.right-b.left+52}" height="${b.bottom-b.top+44}" rx="5"/>`;
    for(const v of niceTicks(...inset.y,3))body+=`<path class="gridline" d="M${b.left},${isc.y(v)}H${b.right}"/>`+svgLabel(b.left-5,isc.y(v)+3.5,num(v),'text-anchor="end" class="tick small"');
    body+=lines(series,[inset.x,inset.y],b,id+'inset')+markLayer(inset.marks??[],isc);
    body+=svgLabel(b.left-34,b.top-8,inset.label??'局部放大','class="inset-title"')+svgLabel(b.left,b.bottom+14,num(inset.x[0]),'class="tick small"')+svgLabel(b.right,b.bottom+14,num(inset.x[1]),'text-anchor="end" class="tick small"');
    if(window)body+=`<path class="inset-link" stroke="#dfb36a" fill="none" d="M${sc.x(inset.x[0])},${box.top}V${box.top+4}M${sc.x(inset.x[1])},${box.top}V${box.top+4}"/>`;
  }
  return `<svg class="chart ${cls}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${aria}">${body}</svg>`;
}
function markLayer(marks,sc){
  return marks.map(m=>{const cx=sc.x(m.x),cy=sc.y(m.y),a=m.anchor??'start',dx=a==='end'?-10:a==='middle'?0:10;
    return `<circle cx="${cx}" cy="${cy}" r="${m.r??5}" fill="none" stroke="${m.color??'#ffd59a'}" stroke-width="1.6"/>`+(m.label?svgLabel(cx+dx,cy+(m.dy??-9),m.label,`text-anchor="${a}" class="mark-label" fill="${m.color??'#ffd59a'}"`):'');}).join('');
}
export function mapChart(data,V,B,selected=null) {
  const left=52,right=514,box={left,right,top:48,bottom:240};const {x,y}=scales([-17.5,17.5],[-17.5,17.5],box);const zc=cutoffPosition(B,V);let body='';
  const ticks=[-17.5,-7.5,0,7.5,17.5];
  for(const [a,b,c,name] of [[-17.5,-7.5,'#577486','H 保护环'],[-7.5,7.5,'#ba9558','中央阳极 A_1'],[7.5,17.5,'#8d9ca5','K 保护环']]){body+=`<rect x="${x(a)}" y="${box.top}" width="${x(b)-x(a)}" height="${box.bottom-box.top}" fill="${c}" opacity=".09"/>`+svgLabel((x(a)+x(b))/2,box.top-8,name,'text-anchor="middle" class="band-label"');}
  body+=grid([-17.5,17.5],[-17.5,17.5],box,{xlabel:'',ylabel:'',xticks:ticks,yticks:ticks});
  body+=svgLabel(left-4,box.top-28,'落点 z_{\\mathrm{hit}} / \\mathrm{mm}','class="axis-label"')+svgLabel((left+right)/2,box.bottom+34,'起飞位置 z_0 / \\mathrm{mm}','text-anchor="middle" class="axis-label"');
  body+=`<path class="gridline" stroke-dasharray="4 4" d="M${x(-17.5)},${y(-17.5)}L${x(17.5)},${y(17.5)}"/>`;
  for(const v of [-7.5,7.5])body+=`<path class="boundary" d="M${x(v)},${box.top}V${box.bottom}M${left},${y(v)}H${right}"/>`;
  if(zc<17.5)body+=`<rect x="${x(zc)}" y="${box.top}" width="${x(17.5)-x(zc)}" height="${box.bottom-box.top}" fill="url(#cut-hatch)" opacity=".55"/>`;
  for(const [i,p] of data.particles.entries()){
    const [id,z0,zhit,outcome]=p,cross=outcome===1&&z0>7.5;
    // Particles are launched in mirrored ±z0 pairs; thin by a hash of the id, never by array position.
    if(!cross&&((id*2654435761)>>>0)%6!==0&&id!==selected)continue;
    const cy=outcome===1||outcome===2?y(zhit):box.bottom+5;
    body+=`<circle data-particle="${id}" cx="${x(z0)}" cy="${cy}" r="${id===selected?5:cross?2.8:1.3}" fill="${cross?COLORS.A1:outcome===1?COLORS.full:'#8d9da9'}" opacity="${cross?1:.4}" ${id===selected?'stroke="#fff" stroke-width="1.5"':''} ${cross?'tabindex="0" role="button"':''}><title>#${id}：${z0.toFixed(2)} → ${zhit===null?'未收集':zhit.toFixed(2)} mm</title></circle>`;
  }
  const barY=304;
  for(let i=0;i<140;i++){const z=-17.5+35*i/140,ratio=Math.max(0,Math.min(1,(coldField(z,V)-coldField(17.5,V))/(coldField(-17.5,V)-coldField(17.5,V))));body+=`<rect x="${left+(right-left)*i/140}" y="${barY}" width="${(right-left)/140+.2}" height="14" fill="hsl(${34+ratio*170},48%,${42+ratio*10}%)"/>`;}
  body+=`<rect data-plot-domain x="${left}" y="${box.top}" width="${right-left}" height="${box.bottom-box.top}" fill="none"/><rect data-bc-domain x="${left}" y="${barY}" width="${right-left}" height="14" fill="none"/><path class="cutoff-line" d="M${x(zc)},${box.top}V${barY+14}"/>`;
  body+=svgLabel(left,barY-7,'本地冷截止场 B_c(z)','class="axis-label"')+svgLabel(Math.min(right,x(zc)+4),barY-7,`z_c = ${zc.toFixed(2)} \\mathrm{mm}`,`text-anchor="${x(zc)>right-90?'end':'start'}" class="mark-label" fill="#f0bf6c"`)+svgLabel(left,barY+29,`H 端 ${coldField(-17.5,V).toFixed(2)} mT`,'class="tick"')+svgLabel(right,barY+29,`K 端 ${coldField(17.5,V).toFixed(2)} mT`,'text-anchor="end" class="tick"');
  const defs='<defs><pattern id="cut-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0V7" stroke="#d9a85d" stroke-width="1.2" opacity=".5"/></pattern></defs>';
  return `<svg class="chart mapping" viewBox="0 0 540 344" role="img" aria-label="电子起飞与到达位置及本地截止磁场">${defs}${body}</svg>`;
}
// Three aligned panels share one time axis: whole radius, the 4.40–4.56 mm crest band, and axial drift.
export function traceChart(trace,counter=null,time=0) {
  const tmax=Math.max(trace.flight_ns,counter?.flight_ns??0),id='trace-'+serial++,L=56,R=514;
  const upper={left:L,right:R,top:24,bottom:138},crest={left:L,right:R,top:170,bottom:250},lower={left:L,right:R,top:284,bottom:394};
  const ser=column=>[{points:trace.points.map(p=>[p[4],p[column]]),color:COLORS.A1},...(counter?[{points:counter.points.map(p=>[p[4],p[column]]),color:'#ff9a5a',dash:'7 4',width:2.6}]:[])];
  const xticks=niceTicks(0,tmax,5);
  let out=grid([0,tmax],[0,4.8],upper,{xlabel:'',ylabel:'半径 r / \\mathrm{mm}',xticks,yticks:[0,1,2,3,4],xTickLabels:false})+lines(ser(3),[[0,tmax],[0,4.8]],upper,id+'r');
  const us=scales([0,tmax],[0,4.8],upper);out+=`<path class="anode-line" stroke="#e39188" stroke-dasharray="4 4" fill="none" d="M${L},${us.y(4.55)}H${R}"/>`+svgLabel(R-2,us.y(4.55)-5,'阳极内壁 r_a = 4.55 mm','text-anchor="end" class="mark-label" fill="#e39188"');
  out+=`<rect x="${L}" y="${us.y(4.56)}" width="${R-L}" height="${us.y(4.40)-us.y(4.56)}" fill="#f2c073" opacity=".08"/>`;
  const cs=scales([0,tmax],[4.40,4.57],crest);
  out+=grid([0,tmax],[4.40,4.57],crest,{xlabel:'',ylabel:'峰顶放大 r / \\mathrm{mm}',xticks,yticks:[4.45,4.5,4.55],xTickLabels:false})+lines(ser(3),[[0,tmax],[4.40,4.57]],crest,id+'zoom');
  out+=`<path class="anode-line" stroke="#e39188" stroke-dasharray="4 4" fill="none" d="M${L},${cs.y(4.55)}H${R}"/>`;
  let lastX=-99;for(const i of radialMaxima(trace)){const p=trace.points[i],px=cs.x(p[4]),py=cs.y(Math.min(4.57,p[3]));out+=`<circle cx="${px}" cy="${py}" r="3.2" fill="${COLORS.full}"/>`;if(px-lastX>58){const end=px>R-50;out+=svgLabel(px+(end?-6:6),py+4,p[3].toFixed(3),`text-anchor="${end?'end':'start'}" class="tick small" fill="#f2c073"`);lastX=px;}}
  if(counter){for(const i of radialMaxima(counter)){const p=counter.points[i];if(p[3]>4.40&&p[3]<4.55)out+=`<circle cx="${cs.x(p[4])}" cy="${cs.y(p[3])}" r="4" fill="none" stroke="#ff9a5a" stroke-width="1.8"/>`+svgLabel(cs.x(p[4])+7,cs.y(p[3])+14,`对照 ${p[3].toFixed(3)}`,'class="tick small" fill="#ff9a5a"');}
    const e=counter.points.at(-1),ex=us.x(e[4]),ey=us.y(e[3]);out+=`<path d="M${ex-5},${ey-5}L${ex+5},${ey+5}M${ex-5},${ey+5}L${ex+5},${ey-5}" stroke="#ff9a5a" stroke-width="2.2"/>`+svgLabel(ex>R-180?ex-8:ex+8,Math.max(upper.top+32,Math.min(upper.bottom-9,ey+18)),`对照 ${e[4].toFixed(2)} ns · ${['回灯丝','中央阳极','保护环','飞出端面','仍在飞行'][counter.outcome]??'结束'}`,`text-anchor="${ex>R-180?'end':'start'}" class="mark-label" fill="#ff9a5a"`);}
  const z0=trace.points[0][2],zend=trace.points.at(-1)[2],zs=[z0,zend,...(counter?[counter.points.at(-1)[2]]:[])],lo=Math.floor(Math.min(...zs,0)-1),hi=Math.ceil(Math.max(...zs,7.5)+1);
  out+=grid([0,tmax],[lo,hi],lower,{xlabel:'t / \\mathrm{ns}',ylabel:'轴向位置 z / \\mathrm{mm}',xticks,yTarget:4})+lines(ser(2),[[0,tmax],[lo,hi]],lower,id+'z');
  const zaxis=scales([0,tmax],[lo,hi],lower);out+=`<path class="boundary" d="M${L},${zaxis.y(7.5)}H${R}"/>`+svgLabel(R-2,zaxis.y(7.5)-5,'K 环 | 中央阳极 · z = 7.5 mm','text-anchor="end" class="mark-label" fill="#dfbe7b"');
  const cx=L+(R-L)*Math.min(time,tmax)/tmax;out+=`<path class="cursor" d="M${cx},${upper.top}V${lower.bottom}"/>`;
  return `<svg class="chart traces" viewBox="0 0 540 432" role="img" aria-label="电子半径、峰顶放大与轴向位置随时间变化">${out}</svg>`;
}
