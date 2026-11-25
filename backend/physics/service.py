"""Physics tasks: field -> trajectories -> collection -> measured-current scaling."""
import sys,json,hashlib,time,os
from pathlib import Path
from functools import lru_cache
from threading import Lock
import numpy as np
from concurrent.futures import wait,FIRST_COMPLETED
from magnetron_model import CONFIG,emission_samples,cold_cutoff_T
from fast_kernel import run_terminal,run_paths,run_trace,classify,Cancelled,PATH_COUNT,warm_native,STATISTICAL_TILT_RTOL,REFERENCE_RTOL,native_available
from terminal_cache import TerminalCache
BACKEND_ROOT=Path(__file__).resolve().parents[1]
ROOT=Path(sys.executable).resolve().parent if getattr(sys,'frozen',False) else BACKEND_ROOT.parent
sys.path.insert(0,str(BACKEND_ROOT))
try:
    from backend.settings import DEFAULT
except ModuleNotFoundError:
    from settings import DEFAULT
_engine_files=[Path(__file__).with_name('fast_kernel.py'),Path(__file__).with_name('magnetron_core.dll'),Path(__file__).with_name('emission_basis.npy')]
ENGINE=hashlib.sha256(b''.join(path.read_bytes() for path in _engine_files if path.exists())+json.dumps(CONFIG,sort_keys=True).encode()+os.environ.get('MAGNETRON_FORCE_PYTHON_KERNEL','0').encode()).hexdigest()[:16]
CACHE=None
_CACHE_LOCK=Lock()
def cache():
    global CACHE
    with _CACHE_LOCK:
        if CACHE is None:CACHE=TerminalCache(Path(os.environ.get('MAGNETRON_DATA_DIR',str(ROOT/'results')))/'trajectory_cache')
        return CACHE

def config_for(p):
    c=dict(CONFIG)
    c.update(anode_radius_m=p['anode_radius_mm']*.001,filament_radius_m=p['filament_radius_um']*1e-6,
        tube_length_m=p['length_mm']*.001,central_collector_length_m=p['central_mm']*.001,
        filament_voltage_V=p['filament_V'] if p['gradient'] else 0.,temperature_K=p['temperature_K'],
        rtol=REFERENCE_RTOL if p.get('accuracy','statistical')=='reference' else (1e-6 if p['tilt_deg']==0 else STATISTICAL_TILT_RTOL))
    voltage=p['anode_V'] if p['gradient'] else p['anode_V']-p['filament_V']/2
    return c,voltage

@lru_cache(maxsize=1)
def emission_basis():
    path=Path(__file__).with_name('emission_basis.npy')
    metadata=json.loads(path.with_suffix('.json').read_text(encoding='utf-8'))
    if metadata['seed']!=CONFIG['seed']:raise RuntimeError('Emission basis seed mismatch; regenerate the frozen basis')
    if hashlib.sha256(path.read_bytes()).hexdigest()!=metadata['basis_sha256']:
        raise RuntimeError('Emission basis checksum mismatch')
    states=np.load(path,allow_pickle=False)
    if states.shape!=(32768,6) or not np.isfinite(states).all():raise RuntimeError('Invalid emission basis')
    states.flags.writeable=False
    return states

@lru_cache(maxsize=4)
def source_states(temperature,filament_radius,length,launch_mode="full"):
    # Sobol prefixes retain exactly the same initial particles at each resolution.
    states=emission_basis().copy()
    states[:,:2]*=filament_radius;states[:,2]*=length;states[:,3:]*=np.sqrt(temperature)
    if launch_mode!='full':
        states=states.copy();states[:,3:5]=0.
        if launch_mode=='cold':states[:,5]=0.
    states.flags.writeable=False
    return states

def physical_key(p,B):
    c,voltage=config_for(p)
    # Same-potential segment length and source strength do not enter the force law.
    values=[ENGINE,voltage,c['filament_voltage_V'],c['filament_radius_m'],c['anode_radius_m'],
            c['tube_length_m'],p['temperature_K'],p['tilt_deg'],float(B),CONFIG['seed'],p.get('launch_mode','full'),c['rtol'],c['max_flight_time_s']]
    return hashlib.sha256(json.dumps(values).encode()).hexdigest()[:24]

def row_from(terminal,B,p,z0_array=None):
    outcomes=classify(terminal,p['central_mm']*.001)
    counts=np.bincount(outcomes,minlength=6)
    weights=np.ones(len(outcomes))
    if p.get('emission_profile','uniform')=='cooled_ends' and p.get('end_cooling_eta',0):
        if z0_array is None:
            c,_=config_for(p)
            z0_array=source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'],p.get('launch_mode','full'))[:len(outcomes),2]
        weights=1-p['end_cooling_eta']*(2*np.asarray(z0_array)/ (p['length_mm']*.001))**2
        weights=weights/weights.mean()
    fractions=np.bincount(outcomes,weights=weights,minlength=6)/len(outcomes)
    h=(outcomes==2)&(terminal[:,4]<0);k=(outcomes==2)&~h
    emission=p['emission_uA']
    return {'field_mT':float(B),'A1_uA':float(fractions[1]*emission),
        'A2_uA':float(fractions[2]*emission),'sum_uA':float((fractions[1]+fractions[2])*emission),
        'A2_H_uA':float(weights[h].sum()/len(outcomes)*emission),
        'A2_K_uA':float(weights[k].sum()/len(outcomes)*emission),
        'region_counts':[int(h.sum()),int(counts[1]),int(k.sum())],
        'counts':counts.tolist(),'fractions':fractions.tolist()}


def emission_moments(terminal,p):
    """Exact sufficient statistics for any normalized quadratic end cooling."""
    c,_=config_for(p)
    source=source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'],p.get('launch_mode','full'))[:len(terminal)]
    q=(2*source[:,2]/c['tube_length_m'])**2
    outcome=classify(terminal,p['central_mm']*.001)
    masks={'A1':outcome==1,'A2_H':(outcome==2)&(terminal[:,4]<0),'A2_K':(outcome==2)&(terminal[:,4]>=0)}
    return {'particles':len(terminal),'q_sum':float(q.sum()),
        'outcome_counts':np.bincount(outcome,minlength=6).tolist(),
        'outcome_q_sums':np.bincount(outcome,weights=q,minlength=6).tolist(),
        'collectors':{name:{'count':int(mask.sum()),'q_sum':float(q[mask].sum())} for name,mask in masks.items()}}


def particles(p,cache_terminals=True,cancel=lambda:False):
    """Full emission-to-terminal map. Unintegrated losses have no invented hit."""
    stats={'solve_s':0.,'cache_io_s':0.,'cache_hits':0,'integrated_particles':0,'particles_reused':0,
        'accepted_steps':0,'batch_count':0,'max_batch_s':0.,'pruned_particles':0}
    c,_=config_for(p)
    source=source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'],p.get('launch_mode','full'))[:p['particles']]
    if cache_terminals:
        terminal=solve(p,p['field_mT'],stats,lambda n:None,cancel)
    else:
        # HTTP owns no disk cache: the scientific owner process is the only
        # writer. This short diagnostic call can coexist with a running scan.
        _,voltage=config_for(p)
        terminal=run_terminal(source,voltage,p['field_mT']*.001,p['tilt_deg'],c,threads=1,cancel=cancel)
    outcomes=classify(terminal,p['central_mm']*.001)
    source_region=np.where(source[:,2]<-p['central_mm']*.0005,0,np.where(source[:,2]>p['central_mm']*.0005,2,1))
    destination=np.where(outcomes==1,1,np.where(outcomes==2,np.where(terminal[:,4]<0,0,2),3))
    transfer=np.zeros((3,4),dtype=int)
    np.add.at(transfer,(source_region,destination),1)
    return {'params':p,'engine':ENGINE,'row':row_from(terminal,p['field_mT'],p),
        'columns':['particle_id','z0_mm','z_hit_mm','outcome','flight_ns'],
        'particles':[[i,float(source[i,2]*1000),None if outcomes[i]==5 else float(terminal[i,4]*1000),
            int(outcomes[i]),None if outcomes[i]==5 else float(terminal[i,1]*1e9)] for i in range(len(terminal))],
        'transfer_counts':transfer.tolist(),'source_regions':['H','central','K'],
        'destination_regions':['H','central','K','uncollected'],'emission_moments':emission_moments(terminal,p)}

def solve(p,B,stats,progress,cancel,persist=True):
    if cancel():raise Cancelled()
    begin=time.perf_counter();key=physical_key(p,B);cached,origin=cache().get(key)
    stats['cache_io_s']+=time.perf_counter()-begin
    count=p['particles'];available=0 if cached is None else min(count,len(cached))
    if available==count:
        stats['cache_hits']+=1;progress(count);return cached[:count]
    c,voltage=config_for(p)
    states=source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'],p.get('launch_mode','full'))
    stats['particles_reused']+=available
    progress(available)
    begin=time.perf_counter()
    cancelled=None
    try:
        fresh=run_terminal(states[available:count],voltage,B*.001,p['tilt_deg'],c,
            threads=p['compute_threads'],cancel=cancel,progress=lambda n:progress(available+n))
    except Cancelled as error:
        cancelled=error;fresh=getattr(error,'terminal',np.empty((0,6)))
    batch_s=time.perf_counter()-begin
    stats['solve_s']+=batch_s;stats['integrated_particles']+=len(fresh)
    stats['batch_count']+=1;stats['max_batch_s']=max(stats['max_batch_s'],batch_s)
    stats['accepted_steps']+=int(fresh[:,5].sum())
    stats['pruned_particles']+=int(np.count_nonzero(fresh[:,0]==5))
    terminal=np.concatenate((cached[:available],fresh)) if available else fresh
    if len(terminal):
        begin=time.perf_counter();cache().put(key,terminal,persist=persist);stats['cache_io_s']+=time.perf_counter()-begin
    if cancelled is not None:raise cancelled
    return terminal

def grid(p):
    c,_=config_for(p)
    # 加速电压可能低于灯丝压降的一半（界面允许 3 V 阳极、5 V 灯丝），此时冷截止场没有定义。
    critical=cold_cutoff_T(max(0.,p['anode_V']-p['filament_V']/2),c['anode_radius_m'],c['filament_radius_m'])*1000
    dense=np.linspace(max(0,critical-1.1),min(p['field_max_mT'],critical+.65),17)
    dense=dense[(dense>=0)&(dense<=p['field_max_mT'])]
    return np.unique(np.round(np.r_[np.linspace(0,p['field_max_mT'],25),dense],5))


def scan_pass(p,fields,stats,progress,cancel,persist=True,phase='statistics'):
    """Deliver completed fields immediately; retain requested order in rows.

    Workers never share or write caches. On interruption every completed native
    prefix is returned and cached, including points outside the ordered prefix.
    """
    from scan_pool import acquire,integrate_field,WORKERS
    if cancel():raise Cancelled()
    pool,stop,counts=acquire()
    c,voltage=config_for(p)
    states=source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'],p.get('launch_mode','full'))
    count=p['particles'];rows={};pending={};begin=time.perf_counter();last_update=0.;interrupted=False;failure=None

    def emit(index,row):
        row['field_idx']=index;rows[index]=row
        if phase=='statistics':
            progress({'phase':phase,'field_idx':index,'row':row,'done':len(rows),'total':len(fields),
                'particles_done':sum(counts[:len(fields)]),'particles_total':len(fields)*count,
                'point_workers':WORKERS,'compute_threads_per_point':1})

    def store(index,B,key,cached,available,fresh,duration,was_cancelled):
        stats['solve_s']+=duration;stats['batch_count']+=1
        stats['max_batch_s']=max(stats['max_batch_s'],duration)
        stats['integrated_particles']+=len(fresh)
        stats['accepted_steps']+=int(fresh[:,5].sum())
        stats['pruned_particles']+=int(np.count_nonzero(fresh[:,0]==5))
        terminal=np.concatenate((cached[:available],fresh)) if available else fresh
        if len(terminal):
            start=time.perf_counter();cache().put(key,terminal,persist=persist)
            stats['cache_io_s']+=time.perf_counter()-start
        if len(terminal)==count and not was_cancelled:emit(index,row_from(terminal,B,p))

    try:
        for index,B in enumerate(fields):
            if cancel():interrupted=True;stop.set();break
            B=float(B);key=physical_key(p,B);start=time.perf_counter();cached,_=cache().get(key)
            stats['cache_io_s']+=time.perf_counter()-start
            available=0 if cached is None else min(count,len(cached));counts[index]=available
            if available==count:
                stats['cache_hits']+=1;emit(index,row_from(cached[:count],B,p));continue
            stats['particles_reused']+=available
            future=pool.submit(integrate_field,index,states[available:count],voltage,B*.001,p['tilt_deg'],c,available)
            pending[future]=(index,B,key,cached,available)
        while pending:
            if cancel():
                interrupted=True;stop.set()
                for future in pending:future.cancel()
            finished,_=wait(pending,timeout=.03,return_when=FIRST_COMPLETED)
            for future in finished:
                item=pending.pop(future)
                if future.cancelled():continue
                fresh,duration,was_cancelled=future.result()
                interrupted|=was_cancelled
                store(*item,fresh,duration,was_cancelled)
            now=time.perf_counter()
            if now-last_update>=.12:
                done=sum(counts[:len(fields)]);total=len(fields)*count;elapsed=now-begin
                progress({'phase':phase,'done':len(rows),'total':len(fields),'particles_done':done,
                    'particles_total':total,'work_done':done,'work_total':total,
                    'elapsed_s':round(elapsed,2),'eta_s':round(elapsed*(total-done)/done,1) if done else None,
                    'point_workers':WORKERS,'compute_threads_per_point':1})
                last_update=now
    except BaseException as error:
        failure=error
    finally:
        # Never clear this token or start a replacement pass until all running
        # calls have returned: their control buffers must remain alive.
        if pending:
            stop.set()
            for future in pending:future.cancel()
            for future,item in pending.items():
                if not future.cancelled():
                    try:store(*item,*future.result())
                    except BaseException as error:
                        if failure is None:failure=error
    if failure is not None:
        from concurrent.futures.process import BrokenProcessPool
        if isinstance(failure,BrokenProcessPool):
            from scan_pool import close
            close()
        raise failure
    if interrupted and not rows:raise Cancelled()
    return [rows[i] for i in sorted(rows)],interrupted

def _execute(kind,p,progress=lambda update:None,cancel=lambda:False):
    begin=time.perf_counter()
    stats={'solve_s':0.,'cache_io_s':0.,'paths_s':0.,'cache_hits':0,'integrated_particles':0,'particles_reused':0,'accepted_steps':0,'batch_count':0,'max_batch_s':0.,'pruned_particles':0}
    # Explicit grid comes from the acquisition orchestration layer; None keeps
    # the built-in grid. Either way the solve loop, cache and cancellation are
    # untouched, and fields_mT is echoed only via requested_fields_mT.
    fields=(p.get('fields_mT') or grid(p)) if kind=='scan' else [p['field_mT']]
    rows=[];last_update=0.;cancelled=False
    preview=None
    if kind=='scan' and p.get('progressive',False) and p['particles']>=4096:
        preview_p=dict(p,particles=1024,compute_threads=1)
        preview,cancelled=scan_pass(preview_p,fields,stats,progress,cancel,persist=False,phase='preview_building')
        if cancelled:raise Cancelled()
        progress({'phase':'preview','preview_rows':preview,'done':0,'total':len(fields),
                  'particles_done':len(fields)*1024,'particles_total':len(fields)*p['particles']})
    if kind=='scan':
        rows,cancelled=scan_pass(dict(p,compute_threads=1),fields,stats,progress,cancel)
    for i,B in enumerate(fields if kind!='scan' else []):
        def update(done):
            nonlocal last_update
            now=time.perf_counter()
            if now-last_update>.12 or done==p['particles']:
                completed=i*p['particles']+done;total=len(fields)*p['particles'];elapsed=now-begin
                progress({'phase':'statistics','done':i+(done==p['particles']),'total':len(fields),'particles_done':completed,
                    'particles_total':total,'elapsed_s':round(elapsed,2),'field_mT':float(B),
                    'work_done':completed,'work_total':total+(PATH_COUNT if kind=='point' else 0),
                    'eta_s':round(elapsed*(total-completed)/completed,1) if completed else None})
                last_update=now
        try:terminal=solve(p,float(B),stats,update,cancel)
        except Cancelled:
            if not rows:raise
            cancelled=True;break
        rows.append(row_from(terminal,B,p))
    c,_=config_for(p)
    result={'params':{k:v for k,v in p.items() if k!='fields_mT'},'engine':ENGINE,'stats':stats,'cancelled':cancelled,
            'numerics':{'solver':'native_dopri5' if native_available else 'reference_rk4',
                        'coordinates':'weak-field log-radius/Sundman; otherwise radial or Cartesian' if native_available else 'Cartesian',
                        'boundary_interpolation':'Dormand-Prince quartic' if native_available else 'reference',
                        'current_rtol':c['rtol'] if native_available else None,
                        'trace_rtol':REFERENCE_RTOL if native_available else None,
                        'max_flight_ns':c['max_flight_time_s']*1e9,'time_limit_outcome':'still_flying',
                        'pruned_outcome':5,'pruned_meaning':'proven_no_collector; final loss destination not computed'}}
    if not native_available:
        result['numerics'].update(accuracy_modes_available=False,max_step_s=c['max_step_s'],relative_step_scale=c['relative_step_scale'])
    if kind=='scan':
        if cancel():result['cancelled']=True
        result.update(rows=rows,requested_fields_mT=[float(v) for v in fields],completed_fields=len(rows),seed=CONFIG['seed'],max_flight_ns=CONFIG['max_flight_time_s']*1e9,
            model='Independent electrons; harmonic coaxial potential; identical-potential collectors; axial exit boundary; no space charge')
        if preview is not None:result['preview_rows']=preview
        from scan_pool import WORKERS
        result['numerics'].update(point_workers=WORKERS,compute_threads_per_point=1)
    else:
        if cancel():raise Cancelled()
        c,voltage=config_for(p);states=source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'],p.get('launch_mode','full'))[:p['particles']]
        # 画轨迹这一步同样可以取消并报进度，否则一次取消要等 48 条轨迹全部走完。
        def path_progress(done,total):
            nonlocal last_update
            now=time.perf_counter()
            if done in (0,total) or now-last_update>.12:
                progress({'phase':'paths','done':1,'total':1,'path_done':done,'path_total':total,
                    'particles_done':p['particles'],'particles_total':p['particles'],
                    'work_done':p['particles']+done,'work_total':p['particles']+total,
                    'elapsed_s':round(now-begin,2),'field_mT':p['field_mT'],'eta_s':None})
                last_update=now
        started=time.perf_counter()
        paths=run_paths(states,voltage,p['field_mT']*.001,p['tilt_deg'],c,cancel=cancel,progress=path_progress,threads=p['compute_threads'])
        stats['paths_s']=time.perf_counter()-started
        if cancel():raise Cancelled()
        result.update(row=rows[0],paths=paths,path_columns=['z_mm','x_mm','y_mm','time_ns'],
            path_axis='z is the tube axis; the browser maps scientific coordinates to the scene in millimetres',
            sample_note='48 fixed Sobol launch IDs; all particles used for statistics',
            mean_accelerating_V=p['anode_V']-p['filament_V']/2)
    result['elapsed_s']=round(time.perf_counter()-begin,4)
    return result

def execute(kind,p,progress=lambda update:None,cancel=lambda:False):
    result=_execute(kind,p,progress,cancel)
    result['cache_persistence']=CACHE.status() if CACHE is not None else None
    return result

def close_cache():
    from scan_pool import close
    close()
    if CACHE is not None:CACHE.close()

def warm():
    warm_native()

def trace(p,particle_id=0,initial_state=None,include_zero_field=True,series=()):
    if type(include_zero_field) is not bool:raise ValueError('include_zero_field must be boolean')
    if not isinstance(series,(list,tuple)) or any(v!='pphi' for v in series):raise ValueError('series must be a list containing only pphi')
    c,voltage=config_for(p)
    if initial_state is None:
        if type(particle_id) is not int or not 0<=particle_id<32768:raise ValueError('particle_id must be integer in 0..32767')
        initial=source_states(p['temperature_K'],c['filament_radius_m'],c['tube_length_m'],p.get('launch_mode','full'))[particle_id].copy()
    else:
        try:initial=np.asarray(initial_state,dtype=float)
        except (ValueError,TypeError):raise ValueError('initial_state must contain six finite numbers')
        if initial.shape!=(6,) or not np.isfinite(initial).all():raise ValueError('initial_state must contain six finite numbers')
        radius=np.hypot(initial[0],initial[1])
        if not c['filament_radius_m']-1e-12<=radius<c['anode_radius_m'] or abs(initial[2])>=c['tube_length_m']/2:
            raise ValueError('initial_state must be inside the vacuum domain')
    def one(field):
        result=run_trace(initial,voltage,field*.001,p['tilt_deg'],c,series=series)
        return result
    result=one(p['field_mT'])
    result['particle_id']=particle_id if initial_state is None else None
    result['initial_state']=initial.tolist()
    result['point_columns']=['x_mm','y_mm','z_mm','r_mm','time_ns']
    result['launch_state']={'state_SI':initial.tolist(),'z0_mm':float(initial[2]*1000),'vz0_over_sigma_th':float(initial[5]/np.sqrt(1.380649e-23*p['temperature_K']/9.1093837139e-31))}
    result['engine']=ENGINE
    if include_zero_field:result['zero_field']=one(0.)
    return result
