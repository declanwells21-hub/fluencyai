#!/usr/bin/env python3
"""Builds the Home page (site/index.html + site/assets/js/home.js) from design "1a Product-forward".

The design file (tools/design/Fluency Home v3 (1a product-forward).dc.html) holds two directions and a review switcher.
This keeps the 1a direction and the shared sections, compiles the design's own template and script with tools/dc2js.py,
and pre-renders it in headless Chromium (search engines and no flash), exactly like Store, Pricing and Partners.

What is changed from the design file, and nothing else (every change is listed in PATCHES below):
  - the 1b direction and the review-only "Design direction" switcher are removed (1a is fixed);
  - the typing dots used a React element, which the site does not load: same three dots, written as plain markup;
  - the waitlist form and the partner pop-up send their email to the site's forms (fl-forms.js);
  - a "Sign in" button is added to the nav (it opens the site account popup), as on every other page;
  - the footer's "Partner hub" link points at /partner-hub;
  - an "About" link is added to the footer;
  - the partner commission wording says the confirmed rule (20% on exam blueprint sales and on a referred person's FIRST
    subscription payment only) in the places the design describes it: the Partners pop-up intro, its "20%" tile and its footnote,
    the ecosystem card, and the FAQ answer;
  - the FAQPage structured data in the head is regenerated from the page's own FAQ text, so search results always match what is shown;
  - the guide links in the "Exam guides" pop-up carry the visitor's partner code (?ref=) like the Store does, so a sale from there is credited.
The head of the page (SEO tags, structured data, mobile app tags, connected scripts) is kept from the current site/index.html.

Run from the repo root:   python3 tools/build_home_1a.py
Needs: python3, playwright with chromium. No network.
"""
import json, os, re, sys, shutil, subprocess, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site') + os.sep
DESIGN = os.path.join(ROOT, 'tools', 'design', 'Fluency Home v3 (1a product-forward).dc.html')

work = tempfile.mkdtemp(prefix='home1a_')
os.environ['HANDOFF_DIR'] = work + os.sep
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import dc2js  # noqa: E402  (reads HANDOFF_DIR when imported)
dc2js.HANDOFF = work + os.sep

src = open(DESIGN, encoding='utf-8').read()

def cut(s, start_marker, end_marker, what):
    a, b = s.index(start_marker), s.index(end_marker)
    assert a < b, what
    return s[:a] + s[b:]

# ---------- patches (each one asserts it found its target, so a changed design fails loudly) ----------
src = cut(src, '  <!-- ===================== 1b · CONVERSATIONAL', '  <!-- FINAL CTA + WAITLIST (shared) -->', '1b direction')
src = cut(src, '  <!-- DIRECTION SWITCHER -->', '  <!-- POP-UPS -->', 'direction switcher')

DOTS_TPL = '{{ dots }}'
DOTS_NEW = ('<span style="display:inline-flex;gap:4px;"><sc-for list="{{ dotList }}" as="d">'
            '<span style="display:inline-block;width:6px;height:6px;border-radius:3px;background:var(--indigo-300);'
            'animation:flDot 1.2s {{ d }}s infinite ease-in-out;"></span></sc-for></span>')
assert src.count(DOTS_TPL) == 1, 'dots placeholder'
src = src.replace(DOTS_TPL, DOTS_NEW)
m = re.search(r'      dots: React\.createElement\(.*\n', src)
assert m, 'dots value'
src = src.replace(m.group(0), '      dotList: [0, 0.15, 0.3],\n')

OLD_PARTNER = "sendPartner: () => /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(s.pEmail.trim()) && this.setState({ pSent: true }),"
NEW_PARTNER = ("sendPartner: () => { const v = s.pEmail.trim(); if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)) return; "
               "this.setState({ pSent: true }); window.flSubmit && window.flSubmit(\"partner_interest\", { email: v, source: \"home_partner_popup\" }); },")
assert OLD_PARTNER in src, 'sendPartner'
src = src.replace(OLD_PARTNER, NEW_PARTNER)

OLD_WL = 'state: this.props.launchState || "waitlist" });'
assert src.count(OLD_WL) == 1, 'waitlist submit'
src = src.replace(OLD_WL, 'state: this.props.launchState || "waitlist", source: "home_waitlist" });')

RULE = "earn 20% on exam blueprint sales and on a referred person's first subscription payment"
for old, new in [
    ("Creators, teachers and affiliates share Fluency with a personal link and earn on what their audience buys.",
     "Creators, teachers and affiliates share Fluency with a personal link and " + RULE + "."),
    ('"Creators, teachers and affiliates get a personal link and earn 20% on confirmed orders it brings in, tracked in the Partner hub."',
     '"Creators, teachers and affiliates get a personal link and ' + RULE + ', tracked in the Partner hub."'),
    ('"Creators, teachers and affiliates share Fluency and earn on what their audience buys."',
     '"Creators, teachers and affiliates share Fluency and earn 20% on exam blueprint sales and first subscription payments."'),
    ("Commission is created only by a confirmed order carrying your code.",
     "Commission is created only by a confirmed exam blueprint order or a first subscription payment carrying your code."),
    ('{ v: "20%", k: "on guides, subscriptions and bundles" }',
     '{ v: "20%", k: "on exam guides and a first subscription payment" }'),
]:
    assert src.count(old) == 1, 'commission wording: ' + old[:50]
    src = src.replace(old, new)

ABOUT_AFTER = '<a href="Partner Hub v3.dc.html" style="color:var(--ink-300);text-decoration:none;">Partner hub</a>\n'
assert src.count(ABOUT_AFTER) == 1, 'footer after the hub link'
src = src.replace(ABOUT_AFTER, ABOUT_AFTER + '        <a href="/about" style="color:var(--ink-300);text-decoration:none;">About</a>\n')

OLD_URL = 'url: "https://selar.com/" + selar }))'
NEW_URL = ('url: "https://selar.com/" + selar + (() => { try { const r = JSON.parse(localStorage.getItem("fl_ref") || "null"); '
           'return r && r.code && Date.now() - r.at < 30 * 864e5 ? "?ref=" + encodeURIComponent(r.code) : ""; } catch (e) { return ""; } })() }))')
assert src.count(OLD_URL) == 1, 'guide links'
src = src.replace(OLD_URL, NEW_URL)

assert src.count('href="Partner Hub v3.dc.html"') == 1, 'footer hub link'
src = src.replace('href="Partner Hub v3.dc.html"', 'href="/partner-hub"')

SIGNIN = ('<button type="button" class="js-login-trigger" data-fl-signin data-logged-out="Sign in" data-logged-in="My account" '
          'style="background:none;border:0;cursor:pointer;color:var(--ink-200);padding:8px 4px;font:600 14px/1 var(--font-body);white-space:nowrap;">Sign in</button>\n      ')
NAV_CTA = '<x-import component-from-global-scope="FluencyAIDesignSystem_b0c8f6.Button" variant="primary" size="s" icon="{{ ctaIcon }}" on-click="{{ goJoin }}" hint-size="160px,36px">{{ ctaLabel }}</x-import>\n    </nav>'
assert src.count(NAV_CTA) == 1, 'nav button'
src = src.replace(NAV_CTA, SIGNIN + NAV_CTA)

open(os.path.join(work, 'Home.dc.html'), 'w', encoding='utf-8').write(src)
js = dc2js.compile_file('Home', 'Home.dc.html')

MOUNT = ('(function(){function go(){var c=window.FL_CONFIG||{};FLDC.mount(document.getElementById("app"),"Home",'
         '{direction:"product",launchState:c.launchState||"waitlist"});}'
         'if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",go);else go();})();\n')
open(SITE + 'assets/js/home.js', 'w', encoding='utf-8').write(
    '/* Home page, design 1a "Product-forward", compiled from tools/design by tools/build_home_1a.py (tools/dc2js.py). */\n' + js + MOUNT)

# ---------- page shell: keep the current head and the connected scripts ----------
cur = open(SITE + 'index.html', encoding='utf-8').read()
head = cur[:cur.index('</head>') + len('</head>')]

def faq_pairs(template):
    block = template[template.index('_faqs() {'):]
    block = block[:block.index('];')]
    return [(json.loads('"' + q + '"'), json.loads('"' + a + '"')) for q, a in re.findall(r'\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\]', block)]

def refresh_faq_json(h, pairs):
    """Rewrites the FAQPage structured data from the page's own FAQ text."""
    def swap(m):
        data = json.loads(m.group(1))
        if data.get('@type') != 'FAQPage': return m.group(0)
        data['mainEntity'] = [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in pairs]
        return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'
    out, n = re.subn(r'<script type="application/ld\+json">(.*?)</script>', swap, h, flags=re.S)
    return out

PAIRS = faq_pairs(src)
assert len(PAIRS) == 10, 'expected 10 FAQ entries, found %d' % len(PAIRS)
head = refresh_faq_json(head, PAIRS)
SCRIPTS = ['/fluency-config.js', '/fl-forms.js', '/assets/js/fl-icons.js', '/assets/js/fl-dc.js', '/assets/js/fl-components.js', '/assets/js/home.js',
           '/fl-motion.js', '/assets/js/fluency-coach.js', '/assets/js/fl-ref.js', '/config.js', '/assets/js/fl-partner-route.js',
           '/assets/js/fl-account.js', '/auth.js', '/assets/js/fl-mobile.js']

def page(app, scripts=SCRIPTS, extra=''):
    return head + '\n<body>\n<div id="app">' + app + '</div>\n' + extra + '\n'.join(f'<script src="{s}"></script>' for s in scripts) + '\n</body>\n</html>\n'

# ---------- pre-render (same runtime, headless Chromium) ----------
from playwright.sync_api import sync_playwright  # noqa: E402
PRE = ['/fluency-config.js', '/assets/js/fl-icons.js', '/assets/js/fl-dc.js', '/assets/js/fl-components.js', '/assets/js/home.js']
tmp = SITE + '_pre_home.html'
# the demo ticks are stopped so the saved page is the design's first frame (what the browser draws on load too)
open(tmp, 'w', encoding='utf-8').write(page('', PRE, '<script>window.setInterval=function(){return 0};</script>\n'))
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8861'], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.2)
errs = []
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 900})
        pg.on('pageerror', lambda e: errs.append(str(e)[:200])); pg.route('**/fonts.g*', lambda r: r.abort())
        pg.goto('http://localhost:8861/_pre_home.html'); pg.wait_for_timeout(1500)
        app = pg.evaluate("()=>document.getElementById('app').innerHTML"); b.close()
finally:
    srv.terminate(); os.remove(tmp); shutil.rmtree(work, ignore_errors=True)
if errs: print('ERRORS', errs); sys.exit(1)
assert 'Stop freezing' in app, 'the page did not render'
open(SITE + 'index.html', 'w', encoding='utf-8').write(page(app))
print('home built: index.html', len(page(app)) // 1024, 'KB, app', len(app) // 1024, 'KB, home.js', len(js) // 1024, 'KB')
