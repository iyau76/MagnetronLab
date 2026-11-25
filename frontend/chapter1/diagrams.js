const text = (x,y,s,c='') => `<text x="${x}" y="${y}" class="${c}">${s}</text>`;
const path = (d,c='') => `<path d="${d}" class="${c}"/>`;
const wrap = (body,w,h,label,cls='') => `<svg class="physics-diagram ${cls}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const battery = (x,y) => path(`M${x-16} ${y-5}h32 M${x-9} ${y+5}h18`)+text(x+23,y-7,'+')+text(x+23,y+14,'−');
const tube = (x,y,w,h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w/2}" class="glass"/>`;

/** The five lead groups are electrical branches, not individual wire segments. */
export function circuitSVG({lit=[],selected=''}={}) {
 const active=new Set(lit),names={L1:'灯丝加热回路',L2:'中央阳极收集回路',L3:'毫伏采样并联线',L4:'保护环与参考回线',L5:'串联励磁回路'};
 const lead=(id,d)=>`<g data-lead="${id}" class="lead ${active.has(id)?'is-lit':''} ${selected===id?'is-selected':''}" tabindex="0" role="button" aria-label="${names[id]}">${path(d,'wire-hit')}${path(d,'wire')}</g>`;
 const part=(id,body,label,box)=>`<g data-part="${id}" class="part ${selected===id?'is-selected':''}" tabindex="0" role="button" aria-label="${label}"><rect class="part-hit" x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}"/>${body}</g>`;
 let b=lead('L1','M62 52V19H285V129 M62 226V266H285V139');
 b+=lead('L4','M89 88H106V65H212V193 M89 194H106V148Q94 139 106 130V88 M62 244H212V203');
 b+=lead('L2','M89 139H133 M181 139H212');
 b+=lead('L3','M122 139V104H142 M172 104H193V139');
 b+=part('tube',tube(33,41,62,195)+path('M62 52V226','filament')+`<rect x="45" y="79" width="37" height="18" class="electrode guard"/><rect x="45" y="119" width="37" height="48" class="electrode"/><rect x="45" y="185" width="37" height="18" class="electrode guard"/>`+path('M82 88H89 M82 139H89 M82 194H89')+text(51,36,'K')+text(51,255,'H')+text(95,78,'A₂')+text(88,161,'A₁')+text(62,285,'真空二极管','center'),'真空二极管',[27,35,70,252]);
 b+=part('resistor',`<rect x="133" y="132" width="48" height="14" class="symbol"/>`+text(157,164,'1 kΩ','center'),'1 kΩ 取样电阻',[126,126,63,44]);
 b+=part('meter',`<circle cx="157" cy="104" r="15" class="symbol"/>`+text(157,109,'mV','center meter-label'),'数字毫伏表',[138,84,39,39]);
 b+=part('accelerator',battery(212,198)+text(211,227,'CH2 · 加速','center'),'加速电源 CH2',[169,180,85,53]);
 b+=part('heater',battery(285,134)+text(285,170,'CH3','center')+text(285,189,'灯丝加热','center'),'灯丝电源 CH3',[249,116,78,82]);
 for(const [x,y] of [[122,139],[193,139],[212,139],[62,244]])b+=`<circle cx="${x}" cy="${y}" r="2.3" class="junction"/>`;
 b+=path('M20 303H324','divider');
 b+=lead('L5','M55 357V331H115 M163 331H215 M263 331H305V393H55V367');
 const coil=x=>path(`M${x} 331c0-16 12-16 12 0c0-16 12-16 12 0c0-16 12-16 12 0c0-16 12-16 12 0`,'coil-symbol');
 b+=part('coils',`<rect class="part-hit" x="108" y="310" width="60" height="30"/><rect class="part-hit" x="208" y="310" width="62" height="30"/>`+coil(115)+coil(215)+text(207,366,'亥姆霍兹线圈','center')+text(207,384,'串联顺接','center coil-note'),'亥姆霍兹线圈',[135,348,145,41]);
 b+=part('magnet',battery(55,362)+text(55,418,'CH1 · 励磁','center'),'励磁电源 CH1',[12,345,89,80]);
 return wrap(b,340,435,'单表测试电路：中央阳极经取样电阻接 CH2，保护环接 CH2 正极，毫伏表跨接电阻；CH1 驱动串联线圈','circuit-diagram');
}

export function structureSVG(){
  const sections=[['guardLeft',88,96,'保护环 A₂','10 mm'],['anode',188,144,'中央阳极 A₁','15 mm'],['guardRight',336,96,'保护环 A₂','10 mm']];
  let b=`<defs><filter id="structure-filament-glow" filterUnits="userSpaceOnUse" x="15" y="150" width="490" height="32"><feGaussianBlur stdDeviation="3"/></filter><linearGradient id="structure-filament-light" gradientUnits="userSpaceOnUse" x1="29" y1="166" x2="490" y2="166"><stop offset="0" stop-color="#d49a43"/><stop offset=".5" stop-color="#ffe9b4"/><stop offset="1" stop-color="#d49a43"/></linearGradient></defs>`;
  b+=`<rect x="48" y="109" width="424" height="114" rx="57" class="glass"/>`+path('M32 166H488','axis');
  for(const [id,x,w,name,length] of sections){
    b+=`<g data-part="${id}" tabindex="0" role="button" aria-label="${name}"><rect class="part-hit" x="${x-2}" y="54" width="${w+4}" height="101"/>${text(x+w/2,70,name,'center')}${text(x+w/2,91,length,'center small')}${path(`M${x} 98V116 M${x+w} 98V116 M${x} 103h${w}`,'dimension')}<rect x="${x}" y="125" width="${w}" height="6" class="electrode ${id==='anode'?'':'guard'}"/><rect x="${x}" y="202" width="${w}" height="6" class="electrode ${id==='anode'?'':'guard'}"/></g>`;
  }
  b+=`<g data-part="glass" tabindex="0" role="button" aria-label="玻璃真空壳"><rect class="part-hit" x="433" y="77" width="83" height="39"/>${text(514,97,'玻璃壳','end small')}${path('M487 103L457 125','annotation')}</g>`;
  b+=`<g data-part="filament" tabindex="0" role="button" aria-label="钨丝阴极 K–H"><rect class="part-hit" x="27" y="157" width="462" height="40"/>${path('M29 166H490','filament-halo')}${path('M29 166H490','filament')}${text(260,190,'钨丝阴极 K–H','center')}${text(260,326,'灯丝半径 r꜀ = 37.5 μm','center small')}</g>`;
  b+=text(12,171,'K')+text(499,171,'H');
  b+=path('M290 134V162 M286 134H294 M286 162H294','dimension')+text(303,153,'rₐ = 4.55 mm','dimension-label');
  b+=path('M136 208V241 M384 208V241 M260 208V269','annotation');
  b+=text(136,260,'A₂ → 接 Uₐ⁺','center')+text(384,260,'A₂ → 接 Uₐ⁺','center');
  b+=text(260,294,'A₁ → 1 kΩ 取样电阻','center');
  return wrap(`<g transform="translate(0,-46)">${b}</g>`,520,300,'真空二极管轴向剖面：两端各十毫米保护环，中央十五毫米阳极；阳极内半径四点五五毫米，钨丝半径三十七点五微米','structure-diagram');
}

export function guardComparisonSVG(){
  const panel=(ox,guard)=>{
    let b=`<g transform="translate(${ox},0)">`;
    const start=guard?26:83,end=guard?234:177;
    b+=path(`M${start} 45H${end} M${start} 116H${end}`,'electrode-line');
    b+=`<ellipse cx="${start}" cy="80.5" rx="13" ry="35.5" class="glass"/><ellipse cx="${end}" cy="80.5" rx="13" ry="35.5" class="glass"/>`;
    if(guard){b+=path('M82 42V48 M178 42V48 M82 113V119 M178 113V119','gap-mark');b+=text(52,30,'A₂','center')+text(208,30,'A₂','center');}
    b+=text(130,30,'A₁','center');
    for(let i=0;i<7;i++){const x=88+i*14,bend=guard?0:(i-3)*7;b+=path(`M${x} 47Q${x+bend} 56 ${x+bend} 77 M${x} 114Q${x+bend} 105 ${x+bend} 84 M${x+bend-2.5} 69l2.5 4 2.5-4 M${x+bend-2.5} 92l2.5-4 2.5 4`,'field-line');}
    if(guard)for(const x of [39,54,68,192,206,221])b+=path(`M${x} 47V77 M${x} 114V84`,'field-line secondary');
    b+=path('M8 80.5H252','filament');
    return b+text(130,153,guard?'（b）加保护环':'（a）不加保护环','center')+'</g>';
  };
  return wrap(panel(0,false)+panel(270,true),530,170,'保护环电场示意比较：无保护环时中央阳极端部电力线弯曲，加等电位保护环后中央区域电场更接近径向场','guard-diagram');
}

export function apparatusSVG(){
  return `<svg class="apparatus-diagram" viewBox="0 0 500 205" role="img" aria-label="同轴单筒真空二极管正交电磁场示意">
                <defs>
                  <linearGradient id="cylOuter" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#8b9aa8" stop-opacity="0.22"/>
                    <stop offset="28%" stop-color="#d7e1ea" stop-opacity="0.14"/>
                    <stop offset="72%" stop-color="#697887" stop-opacity="0.26"/>
                    <stop offset="100%" stop-color="#4e5d6c" stop-opacity="0.34"/>
                  </linearGradient>
                  <linearGradient id="filamentGlow" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stop-color="#c96e1c"/>
                    <stop offset="50%" stop-color="#ffbb55"/>
                    <stop offset="100%" stop-color="#c96e1c"/>
                  </linearGradient>
                  <marker id="arrE" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,1 L9,5 L0,9 z" fill="#1a7a56"/>
                  </marker>
                  <marker id="arrB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,1 L9,5 L0,9 z" fill="#1e5b7a"/>
                  </marker>
                  <marker id="arrElec" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                    <path d="M0,1 L9,5 L0,9 z" fill="#b85d19"/>
                  </marker>
                </defs>

                <!-- 轴向磁场 B -->
                <g stroke="#1e5b7a" stroke-width="1.5" stroke-dasharray="5 3" opacity="0.85">
                  <line x1="58" y1="26" x2="408" y2="26" marker-end="url(#arrB)"/>
                  <line x1="48" y1="180" x2="408" y2="180" marker-end="url(#arrB)"/>
                </g>
                <text x="415" y="30" font-size="13" font-weight="700" fill="#1e5b7a" font-family="Cambria Math,serif">B</text>
                <text x="415" y="184" font-size="11.5" fill="#1e5b7a">轴向匀强磁场</text>

                <!-- 同轴单筒阳极 -->
                <ellipse cx="145" cy="103" rx="22" ry="54" fill="none" stroke="#536373" stroke-width="1.4" stroke-dasharray="4 3"/>
                <path d="M145,49 L345,49 A22,54 0 0,1 345,157 L145,157 A22,54 0 0,1 145,49 Z" fill="url(#cylOuter)" stroke="#3e4c5a" stroke-width="1.6"/>
                <ellipse cx="345" cy="103" rx="22" ry="54" fill="rgba(220,230,238,0.16)" stroke="#3e4c5a" stroke-width="1.6"/>
                <text x="368" y="61" font-size="11.5" font-weight="600" fill="#2e3b48">同轴单筒阳极</text>

                <!-- 中心灯丝 -->
                <line x1="88" y1="103" x2="395" y2="103" stroke="#9aa4ad" stroke-width="0.9" stroke-dasharray="3 3"/>
                <line x1="138" y1="103" x2="348" y2="103" stroke="rgba(242,180,65,0.42)" stroke-width="8" stroke-linecap="round"/>
                <line x1="138" y1="103" x2="348" y2="103" stroke="url(#filamentGlow)" stroke-width="3.2" stroke-linecap="round"/>
                <text x="86" y="94" font-size="11.5" font-weight="600" fill="#8d4109">中心钨丝</text>

                <!-- 径向电场箭头 E -->
                <line x1="205" y1="54" x2="205" y2="91" stroke="#1a7a56" stroke-width="1.8" marker-end="url(#arrE)"/>
                <text x="190" y="75" font-size="13" font-weight="700" fill="#1a7a56" font-family="Cambria Math,serif">E</text>
                <line x1="205" y1="152" x2="205" y2="115" stroke="#1a7a56" stroke-width="1.8" marker-end="url(#arrE)"/>

                <!-- 弧线电子轨迹 -->
                <path d="M 248 103 C 248 82 255 64 265 69 C 274 77 269 93 252 94" fill="none" stroke="#b85d19" stroke-width="2.2" marker-end="url(#arrElec)"/>
                <circle cx="248" cy="103" r="3" fill="#b85d19"/>
                <text x="275" y="88" font-size="11" font-weight="600" fill="#b85d19">电子偏转轨迹 e⁻</text>
              </svg>`;
}

export function worldsSVG(){
  return `<div class="macro-micro-strip">
                <div class="mm-box">
                  <svg width="42" height="32" viewBox="0 0 42 32">
                    <rect x="3" y="22" width="36" height="5" rx="1.5" fill="none" stroke="#1e5b7a" stroke-width="1.3"/>
                    <ellipse cx="14" cy="14" rx="4" ry="8" fill="none" stroke="#1e5b7a" stroke-width="1.4"/>
                    <ellipse cx="28" cy="14" rx="4" ry="8" fill="none" stroke="#1e5b7a" stroke-width="1.4"/>
                    <line x1="10" y1="14" x2="32" y2="14" stroke="#b85d19" stroke-width="1.5"/>
                  </svg>
                  <div>
                    <strong>3D 实验台</strong>
                    <small>调励磁、读电表、改接线</small>
                  </div>
                </div>

                <div class="mm-slogan">
                  从宏观看规律<br/>⇄<br/>进微观找原因
                </div>

                <div class="mm-box">
                  <svg width="36" height="32" viewBox="0 0 36 32">
                    <circle cx="18" cy="16" r="12" fill="none" stroke="#3e4c5a" stroke-width="1.4" stroke-dasharray="3 2"/>
                    <circle cx="18" cy="16" r="2.2" fill="#d4882a"/>
                    <path d="M18,16 Q26,9 29,16" fill="none" stroke="#b85d19" stroke-width="1.6"/>
                  </svg>
                  <div>
                    <strong>管内微观世界</strong>
                    <small>看电场、轨道与临界切点</small>
                  </div>
                </div></div>`;
}
