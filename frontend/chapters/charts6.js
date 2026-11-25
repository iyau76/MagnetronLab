import {curveChart,grid,lines,scales,path,esc,COLORS} from './charts.js';
import {svgLabel} from '../chapter3/svg-tex.js';
import {VOLTS,ratioErrors} from './math6.js';
export const CHANNELS=[['A1_uA','中央 $A_1$','#87cef0'],['A2_uA','合并 $A_2$','#eead76'],['A2_H_uA','$H$ 侧','#9cd5ad'],['A2_K_uA','$K$ 侧','#ccb7ed'],['sum_uA','总收集','#d3dce2']];
export function ratioChart(bundle,eta){const {ratios,observed}=ratioErrors(bundle,eta),uniform=ratioErrors(bundle,0).ratios,box={left:44,right:506,top:28,bottom:206},y=v=>box.bottom-v/1.45*(box.bottom-box.top);let s='';
  for(const v of [0,.4,.8,1.2])s+=`<path class="gridline" d="M44,${y(v)}H506"/>`+svgLabel(35,y(v)+4,v,'text-anchor="end" class="tick"');
  VOLTS.forEach((V,i)=>{const x=88+i*117;
    if(eta>0)s+=`<rect x="${x+4}" y="${y(uniform[i])}" width="24" height="${206-y(uniform[i])}" fill="none" stroke="#edbe76" stroke-dasharray="3 3" opacity=".55"/>`;
    s+=`<rect x="${x-26}" y="${y(observed[i])}" width="24" height="${206-y(observed[i])}" fill="#8eabc0" opacity=".8"/><rect x="${x+4}" y="${y(ratios[i])}" width="24" height="${206-y(ratios[i])}" fill="#edbe76"/>`+svgLabel(x-14,y(observed[i])+13,observed[i].toFixed(3).slice(1),'text-anchor="middle" class="tick small inbar" fill="#0b1824"')+svgLabel(x+16,y(ratios[i])-7,ratios[i].toFixed(3),'text-anchor="middle" class="mark-label" fill="#f4cf8f"')+svgLabel(x,231,`${V} V`,'text-anchor="middle" class="tick"');});
  return `<svg class="chart ratio-chart" viewBox="0 0 540 246" role="img" aria-label="四档零场保护环与中央阳极电流比">${svgLabel(44,16,'I_{A2}(0)/I_{A1}(0)','class="axis-label"')}${eta>0?svgLabel(506,16,'虚框：均匀发射 η = 0','text-anchor="end" class="tick small" fill="#edbe76"'):''}${s}</svg>`;
}
export function weightChart(eta){const b={left:42,right:502,top:28,bottom:110},sc=scales([-17.5,17.5],[0,1],b),points=Array.from({length:101},(_,i)=>{const z=-17.5+35*i/100;return [z,1-eta*(2*z/35)**2];});
  return `<svg class="chart weight-chart" viewBox="0 0 540 153" role="img" aria-label="灯丝沿轴向的发射权重">${grid([-17.5,17.5],[0,1],b,{xlabel:'z / \\mathrm{mm}',ylabel:'w(z)'})}<path d="${path(points,sc.x,sc.y)}" fill="none" stroke="#edbe76" stroke-width="3"/>${svgLabel(499,17,`\\eta = ${eta.toFixed(2)}`,'text-anchor="end"')}</svg>`;
}
export function multiCurve(rows,measured,{bc=1,xnorm=false,ynorm=true,channels=['A1_uA','A2_uA'],highlight=null,compare=null,xMax=null,width=420,height=235,selectedB=null,pick=false}={}){
  const xof=r=>r.field_mT/(xnorm?bc:1),series=[];
  for(const [key,label,color] of CHANNELS){if(!channels.includes(key))continue;
    const norm=ynorm?100/(rows[0]?.[key]||1):1;
    if(measured?.zero[key])series.push({points:measured.rows.map(r=>[xof(r),r[key]*(ynorm?100/measured.zero[key]:1)]),color,opacity:.62,width:1.7});
    if(compare?.length)series.push({points:compare.map(r=>[xof(r),r[key]*(ynorm?100/(compare[0][key]||1):1)]),color,dash:'2 4',opacity:.4});
    if(rows.length)series.push({points:rows.map(r=>[xof(r),r[key]*norm]),color,width:2.3,dash:'7 4'});
  }
  const xmax=xMax??Math.max(5.8,...rows.map(r=>r.field_mT))/(xnorm?bc:1),ymax=ynorm?Math.ceil(Math.max(110,...series.flatMap(s=>s.points.map(p=>p[1])))/20)*20:Math.max(1,...series.flatMap(s=>s.points.map(p=>p[1])))*1.12;
  const box={left:46,right:width-22,top:24,bottom:height-45},x=[0,xmax],y=[0,ymax],id='q'+(++multiCurve.serial),sc=scales(x,y,box);
  let body=grid(x,y,box,{xlabel:xnorm?'B/B_c':'B / \\mathrm{mT}',ylabel:ynorm?'I/I(0) / %':'I / \\mu\\mathrm{A}'})+lines(series.map(s=>({...s,smooth:true})),[x,y],box,id);
  if(highlight&&measured){const over=measured.rows.filter(r=>r.field_mT>0&&r.A2_uA>measured.zero.A2_uA*1.005),point=over.length?over.reduce((a,b)=>a.A2_uA>b.A2_uA?a:b):null;if(point){body+=`<circle cx="${sc.x(xof(point))}" cy="${sc.y(point.A2_uA*(ynorm?100/measured.zero.A2_uA:1))}" r="7" fill="none" stroke="#ffd298" stroke-width="2"/>`;}}
  if(selectedB!==null&&rows.length){const xb=sc.x(selectedB);body+=`<path class="cutoff-line" d="M${xb},${box.top}V${box.bottom}"/>`;
    for(const [key,,color] of CHANNELS){if(!channels.includes(key))continue;const v=interp(rows,selectedB,key)*(ynorm?100/(rows[0]?.[key]||1):1);if(Number.isFinite(v))body+=`<circle cx="${xb}" cy="${sc.y(Math.min(ymax,v))}" r="4.5" fill="${color}" stroke="#08131d" stroke-width="1.5"/>`;}
    const nearRight=xb>box.right-90;body+=svgLabel(nearRight?xb-7:xb+7,box.top+14,`B = ${selectedB.toFixed(3)} mT`,`text-anchor="${nearRight?'end':'start'}" class="mark-label" fill="#f0bf6c"`);}
  if(pick&&rows.length>1){const xs=rows.map(r=>sc.x(r.field_mT));body+=xs.map((cx,i)=>{const a=i?(xs[i-1]+cx)/2:box.left,b=i<xs.length-1?(cx+xs[i+1])/2:box.right;return `<rect class="pick" data-field="${rows[i].field_mT}" x="${a}" y="${box.top}" width="${Math.max(1,b-a)}" height="${box.bottom-box.top}" fill="transparent"><title>${rows[i].field_mT.toFixed(3)} mT · 点选查看全体电子落点</title></rect>`;}).join('');}
  return `<svg class="chart quad-plot${pick?' pickable':''}" viewBox="0 0 ${width} ${height}" role="img" aria-label="模型与实测电流曲线">${body}</svg>`;
}
function interp(rows,B,key){if(!rows.length)return NaN;if(B<=rows[0].field_mT)return rows[0][key];for(let i=1;i<rows.length;i++)if(rows[i].field_mT>=B){const a=rows[i-1],b=rows[i],u=(B-a.field_mT)/((b.field_mT-a.field_mT)||1);return a[key]+(b[key]-a[key])*u;}return rows.at(-1)[key];}
multiCurve.serial=0;
export function budgetChart(models){const x=v=>165+(v+12)/22*330;let s='';for(const v of [-10,-5,0,5,10])s+=`<path class="gridline" d="M${x(v)},15V188"/>`+svgLabel(x(v),211,`${v}%`,'text-anchor="middle"');models.forEach((m,i)=>{const y=28+i*34,v=m.fit.relPct;s+=svgLabel(10,y+4,m.label)+`<rect x="${Math.min(x(0),x(v))}" y="${y-9}" width="${Math.max(1,Math.abs(x(v)-x(0)))}" height="18" fill="${m.measured?'#eead76':'#87cef0'}" opacity=".8"/>`+svgLabel(v<0?x(v)-4:x(v)+5,y+4,`${v>0?'+':''}${v.toFixed(2)}%`,`text-anchor="${v<0?'end':'start'}"`);});return `<svg class="chart budget-chart" viewBox="0 0 540 230" role="img" aria-label="各模型与实测比荷偏差的独立比较">${s}</svg>`;}
export function outcomeChart(row){const names=['回灯丝','中央阳极','保护环','飞出端面','未终止','初态排除'],colors=['#728292','#87cef0','#eead76','#a998bd','#ef8d81','#73806c'];const fractions=row?.fractions??[];let start=0,s='';fractions.forEach((f,i)=>{s+=`<rect x="${20+start*500}" y="15" width="${f*500}" height="19" fill="${colors[i]}"/>`;start+=f;s+=`<rect x="${20+i%3*173}" y="${52+Math.floor(i/3)*28}" width="7" height="7" fill="${colors[i]}"/><text x="${32+i%3*173}" y="${60+Math.floor(i/3)*28}">${names[i]} ${(100*f).toFixed(1)}%</text>`;});return `<svg class="chart outcome-chart" viewBox="0 0 540 100" role="img" aria-label="粒子终端去向权重">${s}</svg>`;}

// ---- Linked simulator views: the all-electron landing map and one electron's r(t), z(t).
export const FREE_FATES=[['回灯丝','#8b969f'],['中央阳极','#87cef0'],['保护环','#eead76'],['飞出端面','#b39bdb'],['仍在飞行','#ef8d81'],['初态排除','#5d6a73']];
const ME=9.1093837015e-31,QE=1.602176634e-19;
export function coldCutoff(z,p){const L=p.length_mm,U=p.gradient?p.anode_V-p.filament_V*(z/L+.5):p.anode_V-p.filament_V/2,ra=p.anode_radius_mm*1e-3,rf=p.filament_radius_um*1e-6;return U>0?1e3*Math.sqrt(8*ME*U/QE)*ra/(ra*ra-rf*rf):0;}
export function freeMapChart(data,p,B,selected=null){
  const L=p.length_mm,h=L/2,c=p.central_mm/2,left=56,right=516,box={left,right,top:46,bottom:256},sc=scales([-h,h],[-h,h],box),{x,y}=sc;let s='';
  for(const [a,b,col,name] of [[-h,-c,'#577486','H 保护环'],[-c,c,'#ba9558','中央阳极 A_1'],[c,h,'#8d9ca5','K 保护环']]){s+=`<rect x="${x(a)}" y="${box.top}" width="${x(b)-x(a)}" height="${box.bottom-box.top}" fill="${col}" opacity=".09"/>`+svgLabel((x(a)+x(b))/2,box.top-12,name,'text-anchor="middle" class="band-label"');}
  const ticks=[-h,-c,0,c,h].map(v=>Number(v.toFixed(2)));
  s+=grid([-h,h],[-h,h],box,{xlabel:'',ylabel:'',xticks:ticks,yticks:ticks});
  s+=svgLabel(4,box.top-30,'落点 z_{\\mathrm{hit}} / \\mathrm{mm}','class="axis-label"')+svgLabel((left+right)/2,box.bottom+33,'起飞位置 z_0 / \\mathrm{mm}','text-anchor="middle" class="axis-label"');
  s+=`<path class="gridline" stroke-dasharray="4 4" d="M${x(-h)},${y(-h)}L${x(h)},${y(h)}"/>`;
  for(const v of [-c,c])s+=`<path class="boundary" d="M${x(v)},${box.top}V${box.bottom}M${left},${y(v)}H${right}"/>`;
  const Bax=B*Math.cos((p.tilt_deg??0)*Math.PI/180),cut=[];for(let i=0;i<=140;i++){const z=-h+L*i/140;if(coldCutoff(z,p)<Bax)cut.push(z);}
  if(cut.length)s+=`<rect x="${x(cut[0])}" y="${box.top}" width="${Math.max(1,x(cut.at(-1))-x(cut[0]))}" height="${box.bottom-box.top}" fill="url(#free-hatch)" opacity=".5"/>`;
  const eta=p.emission_profile==='cooled_ends'?p.end_cooling_eta:0;let picked='';
  for(const [i,q] of data.particles.entries()){const [id,z0,zhit,outcome]=q;if(z0===null||outcome===5)continue;const collected=outcome===1||outcome===2;
    // Mirrored ±z0 launch pairs: thin by an id hash. End-face escapes sit in strips just outside the frame.
    if(!collected&&((id*2654435761)>>>0)%3!==0&&id!==selected)continue;
    const w=1-eta*(2*z0/L)**2,jit=(((id*40503)>>>0)%100)/100,cy=outcome===3?(zhit>0?box.top-3-5*jit:box.bottom+3+5*jit):zhit===null?box.bottom+6:y(Math.max(-h,Math.min(h,zhit)));
    const node=`<circle data-pid="${id}" cx="${x(z0).toFixed(1)}" cy="${cy.toFixed(1)}" r="${id===selected?5.5:collected?2.3:1.5}" fill="${FREE_FATES[outcome][1]}" opacity="${id===selected?1:((collected?.35:.18)+.6*w).toFixed(2)}" ${id===selected?'stroke="#fff" stroke-width="1.8"':''}><title>#${id} · ${FREE_FATES[outcome][0]} · z0 ${z0.toFixed(2)} → ${zhit===null?'—':zhit.toFixed(2)} mm</title></circle>`;
    if(id===selected)picked=node;else s+=node;}
  if(picked){const q=data.particles.find(q=>q[0]===selected);if(q&&q[1]!==null){const px=x(q[1]);s+=`<path d="M${px},${box.top}V${box.bottom}" stroke="#f0bf6c" stroke-dasharray="3 3" opacity=".7"/>`;if(q[2]!==null&&q[3]!==3){const py=y(Math.max(-h,Math.min(h,q[2])));s+=`<path d="M${left},${py}H${right}" stroke="#f0bf6c" stroke-dasharray="3 3" opacity=".7"/>`;}}}
  s+=picked.replace('stroke="#fff"','stroke="#f0bf6c"');
  const barY=312,n=120;for(let i=0;i<n;i++){const z=-h+L*(i+.5)/n,v=coldCutoff(z,p),r=Math.max(0,Math.min(1,(v-coldCutoff(h,p))/((coldCutoff(-h,p)-coldCutoff(h,p))||1)));s+=`<rect x="${left+(right-left)*i/n}" y="${barY}" width="${(right-left)/n+.3}" height="12" fill="hsl(${34+r*170},48%,${42+r*10}%)"/>`;}
  s+=svgLabel(left,barY-6,'同轴冷截止场 B_c(z)','class="axis-label"')+svgLabel(left,barY+27,`H 端 ${coldCutoff(-h,p).toFixed(2)} mT`,'class="tick"')+svgLabel(right,barY+27,`K 端 ${coldCutoff(h,p).toFixed(2)} mT`,'text-anchor="end" class="tick"');
  if(cut.length&&cut.length<141){const edge=cut[0]<=-h+1e-9?cut.at(-1):cut[0];s+=`<path class="cutoff-line" d="M${x(edge)},${box.top}V${barY+12}"/>`;}
  return `<svg class="chart free-map" viewBox="0 0 540 346" role="img" aria-label="全体电子起飞与落点映射"><defs><pattern id="free-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0,0V7" stroke="#d9a85d" stroke-width="1.2" opacity=".5"/></pattern></defs>${s}</svg>`;
}
export function freeTraceChart(tr,p,time=0){
  const t=Math.max(tr.flight_ns,1e-6),ra=p.anode_radius_mm,h=p.length_mm/2,c=p.central_mm/2,L=56,R=516,id='ft'+(++multiCurve.serial);
  const up={left:L,right:R,top:24,bottom:128},lo={left:L,right:R,top:160,bottom:262},xt=niceT(t);
  let s=grid([0,t],[0,ra*1.06],up,{xlabel:'',ylabel:'半径 r / \\mathrm{mm}',xticks:xt,xTickLabels:false})+lines([{points:tr.points.map(q=>[q[4],q[3]]),color:'#87cef0',width:2}],[[0,t],[0,ra*1.06]],up,id+'r');
  const us=scales([0,t],[0,ra*1.06],up);s+=`<path stroke="#e39188" stroke-dasharray="4 4" fill="none" d="M${L},${us.y(ra)}H${R}"/>`+svgLabel(R-2,us.y(ra)-5,`阳极 r_a = ${ra.toFixed(2)} mm`,'text-anchor="end" class="mark-label" fill="#e39188"');
  s+=grid([0,t],[-h,h],lo,{xlabel:'t / \\mathrm{ns}',ylabel:'轴向位置 z / \\mathrm{mm}',xticks:xt,yticks:[-h,-c,0,c,h].map(v=>Number(v.toFixed(2)))});
  const ls=scales([0,t],[-h,h],lo);s+=`<rect x="${L}" y="${ls.y(c)}" width="${R-L}" height="${ls.y(-c)-ls.y(c)}" fill="#ba9558" opacity=".09"/>`;
  for(const v of [-c,c])s+=`<path class="boundary" d="M${L},${ls.y(v)}H${R}"/>`;
  s+=lines([{points:tr.points.map(q=>[q[4],q[2]]),color:'#87cef0',width:2}],[[0,t],[-h,h]],lo,id+'z');
  const cx=L+(R-L)*Math.min(time,t)/t;s+=`<path class="cursor" d="M${cx},${up.top}V${lo.bottom}"/>`;
  return `<svg class="chart free-trace" viewBox="0 0 540 300" role="img" aria-label="所选电子的半径与轴向位置随时间变化">${s}</svg>`;
}
function niceT(t){const mag=10**Math.floor(Math.log10(t/5)),step=[1,2,2.5,5,10].map(f=>f*mag).find(v=>t/v<=6.5);const out=[];for(let v=0;v<=t+1e-9;v+=step)out.push(Number(v.toPrecision(8)));return out;}
