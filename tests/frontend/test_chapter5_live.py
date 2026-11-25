"""Actual non-preset scan, replacement cancellation, and restored wheel time."""
from pathlib import Path
import json
import time
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'results/latest/chapter5_live';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1280,'height':800});errors=[];responses=[];failed=[]
    page.on('requestfailed',lambda r:failed.append([r.url,r.failure]))
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('response',lambda r:responses.append([r.status,r.url]) if r.status>=400 else None)
    page.goto('http://127.0.0.1:8894',wait_until='networkidle');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
    page.locator('#new-experiment').click();page.locator('#transition').wait_for(state='hidden')
    page.locator('[data-action="menu"]').click();page.locator('[data-action="chapter5"]').click();page.locator('#transition').wait_for(state='hidden')
    f=page.frame_locator('#research-frame')
    while page.evaluate('window.__magnetronChapter1.getResearch().step')=='0a':f.locator('#next').click()
    def angle(value):f.locator('#tilt').evaluate('(el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));}',value)
    started=time.perf_counter();angle(7.5)
    page.wait_for_function('window.__magnetronChapter1.researchDebug().preview>0',timeout=90000)
    preview_seconds=time.perf_counter()-started
    page.wait_for_function('!window.__magnetronChapter1.researchDebug().loading',timeout=120000)
    total_seconds=time.perf_counter()-started
    d=page.evaluate('window.__magnetronChapter1.researchDebug()');(OUT/'scan_debug.json').write_text(json.dumps({'state':d,'responses':responses,'failed':failed,'timings':[preview_seconds,total_seconds]},ensure_ascii=False),encoding='utf8');assert len(d['rows'])==29 and d['rows']==sorted(set(d['rows'])),d
    page.wait_for_function('window.__magnetronChapter1.getScene().research.population===6',timeout=30000)
    page.screenshot(path=str(OUT/'1280_live_7_5.png'))
    angle(6.5);page.wait_for_timeout(240);angle(9.5);page.wait_for_timeout(240);f.locator('[data-angle="8"]').click()
    page.wait_for_function('!window.__magnetronChapter1.researchDebug().loading');page.wait_for_timeout(350)
    d=page.evaluate('window.__magnetronChapter1.researchDebug()');assert d['state']['theta']==8 and len(d['rows'])==29
    for _ in range(30):
        step=page.evaluate('window.__magnetronChapter1.getResearch().step')
        if step=='3a':break
        if step=='2b':f.locator('[data-do="end"]').click()
        f.locator('#next').click();page.wait_for_timeout(150)
    assert page.evaluate('window.__magnetronChapter1.getResearch().step')=='3a'
    f.locator('[data-sector="38"]').click();page.wait_for_function('!window.__magnetronChapter1.researchDebug().loadingWheel')
    f.locator('#trace-time').evaluate('(el)=>{el.value=28.09;el.dispatchEvent(new Event("input",{bubbles:true}));}')
    page.wait_for_timeout(600);page.reload()
    page.wait_for_load_state('networkidle');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
    page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click();page.locator('#transition').wait_for(state='hidden')
    page.wait_for_function('window.__magnetronChapter1.getResearch()?.step==="3a"')
    restored=page.evaluate('window.__magnetronChapter1.getResearch()');assert abs(restored['time']-28.09)<.001,restored
    assert 'varphi' not in f.locator('#chart').inner_text()
    page.screenshot(path=str(OUT/'1280_wheel_restore.png'))
    assert not errors,errors
    assert not responses,responses
    (OUT/'result.json').write_text(json.dumps({'preview_seconds':preview_seconds,'total_seconds':total_seconds,'restored':restored,'errors':errors,'bad_responses':responses},ensure_ascii=False,indent=2),encoding='utf8')
    browser.close()
print('Live chapter-five scan and restoration passed')
