"""Adjacent readiness paths: skip, cap, geometry, and chapter re-entry."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT/'results/latest/scan_visibility_20261115'

def run():
    OUT.mkdir(parents=True,exist_ok=True)
    raw=json.loads((ROOT/'frontend/assets/measurements.json').read_text(encoding='utf-8'))['calibration']['points']
    a=sorted(next(row['fields_mT'] for row in raw if row['current_A']==.5),reverse=True)
    checks=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':900})
        c=page.frame_locator('#chapter2-frame')
        def ready():page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        def cal():return page.evaluate('window.__magnetronChapter1.getCalibration()')
        def check(name):checks.append(name);print(name,flush=True)
        def consistent():
            return page.evaluate("""()=>{
              const d=document.querySelector('#chapter2-frame').contentDocument,g=window.__magnetronChapter1.calibrationDebug();
              return {ready:g.probeReady,screen:g.readout,hud:d.querySelector('#lcd-val').textContent};
            }""")
        try:
            page.goto('http://127.0.0.1:8893/');ready()
            page.evaluate("""async values=>{const m=await import('./chapter1/data.js');localStorage.clear();
              m.writeSave({...m.freshState(),chapter:2,calibration:{stage:'2.2',measurementStarted:true,
                leftPanel:'instruments',rightPanel:'records',currentIdx:3,meterOn:true,capRemoved:true,
                activeHole:0,wireMode:'aiding',dRatio:1,measured:{'0.5':values}}});}""",[a[1],a[2],a[0],a[3],a[4]])
            page.reload();ready();page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click()
            page.locator('#transition').wait_for(state='hidden')
            page.wait_for_function('window.__magnetronChapter1.calibrationDebug().probeReady')
            c.locator('#btn-auto-scan').click()
            page.wait_for_function("()=>document.querySelector('#chapter2-frame').contentDocument.querySelector('#meter-hint').textContent.includes('正在读取')")
            # Use a real click while the probe is settled at hole 1. Skip sends it to hole 3.
            c.locator('#skip-scan').click()
            snap=consistent()
            assert snap['hud']==snap['screen'],snap
            page.wait_for_function('window.__magnetronChapter1.calibrationDebug().probeReady')
            page.wait_for_timeout(100)
            assert consistent()['hud']==consistent()['screen']!='--.--'
            assert len(cal()['measured'])==8 and not cal()['autoScanning']
            check('skip during a visible reading clears the HUD while moving and settles consistently')
            c.locator('#btn-probe-cap').click()
            assert consistent()['hud']=='--.--' and consistent()['screen']=='--.--'
            page.wait_for_timeout(1500)
            c.locator('#btn-probe-cap').click()
            page.wait_for_function('window.__magnetronChapter1.calibrationDebug().probeReady')
            page.wait_for_timeout(100)
            assert consistent()['hud']==consistent()['screen']!='--.--'
            check('cap replacement hides readings and removal restores them')
            c.locator('#btn-fit').click();c.locator('#btn-save-book').click();c.locator('#btn-zero-current').click()
            page.wait_for_timeout(850)
            c.locator('#btn-finish-ch2').click();page.locator('#transition').wait_for(state='hidden')
            third=page.frame_locator('#chapter3-frame')
            third.locator('#btn-back-ch2').click();page.locator('#transition').wait_for(state='hidden')
            page.wait_for_function('window.__magnetronChapter1.calibrationDebug().probeReady')
            page.wait_for_timeout(100)
            assert consistent()['hud']==consistent()['screen']=='0.19'
            assert cal()['savedToBook'] and cal()['currentIdx']==0
            check('return from chapter three restores the saved zero-current readout')
            (OUT/'interruptions.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
        except Exception:
            page.screenshot(path=str(OUT/'interruption_failure.png'))
            raise
        finally:browser.close()

if __name__=='__main__':run()
