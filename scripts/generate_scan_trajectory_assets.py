"""Real sparse particle paths accompanying each chapter-five scan frame."""
from pathlib import Path
import hashlib
import json
import sys
import numpy as np

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'backend/physics'),str(ROOT/'backend')]
import service
from fast_kernel import render_samples

OUTPUT=ROOT/'frontend/assets/precomputed'

def simplify(points,tolerance=.025):
    """Retain measured samples with a <=25 micrometre spatial chord error."""
    xyz=np.asarray(points)[:,:3];keep={0,len(xyz)-1};stack=[(0,len(xyz)-1)]
    while stack:
        lo,hi=stack.pop()
        if hi-lo<2:continue
        v=xyz[hi]-xyz[lo];delta=xyz[lo+1:hi]-xyz[lo];vv=float(v@v)
        nearest=np.clip(delta@v/vv,0,1)[:,None]*v if vv>0 else np.zeros_like(delta)
        distance=np.sum((delta-nearest)**2,axis=1);i=int(np.argmax(distance))
        if distance[i]>tolerance*tolerance:
            mid=lo+1+i;keep.add(mid);stack.extend([(lo,mid),(mid,hi)])
    return [points[i] for i in sorted(keep)]

def publish(bundle,frames):
    folder=OUTPUT/'cloud';folder.mkdir(exist_ok=True)
    manifest=json.loads((OUTPUT/'manifest.json').read_text());refs={}
    for key,value in frames.items():
        name=f'cloud/{key.replace(":","_")}.json';path=OUTPUT/name
        for frame in value:
            for tr in frame:tr['points']=simplify(tr['points'])
        path.write_text(json.dumps(value,separators=(',',':'),allow_nan=False),encoding='utf8');raw=path.read_bytes()
        refs[key]=name;manifest['files'][name]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    path=OUTPUT/'ch5_scan_traces.json'
    path.write_text(json.dumps({'metadata':bundle['metadata'],'particles':[42,169,245,2277,3415,6413],'spatial_tolerance_mm':.025,'files':refs},separators=(',',':')),encoding='utf8');data=path.read_bytes()
    manifest['files'][path.name]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
    (OUTPUT/'manifest.json').write_text(json.dumps(manifest,separators=(',',':')),encoding='utf8')
    print(f'Cloud assets: {sum(p.stat().st_size for p in folder.glob("*.json"))/1e6:.2f} MB',flush=True)

def main():
    bundle=json.loads((OUTPUT/'ch5_bundle.json').read_text())
    particles=[42,169,245,2277,3415,6413];out={}
    service.warm()
    for key,scan in bundle['scans'].items():
        frames=[]
        for row in scan['rows']:
            group=[]
            for pid in particles:
                tr=service.trace(dict(scan['params'],field_mT=row['field_mT']),pid,include_zero_field=False)
                p=np.asarray(tr['points']);raw=np.column_stack((p[:,4],p[:,:3]));s=render_samples(raw)
                group.append({'particle_id':pid,'outcome':tr['outcome'],'flight_ns':tr['flight_ns'],
                    'points':np.column_stack((s[:,1:4],np.hypot(s[:,1],s[:,2]),s[:,0])).round(7).tolist()})
            frames.append(group)
        out[key]=frames
        print(f'{key}: {len(frames)} physical frames',flush=True)
    publish(bundle,out)

if __name__=='__main__':main()
