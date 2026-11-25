import * as T from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {makeCoilPack} from '../chapter1/coil-lod.js';
const V=a=>new T.Vector3(...a), C=[-280,195,60], R=113.5;
export function createCalibration(group,{extract,parts,accessories,changed,onProbeReady=()=>{}}){
 const metal=new T.MeshStandardMaterial({color:0x303d46,metalness:.65,roughness:.4}),black=new T.MeshStandardMaterial({color:0x111923,roughness:.55}),silver=new T.MeshStandardMaterial({color:0xb3bcc1,metalness:.72,roughness:.32});
 const red=new T.MeshStandardMaterial({color:0xa94737,roughness:.55});
 const pickables=[],coils=[],movingParts=[],holes=[],field=new T.Group(),leads=new T.Group();group.add(field,leads);
 const box=(size,pos,mat,parent=group,round=0)=>{const o=new T.Mesh(round?new RoundedBoxGeometry(...size,3,round):new T.BoxGeometry(...size),mat);o.position.set(...pos);o.castShadow=o.receiveShadow=true;parent.add(o);return o;};
 const path=(pts,mat,r=1.3,parent=group)=>{const o=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts.map(p=>Array.isArray(p)?V(p):p)),48,r,8,false),mat);parent.add(o);return o;};
 const clear=g=>{for(const c of [...g.children]){c.traverse(o=>{o.geometry?.dispose();if(g===field&&o.material)o.material.dispose();});g.remove(c);}};
 // Copy the complete source assembly. Only the tube box and its cables leave the bench.
 // Generic key/label names belong to the instruments too; a PSU/DMM name whitelist loses them.
 const movingSources=[{sign:-1,origin:-330,pattern:/Coil_左|左.*(?:励磁端子|端子支架)|COIL\.L/},{sign:1,origin:-230,pattern:/Coil_右|右.*(?:励磁端子|端子支架)|COIL\.R/}];
 for(const item of movingSources){const g=new T.Group();g.position.x=C[0]+item.sign*R/2;group.add(g);movingParts.push({...item,g});const pack=makeCoilPack(V([0,190,60]));g.add(pack);coils.push(pack);pack.traverse(o=>{if(o.isMesh){o.userData.calPick={control:'circuit'};pickables.push(o);}});}
 const retained=[];
 const sourceBounds=record=>{const bounds=new T.Box3(),position=record.mesh.geometry.attributes.position,v=new T.Vector3();for(const index of record.original)bounds.expandByPoint(v.fromBufferAttribute(position,index).multiplyScalar(record.unscaled?1:1000));return bounds;};
 const tubeBounds=new T.Box3();for(const record of parts)if(/^TubeAssembly/.test(record.name))tubeBounds.union(sourceBounds(record));tubeBounds.expandByScalar(25);
 for(const record of parts){
  const n=record.name;
  if(record.tag.lead||/^(?:TubeAssembly|管盒|管座固定|端子背面|玻璃顶内壁)/.test(n)||/TubeSupport.*橡皮筋/.test(n)||(/^Plug/.test(n)&&!/COIL\.|PSU\.CH1/.test(n)))continue;
  if(!/^(?:Coil|TubeSupport|Apparatus)|励磁端子|端子支架|透明承托平台/.test(n)&&tubeBounds.containsBox(sourceBounds(record)))continue;
  const o=extract(record,record.mesh.material.clone());o.castShadow=!o.material.transparent;o.receiveShadow=true;
  const moving=movingParts.find(item=>item.pattern.test(n));
  if(moving){o.position.x=-moving.origin;moving.g.add(o);o.userData.calPick={control:'circuit'};}
  else {group.add(o);if(record.tag.part==='power')o.userData.calPick={control:'power'};}
  if(!o.material.transparent||o.userData.calPick)pickables.push(o);
  retained.push(n);
 }
 // The original transparent support, posts, rail, engraved scales and fasteners stay intact.
 const positions=[[-31,-32],[31,-32],[0,0],[-31,32],[31,32]];
 function textSprite(text){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#102835';ctx.beginPath();ctx.arc(64,64,56,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#b7e1eb';ctx.lineWidth=4;ctx.stroke();ctx.fillStyle='#f0f9ff';ctx.font='bold 75px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,64,68);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;const s=new T.Sprite(new T.SpriteMaterial({map:tex,depthTest:false,transparent:true}));s.scale.set(20,20,1);s.renderOrder=10;return s;}

 for(const [i,[x,z]] of positions.entries()){
  const target=V([C[0]+x,180,C[2]+z]);const ring=new T.Mesh(new T.TorusGeometry(4.5,.7,6,32),new T.MeshBasicMaterial({color:0x8ebcc8}));ring.rotation.x=Math.PI/2;ring.position.copy(target);group.add(ring);
  const hit=new T.Mesh(new T.SphereGeometry(11,12,8),new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false}));hit.position.copy(target);hit.userData.calPick={hole:i};group.add(hit);pickables.push(hit);
  const label=textSprite(String(i+1));label.position.copy(target).add(V([0,14,0]));label.userData.calPick={hole:i};pickables.push(label);group.add(label);holes.push({ring,label,target});
 }
 const meter=new T.Group();meter.position.set(-80,0,210);meter.rotation.x=-1.12;accessories.add(meter);
 box([75,140,24],[0,0,0],new T.MeshStandardMaterial({color:0x077db9,roughness:.4,metalness:.15}),meter,7);
 box([68,128,5],[0,0,-13],black,meter,5);
 const panel=box([62,65,1],[0,-25,12.5],new T.MeshStandardMaterial({color:0xc7d8da,roughness:.7}),meter,3);
 const mc=document.createElement('canvas');mc.width=768;mc.height=1300;const mx=mc.getContext('2d'),mt=new T.CanvasTexture(mc);mt.colorSpace=T.SRGBColorSpace;mt.anisotropy=8;
 const face=new T.Mesh(new T.PlaneGeometry(68,128),new T.MeshBasicMaterial({map:mt,toneMapped:false}));face.position.z=13.2;meter.add(face);face.userData.calPick={control:'meter'};pickables.push(face);
 box([12,13,14],[0,72,0],black,meter,3);
 // Position the entire tilted enclosure above the source tabletop (y = 0).
 meter.updateMatrixWorld(true);const meterBounds=new T.Box3().setFromObject(meter);meter.position.y+=1-meterBounds.min.y;meter.updateMatrixWorld(true);
 const socket=meter.localToWorld(V([0,78,0]));
 const standTop=[-25,25].map(x=>meter.localToWorld(V([x,42,-16])));
 for(const top of standTop)path([top,[top.x,2,top.z-23],[top.x,2,top.z-3]],black,1.8,accessories);
 const probe=new T.Group();accessories.add(probe);
 box([10,56,10],[0,48,0],black,probe,3);box([2.8,42,5],[0,0,0],new T.MeshStandardMaterial({color:0x18332e,roughness:.5}),probe);box([2,4,7],[0,-23,0],black,probe);box([2.2,1.5,7.2],[0,-25,0],new T.MeshStandardMaterial({color:0xb9dce0,metalness:.5,roughness:.3}),probe);
 const cap=box([9,53,12],[-80,61,90],black,accessories,2);cap.userData.calPick={control:'cap'};pickables.push(cap);
 const capRest=V([-12,5,200]);
 box([45,8,65],[-80,4,95],metal,accessories,3);box([12,20,14],[-80,18,80],black,accessories);
 const park=V([-80,64,90]);probe.position.copy(park);let destination=park.clone(),capTarget=false,capMotion=null,model={},previous='',cable=null,wireKey='',lastMeter='',lastReady=null;
 function probeIsReady(){return !capMotion&&capTarget&&model.activeHole!=null&&probe.position.distanceTo(destination)<.5;}
 function liveReading(){return probeIsReady()?model.reading:null;}
 function reportProbe(){const ready=probeIsReady();if(ready===lastReady)return;lastReady=ready;queueMicrotask(()=>onProbeReady(ready));}
 function paint(){const value=liveReading(),signature=[model.meterOn,value].join();if(signature===lastMeter)return;lastMeter=signature;
  mx.fillStyle='#087eb9';mx.fillRect(0,0,768,1300);mx.fillStyle='#bed7dc';mx.fillRect(55,70,658,390);mx.fillStyle='#e0eeee';mx.fillRect(80,92,608,340);mx.fillStyle='#183a50';mx.font='48px Arial';mx.fillText(model.meterOn?(value==null?'--':value<0?'S':'N'):'',110,155);mx.textAlign='right';mx.font='bold 139px monospace';mx.fillText(model.meterOn?(value==null?'--.--':Math.abs(value).toFixed(2)):'',650,315);mx.font='40px Arial';mx.fillText('mT',645,392);mx.textAlign='left';mx.fillStyle='#d5e5e8';mx.fillRect(55,540,658,650);mx.fillStyle='#213d4e';mx.fillRect(90,620,588,410);
  for(const [label,x,y,color] of [['ON/OFF',110,655,'#bd413c'],['ZERO',300,655,'#248bac'],['HOLD',490,655,'#248bac'],['RANGE',110,855,'#248bac'],['mT/Gs',490,855,'#248bac']]){mx.fillStyle=color;mx.fillRect(x,y,160,115);mx.strokeStyle='#d9f2ff';mx.lineWidth=3;mx.strokeRect(x,y,160,115);mx.fillStyle='white';mx.font='bold 24px Arial';mx.fillText(label,x+14,y+65);}
  mx.fillStyle='#235874';mx.font='bold 35px Arial';mx.fillText('TESLAMETER',100,1138);mt.needsUpdate=true;
 }
 // A single shell is lifted clear, pulled along the probe axis, and laid on the tabletop.
 function animateCap(removed){
  const start=probe.position.clone(),lifted=start.clone().add(V([0,60,0])),attached=lifted.clone().add(V([0,-3,0])),extracted=lifted.clone().add(V([0,-63,0]));
  const via=V([capRest.x-18,Math.max(60,extracted.y*.6),capRest.z-25]);
  const key=(t,p,c,angle)=>({t,p:p.clone(),c:c.clone(),angle});
  const initial=key(0,start,cap.position,cap.rotation.z);
  const keys=removed?[initial,key(.24,lifted,attached,0),key(.48,lifted,extracted,0),key(.76,destination,via,Math.PI/3),key(1,destination,capRest,Math.PI/2)]
   :[initial,key(.20,lifted,cap.position,cap.rotation.z),key(.48,lifted,via,Math.PI/3),key(.70,lifted,extracted,0),key(.86,lifted,attached,0),key(1,destination,destination.clone().add(V([0,-3,0])),0)];
  capTarget=removed;capMotion={keys,elapsed:0,duration:removed?.95:1.1};
 }
 function advanceCap(dt){
  if(!capMotion)return false;
  const motion=capMotion;motion.elapsed=Math.min(motion.duration,motion.elapsed+dt);const t=motion.elapsed/motion.duration,last=motion.keys.at(-1);
  last.p.copy(destination);if(!capTarget)last.c.copy(destination).add(V([0,-3,0]));
  const end=motion.keys.findIndex(k=>k.t>=t),a=motion.keys[Math.max(0,end-1)],b=motion.keys[Math.max(1,end)];
  const u=T.MathUtils.smoothstep(t,a.t,b.t);probe.position.lerpVectors(a.p,b.p,u);cap.position.lerpVectors(a.c,b.c,u);cap.rotation.z=T.MathUtils.lerp(a.angle,b.angle,u);
  if(t===1)capMotion=null;return true;
 }
 function fieldAt(x,r,d,mode){let bx=0,br=0;for(const [cx,sgn] of [[-d/2,mode==='right'?0:1],[d/2,mode==='left'?0:mode==='oppose'?-1:1]]){if(!sgn)continue;for(let j=0;j<40;j++){const a=(j+.5)*Math.PI*2/40,co=Math.cos(a),si=Math.sin(a),dx=x-cx,dy=r-R*co,dz=-R*si,den=(dx*dx+dy*dy+dz*dz+1)**1.5;bx+=sgn*(R*R-R*r*co)/den;br+=sgn*R*co*dx/den;}}return [bx,br];}
 function fieldLines(){clear(field);if(!model.showFieldLines||!model.current)return;const d=model.dRatio*R,mode=model.wireMode;
  const seeds=mode==='oppose'?[-1,1].flatMap(s=>[15,40,70].map(r=>[s*d/2,r])):[18,42,67,86].map(r=>[0,r]);
  for(const seed of seeds){const halves=[];for(const direction of [-1,1]){let [x,r]=seed;const pts=[];for(let step=0;step<180;step++){pts.push([x,r]);const b=fieldAt(x,r,d,mode),l=Math.hypot(...b);if(l<1e-7)break;const mid=fieldAt(x+direction*2*b[0]/l,r+direction*2*b[1]/l,d,mode),ml=Math.hypot(...mid);if(ml<1e-8)break;x+=direction*4*mid[0]/ml;r+=direction*4*mid[1]/ml;if(Math.abs(x)>235||r>175||r<1)break;}halves.push(pts);}const pts=[...halves[0].reverse(),...halves[1].slice(1)];if(pts.length<3)continue;
   for(const angle of [.2,1.9,3.35,5]){const points=pts.map(([x,r])=>V([C[0]+x,C[1]+r*Math.cos(angle),C[2]+r*Math.sin(angle)])),line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0x6db8dd,transparent:true,opacity:model.exploring?.55:.18,depthWrite:false}));field.add(line);const n=Math.floor(points.length*.55),arrow=new T.ArrowHelper(points[n+1].clone().sub(points[n]).normalize(),points[n],10,0x8dd1e7,4,2);arrow.line.material.transparent=arrow.cone.material.transparent=true;arrow.line.material.opacity=arrow.cone.material.opacity=model.exploring?.7:.23;field.add(arrow);}
  }
 }
 function rebuildLeads(){clear(leads);const x0=movingParts[0].g.position.x,x1=movingParts[1].g.position.x,port=(x,j)=>[x+61,59,j===0?124:112],positive=[80,34,-183.4],negative=[80,15,-183.4],routes=[];
  const left=model.wireMode!=='right',right=model.wireMode!=='left';if(left)routes.push([positive,[80,34,-163],[-100,20,-110],port(x0,0)]);else routes.push([positive,[80,34,-163],[-100,20,-110],port(x1,0)]);
  if(left&&right){routes.push([port(x0,1),[C[0],39,160],port(x1,model.wireMode==='oppose'?1:0)]);routes.push([port(x1,model.wireMode==='oppose'?0:1),[-120,18,130],[80,15,-163],negative]);}else routes.push([port(left?x0:x1,1),[-120,18,130],[80,15,-163],negative]);
  routes.forEach((r,i)=>path(r,i===0?red:black,1.5,leads));
 }
 function update(next){model={...model,...next};const key=[model.wireMode,model.dRatio,model.showFieldLines,model.exploring,!!model.current].join();if(key!==previous){previous=key;fieldLines();}field.traverse(o=>{if(o.material)o.material.opacity=(model.exploring?.55:.18)*Math.min(1.6,Math.sqrt((model.current||0)/.5));});
  for(const {g,sign} of movingParts)g.userData.targetX=C[0]+sign*R*model.dRatio/2;
  destination=model.activeHole==null?park.clone():holes[model.activeHole].target.clone().add(V([0,28,0]));
  if(Boolean(model.capRemoved)!==capTarget)animateCap(Boolean(model.capRemoved));
  holes.forEach((h,i)=>h.ring.material.color.set(i===model.activeHole?0xf2c17b:model.measured?.[i]!=null?0x88d9be:0x8ebcc8));reportProbe();paint();changed();
 }
 function tick(dt,camera){let active=false;for(const {g} of movingParts){const t=g.userData.targetX??g.position.x;if(Math.abs(t-g.position.x)>.01){g.position.x=T.MathUtils.damp(g.position.x,t,9,dt);active=true;}}const wk=movingParts.map(p=>p.g.position.x.toFixed(1)).join()+model.wireMode;if(wk!==wireKey){wireKey=wk;rebuildLeads();}
  if(capMotion){advanceCap(dt);active=true;}
  else {
   if(probe.position.distanceTo(destination)>.05){probe.position.lerp(destination,1-Math.exp(-(model.fast?25:10)*dt));active=true;}
   if(capTarget){cap.position.copy(capRest);cap.rotation.z=Math.PI/2;}
   else {cap.position.copy(probe.position).add(V([0,-3,0]));cap.rotation.z=0;}
  }
  if(active||!cable){if(cable){cable.geometry.dispose();accessories.remove(cable);}const p=probe.position.clone().add(V([0,77,0]));cable=path([socket,[-25,105,160],[p.x+55,p.y+28,p.z+38],p],black,1.2,accessories);}
  reportProbe();paint();coils.forEach(c=>c.update(camera));return active;
 }
 return {park(){update({meterOn:false,capRemoved:false,activeHole:null,showFieldLines:false,current:0,dRatio:1,wireMode:'aiding'});probe.position.copy(park);capMotion=null;capTarget=false;cap.position.copy(park).add(V([0,-3,0]));cap.rotation.z=0;if(cable){cable.geometry.dispose();accessories.remove(cable);cable=null;}},update,tick,pick(ray){const hits=ray.intersectObjects(pickables,true);return (hits.find(h=>h.object.isSprite)??hits[0])?.object.userData.calPick;},pickables,holes,debug:()=>({positions:holes.map(h=>h.target.toArray()),coilX:movingParts.map(p=>p.g.position.x),probe:probe.position.toArray(),capPosition:cap.position.toArray(),capMoving:Boolean(capMotion),capBottom:new T.Box3().setFromObject(cap).min.y,probeReady:probeIsReady(),reading:liveReading(),readout:!model.meterOn?'':liveReading()==null?'--.--':Math.abs(liveReading()).toFixed(2),polarity:!model.meterOn?'':liveReading()==null?'--':liveReading()<0?'S':'N',accessoriesVisible:accessories.visible,meterBottom:new T.Box3().setFromObject(meter).min.y,retained})};
}
