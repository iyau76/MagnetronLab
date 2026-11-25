"""Real controls through chapter four, including the shared WebGL scene."""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'results/latest/chapter4_journey'


def run(width,height,url):
    OUT.mkdir(parents=True,exist_ok=True)
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='msedge',headless=True)
        page=browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url,wait_until='networkidle')
        page.wait_for_function('window.__magnetronChapter1?.getReady()',timeout=60000)
        page.locator('#new-experiment').click()
        page.locator('#transition').wait_for(state='hidden',timeout=30000)
        page.locator('[data-action="menu"]').click()
        page.locator('[data-action="chapter4"]').click()
        page.locator('#transition').wait_for(state='hidden',timeout=30000)
        frame=page.frame_locator('#research-frame')
        def state():return page.evaluate('window.__magnetronChapter1.chapter4Debug()')
        def wait_step(step):
            page.wait_for_function('(step)=>window.__magnetronChapter1.getChapter4()?.step===step',arg=step,timeout=15000)
        def forward():
            for _ in range(12):
                before=state()['state']['step']
                frame.locator('#next').click()
                page.wait_for_timeout(100)
                if state()['state']['step']!=before:return
            raise AssertionError('Narrative did not advance')
        def screenshot(name):
            page.wait_for_timeout(1400)
            page.screenshot(path=str(OUT/f'{width}_{name}.png'))
        wait_step('0a');screenshot('opening')
        forward();wait_step('0b');frame.locator('[data-do="predict"][data-value="2"]').click();forward();wait_step('1a')
        page.wait_for_function('!window.__magnetronChapter1.chapter4Debug().loading')
        forward();wait_step('1b')
        for launch,gradient in [('full','0'),('cold','1')]:
            frame.locator(f'[data-launch="{launch}"][data-gradient="{gradient}"]').click()
            page.wait_for_function('!window.__magnetronChapter1.chapter4Debug().loading')
        forward();wait_step('1c');page.wait_for_function('!window.__magnetronChapter1.chapter4Debug().loading')
        screenshot('ablation');ordered=state()['rows'];assert ordered==sorted(ordered)
        forward();wait_step('1d');forward();wait_step('2a')
        page.wait_for_function('!window.__magnetronChapter1.chapter4Debug().loading')
        page.wait_for_function('window.__magnetronChapter1.getScene().research.active')
        screenshot('mapping')
        align=frame.locator('svg.mapping').evaluate('(svg)=>{const a=svg.querySelector("[data-plot-domain]").getBoundingClientRect(),b=svg.querySelector("[data-bc-domain]").getBoundingClientRect();return {left:a.left-b.left,right:a.right-b.right};}')
        assert abs(align['left'])<.01 and abs(align['right'])<.01,align
        forward();wait_step('2b');forward();wait_step('3a')
        page.wait_for_function('!!window.__magnetronChapter1.chapter4Debug().trace')
        screenshot('trace')
        frame.locator('#trace-time').evaluate('el=>{el.value=el.max;el.dispatchEvent(new Event("input",{bubbles:true}));}')
        forward();wait_step('4a');page.wait_for_function('!!window.__magnetronChapter1.chapter4Debug().counter')
        counter=state()['counter'];assert counter['bounces']==1 and abs(counter['flight_ns']-10.210127)<.001,counter
        screenshot('counterfactual')
        forward();wait_step('4b');forward();wait_step('5a')
        frame.locator('[data-do="connect"]').click();screenshot('guard_meter')
        forward();wait_step('5b');frame.locator('[data-do="delta"]').click();screenshot('dual_delta')
        forward();wait_step('6b');screenshot('ending')
        assert state()['state']['completed']
        assert not errors,errors
        result={'viewport':[width,height],'alignment':align,'counter':counter,'final':state(),'errors':errors}
        (OUT/f'{width}_result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
        browser.close()
        print(f'{width}x{height}: chapter four journey passed')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--url',default='http://127.0.0.1:8893');parser.add_argument('--width',type=int,default=1440);parser.add_argument('--height',type=int,default=900);a=parser.parse_args();run(a.width,a.height,a.url)
