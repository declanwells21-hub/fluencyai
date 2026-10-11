import subprocess,time,json,re
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8871'],cwd='/home/claude/work3/site',stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5)
B='http://localhost:8871/'
try:
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1280,'height':900}); errs=[]; posts=[]
    def mk():
        pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)[:150])); pg.route('**/fonts.g*',lambda r:r.abort()); pg.add_init_script('window.FL_NO_LENIS=true')
        pg.route('**/api/referral',lambda r:(posts.append(r.request.post_data),r.fulfill(status=200,content_type='application/json',body='{"ok":true}'))); return pg
    # ---- Pricing ----
    pg=mk(); pg.goto(B+'pricing.html'); pg.wait_for_timeout(1200)
    st=lambda:pg.evaluate("()=>FLDC.instances.Pricing.state")
    print('PRICING start',st())
    btns=pg.locator('button'); n=btns.count(); print(' buttons',n)
    pg.locator('button:has-text("$5")').first.click(); pg.wait_for_timeout(150); print(' after $5 pack click',st())
    pg.locator('button:has-text("$20")').first.click(); pg.wait_for_timeout(150); print(' after $20 click',st())
    q=pg.locator('[data-fl-click]').filter(has_text='refund').first
    if q.count(): q.click(); pg.wait_for_timeout(150); print(' after faq click',st())
    # ---- Partners ----
    pg=mk(); pg.goto(B+'partners.html'); pg.wait_for_timeout(1200); s2=lambda:pg.evaluate("()=>{const s=FLDC.instances.Partners.state;return {role:s.role,sales:s.sales,subs:s.subs,err:s.err,sent:s.sent}}")
    print('PARTNERS start',s2())
    pg.locator('[role=radio], button').filter(has_text='Educator').first.click(); pg.wait_for_timeout(150); print(' role after click Educator',s2())
    pg.locator('input[type=range]').first.fill('90'); pg.wait_for_timeout(200); print(' after slider fill 90',s2(), '| earnings text:',re.findall(r'\$\d[\d,]*',pg.locator('body').inner_text())[:4])
    pg.get_by_role('button',name=re.compile('Apply|partner code|Get',re.I)).last.click(); pg.wait_for_timeout(200); print(' submit empty ->',s2())
    ins=pg.locator('input[type=text], input:not([type])'); print(' text inputs',ins.count())
    fi=pg.locator('input:not([type=range])'); print(' form inputs',fi.count()); fi.nth(0).fill('Ada Okafor'); fi.nth(1).fill('ada@example.com'); fi.nth(2).fill('TikTok · @germanwithada')
    pg.get_by_role('button',name=re.compile('Apply|partner code|Get',re.I)).last.click(); pg.wait_for_timeout(400); print(' submit valid ->',s2()); print(' POST /api/referral:',posts[-1] if posts else None)
    # ---- Store ----
    pg=mk(); pg.goto(B+'store.html'); pg.wait_for_timeout(1500); s3=lambda:pg.evaluate("()=>{const s=FLDC.instances.Store.state;return {cat:s.cat,lang:s.lang,sel:s.sel,lb:s.lb,cur:s.cur,side:s.side}}")
    print('STORE start',s3())
    pg.locator('[data-fl-click]',has_text='Work & training').first.click(); pg.wait_for_timeout(200); print(' cat Work',s3(),'| cards visible:',pg.locator('main img[alt$="cover"]').count())
    pg.locator('[data-fl-click]',has_text=re.compile(r'^\s*German\s*$')).first.click(); pg.wait_for_timeout(200); print(' lang German',s3(),'| cards:',pg.locator('main img[alt$="cover"]').count())
    pg.locator('[data-fl-click]',has_text='Show me everything').first.click(); pg.locator('[data-fl-click]',has_text=re.compile(r'^\s*Both\s*$')).first.click(); pg.wait_for_timeout(200)
    card=pg.locator('[data-fl-click]:has(img[alt="Goethe-Zertifikat B1 cover"])').first; card.click(); pg.wait_for_timeout(300); print(' open B1',s3())
    print('  selar links in panel:',pg.evaluate("()=>[...document.querySelectorAll('a[href*=selar]')].map(a=>a.href).slice(0,3)"))
    print('  panel text sample:',re.sub(r'\s+',' ',pg.locator('[role=dialog], aside').last.inner_text())[:140])
    pg.keyboard.press('Escape'); pg.wait_for_timeout(200); print(' after Esc',s3())
    sel=pg.locator('select'); print(' currency options:',sel.first.evaluate("e=>[...e.options].map(o=>o.value).join(',')")[:80])
    sel.first.select_option('EUR'); pg.wait_for_timeout(250); print(' cur EUR',s3(),'| price sample:',re.findall(r'€[\d.]+',pg.locator('main').inner_text())[:3])
    print('ERRORS:',sorted(set(errs)))
    b.close()
finally: srv.terminate()
