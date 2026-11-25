"""Small HTTP-side parameter schema; no scientific imports or JIT at startup."""
import math,os
LOGICAL=os.cpu_count() or 2
def thread_budget(want):
    """希望用 want 个线程；本机不够时退到"逻辑核数 − 1"，至少留 1。
    留一个核心给界面与系统，避免计算把浏览器拖住。"""
    return max(1,min(int(want),LOGICAL-1,16))
FAST_THREADS=thread_budget(16)
THREAD_CHOICES=sorted({thread_budget(n) for n in (1,2,4,8,12,16,FAST_THREADS)})
DEFAULT={'anode_V':10.,'filament_V':3.428,'gradient':True,'temperature_K':2000.,
 'anode_radius_mm':4.55,'filament_radius_um':37.5,'length_mm':35.,'central_mm':15.,
 'tilt_deg':0.,'emission_uA':30.,'particles':4096,'field_mT':4.,'field_max_mT':6.5,'compute_threads':FAST_THREADS,
 'launch_mode':'full','emission_profile':'uniform','end_cooling_eta':0.,'progressive':False,'accuracy':'statistical'}
LIMITS={'anode_V':(3,14),'filament_V':(0,5),'temperature_K':(1500,2400),
 'anode_radius_mm':(3,7),'filament_radius_um':(25,100),'length_mm':(10,60),
 'central_mm':(2,59),'tilt_deg':(-25,25),'emission_uA':(1,100),'field_mT':(0,8),'field_max_mT':(4,8),'end_cooling_eta':(0,1)}
def parameters(raw,allow_local_potential=False):
    if not isinstance(raw,dict):raise ValueError('参数必须是对象')
    p=DEFAULT|{k:v for k,v in raw.items() if k in DEFAULT}
    for key,(lo,hi) in LIMITS.items():
        if key=='anode_V' and allow_local_potential:lo=0.
        try:p[key]=float(p[key])
        except (TypeError,ValueError,OverflowError):raise ValueError(f'{key} must be numeric')
        if not math.isfinite(p[key]) or not lo<=p[key]<=hi:raise ValueError(f'{key} 必须在 {lo}–{hi} 范围内')
    for key in ('particles','compute_threads'):
        value=p[key]
        if isinstance(value,bool):raise ValueError(f'{key} must be integer')
        try:
            integer=int(value)
            if float(value)!=integer:raise ValueError()
        except (TypeError,ValueError,OverflowError):raise ValueError(f'{key} must be integer')
        p[key]=integer
    if p['particles'] not in [1024,4096,8192,32768]:raise ValueError('请选择界面提供的粒子数')
    if p['compute_threads'] not in THREAD_CHOICES:raise ValueError('线程数超出本机计算预算')
    if p['central_mm']>=p['length_mm']:raise ValueError('中央段长度必须小于总有效长度')
    for key in ('gradient','progressive'):
        if type(p[key]) is not bool:raise ValueError(f'{key} must be boolean')
    if p['anode_V']<LIMITS['anode_V'][0] and not (allow_local_potential and p['gradient'] is False and p['filament_V']==0):
        raise ValueError('anode_V below 3 V is only available for a local-potential trace with gradient=false and filament_V=0')
    for key,choices in [('launch_mode',('full','axial','cold')),('emission_profile',('uniform','cooled_ends')),('accuracy',('statistical','reference'))]:
        if p[key] not in choices:raise ValueError(f'{key} must be one of {choices}')
    p['fields_mT']=validated_fields(raw.get('fields_mT'),LIMITS['field_max_mT'][1])
    return p

def validated_fields(values,hi):
    """Optional explicit scan grid supplied by the acquisition orchestration
    layer; None keeps the built-in grid. Monotonic either direction so a
    down sweep stays one job."""
    if values is None:return None
    if not isinstance(values,list) or not 2<=len(values)<=128:raise ValueError('fields_mT 需要是 2–128 个磁场点的列表')
    try:fields=[float(v) for v in values]
    except (TypeError,ValueError):raise ValueError('fields_mT 必须是数值列表')
    if any(not math.isfinite(v) or v<0 or v>hi for v in fields):raise ValueError(f'fields_mT 每个点必须在 0–{hi} mT 范围内')
    if not (all(a<b for a,b in zip(fields,fields[1:])) or all(a>b for a,b in zip(fields,fields[1:]))):
        raise ValueError('fields_mT 必须严格单调（升序或降序）')
    return fields
