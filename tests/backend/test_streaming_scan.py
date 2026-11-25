"""Real parallel scans, ordered results, cancellation prefixes and pphi units."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time

ROOT=Path(__file__).resolve().parents[2]
sys.path[:0]=[str(ROOT/'backend/physics'),str(ROOT/'backend')]


def main():
    with tempfile.TemporaryDirectory(prefix='magnetron_stream_') as temporary:
        os.environ['MAGNETRON_DATA_DIR']=temporary
        import numpy as np
        import service
        from settings import parameters
        report={}
        try:
            p=parameters({'anode_V':10,'filament_V':3.68,'particles':8192,'emission_uA':44.299,
                'tilt_deg':8,'fields_mT':[0.,4.,5.735], 'progressive':True})
            updates=[];start=time.perf_counter()
            result=service.execute('scan',p,lambda u:updates.append((time.perf_counter()-start,u)))
            assert result['completed_fields']==3 and not result['cancelled']
            assert [r['field_mT'] for r in result['rows']]==p['fields_mT']
            assert all(sum(r['counts'])==8192 for r in result['rows'])
            assert len(result['preview_rows'])==3
            first_preview=next(i for i,(_,u) in enumerate(updates) if u.get('phase')=='preview')
            first_row=next(i for i,(_,u) in enumerate(updates) if 'row' in u)
            assert first_preview<first_row
            assert all(sum(r['counts'])==1024 for r in result['preview_rows'])
            assert result['numerics']['compute_threads_per_point']==1
            assert result['stats']['integrated_particles']==3*8192
            assert result['stats']['particles_reused']==3*1024
            report['scan_s']=time.perf_counter()-start
            report['arrival_order']=[u['field_idx'] for _,u in updates if 'row' in u]
            report['preview_s']=updates[first_preview][0]
            # Compare to the same native solver called directly, not a fitted curve.
            c,voltage=service.config_for(p)
            initial=service.source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'])
            from fast_kernel import run_terminal
            terminal=run_terminal(initial[:8192],voltage,.005735,8,c,threads=1)
            reference=service.row_from(terminal,5.735,p)
            assert {k:v for k,v in result['rows'][-1].items() if k!='field_idx'}==reference
            descending=service.execute('scan',dict(p,progressive=False,fields_mT=[5.735,4.,0.]))
            assert [r['field_mT'] for r in descending['rows']]==[5.735,4.,0.]
            moments=service.emission_moments(terminal,p)
            eta=.76;denominator=moments['particles']-eta*moments['q_sum']
            weighted=service.row_from(terminal,5.735,dict(p,emission_profile='cooled_ends',end_cooling_eta=eta))
            for name,moment in moments['collectors'].items():
                value=p['emission_uA']*(moment['count']-eta*moment['q_sum'])/denominator
                assert abs(value-weighted[name+'_uA'])<1e-12
            mapped=service.particles(dict(p,field_mT=0,tilt_deg=0))
            assert len(mapped['particles'])==8192
            assert sum(map(sum,mapped['transfer_counts']))==8192
            # Real partial prefixes survive cancellation and resume exactly.
            q=parameters(dict(p,particles=32768,tilt_deg=9,progressive=False,fields_mT=[0.,5.,5.5]))
            stop=threading.Event();seen=[]
            def cancel_after_progress(update):
                seen.append(update)
                done=update.get('particles_done',0)
                if done>0 and done<3*32768:stop.set()
            try:
                partial=service.execute('scan',q,cancel_after_progress,stop.is_set)
                assert partial['cancelled']
            except service.Cancelled:
                partial={'cancelled':True,'rows':[]}
            assert stop.is_set()
            prefixes={}
            for B in q['fields_mT']:
                cached,_=service.cache().get(service.physical_key(q,B))
                if cached is not None:prefixes[B]=cached.copy()
            resumed=service.execute('scan',q)
            assert resumed['completed_fields']==3 and not resumed['cancelled']
            for B,prefix in prefixes.items():
                cached,_=service.cache().get(service.physical_key(q,B))
                assert np.array_equal(cached[:len(prefix)],prefix)
            report['saved_prefixes']={str(B):len(v) for B,v in prefixes.items()}
            # Physics anchors: optional series changes only diagnostics.
            trace_p=parameters(dict(p,tilt_deg=0,field_mT=5.735))
            axial=service.trace(trace_p,3415,include_zero_field=False,series=['pphi'])
            tilted=service.trace(dict(trace_p,tilt_deg=8),3415,include_zero_field=False,series=['pphi'])
            assert len(axial['pphi_mm2_per_ns'])==len(axial['points'])
            assert np.ptp(axial['pphi_mm2_per_ns'])<5.1e-8
            assert abs(tilted['pphi_mm2_per_ns'][-1]+3.994922)<1e-5
            assert abs(tilted['pphi_hull_scale_mm2_per_ns']-10.44)<.01
            launch=service.trace(dict(trace_p,field_mT=4),6413,include_zero_field=False)
            u_loc=10-3.68*(launch['initial_state'][2]/.035+.5)
            local=service.trace(dict(trace_p,field_mT=4,gradient=False,anode_V=u_loc,filament_V=0),
                initial_state=launch['initial_state'],include_zero_field=False)
            assert local['radial_bounces']==1 and local['outcome']==0
            assert abs(local['flight_ns']-10.21013)<.001
            report['pphi_variation']=float(np.ptp(axial['pphi_mm2_per_ns']))
            report['counterfactual_ns']=local['flight_ns']
        finally:
            service.close_cache();service.CACHE=None
        report['passed']=True
        output=ROOT/'results/latest/ch456_backend';output.mkdir(parents=True,exist_ok=True)
        (output/'streaming_scan.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(report),flush=True)


if __name__=='__main__':main()
