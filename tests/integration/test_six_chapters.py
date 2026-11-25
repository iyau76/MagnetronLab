"""Continuous learner path, real controls, original scene, P1-P14 and export."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'results/latest/six_chapters';OUT.mkdir(parents=True,exist_ok=True)
def run(width,height):
 with sync_playwright() as pw:
  browser=pw.chromium.launch(channel='msedge',headless=True)
  page=browser.new_page(viewport={'width':width,'height':height});page.set_default_timeout(60000)
  errors=[];bad=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('response',lambda r:bad.append([r.status,r.url]) if r.status>=400 else None)
  state=lambda:page.evaluate('window.__magnetronChapter1.getState()')
  def wait():page.locator('#transition').wait_for(state='hidden',timeout=90000)
  def shot(name):page.wait_for_timeout(450);page.screenshot(path=str(OUT/f'{width}_{name}.png'))
  def action(name):page.locator(f'[data-action="{name}"]').filter(visible=True).first.click()
  def range_value(loc,value):loc.evaluate('(e,v)=>{e.value=v;e.dispatchEvent(new Event("input",{bubbles:true}));}',value)
  def chapter(n):page.wait_for_function('(n)=>window.__magnetronChapter1.getState().chapter===n',arg=n);wait();print(width,'chapter',n,flush=True)
  try:
   page.goto('http://127.0.0.1:8894',wait_until='domcontentloaded')
   page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=90000)
   page.locator('#new-experiment').click();wait()
   page.locator('#dock-book').click();m=page.frame_locator('#manual-frame')
   for i in range(3):m.locator(f'.spread-tab[data-spread="{i}"]').click();shot('book_'+str(i+1))
   m.locator('.guess-card[data-guess="5"]').click();m.locator('#btnFinishManual').click();page.locator('#book-overlay').wait_for(state='hidden')
   page.locator('#dock-circuit').click();action('circuit-tab')
   for xy in [(180,19),(110,139),(134,104),(180,65),(190,331)]:
    pos=page.locator('.circuit-diagram').evaluate('(e,p)=>{const q=new DOMPoint(...p).matrixTransform(e.getScreenCTM());return [q.x,q.y]}',list(xy));page.mouse.click(*pos)
   assert len(state()['lit'])==5
   action('structure-tab');page.wait_for_function('!window.__magnetronChapter1.getScene().transitioning');action('complete-circuit');page.wait_for_function('!window.__magnetronChapter1.getScene().transitioning')
   for power in ['accelerator','heater','magnet']:page.locator(f'[data-power="{power}"]').click()
   range_value(page.locator('#magnet-current'),1.4);assert state()['progress']['trial'];action('complete-trial');chapter(2)
   f=page.frame_locator('#chapter2-frame');f.locator('#dock-circuit').click()
   if not f.locator('#btn-goto-22').is_visible():f.locator('#dock-circuit').click()
   f.locator('#btn-goto-22').click()
   for i in range(5):
    f.locator('.hole-btn').nth(i).click()
    page.wait_for_function('(i)=>window.__magnetronChapter1.getCalibration().measured["0.5"]?.[i]!=null',arg=i)
   f.locator('#btn-auto-scan').click();page.wait_for_timeout(600);f.locator('#skip-scan').click()
   f.locator('#dock-rec').click()
   if not f.locator('#btn-fit').is_visible():f.locator('#dock-rec').click()
   f.locator('#btn-fit').click();assert abs(page.evaluate('window.__magnetronChapter1.getCalibration().fit.slope')-4.230907195)<1e-8
   f.locator('#btn-save-book').click();f.locator('#dock-inst').click()
   if not f.locator('#btn-zero-current').is_visible():f.locator('#dock-inst').click()
   f.locator('#btn-zero-current').click();f.locator('#btn-finish-ch2').click();chapter(3)
   f=page.frame_locator('#chapter3-frame')
   def step3(s):page.wait_for_function('(s)=>window.__magnetronChapter1.getChapter3().guideStep===s',arg=s)
   def next3(s):f.locator('#dlg-next').click();step3(s)
   next3('0b');next3('0c');f.locator('#btn-run-sweep').click();step3('1');f.locator('#btn-curves-rest,#btn-sweep-rest').filter(visible=True).click();step3('2a')
   f.locator('#btn-calc-single').click();step3('2b');next3('3');f.locator('#btn-plot-scatter').click();step3('4a');f.locator('#btn-run-fit').click();step3('4b');next3('5a');page.wait_for_timeout(1700)
   pos=page.evaluate('(p)=>window.__magnetronChapter1.project(p)',[33.74,66.25,-221.5]);box=f.locator('#scene').bounding_box();page.mouse.click(box['x']+pos[0],box['y']+pos[1]);step3('5found')
   next3('5b');f.locator('button[data-probe="K"]').click();next3('5c');f.locator('#btn-apply-ueff').click();step3('6');next3('7a');next3('7b');shot('chapter3_end');f.locator('#btn-right-next').click();chapter(4)
   f=page.frame_locator('#research-frame')
   def research():return page.evaluate('window.__magnetronChapter1.researchDebug()')
   def step(s):page.wait_for_function('(s)=>window.__magnetronChapter1.getResearch()?.step===s',arg=s)
   def forward():
    before=state()['chapter'],research()['state']['step']
    for _ in range(16):
     f.locator('#next').click();page.wait_for_timeout(140)
     after=state()['chapter'],research()['state']['step']
     if after!=before:return
    raise AssertionError(('advance',before))
   def ready():page.wait_for_function('!window.__magnetronChapter1.researchDebug().loading')
   step('0a');forward();step('0b');f.locator('[data-do="predict"][data-value="2"]').click();forward();step('1a');ready();forward();step('1b')
   for launch,grad in [('full',0),('cold',1)]:f.locator(f'[data-launch="{launch}"][data-gradient="{grad}"]').click();ready()
   forward();step('1c');ready();forward();step('1d');forward();step('2a');ready()
   align=f.locator('svg.mapping').evaluate('(s)=>{const a=s.querySelector("[data-plot-domain]").getBoundingClientRect(),b=s.querySelector("[data-bc-domain]").getBoundingClientRect();return [a.left-b.left,a.right-b.right]}');assert max(map(abs,align))<.01
   shot('chapter4_mapping');forward();step('2b');forward();step('3a');page.wait_for_function('!!window.__magnetronChapter1.researchDebug().trace')
   range_value(f.locator('#trace-time'),f.locator('#trace-time').get_attribute('max'));forward();step('4a');page.wait_for_function('!!window.__magnetronChapter1.researchDebug().counter')
   c=research()['counter'];assert c['bounces']==1 and abs(c['flight_ns']-10.210127)<.001
   forward();step('4b');forward();step('5a');f.locator('[data-do="connect"]').click();forward();step('5b');f.locator('[data-do="delta"]').click();forward();step('6b');shot('chapter4_end');forward();chapter(5)
   step('0a');forward();step('1a')
   for angle in [3,5,8]:f.locator(f'[data-angle="{angle}"]').click();ready();rr=research()['rows'];assert rr==sorted(set(rr))
   forward();step('1b');forward();step('2a');f.locator('[data-do="end"]').click();forward();step('2b');f.locator('[data-do="end"]').click();shot('chapter5_symmetry')
   forward();step('3a');page.wait_for_function('!window.__magnetronChapter1.researchDebug().loadingWheel');assert research()['wheel']==[5,27,2,38,0,0]
   f.locator('[data-sector="38"]').click();page.wait_for_function('!window.__magnetronChapter1.researchDebug().loadingWheel');forward();step('4a');shot('chapter5_end');forward();chapter(6)
   step('0a');forward();step('1a');f.locator('[data-action6="eta-best"]').click();forward();step('2a');f.locator('[data-preset="full"]').click();forward();step('2b');assert '+4.37%' in f.locator('.budget-table').inner_text()
   forward();step('3a');f.locator('[data-action6="hk-detail"]').click();f.locator('#detail-close').click();forward();step('3b');forward();step('4a');shot('chapter6_archive')
   f.locator('#dock-book').click();page.wait_for_timeout(800);m=page.frame_locator('#manual-frame');metrics=[]
   for i in range(7):
    m.locator(f'.spread-tab[data-spread="{i}"]').click();page.wait_for_timeout(600)
    mm=m.locator('.spread.active .page-body').evaluate_all('(es)=>es.map(e=>({h:e.clientHeight,scroll:e.scrollHeight,w:e.clientWidth,scrollW:e.scrollWidth}))')
    metrics.append(mm);assert all(x['scroll']<=x['h']+2 and x['scrollW']<=x['w']+2 for x in mm),(i,mm)
    shot('complete_book_'+str(i+1))
   m.locator('#final-observation').fill('Observable <b>literal</b> note');m.locator('#final-cause').fill('Compare the collection channels.')
   m.locator('#sixth-book-close').click();page.locator('#book-overlay').wait_for(state='hidden');page.wait_for_function('window.__magnetronChapter1.getState().notes.observation.includes("literal")')
   with page.expect_download() as download:f.locator('#export-report').click()
   path=OUT/f'{width}_report.html';download.value.save_as(str(path));text=path.read_text(encoding='utf8');assert 'Observable &lt;b&gt;literal&lt;/b&gt; note' in text
   assert all(state().get(f'chapter{i}Result',{}).get('completed') for i in [4,5,6]);assert not errors,errors;assert not bad,bad
   (OUT/f'{width}_result.json').write_text(json.dumps({'errors':errors,'failed_requests':bad,'book_metrics':metrics,'state':state()},ensure_ascii=False,indent=2),encoding='utf8')
   print(width,'continuous chapters 1-6 and P1-P14 passed',flush=True)
  except Exception:
   shot('failure');(OUT/f'{width}_failure.json').write_text(json.dumps({'errors':errors,'failed_requests':bad,'state':state()},ensure_ascii=False,indent=2),encoding='utf8');raise
  finally:browser.close()
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--width',type=int,default=1280);parser.add_argument('--height',type=int,default=800);args=parser.parse_args();run(args.width,args.height)
