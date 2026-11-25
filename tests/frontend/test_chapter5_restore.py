"""Restore each scientific view and review the new facing notebook pages."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'results/latest/chapter5_restore';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    for width,height in [(1280,800),(1440,900)]:
        page=browser.new_page(viewport={'width':width,'height':height});errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto('http://127.0.0.1:8893',wait_until='networkidle');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        page.evaluate("""async()=>{const m=await import('./chapter1/data.js');m.writeSave({...m.freshState(),chapter:5,bookPage:8,chapter4Result:{completed:true},chapter5:{step:'2b',mode:'both',time:29.21,theta:8,completed:true},chapter5Result:{completed:true}});location.reload();}""")
        page.wait_for_load_state('networkidle');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click();page.locator('#transition').wait_for(state='hidden')
        f=page.frame_locator('#research-frame');page.wait_for_function('window.__magnetronChapter1.getResearch()?.step==="2b"')
        assert f.locator('svg.symmetry-chart').count()==1
        f.locator('#dock-book').click();book=page.frame_locator('#manual-frame');book.locator('.page.right .symmetry-chart').wait_for();page.wait_for_timeout(500)
        page.screenshot(path=str(OUT/f'{width}_P9P10.png'))
        book.locator('[data-research-goto="5"]').click();book.locator('#wheel-notebook svg').wait_for();page.wait_for_timeout(250)
        page.screenshot(path=str(OUT/f'{width}_P11.png'))
        sizes=book.locator('.spread.active .page-body').evaluate_all('(els)=>els.map(e=>({h:e.clientHeight,s:e.scrollHeight}))')
        assert all(r['s']<=r['h']+2 for r in sizes),sizes
        book.locator('#fifth-book-close').click();page.wait_for_timeout(400)
        assert page.evaluate('window.__magnetronChapter1.getResearch().step')=='2b'
        assert not errors,errors
        (OUT/f'{width}.json').write_text(json.dumps({'sizes':sizes,'errors':errors}),encoding='utf8')
        page.close()
    browser.close()
print('Chapter five restoration and notebook passed both viewports')
