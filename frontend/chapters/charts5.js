import {grid,lines,scales,esc} from './charts.js';
import {svgLabel} from '../chapter3/svg-tex.js';

export const FATE_COLORS=['#8b969f','#8bcce8','#83cbb0','#b39bdb','#d8ba80','#dc8585'];
export const FATE_NAMES=['回灯丝','中央阳极','保护环','端面飞出','仍在飞行','数值失败'];
let serial=0;
export function symmetryChart(zero,tilted,{mode='both',time=0,full=false,hull=false}={}) {
  const id='sym-'+serial++,limit=full?Math.max(zero.flight_ns,tilted.flight_ns):Math.ceil(tilted.flight_ns/5)*5;
  const upper={left:58,right:520,top:27,bottom:145},lower={left:58,right:520,top:225,bottom:334};
  const trs=mode==='zero'?[[zero,'#8ccbe4']]:mode==='tilt'?[[tilted,'#f1b575']]:[[zero,'#8ccbe4'],[tilted,'#f1b575']];
  const ymin=hull?-zero.pphi_hull_scale_mm2_per_ns*1.06:Math.min(-.2,...tilted.pphi_mm2_per_ns)*1.09;
  let html=grid([0,limit],[ymin,.2],upper,{xlabel:'t / \\mathrm{ns}',ylabel:'P_\\varphi/m / (\\mathrm{mm}^2/\\mathrm{ns})'});
  html+=lines(trs.map(([tr,color])=>({points:tr.points.map((p,i)=>[p[4],tr.pphi_mm2_per_ns[i]]),color})),[[0,limit],[ymin,.2]],upper,id);
  const up=scales([0,limit],[ymin,.2],upper);
  if(hull){const y=up.y(-zero.pphi_hull_scale_mm2_per_ns);html+=`<path class="boundary" d="M58,${y}H520"/>`+svgLabel(515,y-4,`-P_B/m = -${zero.pphi_hull_scale_mm2_per_ns.toFixed(2)}`,'text-anchor="end"');}
  html+=`<path class="cursor" d="M${up.x(Math.min(time,limit))},27V145"/>`;
  const n=Math.max(6,zero.perigee.length,tilted.perigee.length),lo=Math.log10(.03),hi=Math.log10(2),lp=scales([1,n],[lo,hi],lower);
  for(const r of [.0375,.1,.3,1,2]){const y=lp.y(Math.log10(r));html+=`<path class="gridline" d="M58,${y}H520"/>`+svgLabel(50,y+4,String(r),'text-anchor="end"');}
  for(const v of [1,Math.ceil(n/2),n])html+=svgLabel(lp.x(v),350,String(v),'text-anchor="middle"');
  html+=svgLabel(58,203,'r_{\\min} / \\mathrm{mm}　对数刻度')+svgLabel(520,369,'近地点序号','text-anchor="end"');
  html+=`<path class="boundary" d="M58,${lp.y(Math.log10(.0375))}H520"/>`;
  for(const [tr,color] of trs){const points=tr.perigee.map((p,i)=>[i+1,Math.log10(p.radius_mm)]);
    html+=lines([{points,color}],[[1,n],[lo,hi]],lower,id+color.slice(1));
    for(const [i,p] of tr.perigee.entries())html+=`<circle cx="${lp.x(i+1)}" cy="${lp.y(Math.log10(p.radius_mm))}" r="${tr===tilted?3.8:2.5}" fill="${color}"><title>第${i+1}近地点：${p.radius_mm.toFixed(4)} mm</title></circle>`;
  }
  return `<svg class="chart symmetry-chart" viewBox="0 0 540 380" role="img" aria-label="正则角动量与逐次近地点">${html}</svg>`;
}

export function fateWheel(wheel,pid,selected=0) {
  const cx=167,cy=168,r=135,inner=41,at=(radius,deg)=>[cx+radius*Math.cos((deg-90)*Math.PI/180),cy+radius*Math.sin((deg-90)*Math.PI/180)];
  let out='';
  for(const [i,s] of wheel.sectors.entries()){
    const a=i*5+.35,b=(i+1)*5-.35,p=at(r,a),q=at(r,b),u=at(inner,b),v=at(inner,a);
    const d=`M${p}A${r},${r} 0 0 1 ${q}L${u}A${inner},${inner} 0 0 0 ${v}Z`;
    out+=`<path data-sector="${i}" d="${d}" fill="${FATE_COLORS[s.outcome]}" opacity="${i===selected?1:.72}" stroke="${i===selected?'#fff':'#132432'}" stroke-width="${i===selected?2:.7}" tabindex="${i===selected?0:-1}" role="button" aria-label="转角 ${s.angle_deg} 度，${FATE_NAMES[s.outcome]}"><title>${s.angle_deg}° · ${FATE_NAMES[s.outcome]} · ${s.flight_ns.toFixed(2)} ns</title></path>`;
  }
  out+=svgLabel(cx,165,`#${pid}`,'text-anchor="middle"')+svgLabel(cx,185,'72 方位','text-anchor="middle"');
  for(const angle of [0,90,180,270]){const p=at(151,angle);out+=svgLabel(p[0],p[1]+4,`${angle}°`,'text-anchor="middle"');}
  for(const [i,count] of wheel.counts.entries())if(count||i<4){const y=75+i*46;out+=`<circle cx="351" cy="${y-3}" r="4" fill="${FATE_COLORS[i]}"/>`+svgLabel(365,y,FATE_NAMES[i])+svgLabel(510,y,String(count),'text-anchor="end"');}
  out+=svgLabel(167,345,'相对初态转角 \\Delta\\varphi_0','text-anchor="middle"');
  return `<svg class="chart fate-wheel" viewBox="0 0 540 365" role="group" aria-label="72 个发射方位的真实命运">${out}</svg>`;
}
