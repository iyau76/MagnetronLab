"""Real browser journey through the synthesis chapter's authored decisions."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'results/latest/chapter6_journey';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    for width,height in [(1280,800),(1440,900)]:
        page=browser.new_page(viewport={'width':width,'height':height});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8894',wait_until='networkidle');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        page.evaluate("""async()=>{const m=await import('./chapter1/data.js');m.writeSave({...m.freshState(),chapter:6});location.reload();}""")
        page.wait_for_load_state('networkidle');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click();page.locator('#transition').wait_for(state='hidden',timeout=90000)
        f=page.frame_locator('#research-frame');page.wait_for_function('window.__magnetronChapter1.getResearch()?.step==="0a"')
        def step():return page.evaluate('window.__magnetronChapter1.getResearch().step')
        def next_step(target):
            for _ in range(12):
                if step()==target:return
                f.locator('#next').click();page.wait_for_timeout(150)
            raise AssertionError((target,step()))
        next_step('1a');assert f.locator('#next').is_disabled()
        f.locator('[data-action6="eta-best"]').click();page.wait_for_timeout(900)
        debug=page.evaluate('window.__magnetronChapter1.researchDebug()')
        assert [round(v,3) for v in debug['ratios']['ratios']]==[.809,.820,.822,.822]
        page.screenshot(path=str(OUT/f'{width}_cooling.png'))
        next_step('2a');f.locator('[data-preset="full"]').click();f.locator('[data-action6="xaxis"][data-value="1"]').click();page.wait_for_timeout(400)
        assert f.locator('.quad-card').count()==4
        page.screenshot(path=str(OUT/f'{width}_four_voltages.png'))
        next_step('2b');page.screenshot(path=str(OUT/f'{width}_budget.png'))
        assert '+4.37%' in f.locator('.budget-table').inner_text()
        f.locator('[data-tab="external"]').click();page.screenshot(path=str(OUT/f'{width}_external_budget.png'))
        next_step('3a');f.locator('[data-action6="hk-detail"]').click();page.screenshot(path=str(OUT/f'{width}_H_K.png'));f.locator('#detail-close').click()
        next_step('3b');f.locator('[data-action6="direction"][data-index="2"]').click()
        next_step('4a');page.screenshot(path=str(OUT/f'{width}_archive.png'))
        assert not errors,errors
        (OUT/f'{width}.json').write_text(json.dumps({'errors':errors,'state':page.evaluate('window.__magnetronChapter1.getResearch()')},ensure_ascii=False),encoding='utf8');page.close()
    browser.close()
print('Chapter six core journey passed both viewports')
