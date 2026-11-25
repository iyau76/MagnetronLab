"""Chapter two browser journey. Run against the source preview; no packaging or solver suite."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

def run(url):
    out = ROOT / 'results/latest/chapter2'
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.on('pageerror', lambda e: errors.append(e.stack))
        page.goto(url)
        page.wait_for_function('window.__magnetronChapter1?.getReady()', timeout=60000)
        page.locator('[data-action="new"]').click()
        page.locator('#transition').wait_for(state='hidden')
        page.locator('#dock-circuit').click()
        page.locator('[data-action="light-all"]').click()
        page.locator('[data-action="structure-tab"]').click()
        page.wait_for_timeout(2000)
        page.locator('[data-action="complete-circuit"]').click()
        page.locator('[data-action="skip-chapter2"]').click()
        page.locator('#transition').wait_for(state='hidden')
        f = page.frame_locator('#chapter2-frame')
        state = lambda: page.evaluate('window.__magnetronChapter1.getCalibration()')
        page.screenshot(path=str(out / 'entry.png'))
        f.locator('#dock-circuit').click()
        f.locator('#btn-open-bz').click()
        f.locator('.switch').click()
        for mode in range(4):
            f.locator('.wire-opt').nth(mode).click()
        f.locator('#spacing-slider').focus()
        f.locator('#spacing-slider').press('End')
        page.wait_for_timeout(900)
        positions = page.evaluate('window.__magnetronChapter1.calibrationDebug().coilX')
        assert abs(positions[1] - positions[0] - 113.5 * 1.8) < 1
        page.screenshot(path=str(out / 'opposed.png'))
        f.locator('.wire-opt').nth(2).click()
        f.locator('#btn-snap-dr').click()
        for width, height in [(1440,900),(1280,800),(960,720)]:
            page.set_viewport_size({'width':width,'height':height})
            page.wait_for_timeout(600)
            page.screenshot(path=str(out / f'explore_{width}.png'))
            assert f.locator('body').evaluate('e=>e.scrollWidth<=innerWidth')
        if not f.locator('#btn-goto-22').is_visible():
            f.locator('#dock-circuit').click()
        f.locator('#btn-goto-22').click()
        assert state()['dRatio'] == 1 and state()['wireMode'] == 'aiding'
        f.locator('#btn-zero-current').click()
        f.locator('.hole-btn').nth(2).click()
        page.wait_for_timeout(1400)
        assert state()['currentIdx'] == 0 and not state()['measured']
        f.locator('#ch1-detents button').nth(3).click()
        # Real pointer pick on the 3D plane, using the rendered projection only to locate it.
        xy = page.evaluate('''()=>{const a=window.__magnetronChapter1;
          return a.project(a.calibrationDebug().positions[3]);}''')
        bounds = f.locator('#scene').bounding_box()
        page.mouse.click(bounds['x']+xy[0], bounds['y']+xy[1])
        page.wait_for_timeout(850)
        assert state()['measured']['0.5'][3] is not None
        for i in [0,1,2,4]:
            f.locator('.hole-btn').nth(i).click()
            page.wait_for_timeout(850)
        f.locator('#btn-auto-scan').click()
        page.wait_for_timeout(650)
        f.locator('#pause-scan').click()
        paused=state()['measured']
        page.wait_for_timeout(1000)
        assert state()['measured'] == paused
        f.locator('#btn-auto-scan').click()
        page.wait_for_timeout(500)
        f.locator('#dock-circuit').click()
        paused=state()['measured']
        page.wait_for_timeout(700)
        assert not state()['autoScanning'] and state()['measured'] == paused
        f.locator('#btn-goto-22').click()
        f.locator('#btn-auto-scan').click()
        page.wait_for_function('!window.__magnetronChapter1.getCalibration().autoScanning', timeout=60000)
        f.locator('#dock-rec').click()
        f.locator('#btn-fit').click()
        fit=state()['fit']
        assert abs(fit['slope']-4.230907194994787)<1e-10
        assert abs(fit['intercept']+.18806673618352443)<1e-10
        raw=json.loads((ROOT/'frontend/assets/measurements.json').read_text(encoding='utf8'))['calibration']
        for row in raw['points']:
            assert sorted(state()['measured'][str(row['current_A']).removesuffix('.0')]) == sorted(row['fields_mT'])
        for width,height in [(960,720),(1280,800),(1440,900)]:
            page.set_viewport_size({'width':width,'height':height})
            page.wait_for_timeout(500)
            page.screenshot(path=str(out/f'fit_{width}.png'))
        f.locator('#btn-save-book').click()
        page.wait_for_timeout(850)
        f.locator('#dock-inst').click()
        if not f.locator('#btn-zero-current').is_visible(): f.locator('#dock-inst').click()
        f.locator('#btn-zero-current').click()
        f.locator('#dock-book').click()
        manual=page.frame_locator('#manual-frame')
        manual.locator('.goal-card[data-goal="0"]').click()
        assert '4.231' in manual.locator('#goalInspBody').inner_text()
        assert '−0.188' in manual.locator('#goalInspBody').inner_text()
        page.screenshot(path=str(out/'book_result.png'))
        manual.locator('#btnCloseTop').click()
        page.locator('#book-overlay').wait_for(state='hidden')
        f.locator('#btn-finish-ch2').click()
        page.locator('#transition').wait_for(state='hidden')
        third=page.frame_locator('#chapter3-frame')
        assert '4.231' in third.locator('#cal-summary').inner_text()
        inherited=page.evaluate('window.__magnetronChapter1.getChapter3().calibration')
        assert abs(inherited['slope']-fit['slope'])<1e-12 and not inherited['skipped']
        third.locator('#btn-back-ch1').click()
        page.locator('#transition').wait_for(state='hidden')
        first=page.evaluate('window.__magnetronChapter1.getState()')
        assert first['chapter']==1 and len(first['lit'])==5 and first['progress']['circuit']
        page.screenshot(path=str(out/'return_chapter1.png'))
        page.locator('[data-action="menu"]').click()
        page.locator('#modal [data-action="skip-chapter2"]').click()
        page.locator('#transition').wait_for(state='hidden')
        assert state()['savedToBook'] and len(state()['measured'])==8
        page.reload()
        page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=60000)
        page.locator('[data-action="continue"]').click()
        page.locator('[data-action="load-save"]').first.click()
        page.locator('#transition').wait_for(state='hidden')
        assert state()['savedToBook'] and len(state()['measured'])==8
        assert not errors, errors
        (out/'report.json').write_text(json.dumps({'fit':fit,'page_errors':errors,'viewports':[1440,1280,960],'passed':True},indent=2),encoding='utf8')
        browser.close()
    print('Chapter two journey passed.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8893/')
    run(parser.parse_args().url)
