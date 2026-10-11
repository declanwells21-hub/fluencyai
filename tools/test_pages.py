#!/usr/bin/env python3
"""Compare a built page against the design's own render, for the initial state and a list of states.
Usage: python3 tools/test_pages.py pricing|partners|store"""
import sys,os,io,json,subprocess,time
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import dc2static as D
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
SITE=os.environ.get('SITE_DIR','/home/claude/work3/site/')
NAME={'pricing':('Pricing','Pricing v3.dc.html'),'partners':('Partners','Partners v3.dc.html'),'store':('Store','Store v3.dc.html')}
FORM={'name':'Ada Okafor','email':'ada@example.com','channel':'TikTok @ada','lang':'French'}
STATES={
 'pricing':[{},{'pack':0},{'pack':2},{'faq':0},{'faq':3}],
 'partners':[{},{'role':1},{'role':2},{'sales':100,'subs':40},{'err':'Add a valid email so we can reach you.'},{'f':FORM,'sent':True}],
 'store':[{},{'cat':'family'},{'cat':'work','lang':'German'},{'lang':'French'},{'cur':'EUR'},{'cur':'NGN'},{'sel':'goethe-b1'},{'sel':'goethe-b1','side':'back'},{'sel':'celpip-clb9'},{'sel':'tef-nclc9','lb':True},{'sel':'tef-nclc9','lb':True,'zoom':True}]}
key=sys.argv[1]; comp,fname=NAME[key]
s1=subprocess.Popen([sys.executable,'-m','http.server','8841'],cwd=D.HANDOFF_DIR,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
s2=subprocess.Popen([sys.executable,'-m','http.server','8842'],cwd=SITE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
SET_ORIG="""(st)=>{const el=document.querySelector('[data-fl-page]')||document.body;const k=Object.keys(el).find(k=>k.startsWith('__reactFiber'));let f=el[k];while(f){const n=f.stateNode;if(n&&n.__setLogicState&&n.logic){n.__setLogicState(st);return true}f=f.return}return false}"""
def prep(pg):
    pg.add_style_tag(content='#fl-void{display:none!important} *{animation:none!important;transition:none!important}')
def shot(pg,w,tag=''):
    h=pg.evaluate("()=>document.documentElement.scrollHeight")
    for y in range(0,h,500): pg.evaluate(f"window.scrollTo({{top:{y},behavior:'instant'}})"); pg.wait_for_timeout(40)
    pg.evaluate("window.scrollTo({top:0,behavior:'instant'})"); pg.wait_for_timeout(400)
    pg.evaluate("()=>document.querySelectorAll('img').forEach(i=>{i.loading='eager'})"); pg.wait_for_timeout(500)
    return Image.open(io.BytesIO(pg.screenshot(full_page=True))).convert('RGB')
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); res=[]
    for w in (1280,390):
        for st in STATES[key]:
            ctxA=b.new_context(viewport={'width':w,'height':900},reduced_motion='reduce'); a=ctxA.new_page(); a.route('**/*',D._route); a.add_init_script('window.FL_NO_LENIS=true')
            ctxB=b.new_context(viewport={'width':w,'height':900},reduced_motion='reduce'); m=ctxB.new_page(); m.add_init_script('window.FL_NO_LENIS=true'); errs=[]
            m.on('pageerror',lambda e:errs.append(str(e)[:150])); m.route('**/fonts.g*',lambda r:r.abort())
            a.goto('http://localhost:8841/'+fname.replace(' ','%20')); a.wait_for_timeout(3500); prep(a)
            m.goto(f'http://localhost:8842/{key}.html'); m.wait_for_timeout(1500); prep(m)
            if os.environ.get('NO_CLB7_IMG'): m.evaluate("()=>{FluencyData.GUIDES.filter(g=>/(celpip|ielts)-clb7/.test(g.id)).forEach(g=>g.hasImg=false);FLDC.instances.Store.forceUpdate()}"); m.wait_for_timeout(300)
            if st:
                ok=a.evaluate(SET_ORIG,st); m.evaluate("([n,s])=>FLDC.instances[n].setState(s)",[comp,st]); a.wait_for_timeout(500); m.wait_for_timeout(500)
            A=shot(a,w); Bm=shot(m,w); h=min(A.height,Bm.height)
            d=ImageChops.difference(A.crop((0,0,A.width,h)),Bm.crop((0,0,Bm.width,h))).convert('L'); n=sum(1 for v in d.getdata() if v>24)
            res.append((w,json.dumps(st)[:60],A.size[1],Bm.size[1],round(100*n/(A.width*h),3)))
            print(f'@{w} {json.dumps(st)[:62]:64} orig_h={A.size[1]:5} mine_h={Bm.size[1]:5} diff={100*n/(A.width*h):.3f}% {"ERR "+str(errs) if errs else ""}',flush=True)
            if st==STATES[key][-1] and w==1280: A.save(f'/tmp/t_{key}_orig.png'); Bm.save(f'/tmp/t_{key}_mine.png')
            ctxA.close(); ctxB.close()
    b.close()
finally: s1.terminate(); s2.terminate()
