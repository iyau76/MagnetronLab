"""Focused pointer/layout regression; requires a running preview server.

python tests/integration/test_research_interactions.py --url http://127.0.0.1:8894
Uses native pointer gestures, a private browser context, and the real solver.
No saved artifacts or full chapter journey are required.
"""
import argparse
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]


def run(url):
    out = ROOT / 'results/latest/research_interactions'
    out.mkdir(parents=True, exist_ok=True)
    errors, log = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel='msedge', headless=True)
        context = None

        def load(chapter, patch, width=1280, height=800):
            nonlocal context, page, frame
            if context:
                context.close()
            context = browser.new_context(viewport={'width': width, 'height': height})
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            stamp = int(time.time() * 1000)
            seed = dict(version=1, id='research-pointer-test', createdAt=stamp,
                        savedAt=stamp, chapter=chapter, notes={}, lit=[],
                        **{'chapter' + str(chapter): patch})
            page.add_init_script('localStorage.setItem("magnetron-chapter1-saves-v1",'
                                 + json.dumps(json.dumps([seed])) + ');')
            page.goto(url, wait_until='domcontentloaded')
            page.wait_for_function('window.__magnetronChapter1?.getReady()', timeout=90000)
            page.locator('#continue-experiment').click()
            page.locator('[data-action="load-save"]').first.click()
            page.locator('#transition').wait_for(state='hidden', timeout=90000)
            frame = page.frame_locator('#research-frame')
            page.wait_for_timeout(1300)

        def drag(selector, fraction=.75):
            slider = frame.locator(selector)
            slider.scroll_into_view_if_needed()
            original = slider.element_handle()
            box = slider.bounding_box()
            limits = slider.evaluate('e=>({lo:+e.min,hi:+e.max,value:+e.value})')
            start = (limits['value'] - limits['lo']) / (limits['hi'] - limits['lo'])
            y = box['y'] + box['height'] / 2
            page.mouse.move(box['x'] + 8 + (box['width'] - 16) * start, y)
            page.mouse.down()
            samples = []
            for i in range(1, 13):
                f = start + (fraction - start) * i / 12
                page.mouse.move(box['x'] + 8 + (box['width'] - 16) * f, y)
                page.wait_for_timeout(300 if i == 5 else 70)
                assert original.evaluate('e=>e.isConnected'), selector + ' replaced during drag'
                samples.append(float(slider.input_value()))
            page.mouse.up()
            actual = (samples[-1] - limits['lo']) / (limits['hi'] - limits['lo'])
            assert abs(actual - fraction) < .025, (selector, samples)
            log.append({'drag': selector, 'samples': samples})

        def ready():
            page.wait_for_function('(()=>{const d=window.__magnetronChapter1.researchDebug()?.free;'
                                   'return d&&!d.busy&&!d.mapBusy&&!d.traceBusy&&d.trace})()', timeout=120000)

        def cards():
            return frame.locator('.map-card,.trace-card').evaluate_all(
                'es=>es.map(e=>({y:e.getBoundingClientRect().y,h:e.getBoundingClientRect().height}))')

        page = frame = None
        try:
            load(5, {'step': '3a', 'pid': 3415, 'sector': 0, 'theta': 8})
            drag('#sector')
            frame.locator('[data-do="play"]').click()
            page.wait_for_timeout(200)
            drag('#trace-time', .5)
            assert '播放' in frame.locator('[data-do="play"]').inner_text()
            page.screenshot(path=str(out / 'sector_and_time.png'))

            load(6, {'step': '5a', 'sandbox': None})
            ready()
            before = cards()
            fields = page.evaluate('window.__magnetronChapter1.researchDebug().free.fields')
            for target in [4.2, 4.9, 4.46]:
                selected = min(fields, key=lambda value: abs(value - target))
                frame.locator(f'.pickable [data-field="{selected}"]').click()
                pending = cards()
                page.wait_for_timeout(30)
            ready()
            after = cards()
            assert before == pending == after, (before, pending, after)
            debug = page.evaluate('window.__magnetronChapter1.researchDebug().free')
            assert selected == debug['selectedB'] == debug['traceParams']['field_mT']
            log.append({'stable_cards': after, 'selected_B': selected})
            frame.locator('#map-toggle').click()
            assert not frame.locator('.map-card').is_visible()
            frame.locator('[data-free="play"]').click()
            page.wait_for_timeout(150)
            drag('#free-time', .5)
            assert '播放' in frame.locator('.trace-card [data-free="play"]').inner_text()
            frame.locator('#stage-full').click()
            frame.locator('#full-bar [data-free="play"]').click()
            page.wait_for_timeout(150)
            drag('#full-time', .8)
            assert '播放' in frame.locator('#full-bar [data-free="play"]').inner_text()
            page.keyboard.press('Escape')
            frame.locator('[data-free="tab"][data-tab="advanced"]').click()
            assert frame.locator('#scan-points').input_value() == 'auto'
            assert frame.locator('#scan-points option').all_text_contents() == [
                '自动 · 沿用现有工作点', '29 点 · 快速预览', '61 点 · 加密', '121 点 · 精细']
            page.screenshot(path=str(out / 'free_bench.png'))
            assert not errors, errors
        finally:
            (out / 'result.json').write_text(json.dumps({'log': log, 'errors': errors},
                                                       ensure_ascii=False, indent=2), encoding='utf8')
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--url', default='http://127.0.0.1:8894')
    run(parser.parse_args().url)
    print('Native range dragging and linked-view stability passed.')
