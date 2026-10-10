import sys,json; sys.path.insert(0,__import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from rec_common import *
OUT={}
with Srv() as URL, sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':900}); pg=ctx.new_page(); pg.clock.install(); pg.route('**/*',D._route)
    pg.goto(URL); pg.wait_for_timeout(300)
    for _ in range(30): pg.clock.run_for(200); pg.wait_for_timeout(100)
    DLG="""()=>{const d=document.querySelector('[role=dialog]');if(!d)return null;let e=d;while(e.parentElement&&!(e.parentElement.id==='dc-root')){const cs=getComputedStyle(e);if(cs.position==='fixed')break;e=e.parentElement}return e.outerHTML}"""
    pops={}
    for name,label in [('partners','See how it works'),('resources','Browse guides')]:
        pg.get_by_role('button',name=re.compile(label)).first.click(); pg.wait_for_timeout(250)
        h=pg.evaluate(DLG); pops[name]={'open':clean(h) if h else None}
        print(name,'dialog bytes',len(h or ''), '| buttons in dialog:',pg.evaluate("()=>[...document.querySelectorAll('[role=dialog] button, [role=dialog] a')].map(e=>(e.getAttribute('aria-label')||e.textContent).trim().slice(0,28)+(e.href?' → '+e.getAttribute('href').slice(0,40):''))"))
        if name=='partners':
            inp=pg.locator('[role=dialog] input[type=email], [role=dialog] input').first
            inp.fill('zz-partner@zz.zz'); pg.wait_for_timeout(80)
            pops[name]['typed']=clean(pg.evaluate(DLG))
            btns=pg.evaluate("()=>[...document.querySelectorAll('[role=dialog] button')].map(e=>e.textContent.trim())"); print('  partner buttons',btns)
            send=[x for x in btns if re.search(r'send|request|apply|get|notify|join|submit|talk|start',x,re.I)]
            pg.locator('[role=dialog] button',has_text=send[0] if send else btns[-1]).first.click(); pg.wait_for_timeout(250)
            pops[name]['sent']=clean(pg.evaluate(DLG))
        pg.keyboard.press('Escape'); pg.wait_for_timeout(250)
        print('  closed by Esc:',pg.evaluate("()=>!document.querySelector('[role=dialog]')"))
    OUT['pops']=pops
    # ---- join section ----
    JOIN="()=>document.getElementById('join').outerHTML"
    OUT['join']={'init':clean(pg.evaluate(JOIN))}
    pg.locator('#join button',has_text='Join the waitlist').first.click(); pg.wait_for_timeout(200)
    OUT['join']['empty_err']=clean(pg.evaluate(JOIN))
    pg.locator('#join input[type=email]').fill('zz-email@zz.zz'); pg.wait_for_timeout(100)
    pg.locator('#join select').select_option(label='German'); pg.wait_for_timeout(100)
    OUT['join']['filled']=clean(pg.evaluate(JOIN))
    pg.locator('#join button',has_text='Join the waitlist').first.click(); pg.wait_for_timeout(300)
    OUT['join']['done']=clean(pg.evaluate(JOIN))
    print('join states bytes',{k:len(v) for k,v in OUT['join'].items()})
    print('join DONE text:',re.sub(r'<[^>]+>',' ',OUT['join']['done'])[:300].strip())
    print('outbox/net calls after submit:',pg.evaluate("()=>localStorage.getItem('fl_outbox')"))
    json.dump(OUT,open('/tmp/home_rec2.json','w'))
    b.close()
