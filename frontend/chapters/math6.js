import {weightedRow} from './physics-client.js';
import {loadSweepData,resolveCalibration,physicalField,fitRegression,idealBc_mT,GEOM} from '../chapter3/cutoff-math.js';
export const VOLTS=[4,6,8,10];
export function weightedScan(bundle,V,theta=0,eta=0){
  const s=bundle.scans[`${V}:${theta}`];if(!s)return null;
  return s.rows.map((r,i)=>weightedRow(r,s.moments[i],eta,s.params.emission_uA));
}
export function interpolate(rows,B,key='A1_uA'){
  if(B<=rows[0].field_mT)return rows[0][key];
  for(let i=1;i<rows.length;i++)if(B<=rows[i].field_mT){const a=rows[i-1],b=rows[i],t=(B-a.field_mT)/(b.field_mT-a.field_mT);return a[key]+t*(b[key]-a[key]);}
  return rows.at(-1)[key];
}
// Exactly the Chapter 3 tangent operator, evaluated on the same 71 measured fields.
// Additional teaching anchors must never enter this regression grid.
export function modelFit(asset,byVoltage,calibration=null){
  const data=loadSweepData(asset),cal=resolveCalibration(asset,calibration),model={};
  for(const V of VOLTS){const rows=byVoltage[V];if(!rows?.length)return null;
    model[V]={...data[V],zb_a1:interpolate(rows,0),pts:data[V].pts.map(p=>{const q=[...p];q[6]=interpolate(rows,physicalField(p[1],cal));return q;})};
  }
  const fit=fitRegression(model,cal);return Number.isFinite(fit.em)&&fit.items.every(r=>r.bc>0)?fit:null;
}
export function measuredFit(asset,calibration=null){return fitRegression(loadSweepData(asset),resolveCalibration(asset,calibration));}
export function budgetModels(bundle,asset,calibration=null){
  return [{label:'理想冷基准',fit:{u0:0,relPct:0,em:GEOM.em_codata,items:VOLTS.map(V=>({V,bc:idealBc_mT(V)}))}},
    ...[[0,0,'热初速 + 灯丝压降'],[0,.76,'0° · 端冷闭合'],[8,.76,'8° · 全机制']].map(([theta,eta,label])=>({label,theta,eta,fit:modelFit(asset,Object.fromEntries(VOLTS.map(V=>[V,weightedScan(bundle,V,theta,eta)])),calibration)})),
    {label:'四档实测',measured:true,fit:measuredFit(asset,calibration)}];
}
export function ratioErrors(bundle,eta){const ratios=VOLTS.map(V=>{const r=weightedScan(bundle,V,0,eta)[0];return r.A2_uA/r.A1_uA;});const observed=VOLTS.map(V=>bundle.zero_measured[V].A2/bundle.zero_measured[V].A1);return {ratios,observed,rmse:Math.sqrt(ratios.reduce((s,r,i)=>s+(r-observed[i])**2,0)/4)};}
export const BOUNDARIES=[
  {title:'保护环在截止后反超零场',text:'10 V 实测保护环达到零场的 103.4%。模型中 H 环也会单独回弹，但 K 环已下跌，合并后仍低于零场。有限开口的轴向电场可能改变越口电子的去向。',target:10},
  {title:'缓慢上升与等效倾角',text:'倾角能改变长尾，也会改变截止前缓坡。实际倾斜、灯丝偏心和端区磁场梯度都可能打破柱对称；当前曲线给出的，是这些作用的等效描述。',target:8},
  {title:'合并测量留下的 H / K 盲区',text:'实测只记录两侧保护环的合计电流。模型可以拆开 H / K 两路，但两条模型曲线尚无对应的分环实测数据可逐项对照。',target:10},
];
export const DIRECTIONS=[
  {title:'A · 分别观察两侧保护环',question:'H / K 两路的冲高是否出现在不同磁场？',text:'分开比较两端曲线，可检验压差错位造成的单边回弹；再用有限开口场的轨迹统计，检验额外回收是否集中在 K 侧。'},
  {title:'B · 改变磁场方向与有效倾角',question:'长尾对磁场反转与微角度变化怎样响应？',text:'比较长尾的奇偶变化，约束轴向倾斜、固定偏心与磁场梯度的贡献；同一条尾部曲线不能单独确定它们各自的大小。'},
  {title:'C · 减小阴极上的直流压降',question:'隆起与横轴截距会不会一起减小？',text:'低梯度阴极对照可检验灯丝压降的贡献。保留热初速时，热展宽仍会存在，需比较同一截止判据下的变化。'},
  {title:'D · 纳入真实端部的电磁边界',question:'回收保护环电子的同时，全曲线是否更接近实测？',text:'把端环、屏蔽结构与真实几何加入场求解，检查保护环反超、中央阳极高场尾部和截止场能否同时改善。'},
];
