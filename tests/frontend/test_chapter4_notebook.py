import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'results/latest/chapter4_notebook'
OUT.mkdir(parents=True,exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    for width,height in [(1280,800),(1440,900)]:
        page=browser.new_page(viewport={'width':width,'height':height});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8893',wait_until='networkidle')
        page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        page.evaluate("""async()=>{const m=await import('./chapter1/data.js');m.writeSave({...m.freshState(),chapter:4,bookPage:8,chapter4:{step:'6b',completed:true,connected:true},chapter4Result:{completed:true}});location.reload();}""")
        page.wait_for_load_state('networkidle');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click();page.locator('#transition').wait_for(state='hidden')
        ending=page.frame_locator('#research-frame').locator('#controls').inner_text()
        assert '8.97%' in ending and '16.26%' in ending,ending
        page.screenshot(path=str(OUT/f'{width}_ending.png'))
        page.frame_locator('#research-frame').locator('#dock-book').click();book=page.frame_locator('#manual-frame')
        book.locator('#micro-notebook svg').wait_for();page.wait_for_timeout(400)
        page.screenshot(path=str(OUT/f'{width}_P9.png'))
        book.locator('.research-spread [data-goto="3"]').click();page.wait_for_timeout(200)
        page.screenshot(path=str(OUT/f'{width}_P8.png'))
        overflow=book.locator('.case-spread .research-book-body').evaluate('el=>({client:el.clientHeight,scroll:el.scrollHeight})')
        assert overflow['scroll']<=overflow['client']+2,overflow
        assert not errors,errors
        (OUT/f'{width}.json').write_text(json.dumps({'overflow':overflow,'errors':errors}),encoding='utf8')
        page.close()
    browser.close()
print('Chapter four notebook pages passed both viewports')
