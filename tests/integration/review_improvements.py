"""Targeted learner paths from the Nov 15 review; source preview only.

Run test_chapter3.py first to supply its completed, browser-generated state.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'results/latest/review_improvements_20261115'
OUT.mkdir(parents=True,exist_ok=True)
BASE='http://127.0.0.1:8893/'

def run():
 checks=[];errors=[]
 complete=json.loads((ROOT/'results/latest/chapter3_v2/report.json').read_text(encoding='utf-8'))['state']
 with sync_playwright() as p:
  browser=p.chromium.launch(channel='msedge',headless=True)
  page=browser.new_page(viewport={'width':1440,'height':900})
  page.on('pageerror',lambda e:errors.append(str(e)))
  f=page.frame_locator('#chapter3-frame');m=page.frame_locator('#manual-frame');c=page.frame_locator('#chapter2-frame')
  def st():return page.evaluate('window.__magnetronChapter1.getState()')
  def s3():return page.evaluate('window.__magnetronChapter1.getChapter3()')
  def dbg():return page.evaluate('window.__magnetronChapter1.chapter3Debug()')
  def cal():return page.evaluate('window.__magnetronChapter1.getCalibration()')
  def ready():page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
  def settled():page.locator('#transition').wait_for(state='hidden',timeout=30000)
  def shot(name):
   page.wait_for_timeout(600);page.screenshot(path=str(OUT/(name+'.png')))
  def check(name):checks.append(name);print(name,flush=True)
  def chapter(n):
   page.locator('[data-action="menu"]').click()
   page.locator('#modal [data-action="'+('chapter3' if n==3 else 'skip-chapter2')+'"]').click();settled()
  def load3(saved):
   page.goto(BASE);ready()
   page.evaluate("""async data=>{localStorage.clear();const m=await import('./chapter1/data.js');m.writeSave({...m.freshState(),chapter:3,chapter3:data,lessonDone:true});}""",saved)
   page.reload();ready();page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click();settled()
  try:
   page.goto(BASE);ready();page.locator('#new-experiment').click();settled()
   # Visiting structure never removes the pending prediction marker.
   page.locator('[data-action="tube-view"]').click();page.wait_for_timeout(1900)
   assert page.locator('#dock-book').evaluate("e=>e.classList.contains('unread')")
   page.locator('#dock-book').click();page.wait_for_timeout(600)
   for width,height in [(1440,900),(1280,800),(960,720)]:
    page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(250)
    for spread in [0,1,2]:
     m.locator(f'.spread-tab[data-spread="{spread}"]').click();shot(f'book_{spread}_{width}')
     overflow=m.locator('.spread.active .page-body').evaluate_all('(es)=>es.map(e=>e.scrollHeight-e.clientHeight)')
     assert max(overflow)<=3,(width,spread,overflow)
   m.locator('.spread-tab[data-spread="0"]').click();m.locator('body').press('ArrowRight');m.locator('body').press('Escape');page.locator('#book-overlay').wait_for(state='hidden')
   page.wait_for_timeout(300);assert st()['bookPage']==2
   check('manual page fit and keyboard reading position')
   page.set_viewport_size({'width':1440,'height':900})
   page.locator('#dock-circuit').click();page.locator('[data-action="circuit-tab"]').click()
   before=page.locator('.circuit-diagram').bounding_box()
   page.locator('.lead-keys [data-lead="L1"]').click()
   after=page.locator('.circuit-diagram').bounding_box();assert abs(before['height']-after['height'])<2
   page.locator('[data-action="light-all"]').click();page.locator('[data-action="structure-tab"]').click();page.wait_for_timeout(1800)
   page.locator('[data-action="complete-circuit"]').click();page.wait_for_timeout(2000)
   for name in ['heater','accelerator','magnet']:page.locator(f'[data-power="{name}"]').check()
   page.locator('#magnet-current').fill('0.6');page.locator('[data-action="tube-view"]').click();page.wait_for_timeout(2000)
   assert '观察中央阳极' not in page.locator('#task-hint').inner_text()
   shot('tube_powered');check('chapter one trial hint and existing tube trajectories')
   page.locator('[data-action="bench-view"]').click();page.wait_for_timeout(2000)
   # A lost GPU context must repaint without camera input.
   page.evaluate("""()=>{const gl=document.querySelector('#scene canvas').getContext('webgl2');window._lost=gl.getExtension('WEBGL_lose_context');window._lost.loseContext();}""")
   page.wait_for_timeout(200);page.evaluate('window._lost.restoreContext()');page.wait_for_timeout(1000);shot('context_restored')
   check('WebGL context restoration without user movement')
   chapter(2)
   c.locator('#dock-circuit').click();c.locator('#btn-open-bz').click();c.locator('.wire-opt').nth(3).click();page.wait_for_timeout(300)
   assert '奇对称' in c.locator('#symmetry-explanation').inner_text()
   assert not c.locator('#helmholtz-condition').is_visible()
   shot('opposed_derivation');c.locator('.wire-opt').nth(2).click();page.wait_for_timeout(300)
   assert c.locator('#helmholtz-condition').is_visible();c.locator('#btn-goto-22').click()
   # There is no data commit while the cap/probe are in motion.
   c.locator('.hole-btn').nth(0).click();page.wait_for_timeout(180)
   assert not cal()['measured']
   page.wait_for_function("window.__magnetronChapter1.getCalibration().measured['0.5']?.[0]!=null")
   assert page.evaluate('window.__magnetronChapter1.calibrationDebug().probeReady')
   for i in [1,2,3,4]:
    c.locator('.hole-btn').nth(i).click();page.wait_for_function('(i)=>window.__magnetronChapter1.getCalibration().measured["0.5"]?.[i]!=null',arg=i)
   c.locator('#btn-auto-scan').click();page.wait_for_timeout(220);c.locator('#hud .icon-btn').click()
   assert not cal()['autoScanning'];paused=cal()['measured'];page.wait_for_timeout(500);assert cal()['measured']==paused
   page.locator('[data-action="close-modal"]').click()
   assert '正在自动扫描' not in c.locator('#btn-auto-scan').inner_text()
   c.locator('#btn-auto-scan').click();c.locator('#skip-scan').click();c.locator('#btn-fit').click()
   c.locator('#btn-save-book').click();c.locator('#btn-zero-current').click();page.wait_for_timeout(800)
   assert cal()['savedToBook'];assert c.locator('#btn-finish-ch2').is_enabled()
   assert '正在移向' not in c.locator('#meter-hint').inner_text()
   if not c.locator('#fit-svg').is_visible():c.locator('#dock-rec').click()
   shot('calibration_fitted');c.locator('#dock-book').click();m.locator('.spread-tab[data-spread="0"]').click();m.locator('.goal-card[data-goal="0"]').click();shot('calibration_book')
   m.locator('#btnCloseTop').click();page.locator('#book-overlay').wait_for(state='hidden')
   check('chapter two readiness, cancellation, save during zeroing, negative intercept')
   c.locator('#btn-finish-ch2').click();settled()
   previous=page.evaluate('window.__magnetronChapter1.getScene().power')
   page.evaluate("document.querySelector('#chapter2-frame').contentWindow.dispatchEvent(new Event('resize'))")
   assert previous==page.evaluate('window.__magnetronChapter1.getScene().power')
   check('hidden chapter two cannot overwrite active chapter three')

   partial={'version':2,'guideEnabled':False,'manualLayout':True,'guideStep':'0a','selectedVoltage':10,'leftOpen':True,'rightOpen':True}
   load3(partial);f.locator('#btn-run-sweep').click()
   page.wait_for_function('window.__magnetronChapter1.getChapter3().sweptVoltages[10]?.count>=10')
   f.locator('[data-voltage="4"]').click();count=s3()['sweptVoltages']['10']['count']
   assert '已暂停' in f.locator('[data-curve="10"]').inner_text()
   f.locator('[data-voltage="10"]').click();assert '继续扫场' in f.locator('#btn-run-sweep').inner_text()
   f.locator('#btn-run-sweep').click();page.wait_for_function('(n)=>window.__magnetronChapter1.getChapter3().sweptVoltages[10].count>n',arg=count)
   f.locator('#spd-skip').click();assert s3()['sweptVoltages']['10']['done']
   f.locator('[data-voltage="4"]').click();f.locator('#btn-run-sweep').click();page.wait_for_timeout(700);f.locator('#guide-toggle').click()
   assert dbg()['running'] is None;assert s3()['selectedVoltage']==10
   check('partial sweeps retain progress, continue, and stop on guide restoration')

   # Backtracking preserves achievement but restores the earlier lesson's numerical view.
   back={**complete,'guideEnabled':True,'guideStep':'2b','manualLayout':False,'leftOpen':False,'rightOpen':True}
   load3(back);assert '3.502' in f.locator('#em-table').inner_text();assert '单点比荷' in f.locator('#th-em-mode').inner_text()
   f.locator('#guide-toggle').click();assert '修正后比荷' in f.locator('#th-em-mode').inner_text()
   check('earlier dialogue shows uncorrected results without losing completed correction')
   # Narrow-screen effective drawers and SVG meet-letterboxing use actual pointer coordinates.
   free={**complete,'guideEnabled':False,'manualLayout':True,'stageLayout':'sweep','activeTab':'curves','selectedVoltage':10,'leftOpen':True,'rightOpen':True}
   load3(free);page.set_viewport_size({'width':960,'height':640});page.wait_for_timeout(800)
   assert not f.locator('#left-drawer').is_visible() and f.locator('#right-drawer').is_visible()
   xy=f.locator('#scan-svg').evaluate('(el)=>{const q=new DOMPoint(56,285).matrixTransform(el.getScreenCTM());return [q.x,q.y]}')
   page.mouse.click(*xy);assert s3()['inspectedPointIdx']==0,(s3()['inspectedPointIdx'],xy)
   f.locator('#dock-left').click();assert f.locator('#left-drawer').is_visible() and not f.locator('#right-drawer').is_visible()
   check('narrow drawer selection and SVG replay zero point')
   for w,h in [(1440,900),(1280,800),(960,720)]:
    page.set_viewport_size({'width':w,'height':h});load3({**free,'guideEnabled':True,'guideStep':'0c','manualLayout':False})
    box=f.locator('#bench-meters').bounding_box();panel=f.locator('#left-drawer').bounding_box()
    assert box['y']+box['height']<=panel['y']+panel['height'],(w,box,panel)
    shot(f'controls_{w}')
   check('instrument readouts remain in view at laptop sizes')
   page.set_viewport_size({'width':1440,'height':900});load3({**complete,'guideEnabled':True,'guideStep':'7b','manualLayout':False})
   f.locator('#dlg-next').click();assert not s3()['guideEnabled'];check('final continue action leaves the guide')
   assert not errors,errors
   (OUT/'report.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
  except Exception:
   page.screenshot(path=str(OUT/'failure.png'))
   (OUT/'failure.json').write_text(json.dumps({'checks':checks,'errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
   raise
  finally:browser.close()

if __name__=='__main__':run()
