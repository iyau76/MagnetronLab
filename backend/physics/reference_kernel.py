"""Allocation-free RK4 stages, explicit force callback and terminal-event output.

The force callback accepts x,y,z,vx,vy,vz,time,parameters and returns ax,ay,az.
The coaxial implementation below is one field model, not a restriction on RK4.
All arithmetic uses float64; fastmath is deliberately disabled.
"""
import math
import numpy as np
from compat import njit, prange
from magnetron_model import e,m_e

E_OVER_M=e/m_e
PATH_COUNT=48
# 供显示的轨迹记录：积分时每个接受步都记，再按弧长均匀抽稀到 PATH_POINTS 以内。
# 旧的 257 格缓冲在长出多圈的轨迹上会被反复二分，最老的一段只剩一两个点，
# 画出来就是一条从灯丝直插管壁的长弦，看上去像在壁上反弹。
PATH_CAPACITY=8192
PATH_POINTS=480
# 抽稀时把 1 弧度转角折算成多少毫米路程。取值让一次 180° 回折大约占 20 个点。
BEND_LENGTH_PER_RADIAN=1.7


class Cancelled(Exception):
    """A cooperative stop between complete physical trajectories."""

@njit(cache=True,inline='always')
def coaxial_force(x,y,z,vx,vy,vz,time,parameters):
    anode_voltage,filament_voltage,filament_radius,inverse_log_ratio,inverse_length,bx,bz=parameters
    radius=math.sqrt(x*x+y*y)
    cathode_potential=filament_voltage*(z*inverse_length+.5)
    radial_field_over_radius=-(anode_voltage-cathode_potential)*inverse_log_ratio/(radius*radius)
    axial_field=-filament_voltage*inverse_length*(1-math.log(radius/filament_radius)*inverse_log_ratio) if filament_voltage!=0 else 0.
    return (-E_OVER_M*(radial_field_over_radius*x+vy*bz),
            -E_OVER_M*(radial_field_over_radius*y+vz*bx-vx*bz),
            -E_OVER_M*(axial_field-vy*bx))

@njit(cache=True,inline='always')
def cylinder_crossing(x,y,next_x,next_y,radius,inward):
    dx=next_x-x;dy=next_y-y
    quadratic=dx*dx+dy*dy;linear=2*(x*dx+y*dy)
    constant=x*x+y*y-radius*radius
    root=math.sqrt(linear*linear-4*quadratic*constant)
    return (-linear-root if inward else -linear+root)/(2*quadratic)

@njit(cache=True)
def integrate_one(initial,filament_radius,anode_radius,length,max_step,step_scale,max_time,
                  gyro_step,parameters,force,path):
    x,y,z,vx,vy,vz=initial
    elapsed=0.;steps=0;record=len(path)>0;written=0
    if record:
        path[0]=(elapsed,x,y,z);written=1
    while elapsed<max_time:
        ax,ay,az=force(x,y,z,vx,vy,vz,elapsed,parameters)
        speed=math.sqrt(vx*vx+vy*vy+vz*vz)
        acceleration=math.sqrt(ax*ax+ay*ay+az*az)
        radius=math.sqrt(x*x+y*y)
        step=min(max_step,max_time-elapsed,gyro_step)
        # 三个限制：一步走的弧长、一步的速度变化、一步的加速度变化。
        # 只限制弧长时，电子在近轴回折处速度很小而径向加速度很大，
        # 一步就能把速度方向转过几十度，轨迹会画成一个尖角（2026-09-21 修）。
        if speed>0:
            step=min(step,step_scale*radius/speed)
            if acceleration>0:step=min(step,step_scale*speed/acceleration)
        if acceleration>0:step=min(step,math.sqrt(step_scale*radius/acceleration))
        half=step*.5
        vx2= vx+half*ax;vy2=vy+half*ay;vz2=vz+half*az
        ax2,ay2,az2=force(x+half*vx,y+half*vy,z+half*vz,vx2,vy2,vz2,elapsed+half,parameters)
        vx3=vx+half*ax2;vy3=vy+half*ay2;vz3=vz+half*az2
        ax3,ay3,az3=force(x+half*vx2,y+half*vy2,z+half*vz2,vx3,vy3,vz3,elapsed+half,parameters)
        vx4=vx+step*ax3;vy4=vy+step*ay3;vz4=vz+step*az3
        ax4,ay4,az4=force(x+step*vx3,y+step*vy3,z+step*vz3,vx4,vy4,vz4,elapsed+step,parameters)
        sixth=step/6
        next_x=x+sixth*(vx+2*vx2+2*vx3+vx4)
        next_y=y+sixth*(vy+2*vy2+2*vy3+vy4)
        next_z=z+sixth*(vz+2*vz2+2*vz3+vz4)
        radius_after=math.sqrt(next_x*next_x+next_y*next_y)
        first_fraction=2.;outcome=4
        if radius_after<=filament_radius:
            first_fraction=cylinder_crossing(x,y,next_x,next_y,filament_radius,True);outcome=0
        if radius_after>=anode_radius:
            fraction=cylinder_crossing(x,y,next_x,next_y,anode_radius,False)
            if fraction<first_fraction:first_fraction=fraction;outcome=1
        if abs(next_z)>=length/2:
            end_z=math.copysign(length/2,next_z);fraction=(end_z-z)/(next_z-z)
            if fraction<first_fraction:first_fraction=fraction;outcome=3
        steps+=1
        if first_fraction<=1:
            elapsed+=step*first_fraction
            x+=first_fraction*(next_x-x);y+=first_fraction*(next_y-y);z+=first_fraction*(next_z-z)
        else:
            elapsed+=step;x=next_x;y=next_y;z=next_z
            vx+=sixth*(ax+2*ax2+2*ax3+ax4)
            vy+=sixth*(ay+2*ay2+2*ay3+ay4)
            vz+=sixth*(az+2*az2+2*az3+az4)
        if record:
            # Bound display memory while retaining the first and final accepted points.
            if written==len(path):
                for j in range((written+1)//2):path[j]=path[2*j]
                written=(written+1)//2
            path[written]=(elapsed,x,y,z);written+=1
        if first_fraction<=1:return outcome,elapsed,x,y,z,steps,written
    return 4,elapsed,x,y,z,steps,written

@njit(cache=True,parallel=True,nogil=True)
def integrate_batch(states,filament_radius,anode_radius,length,max_step,step_scale,max_time,
                    gyro_step,parameters,force):
    # columns: boundary class, flight time, final x/y/z, accepted step count.
    terminal=np.empty((len(states),6),dtype=np.float64)
    empty_path=np.empty((0,4),dtype=np.float64)
    for i in prange(len(states)):
        result=integrate_one(states[i],filament_radius,anode_radius,length,max_step,step_scale,
                             max_time,gyro_step,parameters,force,empty_path)
        terminal[i,0]=result[0];terminal[i,1]=result[1]
        terminal[i,2]=result[2];terminal[i,3]=result[3];terminal[i,4]=result[4];terminal[i,5]=result[5]
    return terminal

def field_setup(voltage,field_T,tilt_deg,config):
    tilt=math.radians(tilt_deg)
    parameters=np.array([voltage,config['filament_voltage_V'],config['filament_radius_m'],
        1/math.log(config['anode_radius_m']/config['filament_radius_m']),1/config['tube_length_m'],
        field_T*math.sin(tilt),field_T*math.cos(tilt)])
    gyro_step=.05/(E_OVER_M*abs(field_T)) if field_T else math.inf
    args=(config['filament_radius_m'],config['anode_radius_m'],config['tube_length_m'],
          config['max_step_s'],config['relative_step_scale'],config['max_flight_time_s'],
          gyro_step,parameters,coaxial_force)
    return args

def run_terminal(states,voltage,field_T,tilt_deg,config):
    return integrate_batch(states,*field_setup(voltage,field_T,tilt_deg,config))

def classify(terminal,central_length):
    outcomes=terminal[:,0].astype(np.int8)
    outcomes[(outcomes==1)&(np.abs(terminal[:,4])>central_length/2)]=2
    return outcomes

def thin_path(recorded,budget=None):
    """把记录点抽稀到预算以内，起点与终点原样保留。

    只按弧长均匀取点会在近轴回折处失手：那里每步只有千分之一毫米，一步就能跨过
    两百个原始点，画出来是个尖角。所以取点用的"路程"由两段构成，弧长加上转角
    折算的长度（BEND 毫米/弧度），弯得急的地方自然多留点。
    """
    budget=budget or PATH_POINTS
    count=len(recorded)
    if count<=budget:return recorded
    delta=np.diff(recorded[:,1:4],axis=0)
    segment=np.linalg.norm(delta,axis=1)
    safe=np.where(segment>0,segment,1.)
    cosine=np.sum(delta[:-1]*delta[1:],axis=1)/(safe[:-1]*safe[1:])
    turn=np.arccos(np.clip(cosine,-1.,1.))
    weight=np.empty(count)
    weight[0]=0.
    weight[1:count-1]=segment[:-1]+BEND_LENGTH_PER_RADIAN*turn
    weight[count-1]=segment[-1]
    travelled=np.cumsum(weight)
    total=travelled[-1]
    if not total>0:return recorded[:budget]
    index=np.searchsorted(travelled,np.linspace(0.,total,budget),side='left')
    index=np.clip(index,0,count-1);index[0]=0;index[-1]=count-1
    return recorded[np.unique(index)]


def run_paths(states,voltage,field_T,tilt_deg,config,cancel=lambda:False,progress=lambda done,total:None):
    # 每次检查都落在一条完整轨迹之后：轨迹本身不做半途中断，结果永远可复用。
    args=field_setup(voltage,field_T,tilt_deg,config);paths=[]
    progress(0,PATH_COUNT)
    for i in np.linspace(0,len(states)-1,PATH_COUNT,dtype=int):
        if cancel():raise Cancelled()
        path=np.empty((PATH_CAPACITY,4));result=integrate_one(states[i],*args,path)
        if cancel():raise Cancelled()
        outcome=result[0]
        if outcome==1 and abs(result[4])>config['central_collector_length_m']/2:outcome=2
        a=thin_path(path[:result[6]])
        paths.append({'id':int(i),'outcome':int(outcome),'flight_ns':result[1]*1e9,
            'points':np.column_stack((a[:,3]*1000,a[:,1]*1000,a[:,2]*1000,a[:,0]*1e9)).round(7).tolist()})
        progress(len(paths),PATH_COUNT)
    return paths
