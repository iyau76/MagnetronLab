"""Latest paper pages, end-cooling response and finite-field detail at real sizes."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'results/latest/chapter6_final_artifacts';OUT.mkdir(parents=True,exist_ok=True)
saved=json.loads((ROOT/'results/latest/six_chapters/1280_result.json').read_text(encoding='utf8'))['state']
saved['chapter6'].update(step='1a',paragraph=0)
with sync_playwright() as pw:
    browser=pw.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page(viewport={'width':1280,'height':800});errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.add_init_script('if(!sessionStorage.getItem("seeded")){localStorage.setItem("magnetron-chapter1-saves-v1",'+json.dumps(json.dumps([saved]))+');sessionStorage.setItem("seeded","1");}')
    try:
        page.goto('http://127.0.0.1:8894',wait_until='domcontentloaded')
        page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
        page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click()
        page.locator('#transition').wait_for(state='hidden',timeout=90000)
        f=page.frame_locator('#research-frame');f.locator('#eta').wait_for()
        # Time the input handler including DOM/layout updates, without browser IPC.
        timing=f.locator('#eta').evaluate('''async e=>{const samples=[];for(let i=0;i<24;i++){
          await new Promise(requestAnimationFrame);e.value=String(.5+i*.01);const t=performance.now();
          e.dispatchEvent(new Event('input',{bubbles:true}));document.body.getBoundingClientRect();
          samples.push(performance.now()-t);}return samples;}''')
        f.locator('[data-action6="eta-best"]').click()
        page.wait_for_timeout(450);page.screenshot(path=str(OUT/'1280_cooling.png'))
        for w,h in [(1280,800),(1440,900)]:
            page.set_viewport_size({'width':w,'height':h});f.locator('#dock-book').click()
            m=page.frame_locator('#manual-frame');m.locator('.spread-tab[data-spread="6"]').wait_for()
            for index in [3,4,5,6]:
                m.locator(f'.spread-tab[data-spread="{index}"]').click();page.wait_for_timeout(500)
                boxes=m.locator('.spread.active .page-body').evaluate_all('(es)=>es.map(e=>[e.clientHeight,e.scrollHeight,e.clientWidth,e.scrollWidth])')
                assert all(sh<=h+2 and sw<=w+2 for h,sh,w,sw in boxes),(index,boxes)
                page.screenshot(path=str(OUT/f'{w}_pages_{2*index+1}_{2*index+2}.png'))
            m.locator('#sixth-book-close').click();page.locator('#book-overlay').wait_for(state='hidden')
        for _ in range(30):
            if page.evaluate('window.__magnetronChapter1.getResearch().step')=='4a':break
            f.locator('#next').click();page.wait_for_timeout(100)
        f.locator('[data-action6="sandbox"]').click()
        page.wait_for_function('window.__magnetronChapter1.researchDebug().free?.busy===false')
        f.locator('[data-free="tab"][data-tab="challenges"]').click()
        f.locator('[data-free="challenge"][data-index="4"]').click()
        page.wait_for_function('window.__magnetronChapter1.researchDebug().free?.busy===false')
        f.locator('[data-free="tab"][data-tab="core"]').click();f.locator('[data-free="edge-detail"]').click()
        for w,h in [(1280,800),(1440,900)]:
            page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(350)
            box=f.locator('#detail').bounding_box();assert box['y']>=0 and box['y']+box['height']<=h
            assert f.locator('.edge-detail-grid section').count()==2
            assert '\\partial' not in f.locator('#detail-body').inner_text()
            page.screenshot(path=str(OUT/f'{w}_edge_detail.png'))
        assert not errors,errors
        result={'errors':errors,'eta_input_ms':timing,'eta_median_ms':sorted(timing)[len(timing)//2],'eta_p95_ms':sorted(timing)[int(len(timing)*.95)]}
        (OUT/'result.json').write_text(json.dumps(result,indent=2),encoding='utf8')
        print(result,flush=True)
    finally:browser.close()
