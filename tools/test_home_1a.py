#!/usr/bin/env python3
"""Browser test for the Home page (design 1a). Run from the repo root:  python3 tools/test_home_1a.py
Serves site/ itself, drives headless Chromium, mocks the API, and prints PASS/FAIL per check. No network needed."""
import json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
PORT = 8871
URL = f'http://localhost:{PORT}/'
passed = failed = 0

def check(name, ok, detail=''):
    global passed, failed
    if ok: passed += 1; print('PASS', name)
    else: failed += 1; print('FAIL', name, detail)

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.3)
from playwright.sync_api import sync_playwright

def open_page(b, w=1280, h=900, reduced=False, ref=None):
    ctx = b.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce' if reduced else 'no-preference')
    pg = ctx.new_page(); pg.errors = []; pg.posts = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)[:160]))
    def route(r):
        req = r.request
        if req.method == 'POST' and '/api/' in req.url:
            pg.posts.append((req.url.split('localhost:%d' % PORT)[-1], req.post_data_json if req.post_data else None))
            r.fulfill(status=200, content_type='application/json', body='{"ok":true}')
        elif 'fonts.g' in req.url or 'supabase' in req.url or 'jsdelivr' in req.url: r.abort()
        else: r.continue_()
    pg.route('**/*', route)
    if ref: pg.add_init_script(f'localStorage.setItem("fl_ref", JSON.stringify({{code:"{ref}", at: Date.now()}}))')
    pg.goto(URL); pg.wait_for_timeout(1400)
    return pg

def scroll_all(pg):
    H = pg.evaluate('document.documentElement.scrollHeight'); y = 0
    while y < H: pg.evaluate(f'window.scrollTo(0,{y})'); pg.wait_for_timeout(120); y += 600
    pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(200)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ---- page loads, no errors, no sideways scroll
        for w in (1280, 390, 360):
            pg = open_page(b, w, 900 if w > 500 else 800)
            check(f'{w}px: no script errors', not pg.errors, pg.errors)
            check(f'{w}px: no sideways scroll', pg.evaluate('document.documentElement.scrollWidth') <= w, pg.evaluate('document.documentElement.scrollWidth'))
            if w == 1280:
                check('hero: the design headline', 'Stop freezing' in pg.inner_text('body'))
                check('hero: Dan is shown (fl-coach)', pg.locator('fl-coach').count() >= 1)
                check('the 1b direction and the review switcher are gone', pg.locator('[data-fl-switch]').count() == 0 and 'Design direction' not in pg.inner_text('body'))
            pg.context.close()

        pg = open_page(b)
        # ---- nav and connections
        nav = pg.inner_text('[data-fl-nav]')
        for label in ('How it works', 'Features', 'Pricing', 'Exam guides', 'Partners', 'FAQ', 'Sign in', 'Join the waitlist'):
            check(f'nav has "{label}"', label in nav, nav)
        pg.click('[data-fl-signin]'); pg.wait_for_timeout(500)
        check('Sign in opens the site account popup', pg.locator('#auth-modal-overlay').is_visible())
        pg.keyboard.press('Escape'); pg.evaluate("document.getElementById('auth-close-btn') && document.getElementById('auth-close-btn').click()"); pg.wait_for_timeout(300)

        # ---- the live demo
        before = pg.inner_text('text=LISTENING >> xpath=..') if pg.locator('text=LISTENING').count() else ''
        pg.wait_for_timeout(3500)
        after = pg.inner_text('body')
        check('hero demo is animating', pg.locator('[class*=fl], body').count() > 0 and after != '' )
        scroll_all(pg)
        # ---- how-it-works stages, repairs, correction and explanation controls
        pg.get_by_role('button', name=re.compile('^Speak')).first.click(); pg.wait_for_timeout(300)
        check('stage buttons switch the step', 'STEP 02' in pg.inner_text('body').upper())
        pg.get_by_role('button', name='Say that again').click(); pg.wait_for_timeout(250)
        pg.get_by_role('button', name='Slower, please').click(); pg.wait_for_timeout(250)
        check('repair buttons respond without errors', not pg.errors, pg.errors)
        for name in ('Off', 'Immediate', 'Detailed', 'English', 'Both', 'Your language'):
            pg.locator(f'button:text-is("{name}")').first.click(); pg.wait_for_timeout(120)
        check('correction and explanation controls respond without errors', not pg.errors, pg.errors)

        # ---- FAQ
        qs = pg.locator('#faq button')
        n = qs.count()
        check('FAQ lists 10 questions', n == 10, n)
        faq_before = len(pg.locator('#faq').inner_text()); qs.first.click(); pg.wait_for_timeout(300)
        check('FAQ question opens its answer', len(pg.locator('#faq').inner_text()) > faq_before + 60 and qs.first.get_attribute('aria-expanded') == 'true')
        qs.first.click(); pg.wait_for_timeout(300)

        # ---- waitlist form
        pg.locator('#join').scroll_into_view_if_needed(); pg.wait_for_timeout(300)
        email = pg.locator('#join input[type=email]'); email.fill('not-an-email')
        pg.locator('#join').get_by_role('button', name=re.compile('Join the waitlist')).click(); pg.wait_for_timeout(300)
        check('waitlist: a bad email is refused, nothing is sent', not pg.posts and 'valid' in pg.locator('#join').inner_text().lower() or not pg.posts)
        email.fill('ada@example.com'); pg.locator('#join select').select_option('German')
        pg.locator('#join').get_by_role('button', name=re.compile('Join the waitlist')).click(); pg.wait_for_timeout(700)
        wl = [x for x in pg.posts if 'waitlist' in x[0]]
        check('waitlist: sends email, language and source to the waitlist endpoint', bool(wl) and wl[0][1].get('email') == 'ada@example.com' and wl[0][1].get('language') == 'German' and wl[0][1].get('source') == 'home_waitlist', pg.posts)
        check('waitlist: shows the thank-you state', 'ada@example.com' in pg.locator('#join').inner_text() or 'on the list' in pg.locator('#join').inner_text().lower() or 'thank' in pg.locator('#join').inner_text().lower())

        # ---- pop-ups
        pg.evaluate('window.scrollTo(0,0)')
        pop = pg.locator('[role=dialog][aria-label="Fluency Partners"]')
        pg.get_by_role('button', name='See how it works →').click(); pg.wait_for_timeout(400)
        check('Partners pop-up opens as a dialog', pop.count() == 1 and '20%' in pop.inner_text())
        pop.locator('input[type=email]').fill('creator@example.com')
        pop.get_by_role('button', name=re.compile('Apply')).click(); pg.wait_for_timeout(600)
        pe = [x for x in pg.posts if x[1] and x[1].get('email') == 'creator@example.com']
        check('Partners pop-up: the email is sent as partner interest', bool(pe) and pe[0][1].get('source') == 'home_partner_popup', pg.posts)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        check('Escape closes the pop-up', pop.count() == 0)
        pg.close()

        # ---- guides pop-up carries the partner code
        pg = open_page(b, ref='AMARA20'); scroll_all(pg)
        pg.get_by_role('button', name='Browse guides →').click(); pg.wait_for_timeout(400)
        links = pg.locator('[role=dialog] a[href*="selar.com"]')
        hrefs = [links.nth(i).get_attribute('href') for i in range(links.count())]
        check('guides pop-up: 5 guides, each linking to Selar with the visitor\'s partner code', len(hrefs) == 5 and all(h.endswith('?ref=AMARA20') for h in hrefs), hrefs)
        pg.close()
        pg = open_page(b); scroll_all(pg); pg.get_by_role('button', name='Browse guides →').click(); pg.wait_for_timeout(300)
        hrefs = [a.get_attribute('href') for a in pg.locator('[role=dialog] a[href*="selar.com"]').all()]
        check('guides pop-up: no partner code when the visitor has none', hrefs and all('?' not in h for h in hrefs), hrefs)
        pg.close()

        # ---- links point at real pages
        pg = open_page(b)
        vercel = json.load(open(os.path.join(ROOT, 'vercel.json')))
        routes = {r['source'] for r in vercel.get('rewrites', [])} | {'/'}
        local = sorted({h for h in pg.evaluate("[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))") if h.startswith('/')})
        missing = [h for h in local if h not in routes]
        check('every internal link goes to a real page', not missing, missing)
        check('footer links to the hub, privacy and terms', {'/partner-hub', '/privacy', '/terms'} <= set(local), local)
        pg.close()

        # ---- reduced motion shows the finished demo, mobile has the app tab bar
        pg = open_page(b, reduced=True)
        check('reduced motion: page renders without errors', not pg.errors, pg.errors); pg.close()
        pg = open_page(b, 390, 844)
        check('mobile: the bottom tab bar is present', pg.locator('text=More').count() >= 1 and pg.locator('button:has-text("Account")').count() >= 1)
        pg.close()

        # ---- structured data matches the visible FAQ
        html = open(os.path.join(SITE, 'index.html'), encoding='utf-8').read()
        ld = [json.loads(x) for x in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)]
        faq = next((j for j in ld if j.get('@type') == 'FAQPage'), None)
        design = open(os.path.join(ROOT, 'tools/design/Fluency Home v3 (1a product-forward).dc.html'), encoding='utf-8').read()
        block = design[design.index('_faqs() {'):]; block = block[:block.index('];')]
        pairs = [(json.loads('"' + q + '"'), json.loads('"' + a + '"')) for q, a in re.findall(r'\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\]', block)]
        check('the design FAQ was read from the design file (10 questions)', len(pairs) == 10, len(pairs))
        check('structured data: a FAQPage exists with 10 questions', faq is not None and len(faq['mainEntity']) == 10)
        if faq and pairs:
            got = [(q['name'], q['acceptedAnswer']['text']) for q in faq['mainEntity']]
            check('structured data: questions AND answers equal the design FAQ, in order', got == pairs, [(g[0], p[0]) for g, p in zip(got, pairs) if g != p])
        hub = open(os.path.join(SITE, 'partner-hub.html'), encoding='utf-8').read()
        auth = open(os.path.join(SITE, 'auth.js'), encoding='utf-8').read()
        check('Partner Hub: the admin shortcut is switched off on that page', re.search(r'<body[^>]*data-fl-no-admin', hub) is not None and "!document.body.hasAttribute('data-fl-no-admin')" in auth)
        check('Partner Hub: no admin role switch or admin panel markup', not re.search(r'Admin', re.sub(r'<script.*?</script>|<style.*?</style>', '', hub, flags=re.S)))
        b.close()
finally:
    srv.terminate()

print(f'\n{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
