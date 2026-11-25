"""Real mouse paths, responsive reading and persistent progress for Chapter 1.

Screenshots remain necessary: geometry assertions detect clipping, not composition.
"""
from pathlib import Path
import argparse
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUTPUT=ROOT/'results/latest/structure_controls_20261114/integration'
VIEWPORTS=[(1600,1000),(1440,900),(1280,800),(960,720)]


def exercise(base_url, *, video=False):
    OUTPUT.mkdir(parents=True,exist_ok=True)
    report={'base_url':base_url,'checks':[],'errors':[],'viewports':[]}
    with sync_playwright() as pw:
        browser=pw.chromium.launch(channel='msedge',headless=True)
        options={'viewport':{'width':1600,'height':1000},'device_scale_factor':1}
        if video:
            options['record_video_dir']=str(OUTPUT/'video')
        context=browser.new_context(**options)
        page=context.new_page()
        page.on('pageerror',lambda error:report['errors'].append(str(error)))
        def state():return page.evaluate('window.__magnetronChapter1.getState()')
        def shot(name):page.screenshot(path=str(OUTPUT/(name+'.png')))
        def click(action):page.locator(f'[data-action="{action}"]').filter(visible=True).first.click()
        def contained(selector):
            return page.locator(selector).evaluate_all('''els=>els.filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {tag:e.id||e.dataset.page||e.className,top:r.top,bottom:r.bottom,overflow:e.scrollHeight-e.clientHeight,inside:r.top>=0&&r.bottom<=innerHeight+1&&r.left>=0&&r.right<=innerWidth+1}})''')
        def controls_fit():
            regions=contained('.power-rows,#power-hint,.meter-reading,.instrument-footer')
            assert all(r['inside'] and r['overflow']<=2 for r in regions),regions
            assert all(a['bottom']<=b['top']+1 for a,b in zip(regions,regions[1:])),regions
            assert all(r['overflow']<=2 for r in contained('.instrument-body')),regions
        def svg_click(x,y):
            pos=page.locator('.circuit-diagram').evaluate('(el,p)=>{const q=new DOMPoint(...p).matrixTransform(el.getScreenCTM());return [q.x,q.y]}',[x,y]);page.mouse.click(*pos)
        try:
            page.goto(base_url);page.wait_for_load_state('networkidle')
            page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
            title=page.locator('.launcher-heading h1').bounding_box()
            assert abs(title['x']+title['width']/2-800)<2
            page.locator('#new-experiment').click();page.locator('#hud').wait_for(state='visible')
            page.locator('#transition').wait_for(state='hidden')
            assert page.locator('#dock-records').is_disabled()
            # Opening a control panel is navigation, never a completion signal.
            page.locator('#dock-instruments').click()
            assert not state()['progress']['trial'] and not state()['progress']['circuit']
            assert state()['stage']=='1.1'
            assert '实验讲义' in page.locator('#task-hint').inner_text()
            assert page.locator('[data-action="complete-trial"]').is_disabled()
            click('close-panel')
            for width,height in VIEWPORTS:
                page.set_viewport_size({'width':width,'height':height})
                page.locator('#dock-book').click()
                frame=page.frame_locator('#manual-frame')
                pages=[]
                for spread in range(3):
                    frame.locator(f'.spread-tab[data-spread="{spread}"]').click();page.wait_for_timeout(150)
                    nums=[spread*2+1,spread*2+2]
                    metrics=frame.locator('.spread.active .page,.spread.active .page-body').evaluate_all("els=>els.map(e=>({overflow:e.scrollHeight-e.clientHeight,inside:e.getBoundingClientRect().bottom<=innerHeight}))")
                    assert all(m['inside'] and m['overflow']<=2 for m in metrics),(width,nums,metrics)
                    # Inspect children too: a hidden overflow setting must not hide a bad layout.
                    clipped=frame.locator('.spread.active .page-body').evaluate_all("els=>els.flatMap(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('p,h2,button,input,.math-line,.p6-closing-bar')].filter(n=>{const r=n.getBoundingClientRect();return r.height>0&&(r.bottom>b.bottom+2||r.top<b.top-2||r.right>b.right+2||r.left<b.left-2)}).map(n=>n.className)})")
                    assert not clipped,(width,nums,clipped)
                    shot(f'book_{width}_{nums[0]}');pages.append({'pages':nums,'metrics':metrics})
                    if spread==1:
                        box=frame.locator('#sliderB').bounding_box();page.mouse.move(box['x']+8,box['y']+box['height']/2);page.mouse.down();page.mouse.move(box['x']+box['width']*.8,box['y']+box['height']/2,steps=12);page.mouse.up()
                        page.wait_for_function('window.__magnetronChapter1.getState().bookField>5')
                        assert frame.locator('#roRatio').inner_text()=='0%'
                        frame.locator('.ua-pill[data-ua="4"]').click();page.wait_for_function('window.__magnetronChapter1.getState().bookVoltage===4')
                        frame.locator('.ua-pill[data-ua="10"]').click()
                    if spread==2:
                        assert frame.locator('.guess-card').count()==6
                        frame.locator('.guess-card[data-guess="5"]').click();page.wait_for_function('window.__magnetronChapter1.getState().guess===4')
                        assert frame.locator('#btnFinishManual').is_enabled()
                frame.locator('#btnCloseTop').click();page.locator('#book-overlay').wait_for(state='hidden')
                page.locator('#dock-circuit').click()
                if state()['tab']!='circuit':click('circuit-tab')
                page.wait_for_timeout(1400)
                assert all(m['inside'] and m['overflow']<=2 for m in contained('#drawer,.explanation,.panel-next'))
                # Center of visible symbols, including batteries, never a synthetic key press.
                for ident,xy in [('heater',(285,134)),('accelerator',(212,198)),('meter',(157,104)),('resistor',(157,139)),('coils',(139,325)),('magnet',(55,362)),('tube',(62,140))]:
                    before=state()['lit'];svg_click(*xy);assert state()['selected']==ident,(ident,state()['selected']);assert state()['lit']==before
                assert state()['view']=='bench' and state()['tab']=='circuit'
                assert '?' not in page.locator('.circuit-diagram').text_content()
                shot(f'circuit_{width}')
                click('structure-tab');page.wait_for_function('!window.__magnetronChapter1.getScene().transitioning')
                assert state()['view']=='tube'
                assert all(m['inside'] and m['overflow']<=2 for m in contained('#drawer,.explanation,.panel-next'))
                shot(f'structure_{width}')
                page.locator('#dock-instruments').click();page.wait_for_function('!window.__magnetronChapter1.getScene().transitioning')
                assert state()['view']=='bench'
                assert page.evaluate('window.__magnetronChapter1.getScene().mode')=='bench'
                assert all(m['inside'] and m['overflow']<=2 for m in contained('#instrument-panel,.instrument-body,#power-hint,.meter-reading,.instrument-footer'))
                controls_fit()
                shot(f'power_{width}')
                click('close-panel');report['viewports'].append({'width':width,'height':height,'pages':pages})
            report['checks'].append('all six pages and fixed actions fit all four viewports; real slider dragging survives input updates')
            page.locator('#dock-book').click();frame.locator('.spread-tab[data-spread="2"]').click()
            frame.locator('#btnFinishManual').click();page.locator('#book-overlay').wait_for(state='hidden')
            assert state()['lessonDone'] and state()['panel'] is None
            assert '打开 [🔌 电路与结构]' in page.locator('#task-hint').inner_text()
            assert not page.locator('#drawer').is_visible()
            # Full natural path, starting in the structure tab and opening power directly.
            page.set_viewport_size({'width':1440,'height':900})
            page.locator('#dock-circuit').click();click('circuit-tab')
            for ident,xy in [('L1',(180,19)),('L2',(110,139)),('L3',(134,104)),('L4',(180,65)),('L5',(190,331))]:
                svg_click(*xy);assert ident in state()['lit'],(ident,state()['lit'])
            assert len(state()['lit'])==5
            click('structure-tab');page.wait_for_function('!window.__magnetronChapter1.getScene().transitioning')
            click('complete-circuit');page.wait_for_function('!window.__magnetronChapter1.getScene().transitioning')
            assert state()['view']=='bench' and state()['progress']['circuit']
            assert page.locator('[data-action="complete-trial"]').is_disabled()
            page.locator('[data-power="accelerator"]').click();assert float(page.locator('#current-reading').inner_text())==0
            page.locator('[data-power="heater"]').click();assert float(page.locator('#current-reading').inner_text())>20
            page.locator('[data-power="magnet"]').click()
            slider=page.locator('#magnet-current');box=slider.bounding_box();page.mouse.click(box['x']+box['width']-7,box['y']+box['height']/2)
            assert state()['current']>1.3 and state()['progress']['trial']
            assert page.locator('[data-action="complete-trial"]').is_enabled()
            shot('trial_complete')
            click('complete-trial');page.locator('#transition').wait_for(state='hidden')
            assert state()['chapter']==2 and state()['view']=='bench'
            assert not page.locator('#dock-instruments').is_visible()
            assert page.frame_locator('#chapter2-frame').locator('#btn-view-tube').is_disabled()
            page.frame_locator('#chapter2-frame').locator('#btn-view-bench').click();assert state()['chapter']==2
            shot('chapter2')
            report['checks'].append('five physical wire clicks, component inspection, direct structure-to-power, three channels, both measurements and honest chapter completion')
            # Returning, notes, modal keyboard containment and persistence.
            page.frame_locator('#chapter2-frame').locator('#btn-back-ch1').click();page.locator('#transition').wait_for(state='hidden');page.locator('#dock-book').click()
            frame.locator('.spread-tab[data-spread="0"]').click()
            frame.locator('.goal-card[data-goal="3"]').click()
            frame.locator('#txtAnomaly').fill('A saved observation <b>literal</b>')
            page.wait_for_function('window.__magnetronChapter1.getState().notes.observation.includes("literal")')
            frame.locator('#btnGoalBack').click();frame.locator('.goal-card[data-goal="3"]').click()
            assert frame.locator('#txtAnomaly').input_value()=='A saved observation <b>literal</b>'
            frame.locator('#btnCloseTop').click();page.locator('#book-overlay').wait_for(state='hidden')
            click('menu');click('launcher');page.reload();page.wait_for_load_state('networkidle');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
            click('continue');page.locator('[data-action="load-save"]').first.click()
            page.locator('#transition').wait_for(state='hidden');assert state()['notes']['observation']=='A saved observation <b>literal</b>'
            assert state()['progress']['trial'] and state()['progress']['circuit']
            # New experiment and explicit skip retain incomplete status.
            click('menu');click('launcher');click('new');page.locator('#transition').wait_for(state='hidden');page.locator('#dock-instruments').click();click('skip-chapter2');page.locator('#transition').wait_for(state='hidden')
            assert state()['chapter']==2 and state()['progress']['skippedTrial']
            assert not state()['progress']['trial'] and not state()['progress']['circuit']
            report['checks'].append('Gemini inline notes and literal text/saves round trip, new experiment reset and skip without earned completion')
            # The longest trial hint plus the unfinished-circuit reminder used to overlap the meter.
            page.frame_locator('#chapter2-frame').locator('#btn-back-ch1').click();page.locator('#transition').wait_for(state='hidden');page.locator('#dock-instruments').click()
            for channel in ['heater','accelerator','magnet']:page.locator(f'[data-power="{channel}"]').click()
            box=page.locator('#magnet-current').bounding_box();page.mouse.click(box['x']+box['width']-7,box['y']+box['height']/2)
            assert state()['progress']['trial'] and not state()['progress']['circuit']
            assert page.locator('[data-action="complete-trial"]').is_disabled()
            for font in ['standard','large']:
                page.evaluate('(font)=>document.documentElement.dataset.font=font',font)
                for width,height in VIEWPORTS:
                    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(150)
                    controls_fit();shot(f'power_completed_{font}_{width}')
            report['checks'].append('powered controls, long teaching hint, unfinished-circuit reminder and meter never overlap at either font setting across four viewports')
            assert not report['errors'],report['errors']
            report['passed']=True
        except Exception:
            shot('failure');report['state']=page.evaluate('window.__magnetronChapter1?.getState()');report['passed']=False
            raise
        finally:
            (OUTPUT/'browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
            context.close();browser.close()
    print(json.dumps({'passed':True,'viewports':len(report['viewports']),'checks':report['checks']},ensure_ascii=False))


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--base-url');parser.add_argument('--port',type=int,default=8895);parser.add_argument('--video',action='store_true');args=parser.parse_args()
    if args.base_url:return exercise(args.base_url,video=args.video)
    with socket.socket() as probe:probe.bind(('127.0.0.1',args.port))
    OUTPUT.mkdir(parents=True,exist_ok=True)
    address=f'http://127.0.0.1:{args.port}'
    with tempfile.TemporaryDirectory(prefix='magnetron-chapter1-') as temporary,(OUTPUT/'server.log').open('w',encoding='utf-8') as log:
        env=os.environ|{'MAGNETRON_DATA_DIR':temporary,'PYTHONIOENCODING':'utf-8','PYTHONDONTWRITEBYTECODE':'1'}
        server=subprocess.Popen([sys.executable,str(ROOT/'run.py'),'--port',str(args.port)],cwd=ROOT,env=env,stdout=log,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(200):
                try:
                    with urllib.request.urlopen(address+'/api/health',timeout=1) as response:
                        if json.load(response)['worker']['state']=='ready':break
                except OSError:pass
                if server.poll() is not None:raise RuntimeError('Isolated server exited')
                time.sleep(.1)
            else:raise RuntimeError('Server did not start')
            exercise(address,video=args.video)
        finally:
            try:urllib.request.urlopen(urllib.request.Request(address+'/api/shutdown',data=b'{}'),timeout=5).close();server.wait(timeout=15)
            except Exception:server.terminate();server.wait(timeout=10)
if __name__=='__main__':main()
