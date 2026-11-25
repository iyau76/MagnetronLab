"""Free exploration: presets, live points, cancellation, records and reload."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'results/latest/chapter6_sandbox';OUT.mkdir(parents=True,exist_ok=True)
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1280,'height':800});errors=[];console=[];pending=set()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:console.append(m.text) if m.type=='error' else None)
    page.on('request',lambda r:pending.add(r.url))
    page.on('requestfinished',lambda r:pending.discard(r.url))
    page.on('requestfailed',lambda r:pending.discard(r.url))
    page.goto('http://127.0.0.1:8894',wait_until='domcontentloaded',timeout=90000)
    page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
    page.evaluate("""async()=>{const m=await import('./chapter1/data.js');m.writeSave({...m.freshState(),chapter:6,chapter6:{step:'5a',completed:true,eta:.76,theta:8,preset:'full'},chapter6Result:{completed:true,eta:.76}});location.reload();}""")
    def enter():
        page.wait_for_load_state('domcontentloaded')
        try:page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        except Exception:
            page.screenshot(path=str(OUT/'load_failure.png'));print({'errors':errors,'console':console,'pending':list(pending),'status':page.locator('#preload-status').inner_text()},flush=True);raise
        page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click();page.locator('#transition').wait_for(state='hidden',timeout=90000)
        page.wait_for_function('window.__magnetronChapter1.researchDebug()?.free?.rows>0',timeout=90000)
    enter();f=page.frame_locator('#research-frame')
    debug=lambda:page.evaluate('window.__magnetronChapter1.researchDebug().free')
    def settle():page.wait_for_function('window.__magnetronChapter1.researchDebug()?.free?.busy===false && window.__magnetronChapter1.researchDebug().free.rows>0',timeout=120000)
    assert debug()['rows']==70,debug();print('default ready',flush=True)
    page.screenshot(path=str(OUT/'1280_default.png'))
    f.locator('[data-free="tab"][data-tab="advanced"]').click();f.locator('[data-free="audit"]').click();settle();assert abs(debug()['fit']['relPct']-4.37385)<.0001,debug()
    page.screenshot(path=str(OUT/'1280_audit.png'));print('four-voltage audit passed',flush=True)
    f.locator('[data-free="tab"][data-tab="challenges"]').click();f.locator('[data-free="challenge"][data-index="4"]').click();settle()
    state=page.evaluate('window.__magnetronChapter1.getResearch().sandbox')
    zero=state['lastRows'][0];peak=next(r for r in state['lastRows'] if r['field_mT']==4.5)
    assert abs(100*peak['A2_uA']/zero['A2_uA']-104.586981)<.001
    assert abs(100*peak['A2_K_uA']/zero['A2_K_uA']-115.024819)<.001
    f.locator('[data-free="tab"][data-tab="core"]').click();page.screenshot(path=str(OUT/'1280_edge7.png'))
    f.locator('[data-free="edge-detail"]').click();page.screenshot(path=str(OUT/'1280_edge_detail.png'));f.locator('#detail-close').click()
    f.locator('[data-free="record"]').click();f.locator('#free-notes').fill('edge comparison and repeatable settings')
    with page.expect_download() as download:f.locator('[data-free="json"]').click()
    download.value.save_as(str(OUT/'edge7.json'))
    f.locator('[data-free="tab"][data-tab="core"]').click();f.locator('#edge-switch').uncheck();f.locator('[data-free="angle"][data-value="8"]').click();settle()
    f.locator('[data-free="tab"][data-tab="advanced"]').click();f.locator('[data-param="particles"]').select_option('1024')
    f.locator('[data-free="stop"]').click(timeout=10000)
    f.locator('[data-free="tab"][data-tab="core"]').click()
    f.locator('[data-param="field_mT"]').fill('5.7');f.locator('[data-free="point"]').click();settle()
    assert debug()['rows']==1 and abs(debug()['fields'][0]-5.7)<1e-9,debug()
    page.screenshot(path=str(OUT/'1280_live_point.png'))
    f.locator('[data-free="record"]').click();page.reload();enter();f=page.frame_locator('#research-frame')
    assert debug()['rows']==1 and abs(debug()['fields'][0]-5.7)<1e-9,debug()
    assert page.evaluate('window.__magnetronChapter1.getResearch().sandbox.notes')=='edge comparison and repeatable settings'
    f.locator('[data-free="restore"][data-index="0"]').click();assert debug()['edge'] and debug()['rows']>1
    page.set_viewport_size({'width':1440,'height':900});f.locator('[data-free="tab"][data-tab="core"]').click();page.screenshot(path=str(OUT/'1440_restored_edge.png'))
    assert not errors,errors
    (OUT/'result.json').write_text(json.dumps({'errors':errors,'debug':debug(),'ratio':100*peak['A2_uA']/zero['A2_uA']},indent=2),encoding='utf8')
    browser.close()
print('Sandbox offline/live point, four-voltage audit and record restore passed')
