"""Temporal readout and adjacent UI regressions, against the source preview.

Uses the completed browser state saved by test_chapter3.py.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'results/latest/scan_visibility_20261115'
BASE = 'http://127.0.0.1:8893/'


def run(ui_only=False):
    OUT.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []
    complete = json.loads((ROOT / 'results/latest/chapter3_v2/report.json').read_text(encoding='utf-8'))['state']
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.on('pageerror', lambda e: errors.append(str(e)))
        c = page.frame_locator('#chapter2-frame')
        f = page.frame_locator('#chapter3-frame')
        def ready():
            page.wait_for_function('window.__magnetronChapter1?.getReady()', timeout=90000)
        def settled():
            page.locator('#transition').wait_for(state='hidden', timeout=30000)
        def cal():
            return page.evaluate('window.__magnetronChapter1.getCalibration()')
        def check(name):
            checks.append(name)
            print(name, flush=True)
        def shot(name):
            page.screenshot(path=str(OUT / (name + '.png')))
        def load3(saved):
            page.goto(BASE)
            ready()
            page.evaluate("""async data=>{localStorage.clear();const m=await import('./chapter1/data.js');
              m.writeSave({...m.freshState(),chapter:3,chapter3:data,lessonDone:true});}""", saved)
            page.reload()
            ready()
            page.locator('#continue-experiment').click()
            page.locator('[data-action="load-save"]').first.click()
            settled()
        try:
            if not ui_only:
                page.goto(BASE)
                ready()
                page.locator('#new-experiment').click()
                settled()
                page.locator('[data-action="menu"]').click()
                page.locator('#modal [data-action="skip-chapter2"]').click()
                settled()
                c.locator('#dock-inst').click()
                for i in range(5):
                    c.locator('.hole-btn').nth(i).click()
                    page.wait_for_function('(i)=>window.__magnetronChapter1.getCalibration().measured["0.5"]?.[i]!=null', arg=i)
                c.locator('#btn-auto-scan').click()
                page.wait_for_function("""()=>{
                  const d=document.querySelector('#chapter2-frame').contentDocument;
                  return d.querySelector('#meter-hint').textContent.includes('正在读取');
                }""")
                c.locator('#pause-scan').click()
                paused = cal()['measured']
                page.wait_for_timeout(700)
                assert cal()['measured'] == paused
                check('pause during visible acquisition cancels its later table commit')
                page.evaluate("""()=>{
                  window.readoutSamples=[];
                  window.readoutTimer=setInterval(()=>{
                    const a=window.__magnetronChapter1, s=a.getCalibration(), g=a.calibrationDebug();
                    const d=document.querySelector('#chapter2-frame').contentDocument;
                    readoutSamples.push({t:performance.now(),i:s.currentIdx,h:s.activeHole,
                      scan:s.autoScanning,ready:g.probeReady,readout:g.readout,reading:g.reading,
                      hud:d.querySelector('#lcd-val').textContent,pol:d.querySelector('#lcd-pol').textContent});
                  },40);
                }""")
                c.locator('#btn-auto-scan').click()
                page.wait_for_function("""()=>document.querySelector('#chapter2-frame').contentDocument.querySelector('#meter-hint').textContent.includes('正在读取')""")
                shot('calibration_reading')
                page.wait_for_function('!window.__magnetronChapter1.getCalibration().autoScanning', timeout=70000)
                samples = page.evaluate('clearInterval(readoutTimer);readoutSamples')
                (OUT / 'readout_timeline.json').write_text(json.dumps(samples, ensure_ascii=False), encoding='utf-8')
                durations = {}
                for row in samples:
                    if row['scan'] and row['hud'] != '--.--':
                        assert row['ready'], row
                        assert row['hud'] == row['readout'], row
                        key = f"{row['i']}:{row['h']}"
                        durations.setdefault(key, []).append(row['t'])
                assert len(durations) == 35, len(durations)
                duration_ms = {k: round(max(v)-min(v)) for k,v in durations.items()}
                assert min(duration_ms.values()) >= 300, duration_ms
                assert sum(len([x for x in v if x is not None]) for v in cal()['measured'].values()) == 40
                (OUT / 'visible_durations.json').write_text(json.dumps(duration_ms, indent=2), encoding='utf-8')
                check('all 35 automatic samples show matching HUD and 3D readings for at least 300 ms')
                c.locator('#btn-fit').click()
                c.locator('#btn-save-book').click()
                c.locator('#btn-zero-current').click()
                page.wait_for_timeout(900)
                assert c.locator('#lcd-val').inner_text() == '0.19'
                assert c.locator('#lcd-pol').inner_text() == 'S'
                assert '正在' not in c.locator('#meter-hint').inner_text()
                c.locator('#dock-circuit').click()
                c.locator('.wire-opt').nth(3).click()
                page.wait_for_timeout(400)
                assert cal()['stage'] == '2.3' and cal()['activeHole'] is None
                assert page.evaluate('window.__magnetronChapter1.calibrationDebug().readout') == '--.--'
                c.locator('#dock-inst').click()
                assert cal()['currentIdx'] == 0 and cal()['savedToBook']
                check('fit, zero, polarity and geometry exploration preserve completion without stale readings')
                (OUT/'calibration_report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')

            partial = {**complete, 'guideEnabled': True, 'guideStep': '1', 'manualLayout': False,
                       'stageLayout': 'sweep', 'sweptVoltages': {'10': {'count': 71, 'done': True}},
                       'selectedVoltage': 10, 'singleCalcDone': False, 'scatterDone': False,
                       'fittedRegression': {'done': False, 'dropVerified': False},
                       'bumpRecorded': False, 'anomaliesConfirmed': False, 'completed': False,
                       'leftOpen': True, 'rightOpen': True, 'activeTab': 'curves', 'viewMode': 'bench'}
            for w,h in [(1536,864),(1440,900),(1280,800),(960,720)]:
                page.set_viewport_size({'width':w,'height':h})
                load3(partial)
                page.wait_for_timeout(800)
                action = f.locator('#btn-sweep-rest') if f.locator('#left-drawer').is_visible() else f.locator('#btn-curves-rest')
                bounds = action.bounding_box()
                assert bounds and bounds['y'] >= 66 and bounds['y']+bounds['height'] < h-100, (w,bounds)
                assert action.evaluate('(e)=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}')
                if f.locator('#left-drawer').is_visible():
                    meters = f.locator('#bench-meters').bounding_box()
                    assert meters['y'] >= bounds['y']+bounds['height']
                    assert meters['y']+meters['height'] <= f.locator('#left-drawer').bounding_box()['y']+f.locator('#left-drawer').bounding_box()['height']+1
                shot(f'next_sweep_{w}')
                if w == 1280:
                    # Scroll an already lit plot; the mask must follow the clipped plot.
                    f.locator('#tab-curves').evaluate('(e)=>e.scrollTop=80')
                    page.wait_for_timeout(650)
                    visible = f.locator('#scan-card').evaluate('''e=>{
                      const p=e.closest('.drawer-body').getBoundingClientRect(),r=e.getBoundingClientRect();
                      const h=document.querySelector('#spotlight-hole').getBoundingClientRect();
                      return {actual:h.bottom,expected:Math.min(r.bottom+6,p.bottom)};
                    }''')
                    assert abs(visible['actual']-visible['expected'])<2,visible
                    f.locator('#tab-curves').evaluate('(e)=>e.scrollTop=0')
                    page.wait_for_timeout(650)
                scene_box=f.locator('#scene').bounding_box()
                x=scene_box['x']+scene_box['width']*.5
                y=scene_box['y']+scene_box['height']*.5
                page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+35,y+20,steps=6);page.mouse.up()
                page.evaluate('window.cameraCheck={previous:null,stable:0}')
                page.wait_for_function('''()=>{
                  const p=window.__magnetronChapter1.getScene().camera,c=window.cameraCheck;
                  c.stable=c.previous&&Math.max(...p.map((v,i)=>Math.abs(v-c.previous[i])))<.005?c.stable+1:0;
                  c.previous=p;return c.stable>=4;
                }''',polling=200,timeout=20000)
                camera=page.evaluate('window.__magnetronChapter1.getScene().camera')
                action.click()
                page.wait_for_function('window.__magnetronChapter1.chapter3Debug().running?.v===8')
                # Dock changes must not cancel a running sweep or reset its point count.
                f.locator('#dock-left').click()
                page.wait_for_timeout(700)
                assert page.evaluate('window.__magnetronChapter1.chapter3Debug().running?.v') == 8
                after=page.evaluate('window.__magnetronChapter1.getScene().camera')
                assert max(abs(a-b) for a,b in zip(camera,after))<.1,(camera,after)
            check('remaining-sweep action is visible and pointer-operable at four viewport sizes; dock preserves sweep')
            page.set_viewport_size({'width':1440,'height':900})
            load3({**complete, 'guideEnabled':True, 'guideStep':'7b', 'manualLayout':False})
            f.locator('#btn-right-next').click()
            page.locator('#modal-overlay').wait_for(state='visible')
            a=page.locator('#modal [data-action="book"]').bounding_box()
            b=page.locator('#modal [data-action="close-modal"]').last.bounding_box()
            assert b['x'] >= a['x']+a['width']+14 or b['y'] >= a['y']+a['height']+14
            shot('chapter_end_modal')
            page.locator('#modal .chapter-complete-actions [data-action="close-modal"]').click()
            page.locator('#modal-overlay').wait_for(state='hidden')
            f.locator('#btn-right-next').click()
            page.locator('#modal [data-action="book"]').click()
            page.locator('#book-overlay').wait_for(state='visible')
            check('end modal actions are separated and both open/return paths work')
            assert not errors, errors
            (OUT/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        except Exception:
            shot('failure')
            (OUT/'failure.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
            raise
        finally:
            browser.close()


if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--ui-only',action='store_true')
    run(parser.parse_args().ui_only)
