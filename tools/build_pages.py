#!/usr/bin/env python3
"""Build site/store.html, site/pricing.html, site/partners.html and their scripts from the design handoff.
Templates are compiled by dc2js.py; the page is pre-rendered by running the same runtime in headless Chromium (SEO + no flash)."""
import sys,os,re,subprocess,time,json
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
import dc2js
from playwright.sync_api import sync_playwright
SITE=os.environ.get('SITE_DIR','/home/claude/work3/site/')
H=dc2js.HANDOFF
PAGES={'store':('Store','Store v3.dc.html','/store'),'pricing':('Pricing','Pricing v3.dc.html','/pricing'),'partners':('Partners','Partners v3.dc.html','/partners')}
# shared components (compiled once)
comp=dc2js.compile_file('Coach','Coach.dc.html')+dc2js.compile_file('GuideCover','GuideCover.dc.html')
# The handoff's covers were 1600x1600 mockups cropped by CSS; the site uses the /guides covers, which are already the cover.
CROP='max-width:none;width:159.68%;left:-29.84%;top:-6.42%;'; assert CROP in comp
comp=comp.replace(CROP,'max-width:none;width:100%;height:100%;left:0;top:0;object-fit:cover;')
open(SITE+'assets/js/fl-components.js','w',encoding='utf-8').write('/* Coach and GuideCover components, compiled from the design handoff (tools/dc2js.py). */\n'+comp)
def head_for(fname,canon):
    src=open(H+fname,encoding='utf-8').read(); hel=re.search(r'<helmet>(.*?)</helmet>',src,re.S).group(1)
    lines=[]
    for m in re.finditer(r'<(?:title[^>]*>.*?</title>|meta[^>]*>)',hel,re.S):
        t=m.group(0); t=re.sub(r'(content|href)="assets/',r'\1="https://fluencyai.app/assets/',t) if 'og:image' in t or 'twitter:image' in t else t
        lines.append(t)
    css='\n'.join(re.findall(r'<style[^>]*>(.*?)</style>',src,re.S))
    return '\n'.join(lines),css

# "Sign in" button in the nav of Store, Pricing and Partners (opens the site account popup; the design has none).
_Q = '\\"'   # backslash + quote, as written inside the compiled JS source
_SI_STYLE = 'background:none;border:0;cursor:pointer;color:var(--ink-200);padding:8px 4px;font:600 14px/1 var(--font-body);white-space:nowrap;'
_SI_JS = ('"<button"+" type=' + _Q + 'button' + _Q + '"+" class=' + _Q + 'js-login-trigger' + _Q + '"+" data-fl-signin"+" data-logged-out=' + _Q + 'Sign in' + _Q
          + '"+" data-logged-in=' + _Q + 'My account' + _Q + '"+" style=' + _Q + _SI_STYLE + _Q + '"+">"+"Sign in"+"</button>"+"\\n      "+')
_SI_END = '"</div>"+"\\n      "+'
_SI_BEFORE = {'store': '"<label"+',
              'pricing': 'H.imp("FluencyAIDesignSystem_b0c8f6.Button"',
              'partners': '"<a"+" href=' + _Q + '/partners' + _Q + '"+" style=' + _Q + 'display:inline-flex;align-items:center;height:36px'}
def add_signin(key, js):
    a = _SI_END + _SI_BEFORE[key]
    assert js.count(a) == 1, (key, 'nav anchor not found')
    return js.replace(a, _SI_END + _SI_JS + _SI_BEFORE[key])

def build(key):
    name,fname,route=PAGES[key]
    js=dc2js.compile_file(name,fname)
    js=add_signin(key,js)
    open(SITE+f'assets/js/{key}.js','w',encoding='utf-8').write(f'/* {name} page, compiled from the design handoff ({fname}) by tools/dc2js.py. */\n'+js+
      f'(function(){{function go(){{FLDC.mount(document.getElementById("app"),"{name}",{{}});}}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();}})();\n')
    meta,css=head_for(fname,route)
    scripts=['/fluency-config.js','/fluency-data.js','/assets/js/fl-icons.js','/assets/js/fl-dc.js','/assets/js/fl-components.js',f'/assets/js/{key}.js']+(['/fl-forms.js'] if key=='partners' else [])+['/fl-motion.js','/assets/js/fluency-coach.js','/config.js','/assets/js/fl-account.js','/auth.js']
    def page(app):
        return ('<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'+meta+
          f'\n<meta name="robots" content="index, follow">\n<link rel="canonical" href="https://fluencyai.app{route}">\n<meta property="og:url" content="https://fluencyai.app{route}">\n<link rel="icon" href="/assets/logo-appicon.png">\n<link rel="stylesheet" href="/ds/styles.css">\n<link rel="stylesheet" href="/ds/components.css">\n<link rel="stylesheet" href="/assets/css/fl-account.css">\n<style>\nhtml,body{{height:100%;margin:0}}#app{{height:100%}}\n'+css+'\n</style>\n</head>\n<body>\n<div id="app">'+app+'</div>\n'+
          '\n'.join(f'<script src="{s}"></script>' for s in scripts)+'\n</body>\n</html>\n')
    tmp=SITE+f'_pre_{key}.html'; open(tmp,'w',encoding='utf-8').write(page('').replace('<script src="/fl-motion.js"></script>\n','').replace('<script src="/assets/js/fluency-coach.js"></script>\n','').replace('<script src="/config.js"></script>\n','').replace('<script src="/assets/js/fl-account.js"></script>\n','').replace('<script src="/auth.js"></script>\n',''))
    port=8830+list(PAGES).index(key)
    srv=subprocess.Popen([sys.executable,'-m','http.server',str(port)],cwd=SITE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.2)
    try:
        with sync_playwright() as p:
            b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900}); errs=[]
            pg.on('pageerror',lambda e:errs.append(str(e)[:200])); pg.route('**/fonts.g*',lambda r:r.abort())
            pg.goto(f'http://localhost:{port}/_pre_{key}.html'); pg.wait_for_timeout(2500)
            app=pg.evaluate("()=>document.getElementById('app').innerHTML"); b.close()
    finally: srv.terminate(); os.remove(tmp)
    if errs: print(key,'ERRORS',errs)
    open(SITE+f'{key}.html','w',encoding='utf-8').write(page(app)); print(key,'built: html',len(page(app))//1024,'KB, app',len(app)//1024,'KB')
for k in (sys.argv[1:] or list(PAGES)): build(k)
