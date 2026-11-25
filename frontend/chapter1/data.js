export const PARTS={
 tube:{title:'真空二极管',short:'电子偏转与收集的发生区',text:'抽成高真空的玻璃外壳内同轴封装着中心钨丝阴极与三段金属收集圆筒。切换到管体结构，可观察中央阳极、保护环和灯丝的装配关系。'},
 heater:{title:'灯丝加热电源 CH3',short:'决定阴极温度与发射强弱',text:'跨接在钨丝两端 K–H 之间，工作在恒流加热模式（约 0.60 A），将灯丝烧热至约 2000 K，以热发射出自由电子。加热压降直接落在灯丝 K–H 两端。'},
 accelerator:{title:'加速电源 CH2',short:'提供径向加速电压 Uₐ',text:'正极分别向中央阳极和保护环施加正电势，负极直接接在灯丝的 H 端。它决定了管内径向电场强度，以及电子撞向阳极前获得的动能。'},
 resistor:{title:'1 kΩ 取样电阻',short:'把微安级收集电流转成毫伏电压',text:'中央阳极收集电流通常只有几十微安，不直接串联微安表，而是让电流流经这只精密 1 kΩ 电阻，通过并联测端电压来换算电流。'},
 meter:{title:'数字毫伏表',short:'读数几毫伏，中央电流就是几微安',text:'并联在 1 kΩ 取样电阻两端，工作于直流毫伏挡（DC mV）。根据欧姆定律，1 mV 对应 1 μA 的中央阳极收集电流 Iₑ。这块表记录到达中央阳极的电子所形成的电流。'},
 magnet:{title:'励磁电源 CH1',short:'调节通过线圈的励磁电流 I<sub>M</sub>',text:'专用于驱动线圈产生磁场的独立直流稳流电源。增大或减小 CH1 的输出电流 I<sub>M</sub>，可以直接改变穿过真空管的轴向磁场强弱。'},
 coils:{title:'亥姆霍兹线圈',short:'将励磁电流转为轴向磁场 B',text:'两侧同规格铜线圈沿底座刻度的一个半径 R 间距对称摆放、串联顺接，在中央区域制造沿着管轴方向的近似匀强磁场；它与管内真空电路完全电隔离。'}
};
export const CIRCUIT_PARTS=Object.keys(PARTS);
export const STRUCTURE_PARTS=['anode','guardLeft','guardRight','filament','glass','support','tension','base'];
Object.assign(PARTS,{
 anode:{title:'中央阳极 A₁',short:'长 15 mm · 内半径 4.55 mm',text:'中央阳极接收飞抵筒壁的电子。收集电流经过 1 kΩ 取样电阻，由并联的数字毫伏表测量：1 mV 对应 1 μA。'},
 guardLeft:{title:'保护环 A₂ · 管座端',short:'长 10 mm · 接 Uₐ⁺',text:'管座端保护环与另一端保护环直接连接加速电源正极，减小中央收集区域的端部边缘效应；本章不单独测量保护环电流。'},
 guardRight:{title:'保护环 A₂ · 封顶端',short:'长 10 mm · 接 Uₐ⁺',text:'封顶端保护环与中央阳极近似等电位。两侧保护环延长同轴电极结构，使中央区域的电场更接近径向场。'},
 filament:{title:'钨丝阴极 K–H',short:'直径 75 μm · 半径 37.5 μm',text:'钨丝通电后发热，表面发射热电子。加热电流固定为 0.60 A；约 2000 K 是这里说明热发射所用的近似温度。'},
 glass:{title:'玻璃真空壳',short:'封接外壳 · 同轴装配',text:'玻璃壳与管座封接，形成真空环境。剖视时外壳降低透明度，使内部电极、支撑和引线可见。'},
 support:{title:'定心片与陶瓷绝缘杆',short:'支撑电极 · 保持同轴',text:'端部支撑片和绝缘杆固定电极的相对位置，保持灯丝与收集筒同轴，并使各接线部件相互绝缘。'},
 tension:{title:'灯丝张紧弹簧',short:'补偿热伸长 · 保持张紧',text:'灯丝受热后会伸长，弹性张紧结构为长度变化留出余量，使细钨丝保持沿管轴张紧。'},
 base:{title:'管座与电极引线',short:'机械固定 · 外部电路连接',text:'管座固定玻璃管，并通过管脚引出灯丝和各段电极。电气连接关系以左侧电路图中的 K、H、A₁、A₂ 为准。'}
});
export const LEADS={
 L1:{title:'灯丝回路接通',part:'heater',text:'电流经 K 流入、H 流出加热钨丝，注意这条回路同时承担着阴极本身约 3.68 V 的工作压降。'},
 L2:{title:'主收集通路接通',part:'accelerator',text:'加速正电压经 1 kΩ 取样电阻加到中央收集筒 A₁，飞抵 A₁ 的电子经电阻汇回电源正极。'},
 L3:{title:'微弱电流测读线接通',part:'meter',text:'毫伏表跨接于 1 kΩ 电阻两端，以几乎零分流的方式实时读出中央阳极电流（1 mV ↔ 1 μA）。'},
 L4:{title:'等电位与参考回路接通',part:'tube',text:'两侧保护环 A₂ 直接接至加速电源正极维持与 A₁ 近似同电位，此时暂未接入单独电流表。同时 CH2− 连在灯丝 H 端构成参考电位。'},
 L5:{title:'磁场励磁回路接通',part:'coils',text:'两只线圈串联顺接以保证磁场同向叠加，与电子收集回路彼此绝缘，仅靠磁感应强度 B 穿过管壁影响电子。'}
};
export async function loadMeasurements(){
 const asset=await (await fetch('./assets/measurements.json')).json();
 const rows=asset.magnetic_scan.rows.map(r=>Object.fromEntries(asset.columns.map((k,i)=>[k,r[i]]))).filter(r=>r.nominal_voltage_V===10&&['preflight','up'].includes(r.record_role));
 const unique=new Map();for(const r of rows){if(!Number.isFinite(r.excitation_actual_A)||!Number.isFinite(r.physical_A1_current_uA))continue;const key=r.excitation_actual_A;if(!unique.has(key))unique.set(key,[]);unique.get(key).push(r);}
 const knots=[...unique].sort((a,b)=>a[0]-b[0]).map(([current,values])=>({current,reading:values.reduce((s,v)=>s+v.physical_A1_current_uA,0)/values.length,coilVoltage:values.reduce((s,v)=>s+v.CH1_voltage_V,0)/values.length,records:values.map(v=>v.source_csv_record)}));
 const interpolate=(current,key)=>{if(current<=knots[0].current)return knots[0][key];for(let i=1;i<knots.length;i++)if(current<=knots[i].current){const a=knots[i-1],b=knots[i],t=(current-a.current)/(b.current-a.current);return a[key]+t*(b[key]-a[key]);}return knots.at(-1)[key];};
 return {asset,knots,reading:current=>interpolate(current,'reading'),voltage:current=>interpolate(current,'coilVoltage')};
}
export const SAVE_KEY='magnetron-chapter1-saves-v1';
export const SETTINGS_KEY='magnetron-chapter1-settings-v1';
export function freshState(){return {version:1,id:crypto.randomUUID(),createdAt:Date.now(),savedAt:Date.now(),chapter:1,stage:'1.1',spread:0,bookPage:0,bookVoltage:10,bookField:2.4,guess:null,lessonDone:false,lit:[],visited:[],tab:'circuit',panel:null,view:'bench',selected:'',heater:false,accelerator:false,magnet:false,current:0,notes:{observation:'',explanation:''},progress:{structure:false,circuit:false,trial:false,skippedTrial:false},trial:{heater:false,accelerator:false,magnet:false,lowReading:false,dropReading:false}};}
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const validSave=s=>record(s)&&s.version===1&&typeof s.id==='string'&&record(s.notes)&&Array.isArray(s.lit);
export function restoreState(saved){
 const base=freshState(),s=validSave(saved)?saved:{};
 const state={...base,...s,notes:{...base.notes,...s.notes},progress:{...base.progress,...s.progress},trial:{...base.trial,...s.trial}};
 for(const key of ['current','bookField','bookVoltage','spread','bookPage'])if(!Number.isFinite(state[key]))state[key]=base[key];
 state.current=Math.max(0,Math.min(1.44,state.current));
 state.chapter=[1,2,3,4,5,6].includes(state.chapter)?state.chapter:1;
 state.view=['bench','tube'].includes(state.view)?state.view:'bench';
 state.tab=state.tab==='structure'?'structure':'circuit';
 state.lit=state.lit.filter(id=>Object.hasOwn(LEADS,id));
 state.visited=Array.isArray(state.visited)?state.visited:[];
 for(const key of ['heater','accelerator','magnet','lessonDone'])state[key]=state[key]===true;
 return state;
}
function storedEntries(){const entries=JSON.parse(localStorage.getItem(SAVE_KEY)||'[]');if(!Array.isArray(entries))throw new Error('存档格式无法识别，原记录已保留');return entries;}
export function readSaves(){try{return storedEntries().filter(validSave).map(restoreState);}catch{return [];}}
export function writeSave(state){
 // Keep damaged entries too: one unreadable record must never erase another experiment.
 const saves=storedEntries().filter(s=>!validSave(s)||s.id!==state.id);
 const savedAt=Date.now();saves.unshift(structuredClone({...state,savedAt}));
 localStorage.setItem(SAVE_KEY,JSON.stringify(saves));state.savedAt=savedAt;
}
