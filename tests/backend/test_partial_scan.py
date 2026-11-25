"""Real native progress cancellation, disk-prefix resume, default scan and paths."""
import os,sys,time,tempfile,threading,json,hashlib,datetime,importlib.metadata
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]

def snapshot(directory):
    return sorted((p.name,p.stat().st_size,p.stat().st_mtime_ns) for p in directory.glob('*.npy'))

def main():
    before=snapshot(ROOT/'results/trajectory_cache')
    measurements={}
    with tempfile.TemporaryDirectory(prefix='magnetron_partial_acceptance_') as temporary:
        directory=Path(temporary)
        os.environ['MAGNETRON_DATA_DIR']=temporary
        os.environ['NUMBA_CACHE_DIR']=str(directory/'numba')
        sys.path[:0]=[str(ROOT/'backend'/'physics'),str(ROOT/'backend')]
        import numpy as np
        import service
        from settings import DEFAULT
        from terminal_cache import TerminalCache
        def measure(name,action):
            start=time.perf_counter();result=action();elapsed=time.perf_counter()-start
            measurements[name]={'wall_s':elapsed}
            if isinstance(result,dict):measurements[name]['stats']=result.get('stats')
            print(f'{name}: {elapsed:.4f} s',flush=True)
            return result
        def switch_cache(name):
            if service.CACHE is not None:service.CACHE.close()
            service.CACHE=TerminalCache(directory/name)
        params=dict(DEFAULT,particles=4096,compute_threads=4)
        measure('isolated_kernel_warmup',service.warm)
        switch_cache('reference')
        assert len(service.grid(params))==42
        cold=measure('scan_cold',lambda:service.execute('scan',params))
        hot=measure('scan_hot',lambda:service.execute('scan',params))
        assert cold['completed_fields']==42 and not cold['cancelled']
        assert cold['stats']['integrated_particles']==42*4096
        assert hot['rows']==cold['rows'] and hot['stats']['cache_hits']==42
        assert hot['stats']['integrated_particles']==0
        point=measure('point',lambda:service.execute('point',params))
        assert sum(point['row']['counts'])==4096 and len(point['paths'])==48
        point_hot=measure('point_hot',lambda:service.execute('point',params))
        assert point_hot['row']==point['row'] and point_hot['stats']['cache_hits']==1
        # Slow physical trajectories, with no artificial delay or callback count.
        cancel_params=dict(params,fields_mT=[0.,5.,5.5],launch_mode='cold',gradient=False,tilt_deg=2.)
        switch_cache('cancel_reference')
        reference=measure('cancel_reference',lambda:service.execute('scan',cancel_params))
        switch_cache('partial')
        stop=threading.Event();updates=[]
        def progress(update):
            updates.append(dict(update))
            if update.get('phase')=='statistics' and 4096<update.get('particles_done',0)<8192:stop.set()
        partial=measure('cancel_partial',lambda:service.execute('scan',cancel_params,progress,stop.is_set))
        assert stop.is_set(),'No real partial progress event observed'
        assert partial['cancelled'] and 0<partial['completed_fields']<3
        reference_by_field={row['field_mT']:row for row in reference['rows']}
        assert all(row==reference_by_field[row['field_mT']] for row in partial['rows'])
        prefixes={}
        for B in cancel_params['fields_mT']:
            value,_=service.CACHE.get(service.physical_key(cancel_params,B))
            if value is not None:prefixes[B]=value.copy()
        partial_prefixes={B:p for B,p in prefixes.items() if 0<len(p)<4096}
        assert partial_prefixes,'No incomplete physical field prefix was preserved'
        integrated=sum(len(p) for p in partial_prefixes.values())
        assert partial['stats']['integrated_particles']==sum(len(p) for p in prefixes.values())
        switch_cache('partial')
        for B,prefix in prefixes.items():
            reloaded,origin=service.CACHE.get(service.physical_key(cancel_params,B))
            assert origin=='disk' and np.array_equal(prefix,reloaded)
        resumed=measure('resume',lambda:service.execute('scan',cancel_params))
        assert resumed['completed_fields']==3 and not resumed['cancelled']
        assert resumed['rows']==reference['rows']
        assert resumed['stats']['cache_hits']==sum(len(p)==4096 for p in prefixes.values())
        assert resumed['stats']['particles_reused']==integrated
        assert resumed['stats']['integrated_particles']==3*4096-sum(len(p) for p in prefixes.values())
        for B,prefix in prefixes.items():
            terminal,_=service.CACHE.get(service.physical_key(cancel_params,B))
            assert np.array_equal(prefix,terminal[:len(prefix)])
        prefix=np.concatenate(list(partial_prefixes.values()))
        service.CACHE.close();service.CACHE=None
        assert snapshot(ROOT/'results/trajectory_cache')==before
        try:numba_version=importlib.metadata.version('numba')
        except importlib.metadata.PackageNotFoundError:numba_version=None
        report={'checks':'passed','engine':cold['engine'],'default_params':params,
            'default_rows':cold['rows'],'single_point_row':point['row'],
            'cancellation_params':cancel_params,'reference_rows':reference['rows'],
            'saved_prefix_particles':integrated,'saved_prefix_sha256':hashlib.sha256(prefix.tobytes()).hexdigest(),
            'prefix_reloaded_from':origin,'resumed_prefix_bitwise_equal':True,
            'progress_updates':updates,'measurements':measurements,'numba_optional_version':numba_version,
            'global_cache_unchanged':True}
    output=ROOT/'results'/'latest'/'partial_scan'
    output.mkdir(parents=True,exist_ok=True)
    (output/'measurements.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    (output/'acceptance.md').write_text(f'Default 42-field cold/hot scan and 48 paths passed.\nCancellation from real native progress saved {integrated} continuous rows.\nDisk reload and resume reproduce all requested rows and preserve the prefix bitwise.\nNo artificial delay or callback-count trigger. Global cache unchanged.\n',encoding='utf-8')
    print(json.dumps({'checks':'passed','directory':str(output),'prefix_particles':integrated}),flush=True)
if __name__=='__main__':main()
