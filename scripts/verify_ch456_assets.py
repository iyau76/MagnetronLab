"""Validate generated evidence bundles without rerunning trajectories."""
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'frontend/assets/precomputed'


def main():
    manifest=json.loads((BASE/'manifest.json').read_text(encoding='utf8'))
    for relative,entry in manifest['files'].items():
        data=(BASE/relative).read_bytes()
        assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256'],relative
    print(len(manifest['files']),'asset hashes verified')
    for chapter in (4,5,6):
        name='ch4_baseline.json' if chapter==4 else f'ch{chapter}_bundle.json'
        data=json.loads((BASE/name).read_text(encoding='utf8'))
        assert data['metadata']['particles']==8192
        series=data.get('ablations',data.get('scans',{}))
        for key,scan in series.items():
            rows=scan['rows'];fields=[row['field_mT'] for row in rows]
            assert fields==sorted(set(fields)),(name,key)
            for row in rows:
                assert sum(row['counts'])==8192,(name,key,row)
                assert abs(row['A2_uA']-row['A2_H_uA']-row['A2_K_uA'])<1e-8
                assert abs(row['sum_uA']-row['A1_uA']-row['A2_uA'])<1e-8
        if chapter==4:
            for relative in data['maps'].values():assert (BASE/relative).is_file(),relative
            t=data['traces']['10:4.000000:6413:local'];assert t['request_params']['filament_V']==0 and t['request_params']['gradient'] is False
            assert t['radial_bounces']==1 and abs(t['flight_ns']-10.210127)<.001
        print(name,len(series),'physical scans validated')


if __name__=='__main__':main()
