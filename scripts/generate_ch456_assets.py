"""Reproducible native-solver assets for chapters 4–6 (no synthetic curves).

Run from any directory with manimce Python. Completed bundles can be reused only
when both the native engine fingerprint and measurement asset hash match.
"""
import argparse
from datetime import datetime,timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'backend/physics'),str(ROOT/'backend')]
OUTPUT=ROOT/'frontend/assets/precomputed'
VOLTS=(4,6,8,10)


def write_json(name,value):
    path=OUTPUT/name;path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix(path.suffix+'.tmp')
    temporary.write_text(json.dumps(value,separators=(',',':'),allow_nan=False),encoding='utf-8')
    temporary.replace(path)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--chapter',choices=['4','5','6','all'],default='all')
    parser.add_argument('--force',action='store_true')
    args=parser.parse_args()
    import numpy as np
    import service
    from settings import parameters
    from fast_kernel import classify,render_samples
    from terminal_cache import TerminalCache
    # The generator is the sole cache owner. Give its many grids enough space
    # that a subsequent chapter can reuse every previously computed terminal.
    directory=ROOT/'results/ch456_generation_cache'
    service.CACHE=TerminalCache(directory,memory_mb=256,disk_mb=1024,max_entries=4096)
    measurement_path=ROOT/'frontend/assets/measurements.json'
    measurement=json.loads(measurement_path.read_text(encoding='utf-8'))
    measured=[dict(zip(measurement['columns'],r)) for r in measurement['magnetic_scan']['rows']]
    source_hash=hashlib.sha256(measurement_path.read_bytes()).hexdigest()
    metadata={'schema':1,'engine':service.ENGINE,'measurement_sha256':source_hash,
        'generated_utc':datetime.now(timezone.utc).isoformat(),'particles':8192,
        'geometry':{'anode_radius_mm':4.55,'filament_radius_um':37.5,'length_mm':35,'central_mm':15},
        'filament_V':3.68,'temperature_K':2000,'max_flight_ns':2000,
        'source':'Current native trajectory solver, fixed Sobol emission basis, normalized emitted-current weights'}
    zero={}
    for V in VOLTS:
        rows=[r for r in measured if r['nominal_voltage_V']==V and r['record_role']=='zero_before']
        zero[str(V)]={key:sum(r['physical_'+key+'_current_uA'] for r in rows)/len(rows) for key in ('A1','A2')}
        zero[str(V)]['emission_uA']=zero[str(V)]['A1']+zero[str(V)]['A2']

    def base(V,**extra):
        return parameters(dict(anode_V=V,filament_V=3.68,particles=8192,tilt_deg=0,
            emission_uA=zero[str(V)]['emission_uA'],compute_threads=1,progressive=True,**extra))

    def valid(name):
        path=OUTPUT/name
        if args.force or not path.exists():return False
        try:
            saved=json.loads(path.read_text(encoding='utf-8'))
            return saved['metadata']['engine']==service.ENGINE and saved['metadata']['measurement_sha256']==source_hash
        except (KeyError,ValueError):return False

    def scan(p,fields,moments=False):
        started=time.perf_counter()
        p=dict(p,fields_mT=fields)
        result=service.execute('scan',p)
        out={'params':p,'rows':result['rows'],'preview_rows':result['preview_rows']}
        if moments:
            out['moments']=[]
            for B in fields:
                terminal,_=service.cache().get(service.physical_key(p,B))
                assert terminal is not None and len(terminal)>=8192
                out['moments'].append(service.emission_moments(terminal[:8192],p))
        print(f"V={p['anode_V']:g} tilt={p['tilt_deg']:g} {p['launch_mode']} grad={p['gradient']} {len(fields)} fields {time.perf_counter()-started:.2f}s",flush=True)
        return out

    def thin(trace):
        # Keep extrema and spatial turns, exactly as the production path renderer.
        # Summary diagnostics retain the full integration; anchors remain unthinned.
        points=np.asarray(trace['points'])
        raw=np.column_stack((points[:,4],points[:,:3]))
        shown=render_samples(raw)
        trace=dict(trace)
        trace['source_points']=len(points)
        trace['points']=np.column_stack((shown[:,1:4],np.hypot(shown[:,1],shown[:,2]),shown[:,0])).round(8).tolist()
        trace['display_points']=len(shown)
        return trace

    try:
        service.warm()
        if args.chapter in ('4','all') and not valid('ch4_baseline.json'):
            ablations={};maps={};traces={};representatives={}
            for V in VOLTS:
                critical=service.cold_cutoff_T(V-1.84,.00455,.0000375)*1000
                dense_start=math.floor(max(0,critical-.65)/.025)*.025
                dense_end=math.ceil((critical+.45)/.025)*.025
                fields=sorted(set(float(v) for v in np.round(np.r_[np.arange(0,5.751,.15),
                    np.arange(dense_start,dense_end+.001,.025),4.,4.075,5.735,5.75],6)))
                for launch,gradient in [('cold',False),('full',False),('cold',True),('full',True),('axial',True)]:
                    key=f'{V}:{launch}:{int(gradient)}'
                    ablations[key]=scan(base(V,launch_mode=launch,gradient=gradient),fields)
                full=ablations[f'{V}:full:1']
                peak=max(full['rows'],key=lambda r:r['A1_uA'])['field_mT']
                mapping_fields=[0.,peak]
                if V==10:mapping_fields=sorted(set(mapping_fields+[2.,3.4,3.8,3.9,3.95,3.98,4.,4.04,4.075,4.12,4.18,4.2,4.5]))
                for B in mapping_fields:
                    p=dict(base(V),field_mT=B)
                    mapping=service.particles(p)
                    name=f'maps/{V}_{B:.6f}.json';write_json(name,mapping)
                    maps[f'{V}:{B:.6f}']=name
                p=dict(base(V),field_mT=4. if V==10 else peak)
                mapped=service.particles(p)
                candidates=[r[0] for r in mapped['particles'] if r[1]>7.5 and r[3]==1]
                if V==10:candidates=[6413]+[i for i in candidates if i!=6413]
                best=None
                for pid in candidates:
                    tr=service.trace(p,pid,include_zero_field=False)
                    if best is None or tr['radial_bounces']>best['radial_bounces']:best=tr
                    if tr['radial_bounces']>=3:break
                if best is not None:
                    pid=best['particle_id'];key=f'{V}:{p["field_mT"]:.6f}:{pid}'
                    traces[key]=best
                    local=V-3.68*(best['initial_state'][2]/.035+.5)
                    cf_p=dict(p,gradient=False,anode_V=local,filament_V=0.)
                    counter=service.trace(cf_p,initial_state=best['initial_state'],include_zero_field=False)
                    counter['request_params']=cf_p;counter['U_loc']=local
                    traces[key+':local']=counter
                    representatives[str(V)]={'particle_id':pid,'field_mT':p['field_mT'],'trace':key,'local_trace':key+':local'}
                else:
                    raise AssertionError(f'No K-origin central collector at {V} V / {peak} mT')
            p=dict(base(10),field_mT=4.075)
            tr=service.trace(p,2907,include_zero_field=False);traces['10:4.075000:2907']=tr
            local=10-3.68*(tr['initial_state'][2]/.035+.5)
            cf_p=dict(p,gradient=False,anode_V=local,filament_V=0.)
            traces['10:4.075000:2907:local']=service.trace(cf_p,initial_state=tr['initial_state'],include_zero_field=False)|{'request_params':cf_p,'U_loc':local}
            assert traces[representatives['10']['local_trace']]['radial_bounces']==1
            assert abs(traces[representatives['10']['local_trace']]['flight_ns']-10.21013)<.001
            write_json('ch4_baseline.json',{'metadata':metadata,'zero_measured':zero,'ablations':ablations,'maps':maps,'traces':traces,'representatives':representatives})
        if args.chapter in ('5','all') and not valid('ch5_bundle.json'):
            fields=np.linspace(0,5.735,29)
            for special in (5.,5.377):fields[np.argmin(abs(fields-special))]=special
            fields=sorted(np.round(fields,6).tolist());scans={};traces={};wheels={}
            for V in VOLTS:
                for theta in (0,3,5,8,10):
                    scans[f'{V}:{theta}']=scan(dict(base(V),tilt_deg=theta),fields)
            for pid,B in ((3415,5.735),(42,5.)):
                p=dict(base(10),field_mT=B)
                for theta in (0,8):
                    tr=service.trace(dict(p,tilt_deg=theta),pid,include_zero_field=False,series=['pphi'])
                    traces[f'{pid}:{theta}']=tr
                initial=np.asarray(traces[f'{pid}:0']['initial_state']);sectors=[]
                for degrees in range(0,360,5):
                    angle=math.radians(degrees);cs,sn=math.cos(angle),math.sin(angle)
                    rotation=np.array([[cs,-sn],[sn,cs]]);state=initial.copy()
                    state[:2]=rotation@initial[:2];state[3:5]=rotation@initial[3:5]
                    tr=service.trace(dict(p,tilt_deg=8),initial_state=state,include_zero_field=False)
                    name=f'wheel/{pid}_{degrees:03d}.json';write_json(name,thin(tr))
                    sectors.append({'angle_deg':degrees,'outcome':tr['outcome'],'region':tr['region'],
                        'flight_ns':tr['flight_ns'],'radial_bounces':tr['radial_bounces'],'trace':name})
                counts=np.bincount([r['outcome'] for r in sectors],minlength=6).tolist()
                wheels[str(pid)]={'field_mT':B,'tilt_deg':8,'sectors':sectors,'counts':counts}
                print(f'wheel {pid}: {counts}',flush=True)
            write_json('ch5_bundle.json',{'metadata':metadata,'zero_measured':zero,'scans':scans,'traces':traces,'wheels':wheels})
        if args.chapter in ('6','all') and not valid('ch6_bundle.json'):
            scans={};presets={};cal=measurement['calibration']
            # Use the measured acquisition grid for the same cutoff operator.
            for V in VOLTS:
                up=[r for r in measured if r['nominal_voltage_V']==V and r['record_role']=='up' and 0<=r['excitation_set_mA']<=1400]
                fields=sorted(set([0.,5.735]+[round(max(0,cal['slope_mT_per_A']*r['excitation_actual_A']+cal['intercept_mT']),8) for r in up]))
                for theta in (0,5,8,10):
                    p=dict(base(V),tilt_deg=theta)
                    result=scan(p,fields,moments=True);scans[f'{V}:{theta}']=result
                    for eta in (0.,.76):
                        weighted=[]
                        for index,(B,moment) in enumerate(zip(fields,result['moments'])):
                            n=moment['particles'];den=n-eta*moment['q_sum'];em=p['emission_uA'];collectors=moment['collectors']
                            a={key:em*(value['count']-eta*value['q_sum'])/den for key,value in collectors.items()}
                            row=dict(result['rows'][index],A1_uA=a['A1'],A2_H_uA=a['A2_H'],A2_K_uA=a['A2_K'])
                            row['A2_uA']=a['A2_H']+a['A2_K'];row['sum_uA']=a['A1']+row['A2_uA']
                            row['fractions']=[(count-eta*q)/den for count,q in zip(moment['outcome_counts'],moment['outcome_q_sums'])]
                            weighted.append(row)
                        presets[f'{V}:{theta}:{eta:g}']=weighted
            write_json('ch6_bundle.json',{'metadata':metadata,'zero_measured':zero,'scans':scans,'presets':presets})
        manifest={'metadata':metadata,'files':{}}
        for path in sorted(OUTPUT.rglob('*.json')):
            if path.name=='manifest.json':continue
            data=path.read_bytes()
            manifest['files'][path.relative_to(OUTPUT).as_posix()]={'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
        write_json('manifest.json',manifest)
    finally:
        service.close_cache();service.CACHE=None


if __name__=='__main__':main()
