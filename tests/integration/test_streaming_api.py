"""Isolated HTTP acceptance: incremental delivery and latest request wins."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[2]


def main():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
    base=f'http://127.0.0.1:{port}'
    def request(path,body=None):
        data=None if body is None else json.dumps(body).encode()
        with urlopen(Request(base+path,data=data,headers={'Content-Type':'application/json'}),timeout=10) as response:
            return json.load(response)
    with tempfile.TemporaryDirectory(prefix='magnetron_stream_http_') as directory:
        env=os.environ|{'MAGNETRON_DATA_DIR':directory,'PYTHONIOENCODING':'utf-8'}
        with open(Path(directory)/'server.log','w',encoding='utf-8') as log:
            process=subprocess.Popen([sys.executable,str(ROOT/'backend/server.py'),'--api-only','--port',str(port)],
                cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
            try:
                deadline=time.monotonic()+20
                while time.monotonic()<deadline:
                    try:
                        if request('/api/health')['worker']['state']=='ready':break
                    except OSError:pass
                    time.sleep(.05)
                else:raise AssertionError('worker did not become ready')
                ids=[];latencies=[]
                params={'anode_V':10,'filament_V':3.68,'particles':32768,'tilt_deg':8,'progressive':True,
                    'fields_mT':[i*.25 for i in range(25)]}
                for angle in [8,9,10,8.5,9.5]:
                    start=time.perf_counter()
                    ids.append(request('/api/scan',dict(params,tilt_deg=angle))['id'])
                    latencies.append(time.perf_counter()-start)
                    time.sleep(.035)
                final=request('/api/scan',dict(params,particles=8192,tilt_deg=8,fields_mT=[0,4,5.735]))['id']
                cursor=0;arrivals=[];preview=None;polls=0;deadline=time.monotonic()+40
                while time.monotonic()<deadline:
                    job=request(f'/api/job/{final}?since={cursor}');polls+=1
                    if 'preview_rows' in job:preview=job['preview_rows']
                    rows=job['rows'];arrivals.extend(rows)
                    assert job['next_cursor']==cursor+len(rows)
                    cursor=job['next_cursor']
                    if 'result' in job:assert 'rows' not in job['result']
                    if job['state']=='done':break
                    assert job['state'] not in ('error','cancelled'),job
                    time.sleep(.04)
                else:raise AssertionError('latest scan did not finish')
                assert preview and len(preview)==3
                assert sorted(r['field_idx'] for r in arrivals)==[0,1,2]
                assert all(sum(r['counts'])==8192 for r in arrivals)
                assert request(f'/api/job/{final}?since={cursor}')['rows']==[]
                full=request(f'/api/job/{final}')
                assert [r['field_mT'] for r in full['result']['rows']]==[0,4,5.735]
                assert all(request(f'/api/job/{ident}')['state']=='cancelled' for ident in ids)
                assert max(latencies)<.5,latencies
                trace=request('/api/trace',{'params':dict(params,particles=8192,field_mT=5.735),
                    'particle_id':3415,'include_zero_field':False,'series':['pphi']})
                assert len(trace['points'])==len(trace['pphi_mm2_per_ns'])
                low_local=request('/api/trace',{'params':dict(params,anode_V=1.1,gradient=False,filament_V=0,tilt_deg=0,field_mT=2),
                    'particle_id':3415,'include_zero_field':False})
                assert low_local['flight_ns']>0
                report={'passed':True,'submission_s':latencies,'polls':polls,'arrival_order':[r['field_idx'] for r in arrivals],
                    'replaced_states':[request(f'/api/job/{ident}')['state'] for ident in ids]}
                output=ROOT/'results/latest/ch456_backend';output.mkdir(parents=True,exist_ok=True)
                (output/'streaming_api.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
                print(json.dumps(report),flush=True)
            finally:
                if process.poll() is None:
                    try:request('/api/shutdown',{})
                    except OSError:pass
                try:process.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    import psutil
                    for child in psutil.Process(process.pid).children(recursive=True):child.kill()
                    process.kill();process.wait()
                if process.returncode:
                    log.flush()
                    print((Path(directory)/'server.log').read_text(encoding='utf-8'))


if __name__=='__main__':main()
