import io,subprocess,time,re
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
sa=subprocess.Popen(['python3','-m','http.server','8791'],cwd='/tmp/z3cmp',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
sb=subprocess.Popen(['python3','-m','http.server','8792'],cwd='/home/claude/work3/site',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
A='http://localhost:8791/index.html'; B='http://localhost:8792/guides/index.html'
def shot(pg,url,w):
    pg.set_viewport_size({'width':w,'height':900}); pg.goto(url); pg.wait_for_timeout(1500)
    pg.add_style_tag(content='*{animation:none!important;transition:none!important}')
    pg.evaluate("()=>document.querySelectorAll('img').forEach(i=>{i.loading='eager'})"); pg.wait_for_timeout(2500)
    h=pg.evaluate("()=>document.documentElement.scrollHeight")
    for y in range(0,h,500): pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(60)
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(1500)
    inc=pg.evaluate("()=>[...document.images].filter(i=>!i.complete).map(i=>i.src.slice(-45))")
    if inc: print("   (images not loaded in",url[-40:],":",len(inc),inc[:2],")")
    return Image.open(io.BytesIO(pg.screenshot(full_page=True))).convert('RGB')
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); errs=[]; failed=[]
    pg.on('pageerror',lambda e:errs.append(str(e)[:140])); pg.on('requestfailed',lambda r:failed.append(r.url[:90]))
    pg.on('response',lambda r: failed.append(f'{r.status} {r.url[:90]}') if r.status>=400 else None)
    pg.route('**/fonts.g*',lambda r:r.abort())
    for view in ['','#tcf-irn-a2','#tef-canada-nclc9','#ielts-general-clb7']:
        for w in (1280,390):
            a=shot(pg,A+view,w); c=shot(pg,B+view,w)
            h=min(a.height,c.height); d=ImageChops.difference(a.crop((0,0,a.width,h)),c.crop((0,0,c.width,h))).convert('L')
            n=sum(1 for v in d.getdata() if v>24)
            print(f'{view or "(top)":22} @{w}: orig {a.size} new {c.size} | diff {100*n/(a.width*h):.3f}% | bbox {d.point(lambda v:255 if v>24 else 0).getbbox()}')
            if view=='#tef-canada-nclc9' and w==1280: a.save('/tmp/g_orig.png'); c.save('/tmp/g_new.png')
    print('page errors:',sorted(set(errs))); print('failed/4xx requests:',sorted(set(failed))[:10])
    # behaviour checks on mine
    pg.set_viewport_size({'width':1280,'height':900}); pg.goto(B+'#tef-canada-nclc9'); pg.wait_for_timeout(2000)
    hrefs=pg.evaluate("()=>[...document.querySelectorAll('a[href*=\"selar.com\"]')].map(a=>a.href)")
    print('selar links on this product page:',sorted(set(hrefs)))
    print('preview banner visible:',pg.evaluate("()=>/preview/i.test(document.body.innerText.slice(0,300))"))
    print('fl-coach elements:',pg.evaluate("()=>document.querySelectorAll('fl-coach').length"),'| imgs broken:',pg.evaluate("()=>[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src.slice(-50))"))
    pg.goto(B); pg.wait_for_timeout(1500)
    print('home: product cards:',pg.evaluate("()=>document.querySelectorAll('[data-slug],.card a[href^=\"#\"]').length"),'| broken imgs:',pg.evaluate("()=>[...document.images].filter(i=>i.complete&&i.naturalWidth===0).length"))
    b.close()
finally: sa.terminate(); sb.terminate()
