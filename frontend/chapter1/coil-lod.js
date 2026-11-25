import * as THREE from 'three';

// A homogenised winding pack replaces subpixel wire geometry. The close representation
// adds only resolvable, low-contrast winding relief, never all 640k source triangles.
export function makeCoilPack(center){
 const lod=new THREE.LOD();lod.position.copy(center);lod.userData.pickParts=[{start:0,count:Infinity,tag:{part:'coils'}}];
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#995c39';ctx.fillRect(0,0,64,256);
 // Texture minification is mip-filtered; unlike the original dense geometry it
 // converges to the average copper colour when a winding becomes subpixel.
 for(let i=0;i<12;i++){const y=i*256/12;ctx.fillStyle='#8d512f';ctx.fillRect(0,y,64,3);ctx.fillStyle='#a26742';ctx.fillRect(0,y+3,64,2);}
 const grain=new THREE.CanvasTexture(canvas);grain.colorSpace=THREE.SRGBColorSpace;grain.anisotropy=8;grain.wrapS=grain.wrapT=THREE.RepeatWrapping;
 const mat=new THREE.MeshPhysicalMaterial({color:0xffffff,map:grain,metalness:.56,roughness:.6,anisotropy:.35,anisotropyRotation:Math.PI/2});
 const profile=[new THREE.Vector2(104,-13.5),new THREE.Vector2(123,-13.5),new THREE.Vector2(123,13.5),new THREE.Vector2(104,13.5),new THREE.Vector2(104,-13.5)];
 function body(){const m=new THREE.Mesh(new THREE.LatheGeometry(profile,160),mat);m.rotation.z=Math.PI/2;m.castShadow=true;m.receiveShadow=true;m.userData.coilProxy=true;return m;}
 const close=new THREE.Group();close.add(body());const relief=new THREE.MeshStandardMaterial({color:0x9a5936,metalness:.5,roughness:.65});
 for(let i=0;i<6;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(123.15,.24,6,128),relief);ring.rotation.y=Math.PI/2;ring.position.x=-12+i*4.8;ring.userData.coilProxy=true;close.add(ring);}
 lod.addLevel(close,0);lod.addLevel(body(),380,.12);return lod;
}
