import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

// A real, navigable room around the existing millimetre-scale apparatus.
// Decorative geometry and textures have no role in numerical measurements.
export function createLabRoom(scene){
 const room=new THREE.Group();room.name='laboratory-room';scene.add(room);
 const floorY=-740;
 const material=(color,roughness=.7,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
 const wallMat=material(0xd5dedf),trimMat=material(0x526c7a),steel=material(0x6b8089,.4,.6),dark=material(0x344953,.6),cabinet=material(0x5b798d,.48),wood=material(0x9a7551,.4);
 function box(size,position,mat,parent=room){const radius=Math.min(4,Math.min(...size)*.12);const mesh=new THREE.Mesh(new RoundedBoxGeometry(...size,2,radius),mat);mesh.position.set(...position);mesh.receiveShadow=true;parent.add(mesh);return mesh;}
 function cylinder(radius,length,position,mat,parent=room){const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,16),mat);mesh.position.set(...position);parent.add(mesh);return mesh;}
 function texture(draw,w=1024,h=1024){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=4;return tex;}
 const floorTexture=texture((ctx,w,h)=>{ctx.fillStyle='#bbc0b8';ctx.fillRect(0,0,w,h);for(let y=0;y<4;y++)for(let x=0;x<4;x++){const shade=192+Math.round(8*Math.sin(x*3.17+y*2.11));ctx.fillStyle=`rgb(${shade},${shade+4},${shade-2})`;ctx.fillRect(x*w/4+1,y*h/4+1,w/4-2,h/4-2);ctx.fillStyle='#ffffff12';for(let i=0;i<140;i++){const px=(Math.sin(i*17.13+x*4+y)*.5+.5)*(w/4),py=(Math.sin(i*23.7+y*4+x)*.5+.5)*(h/4);ctx.fillRect(x*w/4+px,y*h/4+py,2,1);}}});floorTexture.wrapS=floorTexture.wrapT=THREE.RepeatWrapping;floorTexture.repeat.set(6,6);
 const floorMat=material(0xffffff,.63);floorMat.map=floorTexture;const floor=new THREE.Mesh(new THREE.PlaneGeometry(11000,11000),floorMat);floor.rotation.x=-Math.PI/2;floor.position.y=floorY;floor.receiveShadow=true;room.add(floor);
 box([7200,2850,80],[0,floorY+1425,-2550],wallMat);box([80,2850,7000],[-2900,floorY+1425,450],wallMat);box([80,2850,7000],[3500,floorY+1425,450],material(0xc8d3d7));
 box([7200,470,18],[0,floorY+235,-2498],material(0x78909a));box([18,470,7000],[-2848,floorY+235,450],material(0x78909a));
 box([7200,55,100],[0,floorY+52,-2493],trimMat);box([90,55,7000],[-2840,floorY+52,450],trimMat);
 const ceiling=box([7300,70,7400],[250,2145,700],material(0xc6d0d1));ceiling.receiveShadow=false;
 // The wide windows are the motivation for the cool key light.
 const sky=texture((ctx,w,h)=>{const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#8fb8ce');g.addColorStop(.58,'#dce8e5');g.addColorStop(1,'#9caf93');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);for(let i=0;i<28;i++){const x=(Math.sin(i*4.37)*.5+.5)*w,y=h*(.60+.15*Math.sin(i*1.7));ctx.fillStyle=i%2?'#789b8b55':'#527d6b55';ctx.beginPath();ctx.ellipse(x,y,50+20*Math.sin(i),85+25*Math.cos(i),0,0,Math.PI*2);ctx.fill();}},1024,512);
 for(const z of [-1250,150,1550]){
  box([70,1450,1230],[-2845,850,z],trimMat);
  const glass=new THREE.Mesh(new THREE.PlaneGeometry(1180,1390),new THREE.MeshBasicMaterial({map:sky,color:0xdceff4}));glass.rotation.y=Math.PI/2;glass.position.set(-2788,850,z);room.add(glass);
  box([100,1450,35],[-2780,850,z],material(0xd9e1df));box([100,40,1220],[-2775,850,z+5],material(0xd9e1df));box([170,45,1320],[-2760,125,z],material(0xd1d8d2));
 }
 // Timber-topped background workbenches, with drawers and physical handles.
 const grain=texture((ctx,w,h)=>{ctx.fillStyle='#a48260';ctx.fillRect(0,0,w,h);for(let i=0;i<280;i++){const y=i*h/280;ctx.strokeStyle=`rgba(55,34,21,${.055+.085*(.5+.5*Math.sin(i*1.77))})`;ctx.lineWidth=i%7===0?2:1;ctx.beginPath();ctx.moveTo(0,y);for(let x=0;x<=w;x+=16)ctx.lineTo(x,y+2.5*Math.sin(x*.018+i*.3));ctx.stroke();}},1024,512);grain.wrapS=grain.wrapT=THREE.RepeatWrapping;grain.repeat.set(3,1);wood.map=grain;wood.bumpMap=grain;wood.bumpScale=.35;
 for(const x of [-1800,-450,900,2250]){
  box([1320,50,620],[x,15,-2000],wood);
  box([1160,660,520],[x,-340,-2000],cabinet);
  for(const dx of [-300,300])for(const yy of [-135,-335,-535]){box([560,177,18],[x+dx,yy,-1730],material(0x7893a2,.45));box([140,15,25],[x+dx,yy+34,-1710],steel);}
  for(const dx of [-510,510])box([46,72,450],[x+dx,-706,-2000],dark);
 }
 // Three secondary workstations make the room read as a teaching laboratory.
 function backgroundScope(x){const g=new THREE.Group();g.position.set(x,50,-2020);room.add(g);box([300,180,190],[0,90,0],material(0x99a8ad),g);box([200,139,6],[-32,92,99],material(0x142f39),g);
  const face=texture((ctx,w,h)=>{ctx.fillStyle='#102b36';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#426472';ctx.lineWidth=1;for(let x=0;x<w;x+=32){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}for(let y=0;y<h;y+=32){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}ctx.strokeStyle='#8dc9a8';ctx.lineWidth=3;ctx.beginPath();for(let x=0;x<w;x++){const y=h*.5+Math.sin(x*.035)*h*.21;x?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();},512,256);const screen=new THREE.Mesh(new THREE.PlaneGeometry(190,124),new THREE.MeshBasicMaterial({map:face}));screen.position.set(-32,92,103);g.add(screen);for(const y of [48,96,142]){const knob=new THREE.Mesh(new THREE.CylinderGeometry(11,11,8,18),steel);knob.rotation.x=Math.PI/2;knob.position.set(105,y,104);g.add(knob);}
  return g;}
 backgroundScope(-1690);backgroundScope(-300);backgroundScope(1350);
 for(const x of [-1650,-300,1050]){const seat=cylinder(135,40,[x,-235,-1290],material(0x3d5963,.65));for(const dx of [-80,80])for(const dz of [-80,80])cylinder(13,460,[x+dx,-485,-1290+dz],steel);}
 // Lab whiteboard with a readable, non-numeric electromagnetic sketch.
 box([1460,920,38],[950,1150,-2475],steel);const board=texture((ctx,w,h)=>{ctx.fillStyle='#e6ece3';ctx.fillRect(0,0,w,h);ctx.fillStyle='#4b6973';ctx.font='35px Microsoft YaHei';ctx.fillText('电磁学实验室',48,69);ctx.strokeStyle='#729195';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(45,95);ctx.lineTo(w-45,95);ctx.stroke();ctx.strokeStyle='#698c95';ctx.lineWidth=4;for(const x of [235,470]){ctx.beginPath();ctx.ellipse(x,300,65,128,0,0,Math.PI*2);ctx.stroke();}ctx.strokeStyle='#b0844f';ctx.beginPath();ctx.moveTo(120,300);ctx.lineTo(590,300);ctx.stroke();ctx.beginPath();ctx.moveTo(590,300);ctx.lineTo(565,285);ctx.moveTo(590,300);ctx.lineTo(565,315);ctx.stroke();ctx.fillStyle='#526f7c';ctx.font='28px Cambria';ctx.fillText('B',610,307);ctx.font='25px Cambria';ctx.fillText('F = q ( E + v × B )',665,240);ctx.fillText('E ⟂ B',665,310);ctx.fillText('I = ΔQ / Δt',665,380);},1024,640);const boardFace=new THREE.Mesh(new THREE.PlaneGeometry(1420,880),new THREE.MeshBasicMaterial({map:board}));boardFace.position.set(950,1150,-2450);room.add(boardFace);
 for(const x of [-1700,400,2500]){box([1300,30,180],[x,2070,-20],material(0x5e7380));box([1240,8,140],[x,2050,-20],new THREE.MeshBasicMaterial({color:0xe4f0ef}));}
 const ambientWindow=new THREE.DirectionalLight(0xcce7fa,.45);ambientWindow.position.set(-2200,1500,700);ambientWindow.target.position.set(0,0,0);scene.add(ambientWindow,ambientWindow.target);
 const adjusted=new Set();room.traverse(o=>{if(o.isMesh&&o.material.isMeshStandardMaterial&&!adjusted.has(o.material)){adjusted.add(o.material);o.material.color.multiplyScalar(.9);}});
 return {group:room,floor,setVisible(value){room.visible=value;},setOpacity(value){room.visible=value>.02;}};
}
