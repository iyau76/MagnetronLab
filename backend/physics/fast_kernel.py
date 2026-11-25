"""Native adaptive integrator with an explicit Python reference fallback.
Terminal statistics at zero tilt store (r,0,z), NOT Cartesian trajectories.
All display paths and traces are independently integrated in full Cartesian space.
"""
import ctypes as C
import math,os,sys,threading
from pathlib import Path
import numpy as np
PATH_COUNT=48
PATH_POINTS=480
# Calibrated for collector currents, independently of display trajectories.
# rtol is a local integration control, not a guaranteed current error.
# Current verification entry points are documented in docs/DEVELOPMENT.md.
# A fine mode remains available for paired checks.
STATISTICAL_TILT_RTOL=1e-7
REFERENCE_RTOL=1e-9
_LIB_NAME='magnetron_core.dll' if os.name=='nt' else ('libmagnetron_core.dylib' if sys.platform=='darwin' else 'libmagnetron_core.so')
DLL_PATH=Path(__file__).with_name(_LIB_NAME)
native_available=DLL_PATH.exists() and os.getenv('MAGNETRON_FORCE_PYTHON_KERNEL')!='1'
_lib=None
class Cancelled(Exception):
    def __init__(self,terminal=None):
        super().__init__('Simulation cancelled');self.terminal=terminal

def library():
    global _lib
    if _lib is None:
        lib=C.CDLL(str(DLL_PATH));ptr=C.POINTER(C.c_double)
        lib.mg_control.argtypes=[C.c_int];lib.mg_control.restype=C.c_void_p
        for name in ('mg_destroy','mg_cancel'):
            getattr(lib,name).argtypes=[C.c_void_p];getattr(lib,name).restype=None
        lib.mg_progress.argtypes=[C.c_void_p];lib.mg_progress.restype=C.c_int
        lib.mg_batch.argtypes=[ptr,C.c_int,ptr,C.c_int,ptr,C.c_void_p];lib.mg_batch.restype=C.c_int
        lib.mg_trace.argtypes=[ptr,ptr,ptr,ptr,C.c_int];lib.mg_trace.restype=C.c_int
        lib.mg_version.restype=C.c_int
        if hasattr(lib,'mg_shutdown'):
            import atexit
            lib.mg_shutdown.argtypes=[];lib.mg_shutdown.restype=None
            atexit.register(lib.mg_shutdown)
        if lib.mg_version()!=1:raise RuntimeError('Native ABI mismatch')
        _lib=lib
    return _lib

def warm_native():
    if native_available:return library().mg_version()
    # This explicit fallback can JIT when Numba is installed.
    import reference_kernel
    return 0

def pointer(a):return a.ctypes.data_as(C.POINTER(C.c_double))
def arguments(voltage,field_T,tilt_deg,c):
    angle=math.radians(tilt_deg)
    return np.array([voltage,c['filament_voltage_V'],c['filament_radius_m'],c['anode_radius_m'],
        c['tube_length_m'],field_T*math.sin(angle),field_T*math.cos(angle),c['max_flight_time_s'],
        c.get('rtol',1e-6 if tilt_deg==0 else STATISTICAL_TILT_RTOL)],dtype=np.float64)

def run_terminal(states,voltage,field_T,tilt_deg,config,threads=4,cancel=lambda:False,progress=lambda n:None):
    states=np.ascontiguousarray(states,dtype=np.float64)
    if states.ndim!=2 or states.shape[1]!=6 or not np.isfinite(states).all():raise ValueError('Invalid initial states')
    n=len(states);out=np.empty((n,6));progress(0)
    if cancel():raise Cancelled(out[:0])
    if not native_available:
        from reference_kernel import run_terminal as reference
        try:
            from numba import set_num_threads
            set_num_threads(threads)
        except ImportError:pass
        for start in range(0,n,32):
            if cancel():raise Cancelled(out[:start].copy())
            end=min(n,start+32);out[start:end]=reference(states[start:end],voltage,field_T,tilt_deg,config);progress(end)
        return out
    lib=library();args=arguments(voltage,field_T,tilt_deg,config);control=lib.mg_control(n)
    if not control:raise MemoryError('Native control allocation')
    finished=threading.Event();status=[]
    def work():
        try:status.append(lib.mg_batch(pointer(states),n,pointer(args),max(1,int(threads)),pointer(out),control))
        finally:finished.set()
    worker=threading.Thread(target=work,name='native-integration');worker.start()
    try:
        while not finished.wait(.01):
            progress(lib.mg_progress(control))
            if cancel():lib.mg_cancel(control)
        worker.join();done=lib.mg_progress(control)
        if not status or status[0]:raise RuntimeError('Native integration failed: rejected minimum step or numerical limit')
        progress(done)
        if done<n:raise Cancelled(out[:done].copy())
        return out
    finally:
        lib.mg_cancel(control);worker.join();lib.mg_destroy(control)

def classify(terminal,central_length):
    outcomes=terminal[:,0].astype(np.int8)
    outcomes[(outcomes==1)&(np.abs(terminal[:,4])>central_length/2)]=2
    return outcomes

def _trace(initial,voltage,field_T,tilt_deg,c):
    initial=np.ascontiguousarray(initial,dtype=np.float64)
    if initial.shape!=(6,) or not np.isfinite(initial).all():raise ValueError('Initial state must contain six finite SI values')
    radius=float(np.hypot(initial[0],initial[1]));a=c['filament_radius_m'];b=c['anode_radius_m'];half=c['tube_length_m']/2
    if radius<a-1e-14 or radius>=b or abs(initial[2])>=half:
        raise ValueError('Initial state must be on the emitter or inside the vacuum domain')
    if abs(radius-a)<=1e-14 and np.dot(initial[:2],initial[3:5])<0:
        terminal=np.array([0.,0.,*initial[:3],0.])
        data=np.array([[0.,*(initial[:3]*1000),*(initial[3:]*1e-6)]])
        return terminal,data
    if not native_available:
        import reference_kernel as ref
        raw=np.empty((131072,4));result=ref.integrate_one(initial,*ref.field_setup(voltage,field_T,tilt_deg,c),raw)
        a=raw[:result[6]];vel=np.gradient(a[:,1:4],a[:,0],axis=0)
        data=np.column_stack((a[:,0]*1e9,a[:,1:4]*1000,vel*1e-6));terminal=np.array(result[:6])
        return terminal,data
    lib=library();args=arguments(voltage,field_T,tilt_deg,c|{'rtol':min(c.get('rtol',1e-9),1e-9)});terminal=np.empty(6);data=np.empty((16384,7))
    count=lib.mg_trace(pointer(initial),pointer(args),pointer(terminal),pointer(data),len(data))
    if count < -100:
        data=np.empty((-count,7));count=lib.mg_trace(pointer(initial),pointer(args),pointer(terminal),pointer(data),len(data))
    if count<0:raise RuntimeError('Native trace numerical failure')
    return terminal,data[:count]

def trace_diagnostics(data,voltage,c,series=(),field_T=0.,tilt_deg=0.):
    t=data[:,0];xyz=data[:,1:4];v=data[:,4:7];r=np.hypot(xyz[:,0],xyz[:,1]);phi=np.unwrap(np.arctan2(xyz[:,1],xyz[:,0]))
    vr=(xyz[:,0]*v[:,0]+xyz[:,1]*v[:,1])/r
    apex=np.flatnonzero((vr[:-1]>0)&(vr[1:]<=0))+1
    minima=np.flatnonzero((vr[:-1]<0)&(vr[1:]>=0))+1
    perigee=[]
    for j in minima:
        left=apex[apex<j];right=apex[apex>j];winding=None
        if len(left) and len(right):
            i,k=int(left[-1]),int(right[0]);closing=math.atan2(math.sin(phi[i]-phi[k]),math.cos(phi[i]-phi[k]))
            winding=int(round((phi[k]-phi[i]+closing)/(2*math.pi)))
        perigee.append({'time_ns':float(t[j]),'radius_mm':float(r[j]),'z_mm':float(xyz[j,2]),'winding':winding})
    a=c['filament_radius_m']*1000;b=c['anode_radius_m']*1000;L=c['tube_length_m']*1000;il=1/math.log(b/a)
    cathode=c['filament_voltage_V']*(xyz[:,2]/L+.5)
    radial_rate=(voltage-cathode)*il/r*vr
    axial_rate=c['filament_voltage_V']/L*(1-np.log(r/a)*il)*v[:,2]
    trap=getattr(np,'trapezoid',np.trapz)
    kinetic=np.sum(v*v,axis=1)/(2*.1758820010772163)
    potential=cathode+(voltage-cathode)*np.log(r/a)*il
    residual=(kinetic-potential)-(kinetic[0]-potential[0])
    result={'radial_bounces':int(len(apex)),'perigee':perigee,'delta_phi_rad':float(phi[-1]-phi[0]),
        'winding_definition':'apocenter-to-apocenter arc closed by a straight chord; null for incomplete arc',
        'radial_work_eV':float(trap(radial_rate,t)),'axial_work_eV':float(trap(axial_rate,t)),
        'max_energy_residual_eV':float(np.max(np.abs(residual))),
        'termination_policy':'strict physical boundary or maximum flight time; no trapped-particle shortcut'}
    if 'pphi' in series:
        # Native trace coordinates are mm and velocities are mm/ns. Convert
        # e/m * B from 1/s to 1/ns; the mechanical term is already mm²/ns.
        e_over_m=.1758820010772163e12
        bz=field_T*math.cos(math.radians(tilt_deg))
        pphi=xyz[:,0]*v[:,1]-xyz[:,1]*v[:,0]-.5*e_over_m*bz*1e-9*r*r
        result['pphi_mm2_per_ns']=pphi.tolist()
        result['pphi_hull_scale_mm2_per_ns']=.5*e_over_m*abs(field_T)*c['anode_radius_m']**2*1e-3
    return result

def run_trace(initial,voltage,field_T,tilt_deg,config,series=()):
    terminal,data=_trace(initial,voltage,field_T,tilt_deg,config)
    code=int(classify(terminal[None,:],config['central_collector_length_m'])[0]);r=np.hypot(data[:,1],data[:,2])
    region=('H' if terminal[4]<0 else 'K') if code==2 else ('central' if code==1 else None)
    diagnostics=trace_diagnostics(data,voltage,config,series,field_T,tilt_deg)
    if code==0:diagnostics['terminal_collision']={'time_ns':float(terminal[1]*1e9),'code':-1,'kind':'filament_collision'}
    return {'outcome':code,'region':region,'flight_ns':float(terminal[1]*1e9),'accepted_steps':int(terminal[5]),
        'points':np.column_stack((data[:,1:4],r,data[:,0])).tolist(),
        'launch_state':np.asarray(initial).tolist(),**diagnostics}

def render_samples(data):
    """Thin display vertices by accumulated spatial turning; preserve radial extrema.
    The integration and diagnostics use the unthinned data. No fixed 480-point cap
    that would join many late orbits by long chords.
    """
    if len(data)<128:return data
    d=np.diff(data[:,1:4],axis=0);length=np.linalg.norm(d,axis=1)
    denom=np.maximum(length[:-1]*length[1:],1e-30)
    turn=np.arccos(np.clip(np.sum(d[:-1]*d[1:],axis=1)/denom,-1,1))
    weight=length/4.;weight[:-1]+=turn/.08
    cumulative=np.r_[0,np.cumsum(weight)]
    ids=np.searchsorted(cumulative,np.arange(0,cumulative[-1],1.))
    r=np.hypot(data[:,1],data[:,2]);dr=np.diff(r)
    extrema=np.flatnonzero(dr[:-1]*dr[1:]<=0)+1
    ids=np.unique(np.r_[0,ids,extrema,len(data)-1]).astype(int)
    return data[ids]

def run_paths(states,voltage,field_T,tilt_deg,config,cancel=lambda:False,progress=lambda n,total:None,threads=1):
    from concurrent.futures import ThreadPoolExecutor,as_completed
    paths={};progress(0,PATH_COUNT)
    ids=np.linspace(0,len(states)-1,PATH_COUNT,dtype=int)
    def one(i):
        if cancel():raise Cancelled()
        terminal,data=_trace(states[i],voltage,field_T,tilt_deg,config)
        code=int(classify(terminal[None,:],config['central_collector_length_m'])[0])
        drawn=render_samples(data)
        return {'id':int(i),'outcome':code,'flight_ns':float(terminal[1]*1e9),
            'source_points':len(data),'display_points':len(drawn),
            'points':drawn[:,[3,1,2,0]].round(8).tolist()}
    # Native integration releases the GIL. Preserve the same IDs and ordering.
    with ThreadPoolExecutor(max_workers=max(1,min(int(threads),PATH_COUNT))) as pool:
        futures={pool.submit(one,int(i)):int(i) for i in ids}
        try:
            for future in as_completed(futures):
                if cancel():raise Cancelled()
                paths[futures[future]]=future.result();progress(len(paths),PATH_COUNT)
        finally:
            for future in futures:future.cancel()
    return [paths[int(i)] for i in ids]
