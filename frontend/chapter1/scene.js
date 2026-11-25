import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {idealTrajectory} from '../modules/ideal-physics.js';
import {createLabRoom} from './lab-room.js';
import {createTubeAssembly} from './tube-assembly.js';
import {createSceneLabels} from './scene-labels.js';
import {createCalibration} from '../chapter2/workstation.js';
import {makeCoilPack} from './coil-lod.js';
import {createInstrumentDisplays} from './instrument-displays.js';
import {createResearchScene} from '../chapters/research-scene.js';
const V=a=>new THREE.Vector3(...a),C=[-287.5,195,60];
const PART_LABELS={standby:'上排数字毫伏表（待机）',tube:'真空二极管',heater:'灯丝加热电源 CH3',accelerator:'加速电源 CH2',magnet:'励磁电源 CH1',resistor:'1 kΩ 取样电阻',meter:'数字毫伏表',coils:'亥姆霍兹线圈'};
const CAMERAS={tubeBench:{pos:[-80,345,450],target:[-285,190,60]},investigation:{pos:[400,430,750],target:[-25,110,-95]},standby:{pos:[362,260,70],target:[285,145,-220]},bench:{pos:[730,680,1080],target:[-5,120,-110]},tube:{pos:[-187,292,267],target:[-310,175,60]},calibration:{pos:[200,560,760],target:[-195,80,70]},coils:{pos:[65,435,440],target:[-280,175,60]},heater:{pos:[85,164,70],target:[35,52,-217]},accelerator:{pos:[48,164,70],target:[-13,52,-217]},magnet:{pos:[-14,164,70],target:[-62,52,-217]},resistor:{pos:[180,220,420],target:[125,45,140]},meter:{pos:[362,166,70],target:[285,50,-220]}};
const leadId=m=>{const ports=[m.from_port,m.to_port].filter(Boolean).join(' ');if(ports.includes('PSU.CH3'))return 'L1';if(ports.includes('DMM_A1'))return 'L3';if(ports.includes('COIL.')||ports.includes('PSU.CH1'))return 'L5';if(ports.includes('TUBE.A2')||ports.includes('PSU.CH2-'))return 'L4';return 'L2';};
function semantic(p){const m=p.metadata??{},n=m.name??p.name;
 if(m.from_port)return {lead:leadId(m)};
 if(/Anode|Guard|Cathode|玻璃|管基|管座/.test(n))return {part:'tube'};
 if(/DMM_A1/.test(n))return {part:'meter'};
 if(/COIL|Coil|线圈|铜绕组/.test(n))return {part:'coils'};
 if(/PSU|CH[123]/.test(n))return {part:'power'};
 if(/R1|电阻|Resistor/.test(n))return {part:'resistor'};
 return {};
}
function excluded(p){const m=p.metadata??{},n=m.name??p.name;
 return /Anode|GuardRing|CathodeFilament/.test(n)||
 /^(?:voltage_mV(?:001)?|CH[123](?:current|voltage))(?:_1)?$/.test(p.name)||
 /Display.*PSU.*mode/.test(n)||
 /DMM_A2\.INPUT|TUBE\.A2.*R2\.A|R1\.S.*R2\.S/.test(n)||
 (/Plug/.test(n)&&/R2\.|DMM_A2\.INPUT/.test(n));
}
export function createScene(container,{onPick=()=>{},onHover=()=>{},onAnchor=()=>{},onProgress=()=>{}}={}){
 const scene=new THREE.Scene();scene.background=new THREE.Color('#242c30');scene.fog=new THREE.Fog('#242c30',1900,4300);
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;container.appendChild(renderer.domElement);renderer.domElement.setAttribute('aria-label','可旋转的三维实验台');
 const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;scene.environmentIntensity=.23;pmrem.dispose();
 const camera=new THREE.PerspectiveCamera(38,1,5,7000),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;controls.minDistance=40;controls.maxDistance=2300;controls.maxPolarAngle=Math.PI*.49;
 scene.add(new THREE.HemisphereLight(0xe9f0f6,0x41434b,.55));
 for(const [i,[pos,intensity,color]] of [[[-950,1800,500],1.8,0xffead5],[[1000,1300,-400],.85,0xc5dcff],[[100,500,-650],1.15,0xd3e8ff]].entries()){const l=new THREE.DirectionalLight(color,intensity);l.position.set(...pos);if(i===0){l.castShadow=true;l.shadow.mapSize.set(2048,2048);Object.assign(l.shadow.camera,{left:-700,right:700,top:650,bottom:-650,near:100,far:4000});l.shadow.bias=-.00015;l.shadow.normalBias=.35;}scene.add(l);}
 const labRoom=createLabRoom(scene);
 const highlight=new THREE.Group(),tube=new THREE.Group(),field=new THREE.Group(),calibration=new THREE.Group(),screens=new THREE.Group(),accessories=new THREE.Group(),wires=new THREE.Group(),flow=new THREE.Group();scene.add(highlight,tube,field,calibration,screens,accessories,wires,flow);tube.position.set(...C);tube.scale.setScalar(1.8);
 const instrumentDisplays=createInstrumentDisplays(screens);
 const labels=document.createElement('div');labels.className='scene-labels';container.appendChild(labels);let labelNodes=[];
 const selectedLabel=document.createElement('span');selectedLabel.className='bench-selection';selectedLabel.hidden=true;labels.append(selectedLabel);
 let bench=null,directWire=null,mode='bench',power={heater:false,accelerator:false,magnet:false,current:0,reading:0},selected='',moving=null,layout=false,interaction=true,alive=true,lastTime=0,lastPowerKey='',hovered='',dragStart=null,dirty=true,electronDots=[],lit=[],flowStart=0;
 const wireRoutes=new Map(),wireMeshes=[];
 let lastOrbit=null;
 let viewProgress=0,modeTransition=null,pendingSelection=null,benchReturn=null;const environmentMaterials=new Map();
 const coilPacks=[];let structureHover=null,qualityLevel='medium';const hoverOverlay=new THREE.Group();scene.add(hoverOverlay);
 const assembly=createTubeAssembly(tube);tube.userData.filament=assembly.filament;tube.userData.glow=assembly.glow;tube.userData.paths=assembly.paths;
 const research=createResearchScene({tube,assembly,camera,controls,moveTo,labels,changed:()=>{dirty=true;}});
 const guardCircuit=new THREE.Group();scene.add(guardCircuit);guardCircuit.visible=false;
 const electricField=new THREE.Group();tube.add(electricField);electricField.visible=false;
 for(const x of [-10,0,10])for(const theta of [-.65,.65]){const radial=V([0,Math.sin(theta),Math.cos(theta)]),arrow=new THREE.ArrowHelper(radial.clone().negate(),radial.clone().multiplyScalar(4.1).add(V([x,0,0])),2.4,0xd79f87,.65,.35);arrow.line.material.transparent=arrow.cone.material.transparent=true;arrow.line.material.opacity=arrow.cone.material.opacity=.7;electricField.add(arrow);}
 const structureLabels=createSceneLabels(container,{onHover:id=>hoverStructure(id),onPick});
 const reference=new THREE.Group();scene.add(reference);const fadeCanvas=document.createElement('canvas');fadeCanvas.width=fadeCanvas.height=128;const fadeCtx=fadeCanvas.getContext('2d'),fade=fadeCtx.createRadialGradient(64,64,8,64,64,64);fade.addColorStop(0,'white');fade.addColorStop(1,'black');fadeCtx.fillStyle=fade;fadeCtx.fillRect(0,0,128,128);const fadeMap=new THREE.CanvasTexture(fadeCanvas);const referencePlane=new THREE.Mesh(new THREE.PlaneGeometry(500,500),new THREE.MeshStandardMaterial({color:0x2b333a,roughness:.92,metalness:.05,transparent:true,opacity:.9,alphaMap:fadeMap,depthWrite:false}));referencePlane.rotation.x=-Math.PI/2;referencePlane.position.set(C[0],C[1]-35,C[2]);referencePlane.receiveShadow=true;reference.add(referencePlane);const grid=new THREE.GridHelper(300,30,0x91a3ad,0x687e8c);grid.position.set(C[0],C[1]-34.9,C[2]);grid.material.transparent=true;grid.material.opacity=.23;reference.add(grid);reference.visible=false;
 const tubeLights=new THREE.Group();scene.add(tubeLights);
 const tubeLightTarget=new THREE.Object3D();tubeLightTarget.position.set(C[0]-12,C[1],C[2]);scene.add(tubeLightTarget);
 for(const [offset,intensity,color] of [[[30,160,110],.85,0xffe6c8],[[-80,75,-100],2.1,0xc6e1ff]]){const light=new THREE.DirectionalLight(color,intensity);light.position.copy(V(C)).add(V(offset));light.target=tubeLightTarget;light.userData.fullIntensity=intensity;light.intensity=0;tubeLights.add(light);}
 renderer.domElement.addEventListener('webglcontextrestored',()=>{dirty=true;renderer.shadowMap.needsUpdate=true;resize();});
 controls.addEventListener('change',()=>dirty=true);
 let calibrationModel=null,calPick=()=>{},calReady=()=>{};
 const pickables=[],parts=[],tubeShells=[],raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
 function label(text,position,parent=tube){const el=document.createElement('span');el.className='scene-label';el.textContent=text;labels.appendChild(el);labelNodes.push({el,position:V(position),parent});}
 function preset(key){const d=CAMERAS[key];if(key==='calibration'||(key==='bench'&&power.actualPoint)){const target=V(d.target);return {target:d.target,pos:target.clone().add(V(d.pos).sub(target).multiplyScalar(Math.max(1,(key==='bench'?1.15:.8)/camera.aspect))).toArray()};}if(key!=='tube')return d;const target=V(d.target),offset=V(d.pos).sub(target).multiplyScalar(Math.max(1,1.3/camera.aspect));return {pos:target.clone().add(offset).toArray(),target:d.target};}
 function moveTo(key,duration=1400){const dest=typeof key==='string'?preset(key):key;if(key==='tube')controls.target.copy(V(dest.target));moving={key:typeof key==='string'?key:null,start:performance.now(),duration,from:camera.position.clone(),fromTarget:controls.target.clone(),to:V(dest.pos),target:V(dest.target)};dirty=true;}
 function hoverStructure(id){if(id&&!assembly.parts.has(id))id=null;structureHover=id;assembly.setHover(id);structureLabels.hover(id);dirty=true;onHover(id?({anode:'中央阳极 A₁',guardLeft:'管座端保护环',guardRight:'封顶端保护环',filament:'钨灯丝',glass:'玻璃封接壳',support:'定心与绝缘支撑',tension:'张紧弹簧',base:'管座引出脚'}[id]||''):'',id);}
 function hoverScene(id){if(mode==='tube'){hoverStructure(id);return;}clearGroup(hoverOverlay);if(id&&mode==='bench')for(const p of parts){if(p.tag.part!==id&&p.tag.lead!==id&&!(p.tag.part==='power'&&['heater','accelerator','magnet'].includes(id)))continue;const wanted={heater:'CH3',accelerator:'CH2',magnet:'CH1'}[id];if(wanted&&/CH[123]/.test(p.name)&&!p.name.includes(wanted))continue;if(p.tag.lead&&!lit.includes(p.tag.lead))continue;const mat=new THREE.MeshBasicMaterial({color:0xe3c590,transparent:true,opacity:.14,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,side:THREE.DoubleSide});hoverOverlay.add(extract(p,mat));}dirty=true;}
 function setCameraNow(key){const d=preset(key);camera.position.set(...d.pos);controls.target.set(...d.target);controls.update();}
 setCameraNow('bench');
 function clearGroup(g){for(const c of [...g.children]){if(c.geometry)c.geometry.dispose();if(c.material){(Array.isArray(c.material)?c.material:[c.material]).forEach(m=>m.dispose());}g.remove(c);}}
 function extract(record,material){const g=new THREE.BufferGeometry();for(const [k,a] of Object.entries(record.mesh.geometry.attributes))g.setAttribute(k,a);g.setIndex(new THREE.BufferAttribute(record.original,1));const o=new THREE.Mesh(g,material);if(!record.unscaled)o.scale.setScalar(1000);return o;}
 function showSelection(id){selected=id;dirty=true;clearGroup(highlight);clearGroup(flow);if(!bench||mode!=='bench'||(id.startsWith('L')&&!lit.includes(id)))return;
  if(id.startsWith('L')){flowStart=performance.now();for(const route of wireRoutes.get(id)??[]){const curve=new THREE.CatmullRomCurve3(route),geometry=new THREE.TubeGeometry(curve,140,1.45,6,false),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xe6b75f,transparent:true,opacity:.9,depthWrite:false}));mesh.renderOrder=5;mesh.userData.total=geometry.index.count;flow.add(mesh);}}
  for(const p of parts){const match=p.tag.part===id||p.tag.lead===id||(p.tag.part==='power'&&['heater','accelerator','magnet'].includes(id));if(!match)continue;
   if(p.tag.part==='power'&&/CH[123]/.test(p.name)){const wanted={heater:'CH3',accelerator:'CH2',magnet:'CH1'}[id];if(wanted&&!p.name.includes(wanted))continue;}
   const mat=new THREE.MeshBasicMaterial({color:0xe8bd6c,transparent:true,opacity:p.tag.lead?.85:.16,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,side:THREE.DoubleSide});const mesh=extract(p,mat);mesh.renderOrder=4;highlight.add(mesh);
  }
 }
 function shadeEnvironment(progress){
  const dark=THREE.MathUtils.smoothstep(progress,.12,.76),brightness=THREE.MathUtils.lerp(1,.001,dark);
  for(const group of [labRoom.group,bench,wires,screens,...coilPacks])if(group)group.traverse(o=>{if(!o.isMesh)return;for(const material of Array.isArray(o.material)?o.material:[o.material]){if(!material.color)continue;if(!environmentMaterials.has(material))environmentMaterials.set(material,{color:material.color.clone(),emissive:material.emissiveIntensity,roughness:material.roughness});}});
  for(const [material,base] of environmentMaterials){material.color.copy(base.color).multiplyScalar(brightness);if(base.emissive!==undefined)material.emissiveIntensity=base.emissive*brightness;if(base.roughness!==undefined)material.roughness=THREE.MathUtils.lerp(base.roughness,1,dark);}
 }
 function applyViewProgress(){
  const p=viewProgress,environmentVisible=mode!=='calibration'&&p<.84;
  if(bench)bench.visible=environmentVisible;labRoom.setVisible(mode==='calibration'||environmentVisible);wires.visible=environmentVisible;screens.visible=mode==='calibration'||environmentVisible;
  for(const pack of coilPacks)pack.visible=environmentVisible;
  for(const {mesh,id} of wireMeshes)mesh.visible=environmentVisible&&lit.includes(id);
  tube.visible=mode!=='calibration';tube.scale.setScalar(THREE.MathUtils.lerp(1,1.8,THREE.MathUtils.smoothstep(p,.64,1)));
  for(const [id,meshes] of assembly.parts)for(const mesh of meshes)if(mesh.userData.importedMechanical||id==='tension')mesh.visible=mode!=='calibration';
  assembly.setReveal(p);shadeEnvironment(p);accessories.visible=mode==='calibration';
  const reveal=THREE.MathUtils.smoothstep(p,.55,.95);reference.visible=mode!=='calibration'&&reveal>0;referencePlane.material.opacity=.9*reveal;grid.material.opacity=.23*reveal;for(const light of tubeLights.children)light.intensity=light.userData.fullIntensity*reveal*(mode==='calibration'?0:1);
  structureLabels.setVisible(mode!=='calibration'&&p>.86&&!research.active);
  field.visible=mode!=='calibration'&&power.magnet&&(power.fieldMT??power.current)>0;electricField.visible=mode!=='calibration'&&p>.8&&power.accelerator;assembly.paths.visible=p>.78;
  scene.background.copy(new THREE.Color(mode==='calibration'?'#172733':'#91a9b2').lerp(new THREE.Color('#080d14'),THREE.MathUtils.smoothstep(p,.08,.75)));if(!scene.fog)scene.fog=new THREE.Fog('#b4c5cc',5000,9500);scene.fog.color.copy(scene.background);scene.fog.near=5000;scene.fog.far=9500;
  camera.near=THREE.MathUtils.lerp(5,.8,THREE.MathUtils.smoothstep(p,.76,1));camera.far=p>.84?1500:7000;camera.updateProjectionMatrix();
 }
 function setMode(next,{instant=false,overview=false}={}){
  if(!overview&&next===mode&&!modeTransition&&((next==='tube'&&viewProgress===1)||(next!=='tube'&&viewProgress===0))){if(instant)setCameraNow(next==='calibration'?'calibration':next);applyViewProgress();dirty=true;return Promise.resolve({mode:next});}
  const previous=mode;if(modeTransition){modeTransition.resolve({interrupted:true,mode:previous});modeTransition=null;}
  if(next==='tube'&&viewProgress<.001&&previous==='bench')benchReturn={pos:camera.position.toArray(),target:controls.target.toArray()};
  mode=next;moving=null;pendingSelection=null;dirty=true;hovered='';hoverStructure(null);structureLabels.select(null);clearGroup(highlight);clearGroup(flow);clearGroup(hoverOverlay);renderer.shadowMap.needsUpdate=true;
  calibration.visible=next==='calibration';if(next==='bench')calibrationModel?.park();
  controls.minDistance=35;controls.maxDistance=2300;controls.maxPolarAngle=Math.PI*.87;
  const targetProgress=next==='tube'?1:0,key=next==='tube'?'tube':next==='calibration'?'calibration':'bench';
  if(instant||next==='calibration'||previous==='calibration'){
   viewProgress=targetProgress;setCameraNow(key);controls.enabled=true;applyViewProgress();paintScreens();return Promise.resolve({mode:next});
  }
  const destination=next==='bench'&&!overview&&benchReturn?benchReturn:preset(key);
  const promise=new Promise(resolve=>{modeTransition={key,fromProgress:viewProgress,toProgress:targetProgress,from:camera.position.clone(),fromTarget:controls.target.clone(),to:V(destination.pos),target:V(destination.target),start:performance.now(),duration:1800*Math.max(.4,Math.abs(targetProgress-viewProgress)),resolve};});
  controls.enabled=false;applyViewProgress();paintScreens();return promise;
 }
 for(let z=-2;z<=2;z++){const arrow=new THREE.ArrowHelper(V([1,0,0]),V([C[0]-50,C[1]+z*7,C[2]-3]),100,0x75b6e6,4,1.8);arrow.line.material.transparent=arrow.cone.material.transparent=true;field.add(arrow);}

 // Radial symmetry of the ideal central-force orbit reflects the outgoing branch
 // about the radial turning axis; this shows its return without inventing a circle.
 function returnOrbit(result){if(result.outcome!=='turning')return result.points;const end=result.points.at(-1),angle=2*Math.atan2(end.yMm,end.xMm),c=Math.cos(angle),s=Math.sin(angle);return [...result.points,...result.points.slice(0,-1).reverse().map(p=>({xMm:c*p.xMm+s*p.yMm,yMm:s*p.xMm-c*p.yMm,tNs:2*end.tNs-p.tNs}))];}
 function paintScreens(){instrumentDisplays.paint(power,mode);}
 function setPower(next){power={...power,...next};dirty=true;paintScreens();field.visible=mode!=='calibration'&&power.magnet&&(power.fieldMT??power.current)>0;electricField.visible=mode==='tube'&&power.accelerator;
  const key=[power.heater,power.accelerator,power.magnet,(power.fieldMT??power.current*4.23).toFixed(5),power.trajectoryVoltage??10].join('/');if(key!==lastPowerKey){lastPowerKey=key;clearGroup(tube.userData.paths);electronDots=[];if(power.heater&&power.accelerator){const result=idealTrajectory({voltageV:power.trajectoryVoltage??10,anodeRadiusMm:4.55,filamentRadiusUm:37.5,fieldMT:power.magnet?(power.fieldMT??power.current*4.23):0});lastOrbit=result;const orbitPoints=returnOrbit(result);for(const [j,x] of [-12,-6,0,6,12].entries()){const points=orbitPoints.map(p=>V([x,p.xMm,p.yMm]));const line=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),Math.min(240,points.length),.045,5,false),new THREE.MeshBasicMaterial({color:0xffce77,toneMapped:false}));tube.userData.paths.add(line);const bead=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffefd0,toneMapped:false}));tube.userData.paths.add(bead);electronDots.push({bead,points,phase:j*.17});}}}
  for(const arrow of field.children){arrow.line.material.opacity=arrow.cone.material.opacity=.2+.7*Math.min(1,(power.fieldMT??power.current*4.23)/6);}
 }
 const select=(id,{focus=true}={})=>{if(modeTransition){pendingSelection={id,focus};return;}if(mode==='tube'){selected=id;structureLabels.select(id);hoverStructure(id);const anchor=assembly.anchors.get(id);if(anchor&&focus){const center=tube.localToWorld(anchor.clone());moveTo({target:center.toArray(),pos:center.clone().add(V(['glass','base','support'].includes(id)?[60,95,310]:[35,48,115])).toArray()},1250);}return;}showSelection(id);if(mode==='bench'&&focus){if(id.startsWith('L')){const ends={L1:[[36,60,-220],C],L2:[[0,60,-220],[70,50,135]],L3:[[285,55,-220],[70,50,135]],L4:[[10,55,-220],C],L5:[[-60,55,-220],[-280,190,60]]}[id];const center=V(ends[0]).add(V(ends[1])).multiplyScalar(.5);moveTo({target:center.toArray(),pos:center.clone().add(V([300,360,550])).toArray()});}else moveTo(id==='tube'?CAMERAS.tubeBench:CAMERAS[id]??CAMERAS.bench);}};
 function worldVisible(o){while(o){if(!o.visible)return false;o=o.parent;}return true;}
 function instrumentAt(point){
  const {x,y,z}=point;
  if(z<=-219&&z>=-485&&x>=170&&x<=400&&y>=0&&y<=183)return {part:y>=92.5?'standby':'meter'};
  if(z<=-219&&z>=-485&&x>=-115&&x<=105&&y>=0&&y<=100)return {part:x< -38?'magnet':x<11?'accelerator':'heater'};
  return null;
 }
 function hit(event){const rect=renderer.domElement.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(mouse,camera);
  if(mode==='tube'){const hits=raycaster.intersectObjects(assembly.pickables.filter(worldVisible),false);const opaque=hits.find(h=>h.object.userData.structurePart!=='glass');const h=opaque||hits[0];return h?{part:h.object.userData.structurePart}:null;}
  const hits=raycaster.intersectObjects([...pickables.filter(worldVisible),...coilPacks.filter(worldVisible),...assembly.pickables.filter(worldVisible)],true);
  let transparentTag=null;for(const h of hits){if(h.object.userData.structurePart)return {part:'tube'};if(h.object.userData.coilProxy)return {part:'coils'};if(h.object.userData.directLead)return {lead:'L4'};const list=h.object.userData.pickParts??[],p=list.find(p=>h.faceIndex>=p.start&&h.faceIndex<p.start+p.count);if(!p){if(!h.object.material?.transparent)return instrumentAt(h.point)??transparentTag;continue;}let tag={...p.tag};if(tag.part==='power')tag.part=h.point.x< -38?'magnet':h.point.x<11?'accelerator':'heater';if(tag.part||tag.lead){if(h.object.material.transparent&&h.object.material.opacity<.5){transparentTag ||=tag;continue;}return tag;}if(!h.object.material.transparent)return instrumentAt(h.point)??transparentTag;}return transparentTag;
 }
 renderer.domElement.addEventListener('pointerdown',e=>{dragStart=[e.clientX,e.clientY];moving=null;});
 renderer.domElement.addEventListener('pointermove',e=>{if(!interaction)return;if(mode==='calibration'){hit(e);renderer.domElement.style.cursor=calibrationModel?.pick(raycaster)?'pointer':'grab';return;}const h=hit(e),id=h?.part??h?.lead??'';if(id!==hovered){hovered=id;renderer.domElement.style.cursor=id?'pointer':'grab';if(mode==='tube')hoverStructure(id||null);else {hoverScene(id||null);onHover(id?PART_LABELS[id]??'': '',id||null);}}});
 renderer.domElement.addEventListener('pointerleave',()=>{hovered='';hoverStructure(null);structureLabels.select(null);clearGroup(hoverOverlay);});
 renderer.domElement.addEventListener('pointerup',e=>{const start=dragStart;dragStart=null;if(!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>6||!interaction)return;if(mode==='calibration'){hit(e);const tag=calibrationModel?.pick(raycaster);if(tag)calPick(tag);return;}const h=hit(e);if(h)onPick(h);});
 function rebuildMesh(mesh){const original=mesh.geometry.index?.array??Uint32Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i);const kept=[];let start=0;const mappings=[];
  for(const p of mesh.userData.parts??[]){const indices=original.slice(p.firstTriangle*3,(p.firstTriangle+p.triangleCount)*3);instrumentDisplays.capture(mesh,indices,p.metadata?.name??p.name);if(excluded(p)){
    const name=p.metadata?.name??p.name;
    if(/DMM_A2\.INPUT|TUBE\.A2.*R2\.A|R1\.S.*R2\.S/.test(name)||(/Plug/.test(name)&&/R2\.|DMM_A2\.INPUT/.test(name))){const object=extract({mesh,original:indices},mesh.material.clone());guardCircuit.add(object);}
    continue;}const tag=semantic(p),record={mesh,original:indices,name:p.metadata?.name??p.name,tag};parts.push(record);if(assembly.importPart(record)){parts.pop();continue;}
   if(/漆包铜线/.test(mesh.material.name)){const position=mesh.geometry.attributes.position,bounds=new THREE.Box3();for(const index of indices)bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,index).multiplyScalar(1000));const pack=makeCoilPack(bounds.getCenter(new THREE.Vector3()));pack.position.y=190;pack.position.z=60;coilPacks.push(pack);scene.add(pack);parts.pop();continue;}
   if(p.metadata?.from_port){const wire=extract(record,new THREE.MeshStandardMaterial({color:0x78878a,roughness:.6}));wire.userData.pickParts=[{start:0,count:p.triangleCount,tag}];wires.add(wire);pickables.push(wire);wireMeshes.push({mesh:wire,id:tag.lead});try{const route=JSON.parse(p.metadata.route_design_local_m).map(([x,y,z])=>V([x*1000,z*1000,-y*1000]));if(!wireRoutes.has(tag.lead))wireRoutes.set(tag.lead,[]);wireRoutes.get(tag.lead).push(route);}catch{}continue;}
   if(/铜绕组包/.test(record.name)){parts.pop();continue;}
   for(const v of indices)kept.push(v);mappings.push({start,count:p.triangleCount,tag});start+=p.triangleCount;}
  mesh.geometry.setIndex(kept);mesh.geometry.computeBoundingSphere();mesh.userData.pickParts=mappings;pickables.push(mesh);mesh.material=mesh.material.clone();mesh.castShadow=!mesh.material.transparent;mesh.receiveShadow=true;if(/漆包铜线|铜绕组/.test(mesh.material.name))mesh.material.roughness=Math.max(.5,mesh.material.roughness);if(mesh.material.transparent){mesh.material.depthWrite=false;}
 }
 let benchLoad;
 function loadBench(){return benchLoad??=new GLTFLoader().loadAsync('./assets/bench_optimized.glb',e=>onProgress(e.total?e.loaded/e.total:Math.min(.9,e.loaded/46e6))).then(async gltf=>{
  bench=gltf.scene;bench.scale.setScalar(1000);bench.traverse(o=>{if(o.isMesh&&o.userData.parts)rebuildMesh(o);});scene.add(bench);instrumentDisplays.build();
  const route=[[-308.5,233,120],[-337,233,120],[-350,100,150],[-210,12,195],[100,12,195],[125,34,-160],[94,34,-183.4]].map(V);const direct=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(route),110,1.05,8,false),new THREE.MeshStandardMaterial({color:0x78878a,roughness:.5}));directWire=direct;direct.userData.directLead=true;scene.add(direct);pickables.push(direct);parts.push({mesh:direct,original:direct.geometry.index.array,tag:{lead:'L4'},name:'directA2',unscaled:true});wireMeshes.push({mesh:direct,id:'L4'});if(!wireRoutes.has('L4'))wireRoutes.set('L4',[]);wireRoutes.get('L4').push(route);setLit(lit);
  calibrationModel=createCalibration(calibration,{extract,parts,accessories,onProbeReady:ready=>calReady(ready),changed:()=>{dirty=true;renderer.shadowMap.needsUpdate=true;}});calibrationModel.park();calibration.visible=false;
  setPower(power);applyViewProgress();renderer.shadowMap.needsUpdate=true;onProgress(1);await renderer.compileAsync(scene,camera);return true;
 },error=>{benchLoad=null;throw error;});}
 function resize(){const w=container.clientWidth,h=container.clientHeight;if(!w||!h)return;const nextAspect=w/h;const previous=camera.aspect;const size=renderer.getSize(new THREE.Vector2());if(size.x!==w||size.y!==h)renderer.setSize(w,h);camera.aspect=nextAspect;if(modeTransition?.key==='tube'){const dest=preset('tube');modeTransition.to=V(dest.pos);modeTransition.target=V(dest.target);}else if(mode==='tube'&&moving?.key==='tube'){const dest=preset('tube');moving.to=V(dest.pos);moving.target=V(dest.target);}else if(mode==='tube'&&!power.actualPoint&&!modeTransition&&previous&&Math.abs(previous-nextAspect)>.01){const offset=camera.position.clone().sub(controls.target).multiplyScalar(Math.max(1,1.3/nextAspect)/Math.max(1,1.3/previous));camera.position.copy(controls.target).add(offset);}camera.updateProjectionMatrix();camera.updateMatrixWorld();dirty=true;renderer.render(scene,camera);}
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(container);resize();
 const project=p=>{const q=V(p).project(camera);return [(q.x+1)*container.clientWidth/2,(-q.y+1)*container.clientHeight/2,q.z];};
 function setLit(ids){lit=ids;for(const wire of wireMeshes){wire.mesh.visible=mode==='bench'&&lit.includes(wire.id);wire.mesh.material.color.set(0x43515a);}dirty=true;}
 function frame(time){if(!alive)return;requestAnimationFrame(frame);if(document.hidden)return;if(!dirty&&time-lastTime<1000/(mode==='bench'?40:50))return;lastTime=time;
  if(modeTransition){const tr=modeTransition,u=Math.min(1,(time-tr.start)/tr.duration),a=u*u*(3-2*u),targetEase=1-Math.pow(1-u,3);viewProgress=THREE.MathUtils.lerp(tr.fromProgress,tr.toProgress,a);camera.position.lerpVectors(tr.from,tr.to,a);camera.position.y+=Math.sin(Math.PI*a)*Math.min(45,tr.from.distanceTo(tr.to)*.045);controls.target.lerpVectors(tr.fromTarget,tr.target,targetEase);applyViewProgress();dirty=true;if(u===1){modeTransition=null;controls.enabled=true;controls.minDistance=mode==='tube'?35:80;controls.maxDistance=mode==='tube'?650:2300;controls.maxPolarAngle=mode==='tube'?Math.PI*.87:Math.PI*.49;renderer.shadowMap.needsUpdate=true;tr.resolve({mode});if(pendingSelection){const next=pendingSelection;pendingSelection=null;select(next.id,{focus:next.focus});}}}
  if(moving){const t=Math.min(1,(time-moving.start)/moving.duration),a=t*t*(3-2*t);camera.position.lerpVectors(moving.from,moving.to,a);camera.position.y+=Math.sin(Math.PI*a)*Math.min(60,moving.from.distanceTo(moving.to)*.08);controls.target.lerpVectors(moving.fromTarget,moving.target,a);if(t===1)moving=null;}
  if(mode!=='tube'&&calibrationModel?.tick(.025,camera)){dirty=true;renderer.shadowMap.needsUpdate=true;}controls.update();const animateElectrons=power.heater||assembly.filament.material.emissiveIntensity>.01,animateFlow=flow.children.length&&time-flowStart<1600;if(!dirty&&!moving&&!modeTransition&&!animateElectrons&&!animateFlow&&!assembly.glassMoving)return;dirty=false;camera.zoom=1;camera.clearViewOffset();
  guardCircuit.visible=mode==='bench'&&power.guardEnabled===true;if(power.guardEnabled===true&&directWire)directWire.visible=false;
  research.tick(time,container.clientWidth,container.clientHeight);if(research.active){structureLabels.setVisible(false);electricField.visible=false;field.visible=false;}
  assembly.setHeater(power.heater,.025);if(!modeTransition&&viewProgress===1)assembly.updateGlass(structureHover==='glass'?.18:power.actualPoint?.035:.075,.025);for(const pack of coilPacks)if(pack.visible)pack.update(camera);
  camera.updateMatrixWorld();tube.updateMatrixWorld(true);if(mode==='tube')structureLabels.update(camera,tube,assembly.anchors,power);
  for(const line of flow.children){const t=Math.min(1,(time-flowStart)/700);line.geometry.setDrawRange(0,Math.floor(line.userData.total*t/6)*6);line.material.opacity=Math.max(0,.9-(time-flowStart-700)/800);}
  if(animateElectrons)for(const {bead,points,phase} of electronDots){const f=((time/2400+phase)%1)*(points.length-1),i=Math.floor(f);bead.position.lerpVectors(points[i],points[Math.min(i+1,points.length-1)],f-i);}
  camera.updateMatrixWorld();tube.updateMatrixWorld(true);for(const l of labelNodes){const p=l.parent.localToWorld(l.position.clone()).project(camera);l.el.style.transform=`translate(-50%,-50%) translate(${(p.x+1)*container.clientWidth/2}px,${(-p.y+1)*container.clientHeight/2}px)`;l.el.hidden=mode!=='tube'||p.z>1;}
  selectedLabel.hidden=mode!=='bench'||!PART_LABELS[selected]||power.actualPoint;
  if(mode==='bench'&&selected){const anchor={heater:[36,140,-200],accelerator:[-13,140,-200],magnet:[-62,140,-200],meter:[307,86,-220],coils:[-280,330,60],resistor:[125,105,140],tube:[-287,228,60]}[selected]??controls.target.toArray();const p=project(anchor);onAnchor(p);if(!selectedLabel.hidden){selectedLabel.textContent=PART_LABELS[selected];selectedLabel.style.left=THREE.MathUtils.clamp(p[0],95,container.clientWidth-95)+'px';selectedLabel.style.top=THREE.MathUtils.clamp(p[1],18,container.clientHeight-65)+'px';}}
  renderer.render(scene,camera);
 }
 requestAnimationFrame(frame);
 return {research(options={}){if(options.enabled!==undefined){research.enable(options.enabled);if(!options.enabled){assembly.paths.visible=true;setPower({guardEnabled:undefined,guardReading:undefined});setLit(lit);applyViewProgress();}}if(Object.hasOwn(options,'geometry'))research.setGeometry(options.geometry);if(Object.hasOwn(options,'follow'))research.setFollow(options.follow);if(options.cutoff)research.setCutoff(...options.cutoff);if(Object.hasOwn(options,'trace'))research.setTrace(options.trace,options.counter??null,options.traceOptions??{});if(Object.hasOwn(options,'field'))research.setField(options.field);if(Object.hasOwn(options,'population'))research.setPopulation(options.population);if(Object.hasOwn(options,'cooling'))research.setCooling(options.cooling);if(options.time!==undefined)research.setTime(options.time);if(options.focus!==undefined)research.focus(options.focus==='near');},attachViewport(next){resizeObserver.unobserve(container);container=next;container.prepend(renderer.domElement);container.append(labels);structureLabels.attachViewport(container);resizeObserver.observe(container);resize();},setCalibration(next,callback,readyCallback){calPick=callback??calPick;calReady=readyCallback??calReady;calibrationModel?.update(next);setPower({heater:false,accelerator:false,magnet:next.current>0,current:next.current,coilVoltage:next.current*40,actualPoint:false,fieldMT:null,trajectoryVoltage:10});},calibrationDebug:()=>calibrationModel?.debug(),get ready(){return loadBench();},setMode,setPower,setLit,select,focusOrbit(){if(mode!=='tube')return;structureLabels.select(null);moveTo({target:C,pos:V(C).add(V([42,24,64])).toArray()},1100);},hover(id){hoverScene(id);},setLayout(value){layout=Number(value)||0;resize();},reset(){moveTo(mode==='tube'?'tube':mode==='calibration'?'calibration':'bench');},quality(q){qualityLevel=q;renderer.setPixelRatio(q==='high'?Math.min(Math.max(devicePixelRatio,1.5),2):q==='low'?1:Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=q!=='low';renderer.shadowMap.needsUpdate=true;resize();},setInteraction(v){interaction=v;},project,get transitioning(){return Boolean(modeTransition);},debug(){return {research:research.debug(),mode,transitioning:Boolean(modeTransition),viewProgress,parts:parts.length,power:{...power},orbit:lastOrbit?{outcome:lastOrbit.outcome,...lastOrbit.diagnostics}:null,camera:camera.position.toArray(),target:controls.target.toArray(),drawing:renderer.info.render,displays:instrumentDisplays.debug(),selected,pixelRatio:renderer.getPixelRatio(),lit};},dispose(){alive=false;instrumentDisplays.dispose();if(modeTransition)modeTransition.resolve({interrupted:true});resizeObserver.disconnect();controls.dispose();structureLabels.dispose();labels.remove();const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const mat of Array.isArray(o.material)?o.material:[o.material])materials.add(mat);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();scene.environment?.dispose();renderer.dispose();renderer.domElement.remove();}};
}
