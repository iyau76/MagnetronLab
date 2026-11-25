"""Focused failure recovery and final visual evidence for the November review."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'results/latest/review_improvements_20261115'
URL='http://127.0.0.1:8893/'

def run():
 checks=[];errors=[]
 complete=json.loads((ROOT/'results/latest/chapter3_v2/report.json').read_text(encoding='utf-8'))['state']
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  page=browser.new_page(viewport={'width':1440,'height':900})
  page.on('pageerror',lambda e:errors.append(str(e)))
  f=page.frame_locator('#chapter3-frame');m=page.frame_locator('#manual-frame')
  def ready():page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
  def settled():page.locator('#transition').wait_for(state='hidden',timeout=30000)
  def shot(name):page.wait_for_timeout(700);page.screenshot(path=str(OUT/(name+'.png')))
  def load(saved):
   page.goto(URL);ready()
   page.evaluate("""async s=>{localStorage.clear();const m=await import('./chapter1/data.js');m.writeSave({...m.freshState(),chapter:3,chapter3:s,lessonDone:true});}""",saved)
   page.reload();ready();page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click();settled()
  try:
   # Block only chapter implementation: the outer laboratory must remain usable.
   page.route('**/chapter2/studio.js',lambda route:route.abort())
   page.goto(URL);ready();page.locator('#new-experiment').click();settled()
   page.locator('[data-action="menu"]').click();page.locator('[data-action="skip-chapter2"]').click();settled()
   assert page.locator('#chapter2-frame').is_hidden()
   assert page.evaluate('window.__magnetronChapter1.getState().chapter')==1
   assert page.locator('#hud').is_visible() and page.locator('#scene canvas').is_visible()
   assert '未能载入' in page.locator('#toast').inner_text()
   shot('chapter_load_recovery');checks.append('failed chapter script returns to a usable bench')
   page.unroute('**/chapter2/studio.js')
   page.goto(URL);ready();page.locator('#new-experiment').click();settled()
   page.evaluate("""()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='magnetron-chapter1-saves-v1')throw new DOMException('test quota','QuotaExceededError');return original.call(this,k,v)}}""")
   page.locator('[data-action="menu"]').click();page.locator('[data-action="launcher"]').click()
   assert page.locator('#launcher').is_visible()
   assert '未能保存' in page.locator('#toast').inner_text()
   checks.append('storage failure is visible and does not trap the learner')

   # An old bench-focus promise must not move chapter one's camera after a return.
   load({**complete,'guideEnabled':True,'guideStep':'4b','manualLayout':False,'viewMode':'tube'})
   f.locator('#dlg-next').click();f.locator('#main-menu').click()
   page.locator('#modal [data-action="return-chapter1"]').click();settled()
   before=page.evaluate('window.__magnetronChapter1.getScene()')
   page.wait_for_timeout(1800);after=page.evaluate('window.__magnetronChapter1.getScene()')
   assert after['mode']=='bench' and after['camera']==before['camera'] and after['target']==before['target']
   checks.append('late chapter-three view completion cannot move chapter one')

   load({**complete,'guideEnabled':True,'guideStep':'5c','manualLayout':False})
   shot('potential_final')
   assert '1.84' in f.locator('#potential-mean').inner_text()
   load({**complete,'guideEnabled':False,'manualLayout':True})
   f.locator('#dock-book').click();m.locator('.spread-tab[data-spread="3"]').click()
   for w,h in [(1440,900),(960,720)]:
    page.set_viewport_size({'width':w,'height':h});shot(f'casebook_final_{w}')
    assert max(m.locator('.case-spread .page-body').evaluate_all('(es)=>es.map(e=>e.scrollHeight-e.clientHeight)'))<=3
   checks.append('final potential diagram and result spreads fit their pages')
   assert not errors,errors
   (OUT/'faults.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
   print('\n'.join(checks),flush=True)
  except Exception:
   page.screenshot(path=str(OUT/'fault_failure.png'))
   (OUT/'fault_failure.json').write_text(json.dumps({'checks':checks,'errors':errors,'body':page.locator('body').inner_text()},ensure_ascii=False,indent=2),encoding='utf-8')
   raise
  finally:browser.close()

if __name__=='__main__':run()
