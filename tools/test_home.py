import sys,json,re,subprocess,time,io; sys.path.insert(0,'/tmp')
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
sys.path.insert(0,'/home/claude/work3/tools'); import dc2static as D
s1=subprocess.Popen(['python3','-m','http.server','8811'],cwd=D.HANDOFF_DIR,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
s2=subprocess.Popen(['python3','-m','http.server','8812'],cwd='/home/claude/work3/site',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
ORIG='http://localhost:8811/Fluency%20Home%20v3.dc.html'; NEW='http://localhost:8812/index.html'
DATA=json.loads(open('/home/claude/work3/site/assets/js/home-states.js').read().split('window.FL_HOME=',1)[1].rsplit(';',1)[0])
def norm(html):
    return None
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- T1 static fidelity (reduced motion) ----------
    def shot(ctx,url,w):
        pg=ctx.new_page(); pg.route('**/*',D._route); pg.set_viewport_size({'width':w,'height':900}); pg.goto(url); pg.wait_for_timeout(3500)
        pg.add_style_tag(content='#fl-void{display:none!important} *{animation:none!important;transition:none!important}')
        h=pg.evaluate("()=>document.documentElement.scrollHeight")
        for y in range(0,h,450): pg.evaluate(f"window.scrollTo(0,{y})"); pg.wait_for_timeout(60)
        pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(800)
        # hide the review toggle in the original
        pg.add_style_tag(content='[data-fl-switch]{display:none!important}')
        im=Image.open(io.BytesIO(pg.screenshot(full_page=True))).convert('RGB'); pg.close(); return im
    ctx=b.new_context(reduced_motion='reduce')
    for w in (1280,390):
        a=shot(ctx,ORIG,w); c=shot(ctx,NEW,w); h=min(a.height,c.height)
        d=ImageChops.difference(a.crop((0,0,a.width,h)),c.crop((0,0,c.width,h))).convert('L')
        n=sum(1 for v in d.getdata() if v>24)
        print(f'T1 static @{w}: orig {a.size} new {c.size} diff {100*n/(a.width*h):.3f}% bbox {d.point(lambda v:255 if v>24 else 0).getbbox()}')
        a.save(f'/tmp/h_orig_{w}.png'); c.save(f'/tmp/h_new_{w}.png')
    ctx.close()
    # ---------- interactive tests on the new page ----------
    ctx=b.new_context(viewport={'width':1280,'height':900}); pg=ctx.new_page(); errs=[]; posts=[]
    pg.on('pageerror',lambda e:errs.append(str(e)[:160])); pg.on('console',lambda m: errs.append('console:'+m.text[:120]) if m.type=='error' and 'fonts' not in m.text and 'ERR_FAILED' not in m.text else None)
    pg.route('**/fonts.g*',lambda r:r.abort()); pg.add_init_script('window.FL_NO_LENIS=true')
    def waitlist(route):
        posts.append(route.request.post_data); route.fulfill(status=200,content_type='application/json',body='{"ok":true}')
    pg.route('**/api/waitlist',waitlist)
    pg.goto(NEW); pg.wait_for_timeout(1500)
    def tnorm(html):
        return pg.evaluate("(h)=>{const t=document.createElement('template');t.innerHTML=h.trim();const d=document.createElement('div');d.appendChild(t.content);return d.innerHTML}",html)
    def child(name): return pg.evaluate("(n)=>document.querySelector('[data-w=\"'+n+'\"]').innerHTML",name)
    # T2 widgets
    bad=0
    for name in ['repair','stage','corr']:
        for j,st in enumerate(DATA['widgets'][name]['states']):
            pg.locator(f'[data-w="{name}"] button').nth(j).click(); pg.wait_for_timeout(40)
            if child(name)!=tnorm(st): bad+=1; print('  MISMATCH',name,j)
    for j,st in enumerate(DATA['widgets']['faq']['states']):
        pg.locator('[data-w="faq"] button').nth(j).click(); pg.wait_for_timeout(40)
        if child('faq')!=tnorm(st): bad+=1; print('  MISMATCH faq',j)
        pg.locator('[data-w="faq"] button').nth(j).click(); pg.wait_for_timeout(40)
        if child('faq')!=tnorm(DATA['widgets']['faq']['init']): bad+=1; print('  MISMATCH faq close',j)
    print('T2 widget states replayed:',4+5+6+10+10,'| mismatches:',bad)
    # T3 hero timer: sample 30 frames and check each is a valid recorded frame in order
    seen=[]; T=[tnorm(x) for x in DATA['hero']['table']]; valid=0
    for k in range(40):
        pg.wait_for_timeout(210); h=child('hero'); valid+= h in T; seen.append(T.index(h) if h in T else -1)
    print('T3 hero frames valid:',valid,'/40 | distinct seen:',len(set(seen)))
    # T4 coach: scroll slowly down the conversation; label must match each speaker turn's expression
    EXP={'welcome':'HELLO','happy':'UNDERSTOOD','listening':'LISTENING','thinking':'THINKING','speaking':'SPEAKING','encouraging':'ENCOURAGING','confused':'NOT SURE YET','idle':'IDLE'}
    els=pg.evaluate("()=>[...document.querySelectorAll('[data-cx]')].map(e=>e.getAttribute('data-cx'))")
    okc=0; badc=[]
    for n,k in enumerate(els):
        tgt=pg.evaluate("(n)=>{const e=document.querySelectorAll('[data-cx]')[n];return e.getBoundingClientRect().top+scrollY-innerHeight*0.4}",n)
        cur=pg.evaluate("scrollY")
        steps=max(1,int(abs(tgt-cur)/40))
        for s_ in range(1,steps+1): pg.evaluate("(y)=>window.scrollTo({top:y,behavior:'instant'})",cur+(tgt-cur)*s_/steps); pg.wait_for_timeout(25)
        pg.wait_for_timeout(350)
        lab=pg.evaluate("()=>document.querySelector('[data-w=coach]').innerText.split('\\n')[0].trim()"); st=pg.evaluate("()=>document.querySelector('[data-w=coach] fl-coach').getAttribute('state')")
        if lab==EXP[k]: okc+=1
        else: badc.append((n,k,lab,st))
    print('T4 coach turns matching expected label:',okc,'/',len(els),'| mismatches:',badc[:6])
    pg.evaluate("window.scrollTo(0,0)")
    # T5 popups
    pg.locator('[data-pop=resources]').click(); pg.wait_for_timeout(200)
    print('T5 guides dialog open:',pg.locator('[role=dialog]').count()==1,'| selar links:',pg.locator('[role=dialog] a[href*=selar]').count())
    pg.keyboard.press('Escape'); pg.wait_for_timeout(150); print('   closed by Esc:',pg.locator('[role=dialog]').count()==0)
    pg.locator('[data-pop=partners]').click(); pg.wait_for_timeout(200)
    pg.locator('[role=dialog] button',has_text='Apply to become a partner').click(); pg.wait_for_timeout(100)
    print('   partner invalid email ignored:',pg.locator('[role=dialog] button',has_text='Apply').count()==1)
    pg.locator('[role=dialog] input').fill('p@q.co'); pg.locator('[role=dialog] button',has_text='Apply').click(); pg.wait_for_timeout(150)
    print('   partner sent text:',pg.locator('[role=dialog]').inner_text()[-80:].replace('\n',' '))
    pg.locator('[role=dialog] [aria-label=Close]').click(); pg.wait_for_timeout(150)
    # T6 join
    pg.locator('#join').scroll_into_view_if_needed()
    pg.locator('#join button',has_text='Join the waitlist').click(); pg.wait_for_timeout(150)
    print('T6 empty submit error shown:',pg.locator('#join [role=alert]').count()==1)
    pg.locator('#join input').fill('abc'); pg.wait_for_timeout(100); print('   error cleared on typing:',pg.locator('#join [role=alert]').count()==0)
    pg.locator('#join input').fill('Test@Example.com'); pg.locator('#join select').select_option(label='German')
    pg.locator('#join button',has_text='Join the waitlist').click(); pg.wait_for_timeout(400)
    print('   success text:',re.sub(r'\s+',' ',pg.locator('#join').inner_text())[-120:])
    print('   POST bodies to /api/waitlist:',posts)
    # nav + links
    hrefs=pg.evaluate("()=>[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))")
    print('T7 hrefs:',sorted(set(hrefs)))
    print('errors:',errs)
    b.close()
finally: s1.terminate(); s2.terminate()
