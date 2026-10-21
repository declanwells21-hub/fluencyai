#!/usr/bin/env python3
"""Browser test for the account popup: age + Terms consent, the consent gate, Google sign-up, 'Download my data' and
'Delete my account'. Run from the repo root:  python3 tools/test_account_ui.py
Serves site/ itself, drives headless Chromium and replaces Supabase and /api/account with fakes. No network needed."""
import json, os, re, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
PORT = 8872
BASE = f'http://localhost:{PORT}'
SB = 'https://proj.supabase.co'
V = '2026-09-09'
passed = failed = 0

def check(name, ok, detail=''):
    global passed, failed
    if ok: passed += 1; print('PASS', name)
    else: failed += 1; print('FAIL', name, detail)

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=SITE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1.3)
from playwright.sync_api import sync_playwright

class Fake:
    """What the fake backend does, and a log of what the page asked for."""
    def __init__(self, consent=None, consent_status=200, user_meta=None, account_status=200, account_body=None):
        self.consent = consent            # list returned by fl_my_consent
        self.consent_status = consent_status
        self.user_meta = user_meta or {}
        self.account_status = account_status
        self.account_body = account_body
        self.log = []                     # (kind, payload)
    def of(self, kind): return [p for k, p in self.log if k == kind]

def session(meta):
    return {'access_token': 'tok', 'refresh_token': 'ref', 'expires_in': 3600, 'token_type': 'bearer', 'user': {'id': 'u1', 'email': 'ada@example.com', 'user_metadata': meta}}

def open_site(b, fake, hash_='', init=''):
    ctx = b.new_context(viewport={'width': 1100, 'height': 900}, accept_downloads=True)
    pg = ctx.new_page(); pg.errors = []
    pg.on('pageerror', lambda e: pg.errors.append(str(e)[:160]))
    pg.add_init_script(init)
    def route(r):
        req = r.request; u = req.url
        def ok(body='{}', status=200): r.fulfill(status=status, content_type='application/json', body=body)
        if u.endswith('/config.js'): return r.fulfill(status=200, content_type='application/javascript', body=f'window.__SUPABASE_URL="{SB}";window.__SUPABASE_ANON_KEY="anon";')
        if u.startswith(SB):
            path = u[len(SB):].split('?')[0]; body = req.post_data_json if req.post_data else None
            if path == '/auth/v1/signup': fake.log.append(('signup', body)); return ok('{}')
            if path == '/auth/v1/verify': fake.log.append(('verify', body)); return ok(json.dumps(session(fake.user_meta or (fake.log and next((p['data'] for k, p in fake.log if k == 'signup'), {})) or {})))
            if path == '/auth/v1/token': fake.log.append(('login', body)); return ok(json.dumps(session(fake.user_meta)))
            if path == '/auth/v1/user': return ok(json.dumps(session(fake.user_meta)['user']))
            if path == '/auth/v1/logout': fake.log.append(('logout', None)); return ok('{}')
            if path == '/auth/v1/authorize': fake.log.append(('google', u)); return r.fulfill(status=302, headers={'Location': BASE + '/about.html'}, body='')
            if path == '/rest/v1/rpc/fl_my_consent': fake.log.append(('consent_check', None)); return ok(json.dumps(fake.consent or []), fake.consent_status)
            if path == '/rest/v1/rpc/fl_record_consent': fake.log.append(('consent_record', body)); return ok('null')
            if path == '/rest/v1/profiles': return ok('[]')
            return ok('null')
        if u.endswith('/api/account') and req.method == 'POST':
            body = req.post_data_json; fake.log.append(('account', {'body': body, 'auth': req.headers.get('authorization')}))
            if fake.account_status != 200: return ok(json.dumps(fake.account_body or {'error': 'nope'}), fake.account_status)
            if body.get('action') == 'export': return r.fulfill(status=200, content_type='application/json', headers={'Content-Disposition': 'attachment; filename="fluency-ai-data.json"'}, body='{"account":{"email":"ada@example.com"}}')
            return ok('{"ok":true}')
        if 'fonts.g' in u: return r.abort()
        r.continue_()
    pg.route('**/*', route)
    pg.goto(BASE + '/about.html' + hash_); pg.wait_for_timeout(1200)
    return pg

def shot(pg, name):
    if os.environ.get('SHOTS'): pg.screenshot(path=f'/tmp/acct_{name}.png', clip={'x': 280, 'y': 60, 'width': 540, 'height': 700})

def step(pg): return pg.evaluate("(document.querySelector('.auth-step.active')||{id:''}).id")
def open_popup(pg): pg.click('[data-fl-signin]'); pg.wait_for_timeout(500)

try:
    with sync_playwright() as p:
        b = p.chromium.launch()

        # ---- the sign-up form
        f = Fake(); pg = open_site(b, f); open_popup(pg); pg.click('#auth-go-to-signup'); pg.wait_for_timeout(200)
        check('sign-up: an age and Terms checkbox is shown, unticked, with links to the Terms and Privacy Policy',
              pg.locator('#auth-agree').is_visible() and not pg.locator('#auth-agree').is_checked() and pg.locator('.fla-check a[href="/terms"]').count() >= 1 and pg.locator('.fla-check a[href="/privacy"]').count() >= 1)
        pg.fill('#auth-email', 'ada@example.com'); pg.fill('#auth-password', 'secret1'); pg.click('#auth-signup-submit'); pg.wait_for_timeout(300); shot(pg, 'signup')
        check('sign-up: without the tick nothing is sent and the person is told why', not f.of('signup') and '16' in pg.inner_text('#auth-signup-error'))
        pg.check('#auth-agree'); pg.click('#auth-signup-submit'); pg.wait_for_timeout(400)
        su = f.of('signup')
        check('sign-up: with the tick, the account is created carrying the age confirmation and the versions agreed',
              bool(su) and su[0]['data']['age_16_confirmed'] is True and su[0]['data']['terms_version'] == V and su[0]['data']['privacy_version'] == V and bool(su[0]['data']['consent_at']), su)
        check('sign-up: moves on to the email code step', step(pg) == 'auth-step-verify')
        # confirm the email: the tick travelled with the account, so consent is recorded without asking again
        pg.fill('#auth-code', '123456'); pg.click('#auth-verify-submit'); pg.wait_for_timeout(700)
        rec = f.of('consent_record')
        check('after confirming the email, consent is recorded from the sign-up tick (source signup_form) and no extra step is shown',
              len(rec) == 1 and rec[0]['p_terms'] == V and rec[0]['p_privacy'] == V and rec[0]['p_age_confirmed'] is True and rec[0]['p_source'] == 'signup_form' and step(pg) == 'auth-step-welcome', (rec, step(pg)))
        check('no script errors during sign-up', not pg.errors, pg.errors); pg.context.close()

        # ---- the consent gate (signed in without having agreed: password login, or Google, or a new Terms version)
        def login(f):
            pg = open_site(b, f); open_popup(pg)
            pg.fill('#auth-login-email', 'ada@example.com'); pg.fill('#auth-login-password', 'secret1'); pg.click('#auth-login-submit'); pg.wait_for_timeout(700); return pg
        f = Fake(consent=[]); pg = login(f)
        check('gate: someone who has not agreed is stopped at "One more step"', step(pg) == 'auth-step-consent', step(pg))
        shot(pg, 'consent'); pg.click('#auth-consent-submit'); pg.wait_for_timeout(250)
        check('gate: continuing without ticking is refused', 'tick' in pg.inner_text('#auth-consent-error').lower() and not f.of('consent_record') and step(pg) == 'auth-step-consent')
        pg.check('#auth-consent-agree'); pg.click('#auth-consent-submit'); pg.wait_for_timeout(600)
        rec = f.of('consent_record')
        check('gate: ticking and agreeing records consent (source consent_gate) and lets them in', len(rec) == 1 and rec[0]['p_source'] == 'consent_gate' and step(pg) == 'auth-step-welcome', (rec, step(pg)))
        pg.context.close()
        f = Fake(consent=[]); pg = login(f); pg.click('#auth-consent-decline'); pg.wait_for_timeout(500)
        check('gate: "Sign out" signs them out and records nothing', bool(f.of('logout')) and not f.of('consent_record') and step(pg) == 'auth-step-login'); pg.context.close()

        f = Fake(consent=[{'terms_version': V, 'privacy_version': V, 'age_16_confirmed': True, 'accepted_at': 'x'}]); pg = login(f)
        check('someone who already agreed to the current versions goes straight in (nothing recorded again)', step(pg) == 'auth-step-welcome' and not f.of('consent_record')); pg.context.close()
        f = Fake(consent=[{'terms_version': '2025-01-01', 'privacy_version': V, 'age_16_confirmed': True, 'accepted_at': 'x'}]); pg = login(f)
        check('when the Terms change, people who agreed to an older version are asked again', step(pg) == 'auth-step-consent'); pg.context.close()
        f = Fake(consent=[], consent_status=500); pg = login(f)
        check('if the consent check cannot run, people are not locked out', step(pg) == 'auth-step-welcome' and not pg.errors, (step(pg), pg.errors)); pg.context.close()

        # ---- Google
        f = Fake(); pg = open_site(b, f); open_popup(pg); pg.click('#auth-go-to-signup')
        pg.click('#auth-google-signup'); pg.wait_for_timeout(300)
        check('Google sign-up: refused until the box is ticked', not f.of('google') and '16' in pg.inner_text('#auth-signup-error'))
        pg.check('#auth-agree'); pg.click('#auth-google-signup'); pg.wait_for_timeout(700)
        intent = pg.evaluate("sessionStorage.getItem('fl_consent_intent')")
        check('Google sign-up: with the tick the person is sent to Google, and the tick is remembered for their return', bool(f.of('google')) and intent and json.loads(intent)['age16'] is True, intent); pg.context.close()
        f = Fake(consent=[], user_meta={'name': 'Ada'})
        pg = open_site(b, f, hash_='#access_token=abc&refresh_token=def&expires_in=3600',
                       init=f'sessionStorage.setItem("fl_consent_intent", JSON.stringify({{terms:"{V}",privacy:"{V}",age16:true}}))')
        pg.wait_for_timeout(600)
        check('coming back from Google after ticking the box: consent is recorded and no extra step is shown',
              len(f.of('consent_record')) == 1 and step(pg) == 'auth-step-welcome', (f.of('consent_record'), step(pg))); pg.context.close()
        f = Fake(consent=[], user_meta={'name': 'Ada'}); pg = open_site(b, f, hash_='#access_token=abc&refresh_token=def&expires_in=3600'); pg.wait_for_timeout(600)
        check('coming back from Google with no tick (for example a sign-in on the login screen): the gate asks', step(pg) == 'auth-step-consent' and not f.of('consent_record')); pg.context.close()

        # ---- download my data
        f = Fake(consent=[{'terms_version': V, 'privacy_version': V, 'age_16_confirmed': True, 'accepted_at': 'x'}]); pg = login(f)
        with pg.expect_download() as dl: pg.click('#auth-download-data')
        d = dl.value; acct = f.of('account')
        check('download: asks the account endpoint to export, signed in as the person, and saves fluency-ai-data.json',
              d.suggested_filename == 'fluency-ai-data.json' and acct and acct[0]['body'] == {'action': 'export'} and acct[0]['auth'] == 'Bearer tok', (d.suggested_filename, acct))
        pg.wait_for_timeout(300); check('download: tells the person that conversations are on their device', 'device' in pg.inner_text('#auth-account-msg'))
        f.log.clear(); f.account_status = 429; f.account_body = {'error': 'You just downloaded your data. Please wait a few minutes.'}
        pg.click('#auth-download-data'); pg.wait_for_timeout(500)
        check('download: a refusal from the server is shown to the person', 'wait a few minutes' in pg.inner_text('#auth-account-msg')); pg.context.close()

        # ---- delete my account
        f = Fake(consent=[{'terms_version': V, 'privacy_version': V, 'age_16_confirmed': True, 'accepted_at': 'x'}]); pg = login(f)
        pg.click('#auth-delete-account'); pg.wait_for_timeout(250)
        shot(pg, 'delete'); txt = pg.inner_text('#auth-step-delete')
        check('delete: the confirmation screen says what happens (subscription cancelled, orders kept, device data)', step(pg) == 'auth-step-delete' and 'cancelled straight away' in txt and 'tax and accounting' in txt and 'device' in txt)
        pg.fill('#auth-delete-confirm', 'delete'); pg.click('#auth-delete-submit'); pg.wait_for_timeout(250)
        check('delete: the wrong word is refused and nothing is sent', not f.of('account') and 'DELETE' in pg.inner_text('#auth-delete-error'))
        pg.click('#auth-delete-cancel'); pg.wait_for_timeout(200)
        check('delete: "Keep my account" goes back without deleting', step(pg) == 'auth-step-welcome' and not f.of('account'))
        pg.click('#auth-delete-account'); pg.fill('#auth-delete-confirm', 'DELETE'); pg.click('#auth-delete-submit'); pg.wait_for_timeout(700)
        acct = f.of('account')
        check('delete: typing DELETE sends the request, signs the person out and says it is done',
              acct and acct[0]['body'] == {'action': 'delete', 'confirm': 'DELETE'} and step(pg) == 'auth-step-login' and 'deleted' in pg.inner_text('#auth-login-error') and pg.evaluate("document.querySelector('[data-fl-signin]').innerText.trim()") == 'Sign in',
              (acct, step(pg)))
        check('no script errors during export and delete', not pg.errors, pg.errors); pg.context.close()
        f = Fake(consent=[{'terms_version': V, 'privacy_version': V, 'age_16_confirmed': True, 'accepted_at': 'x'}], account_status=409, account_body={'error': 'You have partner earnings that have not been paid out yet.', 'code': 'partner_balance'}); pg = login(f)
        pg.click('#auth-delete-account'); pg.fill('#auth-delete-confirm', 'DELETE'); pg.click('#auth-delete-submit'); pg.wait_for_timeout(600)
        check('delete: when the server refuses (unpaid partner earnings) the reason is shown and the person stays signed in', 'partner earnings' in pg.inner_text('#auth-delete-error') and step(pg) == 'auth-step-delete' and not f.of('logout')); pg.context.close()

        # ---- other pages that load the popup still work
        for page in ('', 'store.html', 'pricing.html', 'partners.html', 'partner-hub.html'):
            ctx = b.new_context(viewport={'width': 1100, 'height': 800}); pg = ctx.new_page(); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)[:120])); pg.route('**/fonts.g*', lambda r: r.abort()); pg.goto(f'{BASE}/{page}'); pg.wait_for_timeout(900)
            check(f'{page or "home"}: loads without script errors and has the new popup steps', not errs and pg.locator('#auth-step-consent').count() == 1 and pg.locator('#auth-step-delete').count() == 1 and pg.locator('#auth-agree').count() == 1, errs); ctx.close()
        b.close()
finally:
    srv.terminate()

print(f'\n{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
