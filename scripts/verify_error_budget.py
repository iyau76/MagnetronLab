"""Recompute the two source-boundary rows approved on 2026-11-16."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'frontend/assets/measurements.json'
asset=json.loads(source.read_text(encoding='utf-8'))
point=next(p for p in asset['calibration']['points'] if p['current_A']==1)
fields=point['fields_mT'];mean=sum(fields)/len(fields)
result={
    'measurement_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
    'diameter_mm':[9.,9.2],'reference_diameter_mm':9.1,
    'radius_relative_pct':[100*(d/9.1-1) for d in [9.,9.2]],
    'em_geometry_relative_pct':[100*((9.1/d)**2-1) for d in [9.,9.2]],
    'five_hole_current_A':1.,'fields_mT':fields,'mean_mT':mean,
    'field_span_pct':100*(max(fields)-min(fields))/mean,
    'field_relative_pct':[100*(v/mean-1) for v in [min(fields),max(fields)]],
    'em_field_relative_pct':[100*((mean/v)**2-1) for v in [min(fields),max(fields)]],
    'meaning':'Five spatial readings at 1 A; no fitted-window uncertainty or independent additive error budget is inferred.',
}
assert 4.66<result['field_span_pct']<4.68
assert 2.23<result['em_geometry_relative_pct'][0]<2.24
target=ROOT/'results/latest/ch456_backend/error_budget.json'
target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
