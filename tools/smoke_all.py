import subprocess,time,re
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8881'],cwd='/home/claude/work3/site',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    for path in ['index.html','store.html','pricing.html','partners.html','guides/index.html','privacy.html','terms.html']:
        for w in (1280,390):
            ctx=b.new_context(viewport={'width':w,'height':900}); pg=ctx.new_page(); errs=[]; bad=[]
            pg.on('pageerror',lambda e:errs.append(str(e)[:120])); pg.on('response',lambda r: bad.append(f'{r.status} {r.url.split("8881")[-1]}') if r.status>=400 else None)
            pg.route('**/fonts.g*',lambda r:r.abort()); pg.goto('http://localhost:8881/'+path); pg.wait_for_timeout(1800)
            over=pg.evaluate("()=>document.documentElement.scrollWidth>innerWidth+1")
            print(f'{path:20} @{w}: errors={errs} 404s={sorted(set(bad))} hscroll={over}')
            ctx.close()
    b.close()
finally: srv.terminate()
