#!/usr/bin/env python3
"""Compile one design-handoff page (*.dc.html) into static HTML.
Usage: python3 tools/dc2static.py "Pricing v3.dc.html" out.html
Needs: playwright+chromium, beautifulsoup4, a local http server serving the handoff folder (HANDOFF_URL),
and local copies of react/react-dom/babel/lucide (VENDOR paths below) because the handoff loads them from unpkg."""
import sys,re,os,socket,subprocess,time,html as H
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright
HANDOFF_URL=os.environ.get('HANDOFF_URL','http://localhost:8765/')
HANDOFF_DIR=os.environ.get('HANDOFF_DIR','/home/claude/z2/fluency-handoff/')
VENDOR={'react@18.3.1/umd/react.production.min.js':'/tmp/vend/x_react-18.3.1/package/umd/react.production.min.js',
 'react-dom@18.3.1/umd/react-dom.production.min.js':'/tmp/vend/x_react-dom-18.3.1/package/umd/react-dom.production.min.js',
 '@babel/standalone@7.29.0/babel.min.js':'/tmp/vend/x_babel-standalone-7.29.0/package/babel.min.js',
 'lucide@0.454.0/dist/umd/lucide.js':'/tmp/lu/package/dist/umd/lucide.min.js',
 'lenis@1.1.13/dist/lenis.min.js':'/tmp/vend/l/package/dist/lenis.min.js'}
ROUTES={'Fluency Home v3.dc.html':'/','Store v3.dc.html':'/store','Pricing v3.dc.html':'/pricing','Partners v3.dc.html':'/partners',
        'Partner Hub v3.dc.html':'/partner-hub','Privacy.dc.html':'/privacy','Terms.dc.html':'/terms'}
def _route(r):
    u=r.request.url
    for k,v in VENDOR.items():
        if k in u: return r.fulfill(path=v,content_type='application/javascript')
    if 'fonts.g' in u: return r.abort()
    return r.continue_()
def _free_port():
    s=socket.socket(); s.bind(('',0)); p=s.getsockname()[1]; s.close(); return p
def render(name,wait=4000):
    port=_free_port()
    srv=subprocess.Popen([sys.executable,'-m','http.server',str(port)],cwd=HANDOFF_DIR,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.2)
    try: return _render(name,wait,'http://localhost:%d/'%port)
    finally: srv.terminate()
def _render(name,wait,base):
    with sync_playwright() as p:
        b=p.chromium.launch(); pg=b.new_page(viewport={'width':1280,'height':900}); pg.route('**/*',_route)
        pg.goto(base+name.replace(' ','%20')); pg.wait_for_timeout(wait)
        html=pg.evaluate("()=>document.documentElement.outerHTML"); b.close(); return html
def compile_page(name):
    src=open(HANDOFF_DIR+name,encoding='utf-8').read()
    hel=re.search(r'<helmet>(.*?)</helmet>',src,re.S).group(1)
    meta=[l.strip() for l in re.findall(r'<(?:title|meta|link)[^>]*>(?:[^<]*</title>)?',hel) if 'stylesheet' not in l and 'icon' not in l]
    meta=[re.sub(r'(content|href)="assets/',r'\1="/assets/',m) for m in meta]
    page_style=re.findall(r'<style[^>]*>(.*?)</style>',src,re.S)
    soup=BeautifulSoup(render(name),'html.parser'); root=soup.find(id='dc-root')
    host=root.select_one('[data-screen-label]') or root
    for t in host.select('.sc-host,.sc-host-x'): t.unwrap()
    for t in host.find_all('script'): t.decompose()
    for t in host.find_all(True):
        for a in [a for a in t.attrs if a.startswith('data-dc') or a=='data-sc-name' or a=='data-wiko']: del t.attrs[a]
        if t.name=='a' and t.get('href'):
            base,_,frag=t['href'].partition('#')
            if base in ROUTES: t['href']=ROUTES[base]+('#'+frag if frag else '')
        st=t.get('style') or ''
        if t.name in('button','a') and 'dur-fast' in st: t['class']=(t.get('class') or [])+['fl-press']
    body=host.decode()
    uses_coach='<fl-coach' in body
    head=['<meta charset="utf-8">','<meta name="viewport" content="width=device-width, initial-scale=1">']+meta+[
      '<link rel="icon" href="/assets/logo-appicon.png">','<link rel="stylesheet" href="/ds/styles.css">','<link rel="stylesheet" href="/ds/components.css">']
    css='\n'.join(page_style)
    scripts=['<script src="/fluency-config.js"></script>','<script src="/fl-motion.js"></script>']
    if uses_coach: scripts.insert(0,'<script src="/assets/js/fluency-coach.js"></script>')
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n'+'\n'.join(head)+'\n<style>\n'+css+'\n</style>\n</head>\n<body>\n'+body+'\n'+'\n'.join(scripts)+'\n</body>\n</html>\n'
if __name__=='__main__':
    out=compile_page(sys.argv[1]); open(sys.argv[2],'w',encoding='utf-8').write(out); print('wrote',sys.argv[2],len(out),'bytes')
