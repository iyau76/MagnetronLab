"""Chapter three guided narrative, original 3D bench, layout and persistence."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

def run(url):
    out = ROOT / 'results/latest/chapter3_v2'
    out.mkdir(parents=True, exist_ok=True)
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page(viewport={'width':1440,'height':900})
        page.on('pageerror', lambda e: errors.append(str(e)))
        try:
            page.goto(url)
            page.wait_for_function('window.__magnetronChapter1?.getReady()', timeout=60000)
            page.locator('#new-experiment').click()
            page.locator('#transition').wait_for(state='hidden')
            page.locator('[data-action="menu"]').click()
            page.locator('[data-action="chapter3"]').click()
            page.locator('#transition').wait_for(state='hidden')
            f=page.frame_locator('#chapter3-frame')
            state=lambda: page.evaluate('window.__magnetronChapter1.getChapter3()')
            debug=lambda: page.evaluate('window.__magnetronChapter1.chapter3Debug()')
            scene=lambda: page.evaluate('window.__magnetronChapter1.getScene()')
            def shot(name):
                page.wait_for_timeout(600)
                page.screenshot(path=str(out/(name+'.png')))
            def wait_step(step):
                page.wait_for_function('(s)=>window.__magnetronChapter1.getChapter3().guideStep===s',arg=step)
            def next_to(step):
                f.locator('#dlg-next').click()
                wait_step(step)
            shot('01_opening')
            next_to('0b');next_to('0c')
            shot('02_first_sweep_prompt')
            f.locator('#btn-run-sweep').click()
            wait_step('1')
            shot('03_first_curve')
            page.set_viewport_size({'width':960,'height':720})
            page.wait_for_timeout(600)
            assert f.locator('#scan-svg').is_visible() and f.locator('#btn-curves-rest').is_visible()
            button=f.locator('#btn-curves-rest').bounding_box()
            panel=f.locator('#right-drawer').bounding_box()
            assert button['y']+button['height']<=panel['y']+panel['height'],(button,panel)
            shot('03_first_curve_960')
            f.locator('#btn-curves-rest').click()
            wait_step('2a')
            page.set_viewport_size({'width':1440,'height':900})
            f.locator('#btn-calc-single').click()
            page.wait_for_timeout(850);shot('04_construction')
            wait_step('2b')
            shot('04_naive')
            assert '3.502' in f.locator('#em-table').inner_text()
            next_to('3');f.locator('#btn-plot-scatter').click();wait_step('4a')
            shot('05_scatter')
            assert state()['scatterDone'] and not state()['fittedRegression']['done']
            f.locator('#btn-run-fit').click();wait_step('4b')
            shot('06_intercept')
            assert abs(debug()['fit']['u0']-2.177087417)<1e-7
            # Completed waiting steps remain traversable on backtracking.
            f.locator('#dlg-prev').click();wait_step('4a')
            assert f.locator('#dlg-next').is_visible()
            f.locator('#dlg-prev').click();wait_step('3')
            assert f.locator('#dlg-next').is_visible()
            next_to('4a');next_to('4b');next_to('5a')
            page.wait_for_timeout(1550);shot('07_detective')
            def click_world(point):
                pos=page.evaluate('(p)=>window.__magnetronChapter1.project(p)',point)
                box=f.locator('#scene').bounding_box()
                page.mouse.click(box['x']+pos[0],box['y']+pos[1])
            click_world([307.13,60,-221.5]);page.wait_for_timeout(200)
            assert '0.024' in f.locator('#dialogue-text').inner_text()
            click_world([246.78,149,-222.7]);page.wait_for_timeout(200)
            assert '保护环' in f.locator('#dialogue-text').inner_text()
            click_world([33.74,66.25,-221.5]);wait_step('5found')
            page.wait_for_timeout(1550);shot('08_ch3_native_screen')
            assert 'Ueff' not in f.locator('#dialogue-text').inner_text()
            next_to('5b');page.wait_for_timeout(1500)
            shot('09_h_potential')
            f.locator('#probe-options [data-probe="K"]').click()
            assert '6.32' in f.locator('#potential-readout').inner_text()
            shot('10_k_potential');next_to('5c');shot('11_mean_potential')
            f.locator('#btn-apply-ueff').click();wait_step('6')
            assert '1.891' in f.locator('#em-table').inner_text()
            shot('12_corrected');next_to('7a');next_to('7b');shot('13_bump')
            for w,h in [(1600,1000),(1280,800),(960,720)]:
                page.set_viewport_size({'width':w,'height':h});shot(f'14_bump_{w}')
            f.locator('#btn-right-next').click()
            assert state()['completed']
            assert '长尾' not in page.locator('#modal').inner_text()
            page.locator('[data-action="close-modal"]').first.click()
            f.locator('#dock-book').click()
            m=page.frame_locator('#manual-frame')
            m.locator('[data-spread="3"].spread-tab').click()
            shot('15_casebook')
            overflow=m.locator('.case-spread .page-body').evaluate_all('(es)=>es.map(e=>e.scrollHeight-e.clientHeight)')
            assert max(overflow)<=3, overflow
            assert '三个问题' not in m.locator('.case-spread').inner_text()
            assert '长尾' not in m.locator('.case-spread').inner_text()
            assert '比荷偏低' not in m.locator('.case-spread').inner_text()
            (out/'report.json').write_text(json.dumps({'errors':errors,'state':state()},ensure_ascii=False,indent=2),encoding='utf-8')
            assert not errors, errors
            print('Chapter three v2 guided journey passed.')
        except Exception:
            page.screenshot(path=str(out/'failure.png'))
            (out/'failure.json').write_text(json.dumps({'errors':errors,'state':page.evaluate('window.__magnetronChapter1?.getChapter3()'),'text':page.frame_locator('#chapter3-frame').locator('body').inner_text()},ensure_ascii=False,indent=2),encoding='utf-8')
            raise
        finally:
            browser.close()

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--url',default='http://127.0.0.1:8893/');run(ap.parse_args().url)
