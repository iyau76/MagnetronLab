"""Exercise finite-field HTTP jobs, incremental passes and cross-engine cancellation."""
import hashlib,json,time
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request,urlopen
ROOT=Path(__file__).resolve().parents[2]
BASE='http://127.0.0.1:8894'
def req(path,body=None):
    with urlopen(Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'}),timeout=15) as r:return json.load(r)
def done(ident):
    end=time.monotonic()+120
    while time.monotonic()<end:
        j=req('/api/job/'+ident)
        if j['state']=='done':return j
        assert j['state'] not in ['error','cancelled'],j
        time.sleep(.05)
    raise AssertionError('finite field job did not finish')
p={'anode_V':10,'filament_V':3.68,'temperature_K':2000,'tilt_deg':7.5,'particles':1024,'compute_threads':1,'emission_profile':'cooled_ends','end_cooling_eta':.76,'field_mT':4.45,'edge_boundary':'open'}
dll=ROOT/'backend/physics/magnetron_core.dll';before=hashlib.sha256(dll.read_bytes()).hexdigest()
first=done(req('/api/edge/point',p)['id']);r=first['result'];assert len(r['rows'])==1
assert r['stats']['integrated_particles']+r['stats']['particles_reused']==1024
assert abs(sum(r['rows'][0]['fractions'])-1)<1e-12 and r['field_residual']<1e-10
again=done(req('/api/edge/point',dict(p,end_cooling_eta=.75))['id']);assert again['result']['stats']['integrated_particles']==0
try:req('/api/edge/point',dict(p,length_mm=36))
except HTTPError as e:assert e.code==400
else:raise AssertionError('edge solver accepted unsupported geometry')
scan=req('/api/edge/scan',dict(p,particles=4096,progressive=True,fields_mT=[4.3,4.4]))['id']
cursor=0;arrivals=[];preview=None;end=time.monotonic()+120
while time.monotonic()<end:
    j=req(f'/api/job/{scan}?since={cursor}')
    if j.get('preview_rows'):preview=j['preview_rows']
    arrivals.extend(j['rows']);cursor=j['next_cursor']
    if j['state']=='done':break
    assert j['state'] not in ['error','cancelled'],j
    time.sleep(.05)
else:raise AssertionError('edge scan did not finish')
assert preview and all(r['particles']==1024 for r in preview)
assert [r['field_idx'] for r in arrivals]==[0,1] and all(r['particles']==4096 for r in arrivals)
old=req('/api/edge/scan',dict(p,particles=32768,fields_mT=[4.51,4.52,4.53]))['id'];time.sleep(.15)
t=time.monotonic();new=req('/api/scan',dict(p,tilt_deg=0,fields_mT=[0,4]))['id'];submit_s=time.monotonic()-t
assert req('/api/job/'+old)['state']=='cancelled'
baseline=done(new);assert len(baseline['result']['rows'])==2
assert hashlib.sha256(dll.read_bytes()).hexdigest()==before
out=ROOT/'results/latest/edge_backend';out.mkdir(parents=True,exist_ok=True)
(out/'http.json').write_text(json.dumps({'point':first,'eta_reuse':again,'preview':preview,'rows':arrivals,'replacement_submit_s':submit_s,'baseline_sha256':before},indent=2),encoding='utf8')
print('Finite-field HTTP point, reuse, preview/refinement, geometry guard and engine replacement passed',flush=True)
