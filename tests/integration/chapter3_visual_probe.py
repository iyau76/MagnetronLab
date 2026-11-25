"""Inspect saved guided compositions without replaying acquisition for each viewport."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'results/latest/chapter3_v2'
base=json.loads((out/'report.json').read_text(encoding='utf-8'))['state']
reports=[]
with sync_playwright() as p:
 browser=p.chromium.launch(channel='msedge',headless=True)
 try:
  for step in ['2a','2b','3','4a','4b','6','5b','5c','7b','0c','1']:
   page=browser.new_page(viewport={'width':1440,'height':900})
   page.goto('http://127.0.0.1:8893/');page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=60000)
   saved={**base,'guideEnabled':True,'guideStep':step,'manualLayout':False,'viewMode':'bench','completed':False,'anomaliesConfirmed':False,'bumpRecorded':False}
   if step not in ['6','7b']:saved['fittedRegression']={**saved['fittedRegression'],'dropVerified':False}
   if step in ['2a','2b','3','4a']:saved.update(singleCalcDone=step!='2a',scatterDone=step=='4a',fittedRegression={'done':False,'dropVerified':False})
   if step=='0c':saved.update(sweptVoltages={},singleCalcDone=False,scatterDone=False,fittedRegression={'done':False,'dropVerified':False},heaterFound=False,probeCompared=False,activeTab='curves')
   if step=='1':saved.update(sweptVoltages={'10':base['sweptVoltages']['10']},singleCalcDone=False,scatterDone=False,fittedRegression={'done':False,'dropVerified':False},activeTab='curves')
   page.evaluate("""async saved=>{const m=await import('./chapter1/data.js');const s=m.freshState();Object.assign(s,{chapter:3,chapter3:saved,lessonDone:true});m.writeSave(s)}""",saved)
   page.reload();page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=60000)
   page.locator('#continue-experiment').click();page.locator('[data-action="load-save"]').first.click();page.locator('#transition').wait_for(state='hidden')
   f=page.frame_locator('#chapter3-frame')
   for w,h in [(1600,1000),(1440,900),(1280,800),(960,720)]:
    page.set_viewport_size({'width':w,'height':h});page.wait_for_timeout(1000)
    page.screenshot(path=str(out/f'probe_{step}_{w}.png'))
    report=f.locator('body').evaluate("""e=>({stage:e.dataset.stage,space:getComputedStyle(e).getPropertyValue('--story-space'),boxes:Object.fromEntries(['#right-drawer','#tab-fit','#analysis-summary','#analysis-title','#single-formula','#em-table','#fit-eq-box','#btn-investigate','#analysis-visual','#fit-card','#tab-ideal','.comparison-head','.comparison-plots','.comparison-bottom','#potential-card','#potential-svg','#btn-run-sweep'].map(s=>{let e=document.querySelector(s),r=e.getBoundingClientRect();return [s,{top:r.top,bottom:r.bottom,h:r.height,sh:e.scrollHeight,ch:e.clientHeight,display:getComputedStyle(e).display}]}))})""")
    reports.append({'step':step,'viewport':[w,h],**report})
    for selector in ['#tab-fit','#tab-ideal','#potential-card']:
     box=report['boxes'][selector]
     if box['h']>0:assert box['sh']-box['ch']<=2,(step,w,selector,box)
   page.close()
 finally:browser.close()
(out/'layout_probe.json').write_text(json.dumps(reports,ensure_ascii=False,indent=2),encoding='utf-8')
print('Compositions inspected.')
