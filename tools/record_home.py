import sys,json; sys.path.insert(0,__import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from rec_common import *
OUT={}
FIND_IDX="""(pred)=>{const ch=[...document.querySelector('[data-fl-chat]').children];return ch.findIndex(c=>c.textContent.includes(pred))}"""
with Srv() as URL, sync_playwright() as p:
    b=p.chromium.launch()
    # ---------- A. hero frames (fake clock) ----------
    ctx=b.new_context(viewport={'width':1280,'height':900}); pg=ctx.new_page(); pg.clock.install(); pg.route('**/*',D._route)
    pg.goto(URL); pg.wait_for_timeout(300)
    for _ in range(30): pg.clock.run_for(200); pg.wait_for_timeout(100)
    hero=pg.evaluate(FIND_IDX,'English · B1'); print('hero idx',hero)
    ok=pg.evaluate("""()=>{const el=document.querySelector('[data-fl-chat]');const k=Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));let f=el[k];while(f){const n=f.stateNode;if(n&&n.__setLogicState&&n.logic&&n.logic.state&&'tick' in n.logic.state){window.__inst=n;return true}f=f.return}return false}""")
    print('found component instance:',ok)
    DEMO_N=[7,7,6]; frames=[]; seqraw=[]
    for d in range(3):
        for t in range(DEMO_N[d]+17):
            pg.evaluate("([d,t])=>window.__inst.__setLogicState({demo:d,tick:t})",[d,t]); pg.wait_for_timeout(70)
            seqraw.append(clean(pg.evaluate(JS_CHILD,hero)))
    uniq=[]; idx=[]
    for f in seqraw:
        if f not in uniq: uniq.append(f)
        idx.append(uniq.index(f))
    OUT['hero']={'table':uniq,'seq':idx}; print('hero: ticks',len(idx),'distinct frames',len(uniq),'bytes',sum(map(len,uniq)))
    ctx.close()
    # ---------- B. widgets, coach, popups, join (fake clock stays frozen so hero does not change) ----------
    ctx=b.new_context(viewport={'width':1280,'height':900}); pg=ctx.new_page(); pg.clock.install(); pg.route('**/*',D._route)
    pg.goto(URL); pg.wait_for_timeout(300)
    for _ in range(30): pg.clock.run_for(200); pg.wait_for_timeout(100)
    def child_html(i): return clean(pg.evaluate(JS_CHILD,i))
    W={}
    for name,pred in [('repair','Say one of these instead'),('stage','Five things happen between'),('corr','Any time, mid-conversation'),('faq','Other things people ask me')]:
        i=pg.evaluate(FIND_IDX,pred); n=pg.evaluate("(i)=>document.querySelector('[data-fl-chat]').children[i].querySelectorAll('button').length",i)
        W[name]={'idx':i,'n':n}; print(name,'child',i,'buttons',n)
    def btn(i,j): return pg.locator('[data-fl-chat] > *').nth(i).locator('button').nth(j)
    for name in ['repair','stage','corr']:
        i=W[name]['idx']; W[name]['init']=child_html(i); W[name]['states']=[]
        for j in range(W[name]['n']):
            btn(i,j).click(); pg.wait_for_timeout(60); W[name]['states'].append(child_html(i))
    # restore corr/repair/stage/expl to defaults is irrelevant (state lives in page); record defaults by matching init
    # faq: open i from closed
    i=W['faq']['idx']; 
    # make sure closed
    W['faq']['init']=child_html(i); W['faq']['states']=[]
    for j in range(W['faq']['n']):
        btn(i,j).click(); pg.wait_for_timeout(60); W['faq']['states'].append(child_html(i)); btn(i,j).click(); pg.wait_for_timeout(40)
    OUT['widgets']=W
    for k,v in W.items(): print(k,'states',len(v['states']),'bytes',sum(map(len,v['states'])))
    # ---------- C. coach circle (driven by state, not by scrolling) ----------
    pg.evaluate("window.scrollTo(0,0)"); pg.wait_for_timeout(1800)
    pg.evaluate("""()=>{const el=document.querySelector('[data-fl-chat]');const k=Object.keys(el).find(k=>k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance'));let f=el[k];while(f){const n=f.stateNode;if(n&&n.__setLogicState&&n.logic&&n.logic.state&&'tick' in n.logic.state){window.__inst=n;return true}f=f.return}return false}""")
    cx=['welcome','happy','listening','thinking','speaking','encouraging','confused','idle']
    coach={}
    for v in cx:
        EXP={'welcome':'Hello','happy':'Understood','listening':'Listening','thinking':'Thinking','speaking':'Speaking','encouraging':'Encouraging','confused':'Not sure yet','idle':'Idle'}
        for _try in range(4):
            pg.evaluate("(v)=>window.__inst.__setLogicState({coachB:v})",v); pg.wait_for_timeout(500)
            lab=pg.evaluate("()=>{let e=document.querySelector('fl-coach');while(e&&!(e.textContent||'').includes('Your coach.'))e=e.parentElement;return e.innerText}")
            if EXP[v].lower() in lab.lower(): break
        print('  coach',v,'->',lab.split(chr(10))[0].strip(),'(try',_try,')')
        coach[v]=clean(pg.evaluate("()=>{let e=document.querySelector('fl-coach');while(e&&!(e.textContent||'').includes('Your coach.'))e=e.parentElement;return e.outerHTML}"))
    OUT['coach']=coach; print('coach states',list(coach),[len(x) for x in coach.values()])
    json.dump(OUT,open('/tmp/home_rec.json','w'))
    b.close()
