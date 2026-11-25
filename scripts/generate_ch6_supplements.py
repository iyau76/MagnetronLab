"""Export existing edge terminals and exact teaching anchors without source edits."""
from pathlib import Path
import sys,json,hashlib
import numpy as np
from scipy.interpolate import RectBivariateSpline
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'前期复盘/边缘场_保护环峰值_20261115'
OUT=ROOT/'frontend/assets/precomputed'
sys.path.insert(0,str(ROOT/'backend/physics'))
import service
from fast_kernel import run_terminal
from backend.settings import parameters

def write(name,data):
    (OUT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf8')

def main():
    b=json.loads((OUT/'ch6_bundle.json').read_text(encoding='utf8'))
    p=parameters(b['scans']['10:0']['params']);p['compute_threads']=1
    c,v=service.config_for(p);s=service.source_states(2000,37.5e-6,.035,'full')[:8192]
    anchors=[]
    for B in [4.025,4.125,4.425]:
        terminal=run_terminal(s,v,B*.001,0,c,threads=1)
        anchors.append({'row':service.row_from(terminal,B,p),'moments':service.emission_moments(terminal,p)})
    write('ch6_anchors.json',{'params':p,'anchors':anchors,'use':'Display-only additional fields; regression remains on the 71 measured field points'})
    data={'metadata':{'source':'前期复盘/边缘场_保护环峰值_20261115','source_eta':.75,'default_eta':.76,'source_sha256':{},'geometry':b['metadata']['geometry'],'max_flight_ns':2000},'scans':{}}
    for tag in ['open_t0_n4096','open_t5_n8192','open_t7_n8192','open_t8_n8192','open_t10_n8192','open_t10_kill','flange05_t10','seam05_t10']:
        folder=SOURCE/tag;conditions=json.loads((folder/'conditions.json').read_text());n=conditions['n']
        pp=dict(p,particles=n,tilt_deg=conditions['theta'],emission_profile='cooled_ends',end_cooling_eta=.76)
        rows=[];moments=[]
        for file in sorted(folder.glob('B*.npz')):
            a=np.load(file);raw=a['terminal'];B=float(a['B']);row=service.row_from(raw,B,pp);row['pending_fraction']=row['fractions'][4];row['particles']=n;row['field_idx']=len(rows)
            rows.append(row);moments.append(service.emission_moments(raw,pp));data['metadata']['source_sha256'][f'{tag}/{file.name}']=hashlib.sha256(file.read_bytes()).hexdigest()
        pp['fields_mT']=[r['field_mT'] for r in rows]
        data['scans'][tag]={'params':pp,'conditions':conditions,'rows':rows,'moments':moments}
    field=np.load(SOURCE/'fine_t10/field.npz');r=field['r_mm'];z=field['z_mm'];spline=RectBivariateSpline(np.log(r/r[0]),z,field['phi'])
    zs=np.linspace(0,20,161);data['profile']={'r_mm':1,'points':[[float(zz),float(spline(np.log(1/r[0]),zz,dy=1)[0,0])] for zz in zs],'analytic_V_per_mm':3.68/35*(1-np.log(1/.0375)/np.log(4.55/.0375)),'source':'fine_t10/field.npz'}
    data['profile']['grid']={'radial_inner_cells':192,'axial_step_mm':.125}
    data['metadata']['source_sha256']['fine_t10/field.npz']=hashlib.sha256((SOURCE/'fine_t10/field.npz').read_bytes()).hexdigest()
    data['traces']={}
    for key,name,outcome in [('finite','代表电子轨迹.csv',2),('analytic','代表电子_解析场轨迹.csv',3)]:
        file=SOURCE/name;a=np.genfromtxt(file,delimiter=',',names=True)
        points=[[float(q['x_mm']),float(q['y_mm']),float(q['z_mm']),float(np.hypot(q['x_mm'],q['y_mm'])),float(q['t_ns'])] for q in a]
        data['traces'][key]={'particle_id':4571,'points':points,'flight_ns':points[-1][4],'outcome':outcome,'source':name}
        data['metadata']['source_sha256'][name]=hashlib.sha256(file.read_bytes()).hexdigest()
    write('ch6_edge_bundle.json',data)
    manifest=json.loads((OUT/'manifest.json').read_text(encoding='utf8'))
    for file in OUT.rglob('*.json'):
        if file.name!='manifest.json':
            raw=file.read_bytes();manifest['files'][file.relative_to(OUT).as_posix()]={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    write('manifest.json',manifest)
    print('Exported 3 exact anchors and',sum(len(s['rows']) for s in data['scans'].values()),'existing edge field points')

if __name__=='__main__':main()
