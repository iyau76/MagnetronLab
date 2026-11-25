"""Finite-field reuse, explicit pending weight, cancellation and baseline isolation."""
import sys,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'backend/physics'))
from backend.settings import parameters
import edge_field as edge
import service
from fast_kernel import Cancelled
baseline=ROOT/'backend/physics/magnetron_core.dll';digest=hashlib.sha256(baseline.read_bytes()).hexdigest()
bundle=json.loads((ROOT/'frontend/assets/precomputed/ch6_edge_bundle.json').read_text(encoding='utf8'))
p=parameters(bundle['scans']['open_t7_n8192']['params']);p.update(field_mT=4.5,edge_boundary='open',progressive=False)
result=edge.execute('edge_point',p,lambda _:None,lambda:False);row=result['rows'][0]
expected=next(r for r in bundle['scans']['open_t7_n8192']['rows'] if r['field_mT']==4.5)
for k in ('A1_uA','A2_uA','A2_H_uA','A2_K_uA'):
    assert abs(row[k]-expected[k])<1e-10,(k,row[k],expected[k])
assert row['pending_fraction']>0 and abs(sum(row['fractions'])-1)<1e-12
p['end_cooling_eta']=.75
reweighted=edge.execute('edge_point',p,lambda _:None,lambda:False)
assert reweighted['stats']['integrated_particles']==0
assert edge.field_for.cache_info().hits>=1
assert service.CACHE is None and hashlib.sha256(baseline.read_bytes()).hexdigest()==digest
p.update(field_mT=4.6,particles=8192);calls=[0]
def cancel():calls[0]+=1;return calls[0]>5
try:edge.execute('edge_point',p,lambda _:None,cancel)
except Cancelled:pass
else:raise AssertionError('Edge cancellation was ignored')
assert calls[0]<8
out=ROOT/'results/latest/edge_backend';out.mkdir(parents=True,exist_ok=True)
(out/'verification.json').write_text(json.dumps({'result':result,'reweighted':reweighted,'cancel_checks':calls[0],'baseline_sha256':digest},indent=2),encoding='utf8')
print('Edge field matches existing terminals, reweights without reintegration, cancels and leaves baseline untouched')
