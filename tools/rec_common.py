import sys,subprocess,time,re,json
import dc2static as D
from playwright.sync_api import sync_playwright
from bs4 import BeautifulSoup
def clean(html):
    h=re.sub(r' data-dc-[a-z-]+="[^"]*"','',html); h=re.sub(r' data-sc-name="[^"]*"','',h); h=re.sub(r' data-wiko="[^"]*"','',h)
    # unwrap runtime interpolation spans and host wrappers
    h=re.sub(r'<span class="sc-interp">(.*?)</span>',r'\1',h,flags=re.S)
    return h
class Srv:
    def __enter__(self):
        self.p=subprocess.Popen(['python3','-m','http.server','8803'],cwd=D.HANDOFF_DIR,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1.5); return 'http://localhost:8803/Fluency%20Home%20v3.dc.html'
    def __exit__(self,*a): self.p.terminate()
JS_CHILD="(i)=>{const c=document.querySelector('[data-fl-chat]').children[i];return c?c.innerHTML:null}"
