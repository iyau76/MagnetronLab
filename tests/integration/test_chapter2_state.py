"""Focused browser regression for panel navigation, live readings and probe handling."""
import argparse
import json
import math
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def run(url):
    out = ROOT / 'results/latest/chapter2_state'
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(url)
        page.wait_for_function('window.__magnetronChapter1?.getReady()', timeout=60000)
        page.locator('[data-action="new"]').click()
        page.locator('#transition').wait_for(state='hidden')
        scene = lambda: page.evaluate('window.__magnetronChapter1.getScene()')
        model = lambda: page.evaluate('window.__magnetronChapter1.calibrationDebug()')
        state = lambda: page.evaluate('window.__magnetronChapter1.getCalibration()')
        assert not model()['accessoriesVisible']
        page.screenshot(path=str(out / 'chapter1.png'))
        page.locator('#dock-instruments').click()
        page.locator('[data-action="skip-chapter2"]').click()
        page.locator('#transition').wait_for(state='hidden')
        f = page.frame_locator('#chapter2-frame')
        assert model()['accessoriesVisible']

        # Rotate the actual canvas, then open both drawers without touching reset.
        area = f.locator('#scene').bounding_box()
        page.mouse.move(area['x'] + area['width'] * .55, area['y'] + area['height'] * .45)
        page.mouse.down()
        page.mouse.move(area['x'] + area['width'] * .55 + 100, area['y'] + area['height'] * .45 + 35, steps=14)
        page.mouse.up()
        page.wait_for_function('''()=>{const p=window.__magnetronChapter1.getScene().camera;
          const last=window.cameraSample;window.cameraSample=p;
          window.cameraStable=last&&Math.hypot(...p.map((v,i)=>v-last[i]))<.001?(window.cameraStable||0)+1:0;
          return window.cameraStable>=4}''', polling=100, timeout=10000)
        camera_before = scene()
        for selector in ['#dock-circuit', '#dock-rec', '#dock-rec', '#dock-circuit']:
            f.locator(selector).click()
            page.wait_for_timeout(400)
        camera_after = scene()
        assert math.dist(camera_before['camera'], camera_after['camera']) < .2
        assert math.dist(camera_before['target'], camera_after['target']) < .01
        f.locator('#btn-reset-cam').click()
        page.wait_for_timeout(1500)

        f.locator('#dock-inst').click()
        f.locator('#btn-zero-current').click()
        f.locator('#btn-meter-pwr').click()
        assert f.locator('#lcd-val').inner_text() == '--.--'
        assert model()['readout'] == '--.--' and model()['reading'] is None

        # Sample the shell's full rotated bounds throughout real removal/insertion.
        page.evaluate('''() => {window.capSamples=[];window.captureCap=true;
          const sample=()=>{if(!window.captureCap)return;
            window.capSamples.push(window.__magnetronChapter1.calibrationDebug());
            requestAnimationFrame(sample)};requestAnimationFrame(sample)}''')
        f.locator('#btn-probe-cap').click()
        page.wait_for_timeout(450)
        page.screenshot(path=str(out / 'cap_withdrawing.png'))
        page.wait_for_timeout(1000)
        page.screenshot(path=str(out / 'cap_on_table.png'))
        f.locator('#btn-probe-cap').click()
        page.wait_for_timeout(1400)
        cap_samples = page.evaluate('()=>{window.captureCap=false;return window.capSamples}')
        assert len(cap_samples) > 20
        assert min(s['capBottom'] for s in cap_samples) >= 0
        assert f.locator('#lcd-val').inner_text() == '--.--'

        f.locator('.hole-btn').nth(3).click()
        page.wait_for_timeout(1400)
        assert f.locator('#lcd-pol').inner_text() == model()['polarity'] == 'S'
        assert f.locator('#lcd-val').inner_text() == model()['readout'] == '0.19'
        f.locator('#btn-probe-cap').click()
        page.wait_for_timeout(1400)
        f.locator('#btn-probe-cap').click()
        page.wait_for_timeout(120)
        assert f.locator('#lcd-val').inner_text() == model()['readout'] == '--.--'
        page.wait_for_function('window.__magnetronChapter1.calibrationDebug().probeReady')
        page.wait_for_timeout(80)
        assert f.locator('#lcd-val').inner_text() == '0.19'
        # Opening a tool during travel cancels capture, but leaves the selected probe destination.
        f.locator('.hole-btn').nth(2).click()
        page.wait_for_timeout(100)
        f.locator('#dock-circuit').click()
        assert state()['activeHole'] == 2 and state()['stage'] == '2.2'
        page.wait_for_function('window.__magnetronChapter1.calibrationDebug().probeReady')
        f.locator('#dock-inst').click()
        assert state()['currentIdx'] == 0 and f.locator('#lcd-val').inner_text() == '0.19'
        f.locator('#ch1-detents button').nth(3).click()
        for hole in [0, 1, 2, 4, 3]:
            f.locator('.hole-btn').nth(hole).click()
            page.wait_for_timeout(850)
        measured = state()['measured']
        assert len(measured['0.5']) == 5
        f.locator('#ch1-detents button').nth(7).click()
        f.locator('#dock-circuit').click()
        f.locator('#dock-rec').click()
        assert state()['stage'] == '2.2' and state()['currentIdx'] == 7
        assert state()['measured'] == measured
        assert '2.1' not in f.locator('#crumb-sub').inner_text()

        f.locator('.wire-opt').nth(3).click()
        page.wait_for_timeout(1000)
        assert state()['activeHole'] is None and model()['reading'] is None
        assert model()['readout'] == '--.--'
        assert math.dist(model()['probe'], [-80, 64, 90]) < 1
        f.locator('#spacing-slider').focus()
        f.locator('#spacing-slider').press('End')
        f.locator('#dock-inst').click()
        assert state()['currentIdx'] == 7 and state()['stage'] == '2.2'
        assert state()['wireMode'] == 'aiding' and state()['dRatio'] == 1

        f.locator('#btn-auto-scan').click()
        page.wait_for_timeout(400)
        f.locator('#skip-scan').click()
        assert '正在' not in f.locator('#meter-hint').inner_text()
        assert state()['stage'] == '2.3'
        if not f.locator('#btn-fit').is_visible():
            f.locator('#dock-rec').click()
        f.locator('#btn-fit').click()
        f.locator('#btn-save-book').click()
        page.wait_for_timeout(850)
        f.locator('#btn-zero-current').click()
        assert '归零' in f.locator('#meter-hint').inner_text()
        f.locator('#dock-circuit').click()
        f.locator('.wire-opt').nth(0).click()
        page.wait_for_timeout(300)
        f.locator('#dock-inst').click()
        assert state()['stage'] == '2.3' and state()['currentIdx'] == 0
        assert state()['savedToBook'] and len(state()['measured']) == 8
        assert f.locator('#lcd-val').inner_text() == '--.--'
        page.screenshot(path=str(out / 'resumed_zero.png'))
        f.locator('#btn-back-ch1').click()
        page.locator('#transition').wait_for(state='hidden')
        assert not model()['accessoriesVisible']
        assert not errors, errors
        (out / 'report.json').write_text(json.dumps({
            'camera_before': camera_before['camera'], 'camera_after': camera_after['camera'],
            'cap_min_y': min(s['capBottom'] for s in cap_samples),
            'cap_samples': len(cap_samples), 'errors': errors, 'passed': True,
        }, indent=2), encoding='utf8')
        browser.close()
    print('Chapter two state and probe checks passed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8893/')
    run(parser.parse_args().url)
