import * as THREE from 'three';

const windows = ['8808A 显示窗', '8246B 显示窗', 'ITECH 显示窗'];
const slots = {
  voltage_mV: {window: windows[0], kind: 'meter'},
  voltage_mV001: {window: windows[1], kind: 'standby'},
  ...Object.fromEntries([1, 2, 3].flatMap(channel => ['voltage', 'current'].map(quantity =>
    [`CH${channel}${quantity}`, {window: windows[2], channel, quantity}]))),
};
const segments = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'];

function drawDigits(canvas, value) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!value) return;
  const count=Math.max(4,value.replace('.', '').length);
  const characters = value.replace('.', '').padStart(count, ' ');
  const decimalAfter = value.includes('.') ? count - value.split('.')[1].length : -1;
  ctx.save();ctx.scale(8/count, 2);
  const horizontal = y => [[18,y],[76,y],[83,y+6],[76,y+12],[18,y+12],[11,y+6]];
  const vertical = (x,y) => [[x+6,y],[x+12,y+7],[x+12,y+65],[x+6,y+72],[x,y+65],[x,y+7]];
  const shapes = {a:horizontal(4),b:vertical(78,14),c:vertical(78,94),d:horizontal(166),e:vertical(4,94),f:vertical(4,14),g:horizontal(85)};
  for (let i=0; i<count; i++) {
    const x=10+i*117, active=characters[i]==='-'?'g':segments[Number(characters[i])]??'';
    if (characters[i]===' ') continue;
    for (const [name, points] of Object.entries(shapes)) {
      ctx.fillStyle=active.includes(name)?'#e2fff4':'rgba(94,156,139,.10)';
      ctx.beginPath();points.forEach(([px,py],j)=>j?ctx.lineTo(x+px,py+6):ctx.moveTo(x+px,py+6));ctx.closePath();ctx.fill();if(active.includes(name)){ctx.lineWidth=3;ctx.strokeStyle='#e2fff4';ctx.stroke();}
    }
    if(i+1===decimalAfter){ctx.fillStyle='#e2fff4';ctx.beginPath();ctx.arc(x+105,177,7,0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();
}

// Only the changing digits are replaced. The source glass, units, model names and bezel remain.
export function createInstrumentDisplays(group) {
  const bounds=new Map(), displays=[];
  function capture(mesh, indices, name) {
    if(!slots[name]&&!windows.includes(name)) return;
    const box=new THREE.Box3(),position=mesh.geometry.attributes.position,p=new THREE.Vector3();
    for(const index of indices) box.expandByPoint(p.fromBufferAttribute(position,index).multiplyScalar(1000));
    bounds.set(name,box);
  }
  function build() {
    for(const [name,slot] of Object.entries(slots)) {
      const digits=bounds.get(name),glass=bounds.get(slot.window);
      if(!digits||!glass) continue;
      const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=384;
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const size=digits.getSize(new THREE.Vector3()),center=digits.getCenter(new THREE.Vector3());
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size.x,size.y),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false}));
      mesh.position.set(center.x,center.y,glass.max.z+.08);mesh.renderOrder=2;group.add(mesh);
      displays.push({name,slot,canvas,texture,mesh,last:null,glassZ:glass.max.z});
    }
  }
  function paint(power, mode) {
    for(const d of displays) {
      const {kind,channel,quantity}=d.slot;
      let value='';
      if(kind==='meter'&&mode!=='calibration') {
        const reading=power.heater&&power.accelerator?power.reading:0;
        value=reading===0?'0.000':reading.toFixed(2);
      } else if(kind==='standby'&&mode!=='calibration'&&power.guardEnabled!==undefined) {
        value=power.guardEnabled?(power.guardReading??0).toFixed(3):'----';
      } else if(channel) {
        const enabled=channel===1?power.magnet:mode!=='calibration'&&(channel===2?power.accelerator:power.heater);
        if(enabled) {
          const number=quantity==='current'?(channel===1?power.current:channel===3?(power.filamentCurrent??.6):0):channel===1?(power.coilVoltage??0):channel===2?(power.acceleratingVoltage??10):(power.filamentVoltage??3.68);
          value=number.toFixed(power.actualPoint?3:2);
        }
      }
      if(value===d.last) continue;
      d.last=value;drawDigits(d.canvas,value);d.texture.needsUpdate=true;
    }
  }
  return {capture,build,paint,debug:()=>displays.map(d=>({name:d.name,position:d.mesh.position.toArray(),glassZ:d.glassZ,value:d.last})),dispose(){displays.forEach(d=>d.texture.dispose());}};
}
