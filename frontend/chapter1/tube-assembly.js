import * as THREE from 'three';

// Millimetres. Wall thickness and the support arrangement are mechanical illustrations.
export function createTubeAssembly(group){
 const parts=new Map(),anchors=new Map(),pickables=[],cutPanels=[];
 const steel=new THREE.MeshStandardMaterial({color:0xa4b4bd,metalness:.72,roughness:.4});
 function add(id,mesh,anchor){mesh.userData.structurePart=id;group.add(mesh);pickables.push(mesh);if(!parts.has(id))parts.set(id,[]);parts.get(id).push(mesh);if(anchor)anchors.set(id,new THREE.Vector3(...anchor));return mesh;}
 function electrode(id,length,x,color){
  const ri=4.595,ro=4.865,start=1.3*Math.PI,end=2.7*Math.PI;
  const shape=new THREE.Shape();shape.absarc(0,0,ro,start,end,false);shape.lineTo(ri*Math.cos(end),ri*Math.sin(end));shape.absarc(0,0,ri,end,start,true);shape.closePath();
  const g=new THREE.ExtrudeGeometry(shape,{depth:length-.09,steps:1,curveSegments:80,bevelEnabled:true,bevelSegments:2,bevelSize:.045,bevelThickness:.045});
  g.rotateY(Math.PI/2);g.translate(x-length/2+.045,0,0);
  add(id,new THREE.Mesh(g,new THREE.MeshStandardMaterial({color,metalness:.68,roughness:.36,side:THREE.DoubleSide})),[x,4.7,0]);
  const front=new THREE.Shape();front.absarc(0,0,ro,end,start+Math.PI*2,false);front.lineTo(ri*Math.cos(start),ri*Math.sin(start));front.absarc(0,0,ri,start+Math.PI*2,end,true);front.closePath();
  const fg=new THREE.ExtrudeGeometry(front,{depth:length-.09,steps:1,curveSegments:32,bevelEnabled:true,bevelSegments:2,bevelSize:.045,bevelThickness:.045});fg.rotateY(Math.PI/2);fg.translate(x-length/2+.045,0,0);
  const panel=add(id,new THREE.Mesh(fg,new THREE.MeshStandardMaterial({color,metalness:.68,roughness:.36,transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:true})));panel.userData.cutPanel=true;cutPanels.push(panel);
 }
 electrode('guardLeft',10,-12.6,0xa6b4bc);electrode('anode',15,0,0xc3a078);electrode('guardRight',10,12.6,0xa6b4bc);
 const filament=add('filament',new THREE.Mesh(new THREE.CylinderGeometry(.0375,.0375,35,16),new THREE.MeshStandardMaterial({color:0xc7b396,emissive:0xffbd75,emissiveIntensity:0,roughness:.5})),[0,0,0]);filament.rotation.z=Math.PI/2;
 const glow=new THREE.Mesh(new THREE.CylinderGeometry(.17,.17,33,12),new THREE.MeshBasicMaterial({color:0xffd994,toneMapped:false,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));glow.rotation.z=Math.PI/2;group.add(glow);
 const paths=new THREE.Group();group.add(paths);
 // The old spring has only 60 faces. A legible helix represents its tensioning role.
 const points=[];for(let i=0;i<=180;i++){const t=i/180;points.push(new THREE.Vector3(22+t*5,Math.cos(t*Math.PI*12)*.65,Math.sin(t*Math.PI*12)*.65));}
 const spring=add('tension',new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),180,.09,8,false),steel),[25,.65,0]);
 for(const [x,length] of [[19.75,4.5],[28.5,3]]){const wire=add('tension',new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,length,10),steel));wire.rotation.z=Math.PI/2;wire.position.x=x;}
 // Pin assignment is not known from the asset. These eight pins show the mechanical feedthrough.
 for(let i=0;i<8;i++){const a=i*Math.PI/4,pin=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,9,12),steel);pin.rotation.z=Math.PI/2;pin.position.set(-70,Math.cos(a)*6,Math.sin(a)*6);pin.userData.importedMechanical=true;add('base',pin);}
 function importPart(record){
  const name=record.name;let id=null;
  if(/GlassEnvelope|玻璃封接边/.test(name))id='glass';
  else if(/云母|白色陶瓷|支杆白瓷|电极支撑引线/.test(name))id='support';
  else if(/黑色管基|陶瓷管座|管基细边/.test(name))id='base';
  if(!id)return false;
  const source=record.mesh.geometry,g=new THREE.BufferGeometry();for(const [k,a] of Object.entries(source.attributes))g.setAttribute(k,a.clone());g.setIndex(new THREE.BufferAttribute(record.original.slice(),1));g.scale(1000,1000,1000);g.translate(287.5,-195,-60);g.computeBoundingBox();
  let mat;
  if(id==='glass'){
   mat=new THREE.MeshPhysicalMaterial({color:0xb2ccd9,metalness:0,roughness:.18,clearcoat:1,clearcoatRoughness:.12,transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide});
   // Keep the center transparent while grazing surfaces reveal the envelope's contour.
   mat.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= 0.24 + 4.0 * pow(1.0 - abs(dot(normal, geometryViewDir)), 3.0);\n#include <opaque_fragment>');};
  }
  else if(/云母/.test(name))mat=new THREE.MeshStandardMaterial({color:0x9dabb1,roughness:.56,metalness:.2,transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide});
  else if(/白瓷|陶瓷/.test(name))mat=new THREE.MeshStandardMaterial({color:0xd7d7c8,roughness:.68});
  else mat=new THREE.MeshStandardMaterial({color:id==='base'?0x1c252d:0x9eadb6,metalness:.45,roughness:.48});
  const anchor=g.boundingBox.getCenter(new THREE.Vector3()),mesh=new THREE.Mesh(g,mat);mesh.userData.importedMechanical=true;add(id,mesh,anchors.has(id)?null:anchor.toArray());return true;
 }
 anchors.set('tension',new THREE.Vector3(25,.65,0));
 anchors.set('glass',new THREE.Vector3(-25,12,10));anchors.set('base',new THREE.Vector3(-70,0,6));anchors.set('support',new THREE.Vector3(12.5,-7,0));
 return {parts,anchors,pickables,filament,glow,paths,importPart,setReveal(progress){this.glassMoving=false;
  for(let i=0;i<cutPanels.length;i++){const panel=cutPanels[i],t=THREE.MathUtils.smoothstep(progress,.53+i*.065,.82+i*.065);panel.rotation.x=-t*.8;panel.position.set(0,t*4.5,t*5);panel.material.opacity=1-t;panel.material.depthWrite=t<.01;panel.visible=t<.999;}
  for(const mesh of parts.get('glass')||[])mesh.material.opacity=THREE.MathUtils.lerp(.22,.075,THREE.MathUtils.smoothstep(progress,.3,.72));
 },revealGlass(){for(const m of parts.get('glass')||[])m.material.opacity=.28;},glassMoving:false,updateGlass(target,dt){let active=false;for(const m of parts.get('glass')||[]){m.material.opacity=THREE.MathUtils.damp(m.material.opacity,target,3,dt);active ||=Math.abs(m.material.opacity-target)>.002;}this.glassMoving=active;},setHeater(on,dt){filament.material.emissiveIntensity=THREE.MathUtils.damp(filament.material.emissiveIntensity,on?2.2:0,5,dt);glow.material.opacity=THREE.MathUtils.damp(glow.material.opacity,on?.42:0,5,dt);},setHover(id){for(const [key,meshes] of parts)for(const m of meshes){if(m.material.emissive){if(m===filament)continue;m.material.emissive.set(key===id?0x8b6231:0x000000);m.material.emissiveIntensity=key===id?.28:0;}}},spring};
}
