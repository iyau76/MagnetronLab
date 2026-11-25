"""Real UI scan timing with a separate server and fresh disk cache."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import socket
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def check(args):
    output = ROOT / 'results' / 'latest' / 'browser'
    output.mkdir(parents=True,exist_ok=True)
    # Never attach to or shut down another running instance.
    with socket.socket() as probe:
        probe.bind(('127.0.0.1',args.port))
    address = f'http://127.0.0.1:{args.port}'
    with tempfile.TemporaryDirectory(prefix='magnetron-tilt-') as temporary, (output / (args.label+'_server.log')).open('w',encoding='utf-8') as log:
        env = os.environ | {'MAGNETRON_DATA_DIR': temporary, 'PYTHONIOENCODING': 'utf-8'}
        command = [sys.executable, str(ROOT/'backend'/'server.py'), '--port', str(args.port)]
        server = subprocess.Popen(command, cwd=ROOT, env=env, stdout=log, stderr=log,
                                  creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(200):
                try:
                    with urllib.request.urlopen(address+'/api/health',timeout=1) as response:
                        health=json.load(response)
                    if server.poll() is not None:raise RuntimeError('Isolated server exited')
                    assert Path(health['instance_path']).resolve()==(ROOT/'backend').resolve(),health
                    if health['worker']['state']=='ready':break
                except OSError:pass
                time.sleep(.1)
            else:raise RuntimeError('Server did not become ready')
            report={'health':health,'cases':[],'errors':[],'fresh_cache':True}
            with sync_playwright() as playwright:
                browser=playwright.chromium.launch(channel='msedge',headless=True)
                page=browser.new_page(viewport={'width':1600,'height':1000})
                page.on('pageerror',lambda error:report['errors'].append(str(error)))
                page.goto(address+'/#explore')
                page.wait_for_load_state('networkidle')
                page.wait_for_selector('#scan:not([disabled])',timeout=30000)
                page.get_by_text('计算区域的几何、温度与采样',exact=True).click()
                page.locator('#particles').select_option(str(args.particles))
                page.locator('#compute_threads').select_option(str(args.threads))
                if page.locator('#accuracy').count():
                    page.locator('#accuracy').select_option(args.accuracy)
                for angle in args.angles:
                    page.locator('#tilt_deg').evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}))}',str(angle))
                    start=time.perf_counter()
                    with page.expect_response(lambda r:r.url==address+'/api/scan') as submitted:
                        page.locator('#scan').click()
                    ident=submitted.value.json()['id']
                    page.wait_for_function("!document.querySelector('#scan').disabled",timeout=240000)
                    elapsed=time.perf_counter()-start
                    status=page.locator('#status').inner_text()
                    scan=page.request.get(address+'/api/job/'+ident).json()
                    assert scan['state']=='done',scan
                    result=scan['result']
                    assert result['stats']['cache_hits']==0,result['stats']
                    assert result['stats']['integrated_particles']==len(result['rows'])*args.particles,result['stats']
                    assert '扫描完成' in status,status
                    assert not report['errors'],report['errors']
                    record={'tilt_deg':angle,'particles':args.particles,'threads':args.threads,'accuracy':args.accuracy,
                            'click_to_complete_s':elapsed,'status':status,
                            'note':page.locator('#computeNote').inner_text(),'scan':result}
                    report['cases'].append(record)
                    page.screenshot(path=str(output/f'{args.label}_{angle:g}deg.png'),full_page=True)
                    (output/(args.label+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
                    print(json.dumps({key:value for key,value in record.items() if key!='scan'},ensure_ascii=False),flush=True)
                if page.locator('#accuracy').count() and args.accuracy=='statistical':
                    page.locator('#accuracy').select_option('reference')
                    with page.expect_response(lambda r:r.url==address+'/api/point') as submitted:
                        page.locator('#point').click()
                    ident=submitted.value.json()['id']
                    page.wait_for_function("!document.querySelector('#point').disabled",timeout=30000)
                    point=page.request.get(address+'/api/job/'+ident).json()
                    assert point['state']=='done',point
                    result=point['result']
                    assert result['params']['accuracy']=='reference',result['params']
                    assert result['numerics']['current_rtol']==1e-9,result['numerics']
                    assert result['stats']['cache_hits']==0,result['stats']
                    report['accuracy_switch']={'params_accuracy':result['params']['accuracy'],'numerics':result['numerics'],
                                               'newly_integrated':result['stats']['integrated_particles'],'paths':len(result['paths'])}
                    page.locator('#accuracy').select_option('statistical')
                if args.cancel:
                    page.locator('#anode_V').evaluate('(e)=>{e.value="9.8";e.dispatchEvent(new Event("input",{bubbles:true}))}')
                    page.locator('#particles').select_option('32768')
                    page.locator('#scan').click()
                    page.wait_for_selector('#cancel:not([disabled])',timeout=30000)
                    start=time.perf_counter()
                    page.locator('#cancel').click()
                    page.wait_for_function("!document.querySelector('#scan').disabled",timeout=5000)
                    report['cancel']={'seconds':time.perf_counter()-start,'status':page.locator('#status').inner_text()}
                    assert '已取消' in report['cancel']['status'],report['cancel']
                browser.close()
            (output/(args.label+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        finally:
            try:
                with urllib.request.urlopen(urllib.request.Request(address+'/api/shutdown',data=b'{}'),timeout=5):pass
                server.wait(timeout=15)
            except Exception:
                server.terminate()
                server.wait(timeout=10)


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--label',default='interaction')
    parser.add_argument('--port',type=int,default=8891)
    parser.add_argument('--particles',type=int,default=1024)
    parser.add_argument('--threads',type=int,default=1)
    parser.add_argument('--angles',type=float,nargs='+',default=[10])
    parser.add_argument('--cancel',action=argparse.BooleanOptionalAction,default=True)
    parser.add_argument('--accuracy',choices=['statistical','reference'],default='statistical')
    check(parser.parse_args())
