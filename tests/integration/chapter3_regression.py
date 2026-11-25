"""Targeted chapter-three branches: manual layout, free mode, replay and restore."""
import argparse
import json
import math
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

def run(url):
    out = ROOT / 'results/latest/chapter3_v2'
    out.mkdir(parents=True, exist_ok=True)
    base = json.loads((out / 'report.json').read_text(encoding='utf-8'))['state']
    errors, checked = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width':1440, 'height':900})
        page.on('pageerror', lambda e: errors.append(str(e)))
        f = page.frame_locator('#chapter3-frame')
        m = page.frame_locator('#manual-frame')
        state = lambda: page.evaluate('window.__magnetronChapter1.getChapter3()')
        debug = lambda: page.evaluate('window.__magnetronChapter1.chapter3Debug()')
        scene = lambda: page.evaluate('window.__magnetronChapter1.getScene()')
        def load(saved):
            page.goto(url)
            page.wait_for_function('window.__magnetronChapter1?.getReady()', timeout=60000)
            page.evaluate("""async saved=>{const m=await import('./chapter1/data.js');const s=m.freshState();Object.assign(s,{chapter:3,chapter3:saved,lessonDone:true});m.writeSave(s)}""", saved)
            reload()
        def reload():
            page.reload()
            page.wait_for_function('window.__magnetronChapter1?.getReady()', timeout=60000)
            page.locator('#continue-experiment').click()
            page.locator('[data-action="load-save"]').first.click()
            page.locator('#transition').wait_for(state='hidden')
        def shot(name):
            page.wait_for_timeout(600)
            page.screenshot(path=str(out/(name+'.png')))
        def layout():
            s=state()
            return {k:s[k] for k in ['leftOpen','rightOpen','manualLayout','stageLayout','potentialOpen']}
        def wait_step(step):
            page.wait_for_function('(s)=>window.__magnetronChapter1.getChapter3().guideStep===s', arg=step)
        try:
            # Legacy saves retain progress and fixed physical choices during migration.
            legacy={k:v for k,v in base.items() if k not in ['version','guideEnabled','guideStep','manualLayout','stageLayout','bumpRecorded','heaterFound','probeCompared']}
            legacy.update(cutoffMethod='halfmax',voltageMode='actual')
            load(legacy)
            assert state()['completed'] and not state()['guideEnabled']
            assert state()['cutoffMethod']=='tangent' and state()['voltageMode']=='nominal'
            checked.append('v1 migration')

            # Manual panels survive step transitions and reload, including potential overlays.
            saved={**base,'guideEnabled':True,'guideStep':'5b','manualLayout':False,'completed':False,'bumpRecorded':False,'anomaliesConfirmed':False,'probeCompared':False,
                   'fittedRegression':{**base['fittedRegression'],'dropVerified':False}}
            load(saved)
            f.locator('#probe-options [data-probe="K"]').click()
            f.locator('#dock-left').click()
            manual=layout()
            f.locator('#dlg-next').click();wait_step('5c')
            assert layout()==manual, (layout(),manual)
            assert not f.locator('#potential-card').is_visible()
            reload();assert layout()==manual
            f.locator('#restore-layout').click()
            assert f.locator('#potential-card').is_visible()
            assert not state()['manualLayout']
            assert '6.32' in f.locator('#potential-readout').inner_text()
            shot('reg_mean_restored')
            checked.append('manual layout through potential step and reload')

            # Free mode can complete the potential reasoning without guide-only buttons.
            saved.update(guideEnabled=False,guideStep='4b',manualLayout=True,stageLayout='analysis',activeTab='fit',leftOpen=False,rightOpen=True,potentialOpen=False)
            load(saved)
            f.locator('#btn-investigate').click()
            f.locator('#probe-options [data-probe="K"]').click()
            f.locator('#probe-mean').click()
            assert '1.84' in f.locator('#potential-mean').inner_text()
            f.locator('#btn-apply-ueff').click()
            assert state()['fittedRegression']['dropVerified']
            checked.append('free potential reasoning')

            # Start with 4 V, pause, cancel, then batch the unmeasured voltages.
            load({'version':2,'guideEnabled':False,'manualLayout':True,'guideStep':'0a','selectedVoltage':4,'leftOpen':True,'rightOpen':False})
            f.locator('#btn-run-sweep').click()
            page.wait_for_function('window.__magnetronChapter1.getChapter3().sweptVoltages[4]?.count>=5')
            f.locator('#btn-run-sweep').click()
            paused=state()['sweptVoltages']['4']['count']
            page.wait_for_timeout(250)
            assert state()['sweptVoltages']['4']['count']==paused
            f.locator('[data-voltage="6"]').click()
            assert debug()['running'] is None
            f.locator('[data-voltage="4"]').click();f.locator('#btn-run-sweep').click();f.locator('#spd-skip').click()
            page.wait_for_function('window.__magnetronChapter1.getChapter3().sweptVoltages[4]?.done')
            f.locator('#btn-sweep-rest').click()
            page.wait_for_function('Object.values(window.__magnetronChapter1.getChapter3().sweptVoltages).filter(x=>x.done).length===4')
            f.locator('#guide-toggle').click();wait_step('2a')
            assert state()['manualLayout'] and not state()['rightOpen']
            f.locator('#restore-layout').click()
            assert state()['rightOpen'] and not state()['leftOpen']
            checked.append('4 V first, pause/cancel, remaining batch, resume frontier')

            # A completed experiment stays completed while replacement data is acquired.
            load({**base,'guideEnabled':False,'manualLayout':True,'stageLayout':'sweep','leftOpen':True,'rightOpen':True,'activeTab':'curves','selectedVoltage':10})
            f.locator('#btn-run-sweep').click()
            page.wait_for_function('window.__magnetronChapter1.chapter3Debug().running?.cursor>=3')
            assert state()['completed'] and state()['fittedRegression']['dropVerified']
            f.locator('#spd-skip').click()
            page.wait_for_function('window.__magnetronChapter1.chapter3Debug().running===null')
            assert state()['completed'] and state()['singleCalcDone'] and state()['scatterDone']
            displays={d['name']:d['value'] for d in scene()['displays']}
            assert displays['voltage_mV']=='2.19' and displays['voltage_mV001']==''
            assert displays['CH1current']=='1.398' and displays['CH2voltage']=='9.993'
            f.locator('#axis-b').click()
            box=f.locator('#scan-svg').bounding_box()
            f.locator('#scan-svg').click(position={'x':56/520*box['width'],'y':.55*box['height']})
            assert debug()['workingPoint']['idx']==0
            f.locator('#scan-svg').press('ArrowRight');assert debug()['workingPoint']['idx']==1
            f.locator('#restore-latest').click()
            checked.append('completed resweep, native displays, coincident B-axis samples')

            # The actual camera travels into the tube and is not reset by drawer resizing.
            f.locator('#btn-view-tube').click();page.wait_for_timeout(400)
            assert 0<scene()['viewProgress']<1
            page.wait_for_timeout(1600)
            assert 3.1<scene()['orbit']['finalRadiusMm']<3.4
            f.locator('#tube-pot-ua').click();assert 3.5<scene()['orbit']['finalRadiusMm']<3.8
            f.locator('#tube-pot-ueff').click()
            shot('reg_tube')
            f.locator('#btn-view-bench').click();page.wait_for_timeout(2000)
            area=f.locator('canvas').bounding_box()
            page.mouse.move(area['x']+area['width']*.5,area['y']+area['height']*.45)
            page.mouse.down();page.mouse.move(area['x']+area['width']*.5+50,area['y']+area['height']*.45+20,steps=8);page.mouse.up()
            page.wait_for_function('''()=>{const now=window.__magnetronChapter1.getScene().camera;const last=window.lastCamera;window.lastCamera=now;window.stableFrames=last&&Math.hypot(...now.map((v,i)=>v-last[i]))<.0001?(window.stableFrames||0)+1:0;return window.stableFrames>=5}''',polling=150,timeout=15000)
            before=scene()['camera']
            for selector in ['#dock-left','#dock-right','#dock-right','#dock-left']:
                f.locator(selector).click();page.wait_for_timeout(500)
            assert math.dist(before,scene()['camera'])<.02,(before,scene()['camera'])
            checked.append('continuous tube transition and camera preservation')

            # P6 changes travel live to Chapter 3, and hand-written notes remain intact.
            f.locator('#dock-book').click()
            m.locator('[data-spread="2"].spread-tab').click();m.locator('[data-guess="2"]').click()
            m.locator('#case-bookmark').click()
            m.locator('#case-observation').fill('记录截止前上升。')
            m.locator('#case-explanation').fill('比较不同条件下的收集电流。')
            m.locator('#case-close').click();page.locator('#book-overlay').wait_for(state='hidden')
            f.locator('[data-tab="ideal"]').click()
            assert 'S 形曲线' in f.locator('#p6-recall').inner_text()
            assert page.evaluate('window.__magnetronChapter1.getState().notes.observation')=='记录截止前上升。'
            checked.append('live prediction and notes')

            for width,height in [(1600,1000),(1440,900),(1280,800),(960,720)]:
                page.set_viewport_size({'width':width,'height':height})
                f.locator('#dock-ref').click()
                assert f.locator('.modal-card').bounding_box()['height']<=.82*height+1
                f.locator('#close-modal').click()
                f.locator('#dock-book').click();m.locator('#case-bookmark').click()
                page.wait_for_timeout(400)
                geometry=m.locator('.case-spread .page-body').evaluate_all('els=>els.map(e=>({overflow:e.scrollHeight-e.clientHeight,height:e.clientHeight}))')
                assert all(g['overflow']<=2 for g in geometry),(width,geometry)
                shot(f'reg_book_{width}')
                m.locator('#case-close').click();page.locator('#book-overlay').wait_for(state='hidden')
            checked.append('reference and casebook at four viewports')
            reload();assert state()['completed'] and state()['manualLayout']
            assert debug()['running'] is None
            page.set_viewport_size({'width':1440,'height':900})
            f.locator('#btn-back-ch2').click();page.locator('#transition').wait_for(state='hidden')
            page.frame_locator('#chapter2-frame').locator('#hud .icon-btn').click()
            page.locator('[data-action="chapter3"]').click();page.locator('#transition').wait_for(state='hidden')
            assert state()['completed']
            f.locator('#btn-back-ch1').click();page.locator('#transition').wait_for(state='hidden')
            assert not scene()['power']['actualPoint'] and scene()['power']['acceleratingVoltage']==10
            assert page.locator('#scene canvas').count()==1
            checked.append('save restore and cross chapter scene ownership')
            assert not errors,errors
        except Exception:
            page.screenshot(path=str(out/'regression_failure.png'))
            raise
        finally:
            (out/'regression.json').write_text(json.dumps({'checked':checked,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
            browser.close()
    print('Chapter three regression branches passed.')

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--url',default='http://127.0.0.1:8893/');run(ap.parse_args().url)
