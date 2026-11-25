import {ELECTRON_CHARGE_TO_MASS, criticalFieldMilliTesla} from '../modules/ideal-physics.js';

export const VOLTS = [4, 6, 8, 10];
export const V_COLORS = {4:'#6db3e8',6:'#6fd4be',8:'#e8b86d',10:'#ef8a6c'};
export const GEOM = Object.freeze({Ra_mm:4.55,rc_um:37.5,
  G_m2:(4.55e-3)**2*(1-(37.5e-6/4.55e-3)**2)**2,em_codata:ELECTRON_CHARGE_TO_MASS});
const mean = values => values.reduce((s,x)=>s+x,0)/values.length;

/** Compact display rows: set mA, actual A, CH1 V, actual Ua, Uf, If, A1 µA.
 * Cutoff operators always use actual excitation current, never the setpoint.
 */
export function loadSweepData(asset){
  const rows=asset.magnetic_scan.rows.map(row=>Object.fromEntries(asset.columns.map((key,i)=>[key,row[i]])));
  return Object.fromEntries(VOLTS.map(V=>{
    const zero=rows.filter(r=>r.nominal_voltage_V===V&&r.record_role==='zero_before');
    const up=rows.filter(r=>r.nominal_voltage_V===V&&r.record_role==='up'&&r.excitation_set_mA>=0&&r.excitation_set_mA<=1400).sort((a,b)=>a.excitation_set_mA-b.excitation_set_mA);
    if(!zero.length||up.length!==71||up.some((r,i)=>r.excitation_set_mA!==i*20))throw new Error(`${V} V 扫场数据不完整`);
    const avg=key=>mean(zero.map(r=>r[key]));
    return [V,{zb_a1:avg('physical_A1_current_uA'),zb_ua:avg('accelerating_actual_V'),zb_uf:avg('CH3_voltage_V'),zb_if:avg('CH3_current_A'),zeroCount:zero.length,
      pts:up.map(r=>[r.excitation_set_mA,r.excitation_actual_A,r.CH1_voltage_V,r.accelerating_actual_V,r.CH3_voltage_V,r.CH3_current_A,r.physical_A1_current_uA])}];
  }));
}
export function resolveCalibration(asset,saved){
  const valid=saved&&Number.isFinite(saved.slope)&&saved.slope>0&&Number.isFinite(saved.intercept);
  return valid?{...saved,skipped:!!saved.skipped}:{slope:asset.calibration.slope_mT_per_A,intercept:asset.calibration.intercept_mT,skipped:true,r2:asset.calibration.r_squared};
}
export const linearField=(I,cal)=>cal.slope*I+cal.intercept;
export const physicalField=(I,cal)=>Math.max(0,linearField(I,cal));
export function analyzeVoltage(data,V,cal,method='tangent',voltageMode='nominal'){
  const d=data[V],pts=d.pts,zb=d.zb_a1;
  let slopeSeg=Infinity,segIdx=0;
  for(let i=0;i<pts.length-1;i++){
    const slope=(pts[i+1][6]-pts[i][6])/(pts[i+1][1]-pts[i][1]);
    if(slope<slopeSeg){slopeSeg=slope;segIdx=i;}
  }
  const p=pts[segIdx],q=pts[segIdx+1],xm=(p[1]+q[1])/2,ym=(p[6]+q[6])/2;
  let ic=xm;
  if(method==='tangent')ic=xm+(zb-ym)/slopeSeg;
  else if(method==='halfmax'){
    const i=pts.findIndex((p,i)=>i<pts.length-1&&p[6]>=zb/2&&pts[i+1][6]<=zb/2);
    if(i<0)throw new Error('采集区间未经过半高点');
    ic=pts[i][1]+(zb/2-pts[i][6])/(pts[i+1][6]-pts[i][6])*(pts[i+1][1]-pts[i][1]);
  }else if(method!=='steepest')throw new Error('未知截止判据');
  const bc=linearField(ic,cal),U=voltageMode==='actual'?d.zb_ua:V;
  const peak=pts.reduce((a,b)=>a[6]>b[6]?a:b),end=pts.at(-1),factor=8/((bc*1e-3)**2*GEOM.G_m2);
  return {V,U,zb,uf:d.zb_uf,ic,bc,slopeSeg,segIdx,xm,ym,xZeroCross:xm-ym/slopeSeg,
    peakI:peak[6],peakIM:peak[1],peakPct:100*(peak[6]/zb-1),endI:end[6],endV1:end[2],tailPct:100*end[6]/zb,
    emNaive:factor*U,emUeff:factor*(U-d.zb_uf/2)};
}
export function fitRegression(data,cal,method='tangent',voltageMode='nominal'){
  const items=VOLTS.map(V=>analyzeVoltage(data,V,cal,method,voltageMode));
  const xs=items.map(r=>r.U),ys=items.map(r=>r.bc**2),mx=mean(xs),my=mean(ys);
  const sxx=xs.reduce((s,x)=>s+(x-mx)**2,0),sxy=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0),syy=ys.reduce((s,y)=>s+(y-my)**2,0);
  const slope=sxy/sxx,b=my-slope*mx,em=8/(slope*1e-6*GEOM.G_m2);
  return {items,slope,b,u0:-b/slope,r2:sxy**2/(sxx*syy),em,relPct:100*(em/GEOM.em_codata-1)};
}
export const idealBc_mT=U=>criticalFieldMilliTesla({voltageV:Math.max(0,U),anodeRadiusMm:4.55,filamentRadiusUm:37.5});
export const idealCurrentForVoltage=(U,cal)=>(idealBc_mT(U)-cal.intercept)/cal.slope;
