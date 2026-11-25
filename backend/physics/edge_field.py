"""Isolated finite open-shell Laplace experiment; no production cache writes.

The unchanged edge_core DLL/source comes from the team's 2026-11-15 study.
Field grids and terminal prefixes live only in this module's bounded RAM caches.
"""
from pathlib import Path
from collections import OrderedDict
from functools import lru_cache
import ctypes as C
import hashlib,os,sys,time,json
import numpy as np
from scipy.sparse import diags,kron,eye
from scipy.sparse.linalg import spsolve
from scipy.interpolate import RectBivariateSpline
from fast_kernel import pointer,Cancelled
from service import row_from

NATIVE=Path(__file__).with_name('edge_native')
_EDGE_LIB_NAME='edge_core.dll' if os.name=='nt' else ('libedge_core.dylib' if sys.platform=='darwin' else 'libedge_core.so')
EDGE_LIB_PATH=NATIVE/_EDGE_LIB_NAME
_VERSION_BIN=EDGE_LIB_PATH if EDGE_LIB_PATH.exists() else (NATIVE/'edge_core.cpp')
VERSION=hashlib.sha256(_VERSION_BIN.read_bytes()+(NATIVE/'emission_2000K.npy').read_bytes()+Path(__file__).read_bytes()).hexdigest()[:16]
TERMINALS=OrderedDict()
BOUNDARIES=('open','flange','seam','kill')

@lru_cache(maxsize=4)
def edge_source(temperature,launch_mode):
    path=NATIVE/'emission_2000K.npy'
    meta=json.loads(path.with_suffix('.json').read_text())
    if hashlib.sha256(path.read_bytes()).hexdigest()!=meta['sha256']:
        raise RuntimeError('Finite-field emission source checksum mismatch')
    states=np.load(path,allow_pickle=False)
    # Preserve the original study's exact arithmetic at 2000 K. Its long-lived
    # separatrix trajectories are sensitive even to 1e-10 m/s source rounding.
    if temperature!=2000:states[:,3:]*=np.sqrt(temperature/2000)
    if launch_mode!='full':
        states[:,3:5]=0.
        if launch_mode=='cold':states[:,5]=0.
    states.flags.writeable=False
    return states

def validate(p,raw):
    boundary=raw.get('edge_boundary','open')
    if boundary not in BOUNDARIES:raise ValueError('Unknown finite-field boundary')
    for key,value in [('anode_radius_mm',4.55),('filament_radius_um',37.5),('length_mm',35),('central_mm',15)]:
        if abs(p[key]-value)>1e-10:raise ValueError('Finite-field experiment uses the standard 35 mm tube geometry')
    return dict(p,edge_boundary=boundary)

class Field:
    def __init__(self,ua,uf,gradient,boundary,ninner=96,dz=.25,extent=35.,far=0.):
        self.ua=ua;self.uf=uf;self.gradient=gradient;self.a=.0375;self.b=4.55
        self.gap=.5 if boundary=='seam' else 0.;self.aperture=4.05 if boundary=='flange' else 4.55
        self.dx=np.log(self.b/self.a)/ninner
        self.nx=ninner+int(round(np.log(extent/self.b)/self.dx))
        self.x=np.arange(self.nx+1)*self.dx;self.r=self.a*np.exp(self.x)
        self.nz=round(2*extent/dz);self.z=np.linspace(-extent,extent,self.nz+1);self.dz=self.z[1]-self.z[0]
        nr,nz=len(self.r),len(self.z)
        def lap(n,h):return diags([-np.ones(n-1),2*np.ones(n),-np.ones(n-1)],[-1,0,1])/h**2
        matrix=(kron(lap(nr,self.dx),eye(nz))+kron(diags(self.r**2),lap(nz,self.dz))).tocsr()
        fixed=np.zeros((nr,nz),bool);v=np.full((nr,nz),far,dtype=float)
        fixed[[0,-1],:]=True;fixed[:,[0,-1]]=True
        v[0,:]=uf*np.clip(self.z/35+.5,0,1) if gradient else uf/2
        wall=(abs(self.z)<=17.5+1e-10)&~((self.gap>0)&(abs(abs(self.z)-7.5)<self.gap/2-1e-10))
        fixed[ninner,wall]=True;v[ninner,wall]=ua
        if self.aperture<self.b:
            for zz in (-17.5,17.5):
                j=np.argmin(abs(self.z-zz));mask=(self.r>=self.aperture)&(self.r<=self.b+1e-10)
                fixed[mask,j]=True;v[mask,j]=ua
        f=fixed.ravel();y=v.ravel();u=~f;rhs=-matrix[u][:,f]@y[f];Au=matrix[u][:,u];y[u]=spsolve(Au,rhs)
        self.residual=float(np.max(abs(Au@y[u]-rhs))/max(1.,np.max(abs(rhs))));self.phi=y.reshape(nr,nz)
        spline=RectBivariateSpline(self.x,self.z,self.phi,kx=3,ky=3,s=0)
        fx=spline(self.x,self.z,dx=1);fz=spline(self.x,self.z,dy=1);fxz=spline(self.x,self.z,dx=1,dy=1)
        G=np.empty((self.nx,self.nz,4,4));M=np.array([[1,0,0,0],[0,0,1,0],[-3,3,-2,-1],[2,-2,1,1]])
        for i in range(2):
            for j in range(2):
                sl=(slice(i,i+self.nx),slice(j,j+self.nz))
                G[:,:,i,j]=self.phi[sl];G[:,:,i+2,j]=fx[sl]*self.dx
                G[:,:,i,j+2]=fz[sl]*self.dz;G[:,:,i+2,j+2]=fxz[sl]*self.dx*self.dz
        self.co=np.ascontiguousarray(M@G@M.T)

@lru_cache(maxsize=4)
def field_for(ua,uf,gradient,boundary,version=VERSION):
    return Field(ua,uf,gradient,boundary)

@lru_cache(maxsize=1)
def native():
    if not EDGE_LIB_PATH.exists():
        raise RuntimeError(
            f'Native edge kernel not found at {EDGE_LIB_PATH}. '
            'On Linux/macOS, build it with: bash backend/physics/edge_native/build_unix.sh'
        )
    lib=C.CDLL(str(EDGE_LIB_PATH));ptr=C.POINTER(C.c_double)
    lib.edge_batch.argtypes=[ptr,C.c_int,ptr,C.c_int,ptr,C.c_int,C.c_int,C.c_int,ptr]
    lib.edge_batch.restype=C.c_int;return lib

def check(cancel):
    if cancel():raise Cancelled()

def terminal(p,B,n,field,cancel,stats):
    key=(VERSION,p['anode_V'],p['filament_V'],p['gradient'],p['edge_boundary'],p['temperature_K'],p['launch_mode'],p['tilt_deg'],B,p['accuracy'])
    source=edge_source(p['temperature_K'],p['launch_mode'])
    saved=TERMINALS.pop(key,None);done=0 if saved is None else min(n,len(saved))
    out=np.empty((n,8));
    if done:out[:done]=saved[:done];stats['particles_reused']+=done
    theta=np.deg2rad(p['tilt_deg']);rtol=1e-9 if p['accuracy']=='reference' else 1e-7
    args=np.array([p['anode_V'],p['filament_V'],37.5e-6,.00455,.070,B*.001*np.sin(theta),B*.001*np.cos(theta),2e-6,rtol,35.,field.r[-1],field.gap,field.aperture,float(p['edge_boundary']=='kill')])
    try:
        while done<n:
            check(cancel);end=min(n,done+64)
            block=np.ascontiguousarray(source[done:end]);part=np.empty((end-done,8))
            begin=time.perf_counter();status=native().edge_batch(pointer(block),len(block),pointer(args),1,pointer(field.co),field.nx,field.nz,1,pointer(part))
            stats['solve_s']+=time.perf_counter()-begin
            if status or np.any(part[:,0]<0):raise RuntimeError('Finite-field trajectory integration failed')
            out[done:end]=part;stats['integrated_particles']+=end-done;done=end
        check(cancel)
    finally:
        if done:TERMINALS[key]=out[:done].copy() if saved is None or len(saved)<done else saved
        while len(TERMINALS)>32:TERMINALS.popitem(last=False)
    return out

def execute(kind,p,progress,cancel):
    started=time.perf_counter();stats={'integrated_particles':0,'particles_reused':0,'solve_s':0.,'field_s':0.}
    check(cancel);t=time.perf_counter();field=field_for(p['anode_V'],p['filament_V'],p['gradient'],p['edge_boundary']);stats['field_s']=time.perf_counter()-t;check(cancel)
    fields=[p['field_mT']] if kind.endswith('point') else p.get('fields_mT') or np.linspace(0,p['field_max_mT'],29).tolist()
    preview=[];rows=[];passes=[1024,p['particles']] if p.get('progressive') and p['particles']>1024 and len(fields)>1 else [p['particles']]
    for pass_index,n in enumerate(passes):
        preview_pass=len(passes)>1 and pass_index==0;current=[]
        for i,B in enumerate(fields):
            raw=terminal(p,float(B),n,field,cancel,stats);row=row_from(raw,float(B),p);row['field_idx']=i;row['pending_fraction']=row['fractions'][4];row['particles']=n;current.append(row)
            progress({'phase':'preview' if preview_pass else 'refine','done':i+1,'total':len(fields),**({} if preview_pass else {'row':row})})
        if preview_pass:preview=current;progress({'phase':'refine','preview_rows':preview})
        else:rows=current
    return {'rows':rows,'preview_rows':preview,'params':p,'stats':stats,'elapsed_s':time.perf_counter()-started,'field_residual':field.residual,'edge_version':VERSION,'domain':{'r_max_mm':float(field.r[-1]),'z_max_mm':35,'max_flight_ns':2000}}
