"""Exercise the actual chapter-five controls and shared WebGL scene."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'results/latest/chapter5_journey'

def run(width,height,url):
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url,wait_until='networkidle')
        page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=60000)
        page.locator('#new-experiment').click();page.locator('#transition').wait_for(state='hidden',timeout=30000)
        page.locator('[data-action="menu"]').click();page.locator('[data-action="chapter5"]').click()
        page.locator('#transition').wait_for(state='hidden',timeout=30000)
        frame=page.frame_locator('#research-frame')
        def debug():return page.evaluate('window.__magnetronChapter1.researchDebug()')
        def step(s):page.wait_for_function('(s)=>window.__magnetronChapter1.getResearch()?.step===s',arg=s)
        def forward():
            before=debug()['state']['step']
            for _ in range(15):
                frame.locator('#next').click();page.wait_for_timeout(120)
                if debug()['state']['step']!=before:return
            raise AssertionError('Narrative did not advance')
        def shot(name):
            page.wait_for_timeout(1100);page.screenshot(path=str(OUT/f'{width}_{name}.png'))
            assert not errors,errors
        step('0a');shot('intro');forward();step('1a')
        for angle in [3,5,8]:
            frame.locator(f'[data-angle="{angle}"]').click()
            page.wait_for_function('!window.__magnetronChapter1.researchDebug().loading')
            rows=debug()['rows'];assert len(rows)==29 and rows==sorted(set(rows)),rows
        shot('tilt');forward();step('1b');forward();step('2a')
        frame.locator('[data-do="end"]').click();shot('zero')
        forward();step('2b');frame.locator('[data-do="end"]').click();shot('tilted')
        d=debug();assert abs(d['trace']['tilt']-29.207924)<.0001,d
        assert len(d['trace']['perigee'])==4 and abs(d['trace']['pphiEnd']+3.9949)<.001
        frame.locator('[data-do="principle"]').click();shot('principle');frame.locator('#detail-close').click()
        forward();step('3a');page.wait_for_function('!window.__magnetronChapter1.researchDebug().loadingWheel')
        assert debug()['wheel']==[5,27,2,38,0,0]
        frame.locator('[data-sector="38"]').click();page.wait_for_function('!window.__magnetronChapter1.researchDebug().loadingWheel');shot('wheel')
        frame.locator('[data-pid="42"]').click();page.wait_for_function('!window.__magnetronChapter1.researchDebug().loadingWheel');assert debug()['wheel']==[10,24,11,27,0,0]
        frame.locator('[data-pid="3415"]').click();page.wait_for_function('!window.__magnetronChapter1.researchDebug().loadingWheel')
        forward();step('4a');shot('closing');assert debug()['state']['completed']
        metrics=frame.locator('#controls').evaluate('(e)=>({height:e.clientHeight,scroll:e.scrollHeight})')
        (OUT/f'{width}_result.json').write_text(json.dumps({'final':debug(),'errors':errors,'controls':metrics},ensure_ascii=False,indent=2),encoding='utf8')
        browser.close();print(f'{width}x{height}: chapter five journey passed')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8893');parser.add_argument('--width',type=int,default=1280);parser.add_argument('--height',type=int,default=800);a=parser.parse_args();run(a.width,a.height,a.url)
