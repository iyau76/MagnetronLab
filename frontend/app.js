import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';


export async function mountExplorer(container,{onRecord}={}){
container.innerHTML=await(await fetch("./modules/explore.html")).text();
const $=id=>container.querySelector("#"+id);
const colors=['#b45f53','#147e79','#c98433','#7e739b','#728486','#8a867e'];
const names=['返回阴极','中央阳极 A₁','保护环 A₂','轴向离开计算区域','到时限仍在飞行','无法到达收集电极'];
let params,defaults,pointData,scanData,previousScan,referenceData,view='internal',plotMode='current',busy=false,dirty=false,playing=true,animationTime=0;
let needsRender=true,viewportVisible=true,lastRender=0,flightDuration=0,movingInstances,activeJobId=null,cancelRequested=false,workerReady=false;
const viewport=$('viewport'),scene=new THREE.Scene();scene.background=new THREE.Color('#eaece6');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;renderer.localClippingEnabled=true;viewport.appendChild(renderer.domElement);
const camera=new THREE.PerspectiveCamera(40,1,.01,20000);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.08;
controls.addEventListener('change',()=>needsRender=true);
new IntersectionObserver(entries=>{viewportVisible=entries[0].isIntersecting;needsRender=true;}).observe(viewport);
document.addEventListener('visibilitychange',()=>{needsRender=true;lastRender=performance.now();});
scene.add(new THREE.HemisphereLight(0xffffff,0x73817d,2.7));
for(const [pos,power] of [[[20,45,50],3],[[-30,0,-20],1.5]]){const light=new THREE.DirectionalLight(0xffffff,power);light.position.set(...pos);scene.add(light);}
const internal=new THREE.Group(),fieldArrows=new THREE.Group(),trajectoryGroup=new THREE.Group();scene.add(internal,fieldArrows);
let tubeRig=new THREE.Group(),bench,labels=[],movingDots=[];
const steel=new THREE.MeshStandardMaterial({color:'#769d9c',metalness:.55,roughness:.31,side:THREE.DoubleSide});
const guardMat=new THREE.MeshStandardMaterial({color:'#b99364',metalness:.58,roughness:.35,side:THREE.DoubleSide});
const filamentMat=new THREE.MeshStandardMaterial({color:'#e7b36b',emissive:'#925528',emissiveIntensity:.35,roughness:.5});

function disposeGroup(group){group.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)o.geometry.dispose();if(o.userData.ownMaterial)o.material.dispose();});group.clear();}
function label(text,position,color,parent){const el=document.createElement('div');el.className='label3d';el.textContent=text;el.style.borderColor=color;$('labels').appendChild(el);labels.push({el,position:new THREE.Vector3(...position),parent:parent||tubeRig});}
function hollowTube(length,inner,outer,start,end,material){
 const positions=[],normals=[],indices=[],steps=96;
 // Each radial boundary is closed; four faces per angular segment.
 function quad(a,b,c,d){const k=positions.length/3;positions.push(...a,...b,...c,...d);indices.push(k,k+1,k+2,k,k+2,k+3);}
 for(let i=0;i<steps;i++){let a=start+(end-start)*i/steps,b=start+(end-start)*(i+1)/steps;
  const p=(x,r,t)=>[x,r*Math.cos(t),r*Math.sin(t)];
  quad(p(-length/2,outer,a),p(length/2,outer,a),p(length/2,outer,b),p(-length/2,outer,b));
  quad(p(-length/2,inner,b),p(length/2,inner,b),p(length/2,inner,a),p(-length/2,inner,a));
  for(const x of [-length/2,length/2])quad(p(x,inner,a),p(x,outer,a),p(x,outer,b),p(x,inner,b));
 }
 if(end-start<2*Math.PI-.01){for(const t of [start,end])quad([-length/2,inner*Math.cos(t),inner*Math.sin(t)],[length/2,inner*Math.cos(t),inner*Math.sin(t)],[length/2,outer*Math.cos(t),outer*Math.sin(t)],[-length/2,outer*Math.cos(t),outer*Math.sin(t)]);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return new THREE.Mesh(g,material);
}
function potentialColor(t){const stops=['#275a90','#55aaaf','#e1ca71','#d77c36'];t=Math.max(0,Math.min(.9999,t));let q=t*3,i=Math.floor(q);return new THREE.Color(stops[i]).lerp(new THREE.Color(stops[i+1]),q-i);}
function cathodePotential(x){const mean=params.filament_V/2,drop=params.gradient?params.filament_V:0;return mean+drop*x/params.length_mm;}
function potentialAt(x,radius){const r=params.filament_radius_um/1000,R=params.anode_radius_mm,uc=cathodePotential(x);return uc+(params.anode_V-uc)*Math.log(radius/r)/Math.log(R/r);}
function potentialContours(levels){
 // 等势线：在 (轴向 x, 半径 ρ) 平面上对解析电势做 marching squares。
 const L=params.length_mm,r=params.filament_radius_um/1000,R=params.anode_radius_mm;
 const nx=140,nr=48,positions=[],xs=[],rs=[];
 for(let i=0;i<=nx;i++)xs.push(-L/2+L*i/nx);
 for(let j=0;j<=nr;j++)rs.push(r*Math.pow(R/r,j/nr));
 for(const level of levels){
  for(let i=0;i<nx;i++)for(let j=0;j<nr;j++){
   const corners=[[xs[i],rs[j]],[xs[i+1],rs[j]],[xs[i+1],rs[j+1]],[xs[i],rs[j+1]]];
   const values=corners.map(([x,radius])=>potentialAt(x,radius)-level),crossings=[];
   for(let k=0;k<4;k++){
    const a=corners[k],b=corners[(k+1)%4],va=values[k],vb=values[(k+1)%4];
    if((va<0)!==(vb<0)){const t=va/(va-vb);crossings.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
   }
   if(crossings.length===2)for(const side of [-1,1])positions.push(crossings[0][0],side*crossings[0][1],.018,crossings[1][0],side*crossings[1][1],.018);
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 const lines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x243642,transparent:true,opacity:.62}));lines.userData.ownMaterial=true;lines.renderOrder=3;tubeRig.add(lines);
 return lines;
}
function fieldLevels(){
 // 每 1 V 一条等势线；电压高时改 2 V，线条不至于挤在一起。
 const step=params.anode_V>8?2:1,levels=[];
 for(let v=step;v<params.anode_V-1e-6;v+=step)levels.push(v);
 return levels;
}
function setFieldMode(on){
 // 电势图打开时把电极改成中性灰，画面里只留电势色与等势线，避免和金属的青金色混在一起。
 const neutral=on?'#ccd2cf':null;
 for(const [material,natural] of [[steel,'#769d9c'],[guardMat,'#b99364']]){material.color.set(neutral||natural);material.metalness=on?.12:.55;material.roughness=on?.62:.33;}
 filamentMat.color.set(on?'#8d9296':'#e7b36b');filamentMat.emissiveIntensity=on?.05:.35;
}
function potentialMap(){
 const L=params.length_mm,R=params.anode_radius_mm,r=params.filament_radius_um/1000,pos=[],cols=[],idx=[];
 const mean=params.filament_V/2,drop=params.gradient?params.filament_V:0;
 const minimum=params.gradient?0:mean,maximum=Math.max(params.anode_V,params.gradient?params.filament_V:mean);
 for(const side of [-1,1]){
  let base=pos.length/3;
  for(let i=0;i<=48;i++)for(let j=0;j<=30;j++){
   const x=L*(i/48-.5),radius=r*Math.pow(R/r,j/30),uc=mean+drop*x/L;
   const phi=uc+(params.anode_V-uc)*Math.log(radius/r)/Math.log(R/r);
   pos.push(x,side*radius,.015);const color=potentialColor((phi-minimum)/(maximum-minimum));cols.push(color.r,color.g,color.b);
  }
  for(let i=0;i<48;i++)for(let j=0;j<30;j++){let a=base+i*31+j;idx.push(a,a+31,a+1,a+1,a+31,a+32);}
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.setIndex(idx);g.computeVertexNormals();
 const mesh=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.5,side:THREE.DoubleSide,depthWrite:false}));mesh.userData.ownMaterial=true;tubeRig.add(mesh);
 potentialGroup=new THREE.Group();potentialGroup.add(mesh);
 const contours=potentialContours(fieldLevels());potentialGroup.remove(contours);potentialGroup.add(contours);
 tubeRig.remove(mesh);tubeRig.add(potentialGroup);
 contours.userData.storyOpacity=.62;
 label(`阳极 ${params.anode_V.toFixed(1)} V`,[L*.5-3,R*1.05,0],'#8a5a24');
 label(`阴极 ${minimum.toFixed(2)} V`,[-L*.5+4,r+1.2,0],'#2c5f80');
 potentialLabels=labels.slice(-2);
 $('vmin').textContent=minimum.toFixed(2);$('vmax').textContent=maximum.toFixed(2);
}
// ── 结构拆解动画 ─────────────────────────────────────────────
// 一条循环播放的分镜：实验台 → 推进到线圈 → 加磁场 → 隐去周边 → 只剩真空管
// → 取下玻璃罩 → 剖开收集筒 → 露出灯丝 → 电势分布 → 电子轨迹 → 收起 → 拆开。
// 每段用一组 0–1 的连续参数插值，镜头在关键机位之间平移。
// 线圈位置取自照片重建模型（单位 mm）：轴向沿 x，一对线圈相距一个半径。
const COIL={x:-275,y:193,z:60,radius:120};
// 照片重建里那根真实真空管：玻璃罩半径 16 mm、长约 75 mm，轴向沿 x。
// Scale the display tube to the bench model for the camera transition.
const BENCH_TUBE={x:-287,y:195,z:60,scale:3.2};
const REAL_TUBE_MATERIALS=/玻璃 · 0.6|玻璃内壁|钨丝|白瓷绝缘|酚醛树脂 · 管基/;
const CAMERA_KEYS={
 bench:{pos:[905,1203,1690],target:[COIL.x,COIL.y,COIL.z],near:20,far:10000,min:120,max:4500},
 coil:{pos:[COIL.x+330,COIL.y+250,COIL.z+400],target:[COIL.x,COIL.y,COIL.z],near:20,far:10000,min:120,max:2600},
 tube:{pos:[BENCH_TUBE.x+8,BENCH_TUBE.y+42,BENCH_TUBE.z+126],target:[BENCH_TUBE.x,BENCH_TUBE.y,BENCH_TUBE.z],near:.5,far:10000,min:30,max:2600}};
const STORY=[
 {id:'overview',ms:2400,caption:'完整实验台 · 707 同型装置外观参照'},
 {id:'approach',ms:3400,caption:'推进到亥姆霍兹线圈',cam:['bench','coil']},
 {id:'field',ms:2200,caption:'加上轴向磁场：磁感线穿过真空管',to:{field:1}},
 {id:'isolate',ms:2200,caption:'隐去电源、导线与台面，只留线圈和真空管',to:{bench:0}},
 {id:'unfield',ms:2800,caption:'镜头推到真空管上，隐去线圈与磁场',cam:['coil','tube'],to:{coil:0,bench:0,field:0,arrows:0}},
 {id:'arrive',ms:2000,caption:'就地换成虚拟真空管：按真实几何重建',enter:'internal',to:{tube:1,realtube:0}},
  {id:'glass',ms:2600,caption:'取下玻璃罩，露出保护环与中央阳极',to:{glass:0}},
 {id:'cut',ms:2600,caption:'剖开收集筒',to:{cut:1}},
 {id:'filament',ms:2000,caption:'灯丝是轴上的一根细丝，两端为 K 与 H'},
 {id:'potential',ms:2800,caption:'灯丝与阳极之间的电势分布',to:{potential:1},enter:'potential'},
 {id:'trajectory',ms:4000,caption:'电子从灯丝发出，在磁场中弯折',to:{trajectory:1}},
 {id:'clear',ms:2200,caption:'收起轨迹与电势',to:{trajectory:0,potential:0}},
 {id:'explode',ms:3000,caption:'保护环、中央阳极与灯丝分开',to:{explode:1}},
 {id:'return',ms:3200,caption:'回到实验台，循环播放',cam:['tube','bench'],enter:'bench'},
];
const STORY_START={bench:1,coil:1,realtube:1,field:0,arrows:1,tube:0,glass:1,cut:0,potential:0,trajectory:1,explode:0};
const story={playing:false,armed:false,pausedAt:0,index:0,startedAt:0,from:{...STORY_START},state:{...STORY_START},camera:null};
let tubeParts=[],filamentMesh=null,glassMesh=null,potentialGroup=null,trajectoryMaterials=[],potentialLabels=[];
function storyCameraAt(key){return {pos:[...key.pos],target:[...key.target]};}
function applyStoryCamera(next){
 const {pos,target,near,far,min,max}=CAMERA_KEYS[next]?{...CAMERA_KEYS[next]}:next;
 camera.near=near;camera.far=far;camera.position.set(...pos);controls.target.set(...target);
 controls.minDistance=min;controls.maxDistance=max;camera.updateProjectionMatrix();controls.update();
}
async function storyStart(){
 // 动画第一段就是实验台，先把模型准备好，否则开头是一片空场。
 await ensureBench();
 story.armed=true;story.pausedAt=0;story.playing=true;story.index=0;story.startedAt=performance.now();
 story.from={...STORY_START};story.state={...STORY_START};
 story.camera=storyCameraAt(CAMERA_KEYS.bench);
 view='explode';container.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view==='explode'));
 container.classList.add('is-story');
 if(bench)bench.visible=true;
 helmholtz.visible=false;
 setStoryCheckboxes(false,false);
 rebuildTube();
 // 先把镜头摆到全景机位，否则第一段会停在进入动画前的位置上。
 applyStoryCamera(CAMERA_KEYS.bench);
 onStoryClip(STORY[0]);
 applyStoryFrame();
}
function storyPause(){
 // 记住停在这一段的什么位置；恢复时把时间基准挪回去，就不会从头开始。
 story.pausedAt=Math.min(performance.now()-story.startedAt,STORY[story.index].ms);
 story.playing=false;
}
function storyResume(){
 story.playing=true;story.startedAt=performance.now()-story.pausedAt;
}
function storyStop(){
 story.playing=false;story.armed=false;story.pausedAt=0;
}
function storyHome(){
 // 离开结构拆解视图时才把虚拟真空管放回原点、恢复原始尺度。
 // 暂停时不能搬——镜头还停在真实真空管那儿，搬走就只剩空场。
 internal.position.set(0,0,0);internal.scale.setScalar(1);
}
function setStoryCheckboxes(potential,cutaway){
 $('potential').checked=potential;$('cutaway').checked=cutaway;
 $('trajectories').checked=true;$('fieldLines').checked=false;$('coilsOnly').checked=false;
}
function onStoryClip(clip){
 $('storyCaption').textContent=clip.caption;
 if(clip.enter==='internal'){
  if(bench)bench.visible=false;helmholtz.visible=false;
 }
 if(clip.enter==='potential'){setStoryCheckboxes(true,true);rebuildTube();}
 if(clip.enter==='bench'){
  // 循环回到开头：场景整个复位，只留镜头飞行，避免台面与真空管在过渡里叠影。
  story.from={...STORY_START};story.state={...STORY_START};
  setStoryCheckboxes(false,false);rebuildTube();
  if(bench)bench.visible=true;helmholtz.visible=false;
 }
}
function applyStoryFrame(){
 const s=story.state;
 if(bench){
  bench.visible=s.bench>0.01||s.coil>0.01||s.realtube>0.01;
  bench.traverse(object=>{
   if(!object.isMesh||!object.material)return;
   const materials=Array.isArray(object.material)?object.material:[object.material];
   let visible=s.bench;
   for(const material of materials){
    if(!material)continue;
    const name=material.name||'';
    const channel=COIL_MATERIALS.test(name)?s.coil:REAL_TUBE_MATERIALS.test(name)?s.realtube:s.bench;
    visible=Math.max(visible===s.bench?channel:visible,channel);
    const base=material.userData.storyBase??(material.userData.storyBase=material.opacity??1);
    material.transparent=channel<.999||base<1;material.opacity=base*channel;material.depthWrite=channel>.5&&base>=1;
   }
   // 只靠材质透明度会漏掉实例化与多材质的零件，逐网格再设一次可见性最稳。
   object.visible=visible>0.02;
  });
 }
 if(glassMesh){glassMesh.visible=s.glass>0.01;glassMesh.material.opacity=.16*s.glass;}
 internal.position.set(BENCH_TUBE.x,BENCH_TUBE.y,BENCH_TUBE.z);
 internal.scale.setScalar(BENCH_TUBE.scale);
 // 可见性一律由分镜状态决定；rebuildTube 在动画期间不再插手，否则会把台面/真空管改回去。
 internal.visible=s.tube>0.5;
 fieldArrows.visible=s.tube>0.5&&s.arrows>0.01;
 fieldArrows.traverse(o=>{if(o.material){o.material.transparent=true;o.material.opacity=s.arrows;}});
 if(potentialGroup){potentialGroup.visible=s.potential>0.01;potentialGroup.traverse(o=>{if(o.material)o.material.opacity=(o.userData.storyOpacity??1)*s.potential;});}
 for(const item of potentialLabels)item.storyHidden=s.potential<0.4;
 $('fieldKey').hidden=s.potential<0.4||view==='bench';
 setFieldMode(s.potential>0.4);
 if(trajectoryGroup){trajectoryGroup.visible=s.trajectory>0.01;for(const [material,base] of trajectoryMaterials){material.opacity=base*s.trajectory;material.transparent=true;}}
 for(const part of tubeParts)part.mesh.position.x=part.baseX+part.direction*params.length_mm*.30*s.explode;
 if(filamentMesh)filamentMesh.position.y=-params.anode_radius_mm*1.7*s.explode;
 needsRender=true;
}
function storyJump(index){
 index=Math.max(0,Math.min(STORY.length-1,index));
 story.index=index;story.startedAt=performance.now();story.pausedAt=0;story.armed=true;
 const state={...STORY_START};
 for(let i=0;i<index;i++)if(STORY[i].to)Object.assign(state,STORY[i].to);
 story.from={...state};story.state={...state};
 const enters=STORY.slice(0,index+1).map(c=>c.enter).filter(Boolean);
 const inTube=enters.lastIndexOf('internal')>enters.lastIndexOf('bench');
 if(bench)bench.visible=!inTube;
 helmholtz.visible=false;
 setStoryCheckboxes(state.potential>0.5,state.cut>0.5);
 rebuildTube();
 applyStoryCamera(CAMERA_KEYS[inTube?'tube':'bench']);
 onStoryClip(STORY[index]);
 applyStoryFrame();
}
function tickStory(now){
 if(!story.playing)return;
 let clip=STORY[story.index],t=(now-story.startedAt)/clip.ms;
 while(t>=1){
  story.index=(story.index+1)%STORY.length;
  story.startedAt+=clip.ms;
  story.from={...story.state};
  clip=STORY[story.index];t=(now-story.startedAt)/clip.ms;
  onStoryClip(clip);
 }
 const k=THREE.MathUtils.smoothstep(t,0,1);
 if(clip.to)for(const [key,value] of Object.entries(clip.to))story.state[key]=story.from[key]+(value-story.from[key])*k;
 if(clip.cam){
  const a=CAMERA_KEYS[clip.cam[0]],b=CAMERA_KEYS[clip.cam[1]];
  const pos=a.pos.map((v,i)=>v+(b.pos[i]-v)*k),target=a.target.map((v,i)=>v+(b.target[i]-v)*k);
  applyStoryCamera({pos,target,near:a.near+(b.near-a.near)*k,far:a.far+(b.far-a.far)*k,min:a.min+(b.min-a.min)*k,max:a.max+(b.max-a.max)*k});
 }
 if(document.activeElement!==$('storySeek'))$('storySeek').value=String(story.index);
 applyStoryFrame();
}
function rebuildTube(){
 needsRender=true;
 disposeGroup(internal);disposeGroup(fieldArrows);labels=[];$('labels').replaceChildren();movingDots=[];
 tubeParts=[];filamentMesh=null;glassMesh=null;potentialGroup=null;trajectoryMaterials=[];
 tubeRig=new THREE.Group();internal.add(tubeRig);tubeRig.rotation.z=-THREE.MathUtils.degToRad(params.tilt_deg);
 const L=params.length_mm,C=params.central_mm,R=params.anode_radius_mm,G=(L-C)/2,exploded=view==='explode'&&!story.playing,cut=$('cutaway').checked||(story.playing&&story.state.cut>.5);
 for(const [id,len,x,mat] of [['A₁',C,0,steel],['A₂ · H 侧',G,-(C+G)/2,guardMat],['A₂ · K 侧',G,(C+G)/2,guardMat]]){
  let mesh=hollowTube(len,R,R+.3,cut?Math.PI:0,2*Math.PI,mat);mesh.position.x=x+(exploded?Math.sign(x)*L*.30:0);tubeRig.add(mesh);
  tubeParts.push({mesh,baseX:mesh.position.x,direction:Math.sign(x)});
  label(id,[mesh.position.x,R+1.5,0],mat===steel?colors[1]:colors[2]);
 }
 const filamentRadius=Math.max(params.filament_radius_um/1000,.32);
 const filament=new THREE.Mesh(new THREE.CylinderGeometry(filamentRadius,filamentRadius,L,16),filamentMat);filament.rotation.z=Math.PI/2;filament.position.y=exploded?-R*1.7:0;tubeRig.add(filament);filamentMesh=filament;
 label('灯丝（直径放大）· H → K',[0,exploded?-R*1.7:-R-1.9,0],'#a77035');
 // 玻璃罩：只在拆解动画里出现，独立材质以便整段淡出。
 const glassMaterial=new THREE.MeshPhysicalMaterial({color:'#dfeaf0',transparent:true,opacity:.22,roughness:.06,metalness:0,side:THREE.DoubleSide,depthWrite:false});
 glassMaterial.userData.ownMaterial=true;
 glassMesh=new THREE.Mesh(new THREE.CylinderGeometry(R+.55,R+.55,L,48,1,true),glassMaterial);
 glassMesh.rotation.z=Math.PI/2;glassMesh.visible=story.playing&&story.state.glass>0.01;tubeRig.add(glassMesh);
 const grid=new THREE.GridHelper(L*2,16,0xbec9c1,0xd7ded7);grid.userData.ownMaterial=true;grid.position.y=-R*2.5;internal.add(grid);
 for(let i=0;i<3;i++){const arrow=new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(-L*.65,R*2+i*.7,-R),L*1.3,0x668ca1,L*.07,L*.025);arrow.line.userData.ownMaterial=true;arrow.cone.userData.ownMaterial=true;fieldArrows.add(arrow);}
 label('B',[L*.78,R*2.2,-R],'#4d7f96',fieldArrows);
 const showPotential=$('potential').checked&&(!exploded||story.playing);
 setFieldMode(showPotential);
 if(showPotential)potentialMap();
 $('fieldKey').hidden=!showPotential||view==='bench';
 if(!story.playing){internal.visible=view!=='bench';fieldArrows.visible=view!=='bench'&&!exploded;}
 if(pointData&&!dirty)buildPaths();
 updateSceneCaption();
}
function buildPaths(){
 disposeGroup(trajectoryGroup);tubeRig.add(trajectoryGroup);movingDots=[];animationTime=0;
 const count=pointData.paths.length,positions=[],vertexColors=[],matrix=new THREE.Matrix4();
 const endpoints=new THREE.InstancedMesh(new THREE.SphereGeometry(.10,8,6),new THREE.MeshBasicMaterial(),count);
 movingInstances=new THREE.InstancedMesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial(),count);
 endpoints.userData.ownMaterial=true;movingInstances.userData.ownMaterial=true;
 movingInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);movingInstances.frustumCulled=false;
 pointData.paths.forEach((path,index)=>{
  const color=new THREE.Color(colors[path.outcome]);
  for(let j=1;j<path.points.length;j++){positions.push(...path.points[j-1].slice(0,3),...path.points[j].slice(0,3));vertexColors.push(color.r,color.g,color.b,color.r,color.g,color.b);}
  endpoints.setMatrixAt(index,matrix.makeTranslation(...path.points.at(-1).slice(0,3)));endpoints.setColorAt(index,color);
  movingInstances.setMatrixAt(index,matrix.makeTranslation(...path.points[0].slice(0,3)));movingInstances.setColorAt(index,color);
  movingDots.push({index,path,cursor:1});
 });
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(vertexColors,3));
 const lines=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.64}));lines.userData.ownMaterial=true;
 trajectoryGroup.add(lines,endpoints,movingInstances);flightDuration=Math.max(...pointData.paths.map(p=>p.flight_ns))+4;
 trajectoryMaterials=[[lines.material,.64],[endpoints.material,1],[movingInstances.material,1]];
 needsRender=true;
 trajectoryGroup.visible=$('trajectories').checked;
}
function home(){
 if(view==='bench'){camera.near=20;camera.far=10000;camera.position.set(905,1203,1690);controls.target.set(COIL.x,COIL.y,COIL.z);controls.minDistance=120;controls.maxDistance=4500;}
 else{camera.near=.05;camera.far=500;const scale=Math.max(params.length_mm/20,params.anode_radius_mm/4.55);camera.position.set(17*scale,17*scale,35*scale);controls.target.set(0,0,0);controls.minDistance=8;controls.maxDistance=220;}
 camera.updateProjectionMatrix();
 controls.update();
}
// ── 亥姆霍兹线圈的磁场可视化 ─────────────────────────────────
const helmholtz=new THREE.Group();helmholtz.visible=false;scene.add(helmholtz);
let helmholtzBuilt=false;
function buildHelmholtz(){
 if(helmholtzBuilt)return;helmholtzBuilt=true;
 const R=COIL.radius,N=64,loops=[COIL.x-R/2,COIL.x+R/2],segments=[];
 for(const x0 of loops)for(let i=0;i<N;i++){
  const t0=2*Math.PI*i/N,t1=2*Math.PI*(i+1)/N;
  segments.push([x0,COIL.y+R*Math.cos(t0),COIL.z+R*Math.sin(t0),x0,COIL.y+R*Math.cos(t1),COIL.z+R*Math.sin(t1)]);
 }
 // 两个圆环的比奥–萨伐尔叠加；只关心方向与相对强弱，常数略去。
 function field(p,out){
  let bx=0,by=0,bz=0;
  for(const [ax,ay,az,ex,ey,ez] of segments){
   const mx=(ax+ex)/2,my=(ay+ey)/2,mz=(az+ez)/2;
   const rx=p[0]-mx,ry=p[1]-my,rz=p[2]-mz,r2=rx*rx+ry*ry+rz*rz;
   if(r2<1)continue;
   const inv=1/(r2*Math.sqrt(r2)),dx=ex-ax,dy=ey-ay,dz=ez-az;
   bx+=(dy*rz-dz*ry)*inv;by+=(dz*rx-dx*rz)*inv;bz+=(dx*ry-dy*rx)*inv;
  }
  const mag=Math.hypot(bx,by,bz)||1e-12;
  if(out){out[0]=bx/mag;out[1]=by/mag;out[2]=bz/mag;}
  return mag;
 }
 const center=[COIL.x,COIL.y,COIL.z],reference=field(center,null);
 function streamline(seed,direction){
  const p=[...seed],k1=[0,0,0],k2=[0,0,0],k3=[0,0,0],k4=[0,0,0],probe=[0,0,0],points=[],h=4*direction;
  for(let step=0;step<420;step++){
   const magnitude=field(p,k1);
   points.push([p[0],p[1],p[2],Math.min(1,magnitude/reference)]);
   for(let i=0;i<3;i++)probe[i]=p[i]+h/2*k1[i];
   field(probe,k2);
   for(let i=0;i<3;i++)probe[i]=p[i]+h/2*k2[i];
   field(probe,k3);
   for(let i=0;i<3;i++)probe[i]=p[i]+h*k3[i];
   field(probe,k4);
   for(let i=0;i<3;i++)p[i]+=h/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]);
   if(Math.abs(p[0]-COIL.x)>BOUND||Math.hypot(p[1]-COIL.y,p[2]-COIL.z)>BOUND)break;
  }
  return points;
 }
 // 线圈的回路磁通散得很远（实测要到十几个线圈半径才闭合），画成闭合线没有意义。
 // 这里只取线圈附近的一段，两端渐隐到背景色，读作"磁场还在往外延伸"。
 const BOUND=2.2*R,background=new THREE.Color('#eaece6');
 const weak=new THREE.Color('#2f5f9e'),middle=new THREE.Color('#2f9aa8'),strong=new THREE.Color('#d98a2b');
 const positions=[],colors=[];
 for(const azimuth of [0,90,180,270])for(const fraction of [.3,.58,.86]){
  const angle=THREE.MathUtils.degToRad(azimuth);
  const seed=[COIL.x,COIL.y+R*fraction*Math.cos(angle),COIL.z+R*fraction*Math.sin(angle)];
  // 从种子向两侧各积分一次，再接成一条连续折线；直接首尾相接会多出一条
  // 从线尾跳回种子的长直线，看上去像从线圈炸开的刺。
  const backward=streamline(seed,-1),forward=streamline(seed,1);
  const path=[...backward].reverse().concat(forward.slice(1));
  for(let i=0;i<path.length-1;i++){
   for(const point of [path[i],path[i+1]]){
    const t=point[3];
    const color=t<.5?weak.clone().lerp(middle,t*2):middle.clone().lerp(strong,(t-.5)*2);
    const distance=Math.hypot(point[0]-COIL.x,point[1]-COIL.y,point[2]-COIL.z)/BOUND;
    color.lerp(background,THREE.MathUtils.smoothstep(distance,.6,1));
    positions.push(point[0],point[1],point[2]);colors.push(color.r,color.g,color.b);
   }
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const material=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:1});
 const lines=new THREE.LineSegments(geometry,material);lines.userData.ownMaterial=true;helmholtz.add(lines);
 // 方向箭头
 const arrows=new THREE.InstancedMesh(new THREE.ConeGeometry(2.8,9,8),new THREE.MeshBasicMaterial({color:0x1f6f8c}),60);
 arrows.userData.ownMaterial=true;
 const matrix=new THREE.Matrix4(),quaternion=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0),dir=new THREE.Vector3();
 let index=0;
 for(let i=0;i<positions.length/3-1&&index<60;i+=43){
  const a=new THREE.Vector3(positions[i*3],positions[i*3+1],positions[i*3+2]);
  const b=new THREE.Vector3(positions[(i+1)*3],positions[(i+1)*3+1],positions[(i+1)*3+2]);
  if(Math.hypot(a.x-COIL.x,a.y-COIL.y,a.z-COIL.z)>.62*BOUND)continue;
  dir.subVectors(b,a);if(dir.lengthSq()<1e-6)continue;
  quaternion.setFromUnitVectors(up,dir.clone().normalize());
  arrows.setMatrixAt(index++,matrix.compose(a,quaternion,new THREE.Vector3(1,1,1)));
 }
 arrows.count=index;helmholtz.add(arrows);
}
const COIL_MATERIALS=/漆包铜线|黄铜内框|铜绕组阴影|线圈法兰/;
function focusCoils(){
 camera.near=20;camera.far=10000;
 camera.position.set(COIL.x+330,COIL.y+250,COIL.z+400);
 controls.target.set(COIL.x,COIL.y,COIL.z);
 controls.minDistance=120;controls.maxDistance=2600;
 camera.updateProjectionMatrix();controls.update();
}
let coilsOnlyActive=false;
function applyFieldVisibility(){
 const inBench=view==='bench';
 const onlyCoils=inBench&&$('coilsOnly').checked;
 const showLines=inBench&&($('fieldLines').checked||onlyCoils);
 if(showLines)buildHelmholtz();
 helmholtz.visible=showLines;
 if(bench)bench.traverse(object=>{if(object.isMesh&&object.material)object.visible=!onlyCoils||COIL_MATERIALS.test(object.material.name||'');});
 // 只看线圈时自动拉近到线圈对，否则磁感线在全景里太小看不清。
 if(onlyCoils!==coilsOnlyActive){coilsOnlyActive=onlyCoils;if(onlyCoils)focusCoils();else home();}
 updateSceneCaption();
 needsRender=true;
}
function dressBenchGlass(root){
 // 亚克力罩原本几乎是全透明的（alpha 0.12），照片重建里看不出来是一块玻璃。
 // 提高不透明度并加一圈轮廓线，玻璃才有厚度感；线圈法兰也跟着稍微实一点。
 root.traverse(object=>{
  if(!object.isMesh||!object.material)return;
  const name=object.material.name||'';
  if(name.includes('亚克力')){object.material.opacity=.34;object.material.roughness=.06;object.material.depthWrite=false;object.material.needsUpdate=true;
   const edges=new THREE.LineSegments(new THREE.EdgesGeometry(object.geometry,42),new THREE.LineBasicMaterial({color:0xa8bccb,transparent:true,opacity:.5}));
   edges.userData.ownMaterial=true;object.add(edges);}
  else if(name.includes('线圈法兰')){object.material.opacity=.2;object.material.needsUpdate=true;}
 });
}
let benchPromise=null,benchLoading=false;
async function ensureBench(){
 if(bench)return true;
 if(benchLoading){await benchPromise;return !!bench;}
 benchLoading=true;$('benchLoading').hidden=false;
 const loadStart=performance.now();
 benchPromise=(async()=>{
  const gltf=await new GLTFLoader().loadAsync('./assets/bench_optimized.glb');
  const loaded=gltf.scene;loaded.scale.setScalar(1000);dressBenchGlass(loaded);
  await renderer.compileAsync(loaded,camera,scene);
  bench=loaded;scene.add(bench);
  $('assetStats').textContent=`实验台加载与着色准备 ${(performance.now()-loadStart).toFixed(0)} ms · 部件已在构建阶段合并`;
 })();
 try{await benchPromise;}
 catch(err){toast('实验台模型载入失败：'+err.message);benchPromise=null;}
 finally{benchLoading=false;$('benchLoading').hidden=true;}
 return !!bench;
}
async function setView(next){
 renderTimes=[];lastStats=0;
 if(next!=='explode'){storyStop();storyHome();container.classList.remove('is-story');}
 if(next==='explode'&&!story.playing){if(story.armed)storyResume();else storyStart();}
 view=next;container.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));container.classList.toggle('is-bench',view==='bench');
 if(view==='bench')await ensureBench();
 if(bench)bench.visible=view==='bench';rebuildTube();home();applyFieldVisibility();
}
function updateSceneCaption(){
 const title=view==='bench'?'完整实验台 · 照片重建':view==='explode'?'三段收集筒 · 拆解展示':'三段收集筒 · '+($('cutaway').checked?'纵向剖面':'完整筒体');
 $('sceneCaption').firstElementChild.textContent=title;
 const linesOn=view==='bench'&&($('fieldLines').checked||$('coilsOnly').checked);
 $('sceneFooter').textContent=view==='bench'?(linesOn?'磁感线 · 颜色由冷到暖表示磁场由弱到强':'707 同型装置外观参照 · 仪表显示为初始化状态'):view==='explode'?'部件分开展示 · 轨迹播放暂停':'长度单位 mm · B 方向固定 · 播放速度 20 ns/s';
}
new ResizeObserver(()=>{const w=viewport.clientWidth,h=viewport.clientHeight;if(!w||!h)return;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();needsRender=true;}).observe(viewport);
const dotMatrix=new THREE.Matrix4();let lastStats=0,renderTimes=[],renderCalls=0,renderTriangles=0;
function chainVisible(object){let node=object;while(node){if(node.visible===false)return false;node=node.parent;}return true;}
function animate(now){requestAnimationFrame(animate);
 if(document.hidden||!viewportVisible)return;
 if(story.playing)tickStory(now);else controls.update();
 const playingParticles=playing&&!dirty&&view==='internal'&&pointData&&$('trajectories').checked;
 if(now-lastRender<1000/30)return;
 if(!needsRender&&!playingParticles){if(now-lastStats>1000){$('renderStats').textContent=`空闲 · 已暂停绘图 · 上次 ${renderCalls} 次调用 / ${(renderTriangles/1000).toFixed(1)} 千三角面`;lastStats=now;}return;}
 const dt=Math.min(.10,(now-lastRender)/1000);lastRender=now;
 if(playingParticles){const previousTime=animationTime;animationTime=(animationTime+dt*20)%flightDuration;
  for(const item of movingDots){const {path,index}=item;if(animationTime<previousTime)item.cursor=1;
   if(animationTime>path.flight_ns){movingInstances.setMatrixAt(index,dotMatrix.makeScale(0,0,0));continue;}
   while(item.cursor<path.points.length-1&&path.points[item.cursor][3]<animationTime)item.cursor++;
   const a=path.points[item.cursor-1],b=path.points[item.cursor],fraction=(animationTime-a[3])/(b[3]-a[3]);
   movingInstances.setMatrixAt(index,dotMatrix.makeTranslation(a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction,a[2]+(b[2]-a[2])*fraction));
  }
  movingInstances.instanceMatrix.needsUpdate=true;$('clock').textContent=animationTime.toFixed(1)+' ns';
 }
 for(const label of labels){label.el.hidden=view==='bench'||!chainVisible(label.parent)||label.storyHidden===true;const p=label.parent.localToWorld(label.position.clone()).project(camera);label.el.style.left=(p.x*.5+.5)*viewport.clientWidth+'px';label.el.style.top=(-p.y*.5+.5)*viewport.clientHeight+'px';if(p.z>1)label.el.hidden=true;}
 const begin=performance.now();renderer.render(scene,camera);renderTimes.push(performance.now()-begin);if(renderTimes.length>90)renderTimes.shift();
 needsRender=false;renderCalls=renderer.info.render.calls;renderTriangles=renderer.info.render.triangles;
 if(now-lastStats>1000){const sorted=[...renderTimes].sort((a,b)=>a-b);$('renderStats').textContent=`${renderCalls} 次绘图调用 · ${(renderTriangles/1000).toFixed(1)} 千三角面 · 提交耗时 P95 ${sorted[Math.floor(sorted.length*.95)].toFixed(1)} ms · 动画上限 30 帧/s`;lastStats=now;}
}requestAnimationFrame(animate);

const units={field_max_mT:' mT',anode_V:' V',filament_V:' V',field_mT:' mT',tilt_deg:'°',length_mm:' mm',central_mm:' mm',temperature_K:' K',anode_radius_mm:' mm',filament_radius_um:' μm',emission_uA:' μA'};
function threadLabel(count,fast){
 return count===fast?`快速 · ${count} 线程`:count>=4?`快速 · ${count} 线程`:count===3?'均衡 · 3 线程':count===2?'均衡 · 2 线程':count===1?'轻量 · 1 线程':`${count} 线程`;
}
function buildThreadOptions(){
 const select=$('compute_threads'),choices=Array.isArray(defaults.thread_choices)&&defaults.thread_choices.length?defaults.thread_choices:[1,2,4];
 select.replaceChildren(...choices.map(n=>{const option=document.createElement('option');option.value=String(n);option.textContent=threadLabel(n,defaults.fast_threads);return option;}));
 $('computeNote').dataset.threads=`本机 ${defaults.logical_cores??'?'} 逻辑核，计算最多用 ${Math.max(...choices)} 个线程`;
}
// /api/defaults 里混有三项运行时信息（线程预算），计算回显永不包含它们；
// 混进 params 会让 curveMismatch() 恒真（曲线永久变浅、对照按钮永久禁用）。
const RUNTIME_ONLY_KEYS=['thread_choices','fast_threads','logical_cores','geometry_presets'];
function adoptParams(source){params={...source};for(const k of RUNTIME_ONLY_KEYS)delete params[k];}
function syncInputs(){for(const input of container.querySelectorAll('[data-param]')){if(input.type==='checkbox')input.checked=params[input.id];else input.value=params[input.id];}updateReadouts();}
function updateReadouts(){for(const [key,unit] of Object.entries(units))$(key+'-value').textContent=(key==='filament_V'?Number(params[key]).toFixed(3):Number(params[key]).toLocaleString('en-US',{maximumFractionDigits:3}))+unit;$('central_mm').max=params.length_mm-1;}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,6500);}
function setBusy(value,text){busy=value;container.querySelectorAll('[data-param],#reset,#cardRadius,#saveResearch').forEach(el=>el.disabled=value);container.querySelectorAll('#point,#scan').forEach(el=>el.disabled=value||!workerReady);$('compare').disabled=value||!workerReady||curveMismatch()||!params.gradient;$('cancel').hidden=!value;$('cancel').disabled=false;if(!value){activeJobId=null;cancelRequested=false;}$('status').textContent=text;}
async function cancelCurrent(){cancelRequested=true;$('cancel').disabled=true;$('status').textContent='正在取消…';if(activeJobId)await fetch('/api/cancel/'+activeJobId,{method:'POST'});}
function performanceNote(result){const s=result.stats;if(!s)return;$('taskStats').textContent=`本次 ${result.elapsed_s.toFixed(3)} s · 求解 ${s.solve_s.toFixed(3)} s · ${s.cache_hits} 个工作点复用 · ${(s.accepted_steps/1e6).toFixed(2)} 百万积分步 · 计算进程 ${result.worker_memory_mb?.toFixed(0)??'—'} MB`;}
async function job(kind,p){
 const response=await fetch('/api/'+kind,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
 const data=await response.json();if(!response.ok)throw new Error(data.message);activeJobId=data.id;if(cancelRequested)await cancelCurrent();
 for(;;){await new Promise(r=>setTimeout(r,kind==='point'?80:180));const state=await (await fetch('/api/job/'+data.id)).json();
  if(state.state==='cancelled'){const error=new Error('已取消；已完成的工作点保留，轨迹可继续复用');error.cancelled=true;error.partial=state.result;throw error;}
  if(state.state==='error')throw new Error(state.message);
  if(state.particles_total){$('progress').firstElementChild.style.width=100*state.particles_done/state.particles_total+'%';$('computeNote').textContent=`已完成 ${state.done} / ${state.total} 个工作点 · ${state.elapsed_s}s · 预计剩余 ${state.eta_s??'—'}s`;}
  if(state.state==='done'){performanceNote(state.result);return {...state.result,cached:state.cached};}
 }
}
async function calculatePoint(){if(busy)return;setBusy(true,'计算电子去向…');const p={...params};try{pointData=await job('point',p);dirty=false;rebuildTube();showPoint();$('status').textContent=pointData.cached?'当前点 · 已缓存计算':'当前点 · '+pointData.elapsed_s.toFixed(2)+' s';}catch(e){if(!e.cancelled)toast(e.message);$('status').textContent=e.cancelled?e.message:'计算未完成';}finally{setBusy(false,$('status').textContent);}}
async function calculateScan(compare=false){if(busy)return;if(compare){if(curveMismatch()||!params.gradient){toast('请先完成当前条件下的有梯度扫描，再去掉梯度作单因素对照。');return;}previousScan=scanData;params.gradient=false;syncInputs();markDirty();}
 setBusy(true,'正在扫描磁场…');$('progress').firstElementChild.style.width='0%';
 let curveReady=false;
 try{scanData=await job('scan',{...params});curveReady=true;drawChart();showFinding();$('status').textContent='曲线已完成 · 正在更新当前点轨迹';trajectoryGroup.visible=false;pointData=await job('point',{...params});dirty=false;rebuildTube();showPoint();drawChart();showFinding();$('progress').firstElementChild.style.width='100%';$('computeNote').textContent=`${scanData.rows.length} 个磁场点 · ${scanData.params.particles} 粒子/点 · ${scanData.elapsed_s.toFixed(1)} s`;$('status').textContent=scanData.cached?'扫描完成 · 读取缓存':'扫描完成';}
 catch(e){if(e.partial){scanData=e.partial;drawChart();showFinding();$('computeNote').textContent=`已保留 ${scanData.rows.length} / ${scanData.requested_fields_mT.length} 个完整工作点，可导出。`;}if(!e.cancelled)toast(e.message);$('status').textContent=curveReady?(e.cancelled?'曲线已完成 · 轨迹更新已取消':'曲线已完成 · 轨迹更新失败'):(e.cancelled?e.message:'扫描未完成');}finally{setBusy(false,$('status').textContent);}}
function showPoint(){for(const [id,key] of [['A1','A1_uA'],['A2','A2_uA'],['sum','sum_uA']])$(id).textContent=pointData.row[key].toFixed(3);
 $('destinations').innerHTML=pointData.row.fractions.map((f,i)=>`<div class="destination"><div class="row"><span>${names[i]}</span><span>${(f*100).toFixed(2)}% · ${pointData.row.counts[i]}</span></div><div class="bar"><i style="background:${colors[i]};width:${f*100}%"></i></div></div>`).join('');
 $('balance').textContent=`样本合计 ${pointData.row.counts.reduce((a,b)=>a+b,0)} / ${pointData.params.particles}。轨迹为同一批初态中的固定 48 条，统计使用全部粒子。`;
 drawChart();
}
function curveMismatch(){if(!scanData)return false;return Object.keys(params).some(k=>!['field_mT','compute_threads'].includes(k)&&params[k]!==scanData.params[k]);}
function markDirty(){dirty=true;for(const id of ['A1','A2','sum'])$(id).textContent='—';$('destinations').replaceChildren();$('balance').textContent='参数已改变，重新计算后更新电子去向。';rebuildTube();drawChart();showFinding();}
function showFinding(){if(!scanData)return;const rows=scanData.rows,base=rows[0].A1_uA,peak=rows.reduce((a,b)=>a.A1_uA>b.A1_uA?a:b);const rise=(peak.A1_uA/base-1)*100;
 $('finding').textContent=`${curveMismatch()?'上次扫描':'本次扫描'}：中央电流相对零场的最大变化为 +${rise.toFixed(2)}%，出现在 ${peak.field_mT.toFixed(2)} mT。可切换“隆起放大”查看微小变化。`;
}
function drawChart(){
 if(!scanData)return;$('compare').disabled=busy||!workerReady||curveMismatch()||!params.gradient;const w=320,h=255,l=44,r=12,t=28,b=34,pw=w-l-r,ph=h-t-b,rows=scanData.rows,maxB=scanData.params.field_max_mT;
 let ymin=0,ymax=plotMode==='current'?Math.max(scanData.params.emission_uA,...(referenceData?.rows??[]).map(r=>r.sum_uA))*1.04:plotMode==='normalized'?1.08:1.06;if(plotMode==='bump')ymin=.94;
 const xx=v=>l+v/maxB*pw,yy=v=>t+(ymax-v)/(ymax-ymin)*ph;
 const yVal=(row,key,data)=>plotMode==='current'?row[key]:row[key]/(data===referenceData?data.baseline?.[key]:data.rows[0][key]);
 let svg=`<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="clip"><rect x="${l}" y="${t}" width="${pw}" height="${ph}"/></clipPath></defs>`;
 for(let i=0;i<5;i++){let y=ymin+(ymax-ymin)*i/4;svg+=`<path d="M${l} ${yy(y)}H${w-r}" stroke="#dce2de"/><text x="${l-7}" y="${yy(y)+3}" text-anchor="end" font-size="10" fill="#718184">${plotMode==='current'?y.toFixed(0):y.toFixed(2)}</text>`;}
 for(let v=0;v<=maxB;v++){svg+=`<text x="${xx(v)}" y="${h-b+17}" text-anchor="middle" font-size="10" fill="#718184">${v}</text>`;}
 const path=(data,key)=>data.rows.map((row,i)=>(i?'L':'M')+xx(row.field_mT).toFixed(2)+' '+yy(yVal(row,key,data)).toFixed(2)).join('');
 svg+=`<g clip-path="url(#clip)" opacity="${curveMismatch()?.36:1}">`;
 for(const [key,c] of [['A1_uA',colors[1]],['A2_uA',colors[2]],['sum_uA','#415979']])svg+=`<path d="${path(scanData,key)}" fill="none" stroke="${c}" stroke-width="2"/>`;
 if(previousScan){for(const [key,c] of [['A1_uA',colors[1]],['A2_uA',colors[2]],['sum_uA','#415979']])svg+=`<path d="${path(previousScan,key)}" fill="none" stroke="${c}" stroke-width="1.3" stroke-dasharray="4 4" opacity=".65"/>`;$('compareLegend').hidden=false;}
 if(referenceData){for(const [key,c] of [['A1_uA',colors[1]],['A2_uA',colors[2]],['sum_uA','#415979']])for(const row of referenceData.rows){const value=yVal(row,key,referenceData);if(Number.isFinite(value))svg+=`<circle cx="${xx(row.field_mT)}" cy="${yy(value)}" r="2" fill="none" stroke="${c}"/>`;}}
 svg+=`</g><path d="M${xx(params.field_mT)} ${t}V${h-b}" stroke="#889c99" stroke-dasharray="3 4"/><text x="${l}" y="15" font-size="10" fill="#718184">${plotMode==='current'?'收集电流 / μA':'各通道电流 / 该通道零场电流'}</text><text x="${w-r}" y="${h-1}" text-anchor="end" font-size="10" fill="#718184">磁场 B / mT</text></svg>`;
 $('chart').innerHTML=svg;$('curveCaption').textContent=curveMismatch()?'参数已改变，浅色曲线保留上次结果；重新扫描更新。':'点击曲线选择工作点；竖线标示当前磁场。';
 $('chart').firstElementChild.onclick=e=>{if(busy||curveMismatch())return;const rect=e.currentTarget.getBoundingClientRect();const x=(e.clientX-rect.left)/rect.width*w;let B=Math.max(0,Math.min(maxB,(x-l)/pw*maxB));params.field_mT=rows.reduce((a,b)=>Math.abs(a.field_mT-B)<Math.abs(b.field_mT-B)?a:b).field_mT;syncInputs();markDirty();calculatePoint();};
}
function download(name,contents,type){const url=URL.createObjectURL(new Blob([contents],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportResults(){if(!scanData)return;const data={exported_at:new Date().toISOString(),scan:scanData,workpoint:pointData,comparison:previousScan,experimental_reference:referenceData};download('磁截止_参数与结果.json',JSON.stringify(data,null,2),'application/json');}
function exportCsv(){if(!scanData)return;const keys=Object.keys(scanData.params),header='B_mT,A1_uA,A2_uA,sum_uA,cathode_count,A1_count,A2_count,axial_exit_count,still_flying_count,pruned_noncollector_count,'+keys.join(',')+',engine,seed,partial_scan\n';download('磁截止_扫描.csv',header+scanData.rows.map(r=>[r.field_mT,r.A1_uA,r.A2_uA,r.sum_uA,...Array.from({length:6},(_,i)=>r.counts[i]??0),...keys.map(k=>scanData.params[k]),scanData.engine,scanData.seed,!!scanData.cancelled].join(',')).join('\n'),'text/csv');}
let pointTimer;
for(const input of container.querySelectorAll('[data-param]'))input.addEventListener('input',()=>{params[input.id]=input.type==='checkbox'?input.checked:input.id==='accuracy'?input.value:Number(input.value);if(input.id==='compute_threads')return;if(params.central_mm>=params.length_mm)params.central_mm=params.length_mm-1;
 updateReadouts();$('central_mm').value=params.central_mm;markDirty();$('status').textContent='参数已改变 · 待计算';
 if(input.id==='field_mT'){clearTimeout(pointTimer);pointTimer=setTimeout(calculatePoint,500);}
});
for(const key of ['cutaway','potential','trajectories'])$(key).onchange=rebuildTube;
for(const key of ['fieldLines','coilsOnly'])$(key).onchange=applyFieldVisibility;
$('storySeek').max=String(STORY.length-1);
$('storySeek').oninput=event=>storyJump(Number(event.target.value));
$('storyToggle').onclick=()=>{
 if(story.playing){storyPause();$('storyToggle').textContent='继续播放';return;}
 $('storyToggle').textContent='暂停';
 if(story.armed)storyResume();else storyStart();
};
container.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
container.querySelectorAll('[data-plot]').forEach(b=>b.onclick=()=>{plotMode=b.dataset.plot;container.querySelectorAll('[data-plot]').forEach(el=>el.classList.toggle('active',el===b));drawChart();});
$('home').onclick=home;$('point').onclick=calculatePoint;$('scan').onclick=()=>calculateScan();$('compare').onclick=()=>calculateScan(true);$('export').onclick=exportResults;$('exportCsv').onclick=exportCsv;
$('cancel').onclick=cancelCurrent;
$('play').onclick=()=>{playing=!playing;$('play').textContent=playing?'暂停电子':'播放电子';needsRender=true;lastRender=performance.now();};
$('cardRadius').onclick=()=>{params.filament_radius_um=37.5;syncInputs();markDirty();$('status').textContent='已选参数卡半径 · 待计算';};
$('reset').onclick=async()=>{adoptParams(defaults);previousScan=null;dirty=false;syncInputs();[pointData,scanData]=await Promise.all(['default_point','default_scan'].map(s=>fetch('./assets/'+s+'.json').then(r=>r.json())));rebuildTube();home();showPoint();showFinding();$('compareLegend').hidden=true;$('status').textContent='机制验证预设';};
try{defaults=await (await fetch('/api/defaults')).json();adoptParams(defaults);buildThreadOptions();syncInputs();[pointData,scanData]=await Promise.all(['default_point','default_scan'].map(s=>fetch('./assets/'+s+'.json').then(r=>r.json())));rebuildTube();home();showPoint();showFinding();$('status').textContent='示例已就绪 · 本机计算';$('computeNote').textContent=`预计算 ${scanData.rows.length} 个磁场点 · ${params.particles} 粒子/点`;}catch(e){$('status').textContent='启动失败';toast(e.message);console.error(e);}
async function watchWorker(){
 setBusy(false,'示例可浏览 · 计算核心准备中');
 for(;;){
  const health=await(await fetch('/api/health')).json();
  if(health.worker.state==='ready'){workerReady=true;setBusy(false,'本机计算已就绪 · 优化版');return;}
  if(health.worker.state==='error'){toast(health.worker.message);$('status').textContent='计算核心启动失败';return;}
  await new Promise(r=>setTimeout(r,600));
 }
}
watchWorker().catch(e=>{toast(e.message);$('status').textContent='无法连接计算服务';});

$('saveResearch').onclick=()=>{
 if(dirty||busy){toast('先计算当前工作点，再保存对应的研究记录。');return;}
 onRecord?.({type:'research',title:`独立电子模型 · ${params.anode_V} V / ${params.field_mT} mT`,
 conditions:{...params,model:'无碰撞独立电子、同轴解析电势、均匀磁场'},
 observations:{workpoint:pointData.row,scan:scanData,comparison:previousScan,experimental_reference:referenceData},
 conclusion:'请在实验记录中填写预测、证据与下一项实验。'});
 toast('已保存至实验记录，可补充你的解释。');
};
$('pinComparison').onclick=()=>{previousScan=structuredClone(scanData);$('compareLegend').hidden=false;drawChart();toast('已保留此组条件，可改变任一参数后重新扫描作对照。');};
$('clearReference').onclick=()=>{referenceData=null;previousScan=null;$('referenceInfo').hidden=true;$('compareLegend').hidden=true;drawChart();};
return {setParameters(next){if(busy){toast('当前计算完成或取消后，才能载入新条件。');return false;}for(const key of Object.keys(defaults))if(!RUNTIME_ONLY_KEYS.includes(key)&&next[key]!==undefined)params[key]=next[key];if(!(defaults.thread_choices??[1,2,4]).includes(params.compute_threads))params.compute_threads=defaults.compute_threads;syncInputs();markDirty();return true;},setReference(data){referenceData=data;$('referenceInfo').hidden=false;$('referenceInfo').textContent=`空心点：${data.title}。模型线与实测点各自保留条件，源强未自动拟合。`;drawChart();},setView,getState:()=>({params,pointData,scanData,busy})};

}
