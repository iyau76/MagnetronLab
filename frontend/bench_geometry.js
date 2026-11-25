// Static visual asset preparation. Parts retain triangle ranges for semantic picking.
export function prepareBench(source,THREE,mergeGeometries){
 const groups=new Map(),result=new THREE.Group();source.updateMatrixWorld(true);
 source.traverse(object=>{if(!object.isMesh)return;const material=object.material;
  if(material.transmission>0){material.transmission=0;material.transparent=true;material.opacity=.12;material.depthWrite=false;material.needsUpdate=true;}
  const attributes=Object.entries(object.geometry.attributes).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).sort().join('|');
  const key=material.uuid+'|'+attributes+'|'+Boolean(object.geometry.index);
  if(!groups.has(key))groups.set(key,{material,geometries:[],parts:[],triangles:0});
  const group=groups.get(key),geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
  const triangles=(geometry.index?geometry.index.count:geometry.attributes.position.count)/3;
  group.parts.push({name:object.name,metadata:object.userData,worldMatrix:object.matrixWorld.toArray(),firstTriangle:group.triangles,triangleCount:triangles});
  group.triangles+=triangles;group.geometries.push(geometry);
 });
 for(const group of groups.values()){
  const geometry=mergeGeometries(group.geometries,false);group.geometries.forEach(g=>g.dispose());
  const mesh=new THREE.Mesh(geometry,group.material);mesh.name=group.material.name;mesh.userData.parts=group.parts;result.add(mesh);
 }
 source.traverse(object=>{if(object.geometry)object.geometry.dispose();});
 result.userData.source_parts=[...groups.values()].reduce((n,g)=>n+g.parts.length,0);
 result.userData.display_batches=result.children.length;
 return result;
}
