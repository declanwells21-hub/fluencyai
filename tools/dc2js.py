#!/usr/bin/env python3
"""Compile design-handoff templates (*.dc.html) to plain JavaScript for assets/js/fl-dc.js.
Usage: python3 tools/dc2js.py Name "File.dc.html" > out.js     (Name = registry name, e.g. Store or GuideCover)
Semantics follow the design runtime (support.js): {{ expr }} text/attrs, <sc-if value>, <sc-for list as>, <x-import>, <dc-import>.
Whitespace-only text without a literal space is dropped (as the runtime does); everything else is kept."""
import re,sys,json,os
HANDOFF=os.environ.get('HANDOFF_DIR','/home/claude/z2/fluency-handoff/')
VOID={'area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr'}
TAG=re.compile(r'<(/?)([A-Za-z][\w:-]*)((?:\s+[^\s=>/"\']+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>"\']+))?)*)\s*(/?)>',re.S)
ATTR=re.compile(r'([^\s=>/"\']+)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>"\']+)))?',re.S)
INTERP=re.compile(r'\{\{([\s\S]+?)\}\}')
def parse(src):
    root={'t':'root','kids':[]}; st=[root]; pos=0
    for m in TAG.finditer(src):
        if m.start()>pos: st[-1]['kids'].append({'t':'text','s':src[pos:m.start()]})
        pos=m.end(); close,name,attrs,selfc=m.groups()
        if close:
            if name in VOID and st[-1].get('name')!=name: continue      # stray </img>
            while len(st)>1 and st[-1]['name']!=name: st.pop()
            if len(st)>1: st.pop()
            continue
        al=[]
        for a in ATTR.finditer(attrs):
            v=a.group(2) if a.group(2) is not None else a.group(3) if a.group(3) is not None else a.group(4)
            al.append((a.group(1),v))
        node={'t':'el','name':name,'attrs':al,'kids':[]}; st[-1]['kids'].append(node)
        if not selfc and name not in VOID: st.append(node)
    if pos<len(src): st[-1]['kids'].append({'t':'text','s':src[pos:]})
    return root
def js(s): return json.dumps(s,ensure_ascii=False)
def ex(e): return 'T(function(){return ('+e.strip()+')})'     # tolerant expression: errors -> undefined
def interp_parts(raw,attr=False):
    parts=INTERP.split(raw); out=[]
    for i,p in enumerate(parts):
        if i%2==0:
            if p: out.append(js(p))
        else: out.append(('SA(' if attr else 'S(')+ex(p)+')')
    return out
ROUTES={'Fluency Home v3.dc.html':'/','Store v3.dc.html':'/store','Pricing v3.dc.html':'/pricing','Partners v3.dc.html':'/partners','Partner Hub v3.dc.html':'/partners','Privacy.dc.html':'/privacy','Terms.dc.html':'/terms'}
def route(v):
    base,_,frag=v.partition('#')
    return ROUTES[base]+('#'+frag if frag else '') if base in ROUTES else v
def camel(s): return re.sub(r'-([a-z])',lambda m:m.group(1).upper(),s)
EVENTS={'onClick':'click','onChange':'change','onInput':'input','onKeyDown':'keydown'}
def gen_children(kids,tag=None):
    out=[]
    for k in kids:
        if k['t']=='text':
            s=k['s']
            if '{{' not in s:
                if not s.strip() and ' ' not in s: continue
                out.append(js(s))
            else: out+=interp_parts(s)
        else: out.append(gen_el(k))
    return '+'.join(out) if out else '""'
def gen_el(n):
    name=n['name']; A=dict(n['attrs'])
    if name=='sc-if': return '(B('+ex(INTERP.search(A['value']).group(1))+')?('+gen_children(n['kids'])+'):"")'
    if name=='sc-for':
        lst=INTERP.search(A['list']).group(1); var=A['as']
        return '(L('+ex(lst)+').map(function('+var+',_i){return '+gen_children(n['kids'])+'}).join(""))'
    if name in('x-import','dc-import'):
        comp=A.get('name') if name=='dc-import' else A['component-from-global-scope']
        props=[]
        for k,v in n['attrs']:
            if k in('component-from-global-scope','from') or (k=='name' and name=='dc-import') or k.startswith('hint-'): continue
            pk=camel(k) if not k.startswith('on-') else camel(k)
            if v is None: props.append(js(pk)+':true'); continue
            m=re.fullmatch(r'\s*\{\{([\s\S]+?)\}\}\s*',v)
            if m: props.append(js(pk)+':'+ex(m.group(1)))
            elif '{{' in v: props.append(js(pk)+':'+'+'.join(interp_parts(v,True) or ['""']))
            else: props.append(js(pk)+':'+js(v))
        ch=gen_children(n['kids']) if n['kids'] else '""'
        return 'H.imp('+js(comp)+',{'+','.join(props)+'},'+ch+')'
    # plain element
    parts=['"<'+name+'"']
    for k,v in n['attrs']:
        if k=='data-wiko' or k.startswith('hint-'): continue
        if k in EVENTS:
            m=INTERP.search(v or ''); parts.append('" data-fl-'+EVENTS[k]+'=\\""+H.reg('+ex(m.group(1))+')+"\\""'); continue
        if v is None: parts.append(js(' '+k)); continue
        m=re.fullmatch(r'\s*\{\{([\s\S]+?)\}\}\s*',v)
        key=k
        if name=='select' and k=='value': key='data-fl-value'
        if m: parts.append('H.attr('+js(key)+','+ex(m.group(1))+')')
        elif '{{' in v: parts.append('" '+key+'=\\""+'+'+'.join(interp_parts(v,True))+'+"\\""')
        else: parts.append(js(' '+key+'="'+(route(v) if k=='href' else v)+'"'))
    parts.append('">"')
    body=gen_children(n['kids'])
    if name in VOID: return '+'.join(parts)
    return '+'.join(parts)+'+'+body+'+'+js('</'+name+'>')
def compile_file(regname,fname):
    src=open(HANDOFF+fname,encoding='utf-8').read()
    a=src.index('<x-dc>')+6; b=src.rindex('</x-dc>')
    tpl=src[a:b]; tpl=re.sub(r'<helmet>.*?</helmet>','',tpl,flags=re.S)
    m=re.search(r'<script type="text/x-dc"[^>]*data-dc-script[^>]*>(.*?)</script>',src,re.S); script=m.group(1) if m else 'class Component extends DCLogic{renderVals(){return {}}}'
    root=parse(tpl)
    code=gen_children(root['kids'])
    return ('FLDC.define('+js(regname)+',function(DCLogic){'+script+'\nreturn Component;},function(v,H,T,S,B,L,SA){with(v){return '+code+';}});\n')
if __name__=='__main__':
    sys.stdout.write(compile_file(sys.argv[1],sys.argv[2]))
