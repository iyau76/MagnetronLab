import * as THREE from '../node_modules/three/build/three.module.js';
import {GLTFLoader} from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {GLTFExporter} from '../node_modules/three/examples/jsm/exporters/GLTFExporter.js';
import {mergeGeometries} from '../node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
import {prepareBench} from '../bench_geometry.js';
import fs from 'node:fs/promises';
globalThis.FileReader=class{
 readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}
 readAsDataURL(blob){blob.arrayBuffer().then(result=>{this.result='data:'+blob.type+';base64,'+Buffer.from(result).toString('base64');this.onloadend?.();});}
};
const sourceUrl=new URL('../source_assets/bench.glb',import.meta.url);
async function loadSourceScene(){
 const raw=await fs.readFile(sourceUrl);
 const gltf=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 gltf.scene.updateMatrixWorld(true);
 return gltf.scene;
}

// Merge the source scene into the asset loaded by the current frontend.
const merged=prepareBench(await loadSourceScene(),THREE,mergeGeometries);
const buffer=await new GLTFExporter().parseAsync(merged,{binary:true});

const out=url=>new URL(url,import.meta.url);
await fs.writeFile(out('../assets/bench_optimized.glb'),Buffer.from(buffer));
const record={source_parts:merged.userData.source_parts,batches:merged.children.length,
 bytes:buffer.byteLength,build_ms:null,
 outputs:{bench_optimized_glb:buffer.byteLength}};
await fs.mkdir(out('../../results/latest'),{recursive:true});
await fs.writeFile(out('../../results/latest/bench_asset.json'),JSON.stringify(record,null,2));
console.log('parts',merged.userData.source_parts,'bytes',buffer.byteLength);
