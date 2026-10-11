#!/usr/bin/env python3
"""Structural comparison of a built page against the design's render: tags, text, key attributes and computed style.
Usage: python3 tools/compare_dom.py pricing|partners|store ['{"state":"json"}']"""
import sys,os,json,subprocess,time,difflib
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import dc2static as D
from playwright.sync_api import sync_playwright
SITE=os.environ.get('SITE_DIR','/home/claude/work3/site/')
NAME={'pricing':('Pricing','Pricing v3.dc.html'),'partners':('Partners','Partners v3.dc.html'),'store':('Store','Store v3.dc.html')}
key=sys.argv[1]; st=json.loads(sys.argv[2]) if len(sys.argv)>2 else {}
comp,fname=NAME[key]
SET_ORIG="""(st)=>{const el=document.querySelector('[data-fl-page]');const k=Object.keys(el).find(k=>k.startsWith('__reactFiber'));let f=el[k];while(f){const n=f.stateNode;if(n&&n.__setLogicState&&n.logic){n.__setLogicState(st);return true}f=f.return}return false}"""
DUMP="""()=>{const root=document.querySelector('[data-fl-page]');const out=[];const A=['href','src','alt','aria-label','aria-checked','aria-pressed','aria-expanded','role','type','placeholder','target','rel'];
const CS=['color','backgroundColor','fontSize','fontWeight','display','position','opacity','borderRadius','width','height','marginTop','paddingLeft','gap'];
function walk(n,depth){ if(n.nodeType===3){const t=n.nodeValue.replace(/\\s+/g,' ').trim(); if(t) out.push('"'+t+'"'); return;}
 if(n.nodeType!==1) return; const c=n.className&&n.className.baseVal===undefined?n.className:''; 
 if(/sc-host|sc-interp/.test(c)){ for(const k of n.childNodes) walk(k,depth); return;}
 const tag=n.tagName.toLowerCase(); let s='<'+tag; for(const a of A){ if(n.hasAttribute(a)){ let v=n.getAttribute(a); if(a==='src'||a==='href') v=v.replace(/^https?:\\/\\/[^/]+/,''); s+=' '+a+'='+v;} }
 if(tag!=='svg'&&tag!=='path'&&tag!=='circle'&&tag!=='rect'&&tag!=='line'&&tag!=='polyline'){const cs=getComputedStyle(n); s+=' |'+CS.map(p=>{let v=cs[p];return p==='width'||p==='height'?Math.round(parseFloat(v)||0)/1:v}).join(',');}
 out.push(s+'>'); if(tag==='svg'||tag==='fl-coach') return; for(const k of n.childNodes) walk(k,depth+1);}
walk(root,0); return out}"""
def run(page,setter):
    page.add_style_tag(content='*{animation:none!important;transition:none!important}'); 
    if st: setter()
    page.wait_for_timeout(700)
    return page.evaluate(DUMP)
s1=subprocess.Popen([sys.executable,'-m','http.server','8861'],cwd=D.HANDOFF_DIR,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
s2=subprocess.Popen([sys.executable,'-m','http.server','8862'],cwd=SITE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    ca=b.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce'); a=ca.new_page(); a.route('**/*',D._route); a.add_init_script('window.FL_NO_LENIS=true')
    cb=b.new_context(viewport={'width':1280,'height':900},reduced_motion='reduce'); m=cb.new_page(); m.route('**/fonts.g*',lambda r:r.abort()); m.add_init_script('window.FL_NO_LENIS=true')
    a.goto('http://localhost:8861/'+fname.replace(' ','%20')); a.wait_for_timeout(3500)
    m.goto(f'http://localhost:8862/{key}.html'); m.wait_for_timeout(1500)
    if os.environ.get('NO_CLB7_IMG'): m.evaluate("()=>{FluencyData.GUIDES.filter(g=>/(celpip|ielts)-clb7/.test(g.id)).forEach(g=>g.hasImg=false);FLDC.instances.Store.forceUpdate()}"); m.wait_for_timeout(300)
    A=run(a,lambda:a.evaluate(SET_ORIG,st)); B=run(m,lambda:m.evaluate("([n,s])=>FLDC.instances[n].setState(s)",[comp,st]))
    import re
    R={'Fluency Home v3.dc.html':'/','Store v3.dc.html':'/store','Pricing v3.dc.html':'/pricing','Partners v3.dc.html':'/partners','Partner Hub v3.dc.html':'/partners','Privacy.dc.html':'/privacy','Terms.dc.html':'/terms'}
    def fix(x):
        x=re.sub(r'(src=)(?:/guides/)?assets/(?:guides/)?[a-z0-9-]+\.jpg',r'\1IMG',x)
        for k,v in R.items(): x=x.replace('href='+k,'href='+v)
        return x
    def merge(L):
        out=[]
        for x in L:
            if x.startswith('"') and out and out[-1].startswith('"'): out[-1]=out[-1][:-1]+(' ' if True else '')+x[1:]; out[-1]=re.sub(r'\s+"$','"',out[-1]) if False else out[-1]
            else: out.append(x)
        return [re.sub(r'\s+',' ',x).replace(' "','"') if x.startswith('"') else x for x in out]
    A=merge([fix(x) for x in A]); B=merge([fix(x) for x in B])
    sm=difflib.SequenceMatcher(None,A,B,autojunk=False)
    diffs=[op for op in sm.get_opcodes() if op[0]!='equal']
    print(f'{key} state={json.dumps(st)[:50]}: nodes orig={len(A)} mine={len(B)} | differing blocks: {len(diffs)}')
    for tag,i1,i2,j1,j2 in diffs[:int(os.environ.get('MAXD','14'))]:
        print(' ',tag,'ORIG:',[x[:110] for x in A[i1:i2][:3]],'\n      MINE:',[x[:110] for x in B[j1:j2][:3]])
    b.close()
finally: s1.terminate(); s2.terminate()
