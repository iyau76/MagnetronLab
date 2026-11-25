import * as THREE from 'three';
import {Line2} from 'three/addons/lines/Line2.js';
import {LineGeometry} from 'three/addons/lines/LineGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';
import {cutoffPosition,traceIndex} from './model-math.js';
import {renderMath} from '../mathlite.js';

// Scientific coordinates are (x,y,z) in mm. The established tube's axis is world x.
const xyz=p=>new THREE.Vector3(p[2],p[0],p[1]);
export function createResearchScene({tube,assembly,camera,controls,moveTo,changed,labels}) {
  const group=new THREE.Group();tube.add(group);group.visible=false;
  // Keep the chapter-one mechanical orientation: K at the socket (world -x),
  // H at the spring. Rotate the scientific frame as a whole, retaining handedness.
  group.rotation.y=Math.PI;
  const paths=new THREE.Group(),envelope=new THREE.Group(),axes=new THREE.Group(),magnetic=new THREE.Group(),perigees=new THREE.Group(),population=new THREE.Group(),thermal=new THREE.Group();group.add(paths,envelope,axes,magnetic,perigees,population,thermal);
  const point=new THREE.Mesh(new THREE.SphereGeometry(.13,16,10),new THREE.MeshBasicMaterial({color:0xfff1bc,toneMapped:false}));group.add(point);point.visible=false;
  const backups=new Map();let active=false,peeled=false,start=0,trace=null,lines=[],time=0,near=false,fieldValue=null,cameraBackup=null,following=false,followAfter=0;
  let geometry={length_mm:35,central_mm:15,anode_radius_mm:4.55,filament_radius_um:37.5};
  const transforms=new Map();
  const hideIds=['glass','support','tension','base'];
  const labelNodes=[['$H$ 侧保护环',[-12.5,6,0]],['中央阳极 $A_1$',[0,7,0]],['$K$ 侧保护环',[12.5,6,0]],['$z$',[-14,-6,0]],['$x$',[-19,-1,0]],['$y$',[-19,-6,5]]].map(([text,position])=>{const el=document.createElement('span');el.className='research-label';el.innerHTML=text;el.hidden=true;labels.append(el);renderMath(el);return {el,position:new THREE.Vector3(...position)};});
  const backup=m=>{if(!backups.has(m))backups.set(m,{visible:m.visible,opacity:m.material.opacity,transparent:m.material.transparent,depthWrite:m.material.depthWrite});};
  const dispose=g=>{while(g.children.length){const o=g.children[0];g.remove(o);o.traverse(n=>{n.geometry?.dispose();if(n.material)(Array.isArray(n.material)?n.material:[n.material]).forEach(m=>m.dispose());});}};
  for(const [dir,color] of [[[1,0,0],0x78c7e9],[[0,1,0],0xeea477],[[0,0,1],0xc9d6dd]])axes.add(new THREE.ArrowHelper(new THREE.Vector3(...dir),new THREE.Vector3(-19,-6,0),4,color,1,.4));
  function setFollow(value){following=value;followAfter=performance.now()+1100;changed();}
  function focus(close=false) {
    near=close;const p=trace?.points[traceIndex(trace,time)]??[0,0,0];
    if(active){controls.minDistance=close?2:12;camera.near=close?.08:.5;camera.updateProjectionMatrix();}
    if(!close)following=false;
    const target=close?group.localToWorld(xyz(p)):tube.localToWorld(new THREE.Vector3(0,0,0));
    const aspect=camera.aspect;
    const portraitScale=aspect<1.25?1.48/aspect:1;
    const scale=portraitScale*Math.max(1,geometry.length_mm/35,geometry.anode_radius_mm/4.55);
    const offset=close?new THREE.Vector3(3,9,21):new THREE.Vector3(19,28,87).multiplyScalar(scale);
    moveTo({target:target.toArray(),pos:target.clone().add(offset).toArray()},1100);
  }
  function setTrace(value,counter=null,options={}) {
    dispose(paths);dispose(perigees);dispose(population);lines=[];trace=value;point.visible=!!value;
    for(const [tr,color,dashed] of [[value,options.color??0x8ed7f5,false],[counter,options.counterColor??0xf4b469,!options.solidCounter]]){
      if(!tr)continue;
      const geometry=new LineGeometry().setPositions(tr.points.flatMap(p=>[p[2],p[0],p[1]]));
      const material=new LineMaterial({color,linewidth:dashed?1.7:2.6,transparent:true,opacity:dashed?.8:1,dashed,dashSize:.28,gapSize:.19,worldUnits:false,depthTest:false,toneMapped:false});
      const line=new Line2(geometry,material);line.computeLineDistances();line.renderOrder=20;paths.add(line);lines.push({line,tr});
      if(options.markers)for(const p of tr.perigee??[]){
        const index=traceIndex(tr,p.time_ns),ring=new THREE.Mesh(new THREE.RingGeometry(.12,.19,24),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,depthTest:false,toneMapped:false}));
        ring.position.copy(xyz(tr.points[index]));ring.userData.time=p.time_ns;ring.renderOrder=22;perigees.add(ring);
      }
    }
    setTime(value?Math.min(time,value.flight_ns):0);
  }
  function setPopulation(traces=[]) {
    dispose(population);
    for(const tr of traces){
      const material=new LineMaterial({color:tr.outcome===1?0x8ccbe4:tr.outcome===2?0xe5be87:0x9caebd,linewidth:1.3,transparent:true,opacity:.34,worldUnits:false,depthTest:false,toneMapped:false});
      const line=new Line2(new LineGeometry().setPositions(tr.points.flatMap(p=>[p[2],p[0],p[1]])),material);line.renderOrder=18;population.add(line);
      const bead=new THREE.Mesh(new THREE.SphereGeometry(.1,10,6),new THREE.MeshBasicMaterial({color:0xf7d692,depthTest:false,toneMapped:false}));bead.renderOrder=21;bead.userData.trace=tr;population.add(bead);
    }
    changed();
  }
  function setGeometry(value=null){
    const next={length_mm:35,central_mm:15,anode_radius_mm:4.55,filament_radius_um:37.5,...value};
    if(Object.keys(geometry).every(k=>geometry[k]===next[k]))return;
    geometry=Object.fromEntries(Object.keys(geometry).map(k=>[k,next[k]]));
    const {length_mm:L,central_mm:c,anode_radius_mm:r,filament_radius_um:rf}=geometry;
    for(const [id,oldLength,oldX,newLength,newX] of [['guardLeft',10,-12.6,(L-c)/2,-(L+c)/4],['anode',15,0,c,0],['guardRight',10,12.6,(L-c)/2,(L+c)/4]]){
      for(const mesh of assembly.parts.get(id)??[]){
        if(!transforms.has(mesh))transforms.set(mesh,{scale:mesh.scale.clone(),position:mesh.position.clone()});
        mesh.scale.set(newLength/oldLength,r/4.55,r/4.55);
        mesh.position.x=newX-oldX*mesh.scale.x;
      }
    }
    for(const mesh of [assembly.filament,assembly.glow]){
      if(!transforms.has(mesh))transforms.set(mesh,{scale:mesh.scale.clone(),position:mesh.position.clone()});
      mesh.scale.set(rf/37.5,L/35,rf/37.5);
    }
    thermal.scale.x=L/35;
    labelNodes[0].position.set(-(L+c)/4,r+1.45,0);labelNodes[1].position.set(0,r+2.45,0);labelNodes[2].position.set((L+c)/4,r+1.45,0);
    const origin=new THREE.Vector3(-L/2-1.5,-r-1.45,0);
    for(const arrow of axes.children)arrow.position.copy(origin);
    labelNodes[3].position.copy(origin).add(new THREE.Vector3(5,0,0));
    labelNodes[4].position.copy(origin).add(new THREE.Vector3(0,5,0));
    labelNodes[5].position.copy(origin).add(new THREE.Vector3(0,0,5));
    if(fieldValue)setField(fieldValue);changed();
  }
  function restoreGeometry(){
    setGeometry(null);
    for(const [mesh,t] of transforms){mesh.scale.copy(t.scale);mesh.position.copy(t.position);}
    transforms.clear();
  }
  function setCooling(eta=null){
    assembly.filament.visible=eta===null;assembly.glow.visible=eta===null;
    thermal.visible=eta!==null;
    if(eta!==null)for(let i=0;i<96;i++){
      const z=-17.5+(i+.5)*35/96,w=1-eta*(2*z/35)**2;
      const color=new THREE.Color(0xe25922).lerp(new THREE.Color(0xfff4d4),w);
      for(const [j,[radius,opacity]] of [[.085,1],[.32,.3*w]].entries()){
        const old=thermal.children[2*i+j];
        if(old){old.material.color.copy(color);old.material.opacity=opacity;}
        else{const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,35/96+.004,8),new THREE.MeshBasicMaterial({color,transparent:opacity<1,opacity,depthWrite:opacity===1,toneMapped:false}));
          mesh.rotation.z=Math.PI/2;mesh.position.x=z;thermal.add(mesh);}
      }
    }
    changed();
  }
  function setTime(t) {
    time=t;
    if(trace){const i=traceIndex(trace,t);point.position.copy(xyz(trace.points[i]));}
    for(const {line,tr} of lines)line.geometry.instanceCount=Math.max(0,Math.min(tr.points.length-1,traceIndex(tr,t)));
    for(const ring of perigees.children)ring.visible=ring.userData.time<=t;
    changed();
  }
  function setField(value) {
    dispose(magnetic);fieldValue=value;if(!value)return;
    const {B=5.735,theta=0}=value,a=theta*Math.PI/180,dir=new THREE.Vector3(Math.cos(a),Math.sin(a),0);
    // Faint field lines hug the outside of the anode; a compact B / B_z / B_perp gizmo sits above the H end.
    const radius=geometry.anode_radius_mm+1.85;
    for(const [y,z] of [[radius,0],[-radius,0],[0,radius],[0,-radius]]){
      const origin=new THREE.Vector3(-geometry.length_mm/2-.5,y,z).addScaledVector(dir,-1),arrow=new THREE.ArrowHelper(dir,origin,geometry.length_mm+2,0x73ced3,.9,.32);
      arrow.line.material.transparent=true;arrow.line.material.opacity=.13;arrow.cone.material.transparent=true;arrow.cone.material.opacity=.35;magnetic.add(arrow);
    }
    magnetic.visible=B>0;changed();
  }
  function setCutoff(B,V=10,Uf=3.68) {
    dispose(envelope);const z=cutoffPosition(B,V,Uf),length=17.5-z;
    if(length>.001){
      const geometry=new THREE.CylinderGeometry(4.61,4.61,length,32,Math.max(2,Math.ceil(length)),true);
      geometry.rotateZ(Math.PI/2);
      const cage=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xd9a85d,transparent:true,opacity:.13,side:THREE.DoubleSide,depthWrite:false}));cage.position.x=(z+17.5)/2;envelope.add(cage);
      const edge=new THREE.Mesh(new THREE.TorusGeometry(4.63,.05,6,64),new THREE.MeshBasicMaterial({color:0xf0bf6c,toneMapped:false}));edge.rotation.y=Math.PI/2;edge.position.x=z;envelope.add(edge);
    }
    changed();return z;
  }
  function enable(value) {
    if(active===value)return;
    active=value;group.visible=value;start=performance.now();peeled=value;labelNodes.forEach(l=>l.el.hidden=!value);
    if(value){cameraBackup={near:camera.near,minDistance:controls.minDistance};camera.near=.5;controls.minDistance=12;camera.updateProjectionMatrix();for(const meshes of assembly.parts.values())for(const m of meshes)backup(m);}
    else {following=false;restoreGeometry();setCooling(null);if(cameraBackup){camera.near=cameraBackup.near;controls.minDistance=cameraBackup.minDistance;camera.updateProjectionMatrix();}for(const [m,b] of backups){m.visible=b.visible;Object.assign(m.material,{opacity:b.opacity,transparent:b.transparent,depthWrite:b.depthWrite});}backups.clear();dispose(paths);dispose(envelope);dispose(magnetic);dispose(perigees);dispose(population);trace=null;fieldValue=null;lines=[];point.visible=false;}
    changed();
  }
  function tick(now,width,height) {
    if(!active)return;
    for(const [i,id] of hideIds.entries())for(const m of assembly.parts.get(id)??[]){backup(m);const u=Math.min(1,Math.max(0,(now-start-i*120)/650));m.material.transparent=true;m.material.depthWrite=false;m.material.opacity=(backups.get(m)?.opacity??1)*(1-u);m.visible=u<1;}
    for(const id of ['guardLeft','anode','guardRight'])for(const m of assembly.parts.get(id)??[]){m.material.transparent=true;m.material.opacity=.3;m.material.depthWrite=false;}
    if(following&&trace&&now>=followAfter){const target=group.localToWorld(point.position.clone()),delta=target.clone().sub(controls.target);camera.position.add(delta);controls.target.copy(target);}
    for(const {line} of lines)line.material.resolution.set(width,height);
    for(const obj of population.children){if(obj.material.resolution)obj.material.resolution.set(width,height);if(obj.userData.trace){const tr=obj.userData.trace,i=traceIndex(tr,((now/2600+tr.particle_id*.137)%1)*tr.flight_ns);obj.position.copy(xyz(tr.points[i]));}}
    for(const ring of perigees.children){const q=camera.getWorldQuaternion(new THREE.Quaternion()),parent=group.getWorldQuaternion(new THREE.Quaternion()).invert();ring.quaternion.copy(parent.multiply(q));}
    for(const label of labelNodes){const p=group.localToWorld(label.position.clone()).project(camera);label.el.style.transform=`translate(-50%,-50%) translate(${(p.x+1)*width/2}px,${(1-p.y)*height/2}px)`;label.el.hidden=p.z>1||p.z< -1;}
    assembly.paths.visible=false;
  }
  return {enable,focus,setFollow,setGeometry,setTrace,setTime,setCutoff,setField,setPopulation,setCooling,tick,get active(){return active;},debug:()=>({active,peeled,near,following,geometry:{...geometry},time,field:fieldValue,population:population.children.length/2,thermal:thermal.children.length,perigees:perigees.children.length,particle_id:trace?.particle_id,points:trace?.points.length??0}),dispose(){enable(false);labelNodes.forEach(l=>l.el.remove());dispose(group);tube.remove(group);}};
}
