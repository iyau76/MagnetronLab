import {criticalFieldMilliTesla} from '../modules/ideal-physics.js';

export const PLOT = Object.freeze({left:48,right:514,top:25,bottom:264,width:540,height:320});
export const localDrop = (z,voltage=10,filament=3.68,length=35) => voltage-filament*(z/length+.5);
export const coldField = (z,voltage=10,filament=3.68) => criticalFieldMilliTesla({voltageV:Math.max(0,localDrop(z,voltage,filament)),anodeRadiusMm:4.55,filamentRadiusUm:37.5});
export function cutoffPosition(field,voltage=10,filament=3.68) {
  if(!filament)return field>coldField(0,voltage,0)?-17.5:17.5;
  const drop=field**2/coldField(0,1,0)**2;
  return Math.max(-17.5,Math.min(17.5,35*((voltage-drop)/filament-.5)));
}
export function radialMaxima(trace) {
  const p=trace.points,out=[];
  for(let i=1;i<p.length-1;i++)if(p[i][3]>=p[i-1][3]&&p[i][3]>p[i+1][3])out.push(i);
  if(trace.outcome===1||trace.outcome===2)out.push(p.length-1);
  return out;
}
export function traceIndex(trace,t) {
  let lo=0,hi=trace.points.length-1;
  while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(trace.points[mid][4]<=t)lo=mid;else hi=mid-1;}
  return lo;
}
export function transferDifference(zero,current) {
  const a=zero.transfer_counts,b=current.transfer_counts;
  const H=b[0][1]-a[0][1],K=b[2][1]-a[2][1],central=b[1][1]-a[1][1];
  const net=H+K+central,base=zero.row.counts[1];
  return {H,K,central,net,percent:100*net/base};
}
export function measuredCurves(asset,calibration) {
  const rows=asset.magnetic_scan.rows.map(row=>Object.fromEntries(asset.columns.map((key,i)=>[key,row[i]])));
  const cal=calibration??{slope:asset.calibration.slope_mT_per_A,intercept:asset.calibration.intercept_mT};
  return Object.fromEntries([4,6,8,10].map(V=>{
    const zero=rows.filter(r=>r.nominal_voltage_V===V&&r.record_role==='zero_before');
    const avg=k=>zero.reduce((s,r)=>s+r[k],0)/zero.length;
    const convert=r=>({field_mT:Math.max(0,cal.slope*r.excitation_actual_A+cal.intercept),A1_uA:r.physical_A1_current_uA,A2_uA:r.physical_A2_current_uA,sum_uA:r.physical_A1_current_uA+r.physical_A2_current_uA,im:r.excitation_actual_A,v1:r.CH1_voltage_V,ua:r.accelerating_actual_V,uf:r.CH3_voltage_V,if:r.CH3_current_A});
    return [V,{zero:{A1_uA:avg('physical_A1_current_uA'),A2_uA:avg('physical_A2_current_uA'),sum_uA:avg('physical_A1_current_uA')+avg('physical_A2_current_uA')},rows:rows.filter(r=>r.nominal_voltage_V===V&&r.record_role==='up'&&r.excitation_set_mA>=0&&r.excitation_set_mA<=1400).sort((a,b)=>a.excitation_set_mA-b.excitation_set_mA).map(convert)}];
  }));
}
