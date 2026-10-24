// The three welcome emails: account, partner and waitlist.
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const root = path.join(__dirname, '..');

// ---- fakes: the Brevo email API and the Supabase admin client ----
let sent = [];
global.fetch = async (url, init = {}) => {
  if (/brevo\.com/.test(url)) { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({}), text: async () => '' }; }
  throw new Error('unexpected fetch ' + url);
};
let accounts = {}; let adminCalls = [];
const fakeAdmin = {
  getUserById: async (id) => ({ data: { user: JSON.parse(JSON.stringify(accounts[id])) }, error: null }),
  updateUserById: async (id, patch) => { adminCalls.push(patch); if (patch.app_metadata) accounts[id].app_metadata = patch.app_metadata; return { error: null }; },
};
require.cache[require.resolve(path.join(root, 'api/_lib/supabase.js'))] = { id: 'x', filename: 'x', loaded: true, exports: { getServiceClient: () => ({ auth: { admin: fakeAdmin } }) } };

const W = require(path.join(root, 'api/_lib/welcomeEmails.js'));
const partnerEmails = require(path.join(root, 'api/_lib/partnerEmails.js'));

const hexes = (html) => new Set((html.match(/#[0-9A-Fa-f]{6}\b/g) || []).map((h) => h.toUpperCase()));
const rgbas = (html) => new Set((html.match(/rgba\([^)]*\)/g) || []).map((h) => h.replace(/\s/g, '')));
const original = fs.readFileSync(path.join(__dirname, 'fixtures/welcome-template.html'), 'utf8');

const newAccount = (over = {}) => ({ id: 'u1', email: 'ann@example.com', email_confirmed_at: new Date().toISOString(), created_at: new Date().toISOString(), app_metadata: {}, user_metadata: { full_name: 'Ann Lee' }, ...over });
let passed = 0, failed = 0;
async function test(name, fn) {
  sent = []; adminCalls = []; accounts = {};
  process.env.BREVO_API_KEY = 'key'; process.env.EMAIL_FROM_ADDRESS = 'hello@fluencyai.app'; process.env.WELCOME_FROM_ADDRESS = 'welcome@fluencyai.app'; delete process.env.WELCOME_REPLY_TO;
  try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
}

(async () => {
  const all = () => [W.accountWelcome({ name: 'Ann Lee' }), W.partnerWelcome({ name: 'Ann Lee', email: 'ann@example.com', code: 'ANNA', rate: 0.2 }), W.waitlistWelcome({ unsubscribeUrl: 'https://fluencyai.app/api/waitlist?unsubscribe=a&t=b' })];

  await test('nothing in any email sends people to the web app or tells them to start speaking in a browser', async () => {
    for (const m of all()) {
      assert.ok(!/fluencyai\.app\/app/i.test(m.htmlContent + m.textContent), 'link to /app');
      assert.ok(!/in your browser|Start my first conversation|Voxi/i.test(m.htmlContent + m.textContent));
    }
  });
  await test('colours: every colour in the three emails already exists in the supplied template', async () => {
    const ok = hexes(original), okRgba = rgbas(original);
    for (const m of all()) {
      for (const h of hexes(m.htmlContent)) assert.ok(ok.has(h), 'new colour ' + h);
      for (const r of rgbas(m.htmlContent)) assert.ok(okRgba.has(r), 'new colour ' + r);
    }
  });
  await test('no leftover {{placeholders}} and the website is in every email (button, footer and plain text)', async () => {
    for (const m of all()) {
      assert.ok(!/\{\{|\}\}/.test(m.htmlContent) && !/\{\{|\}\}/.test(m.textContent));
      assert.ok(m.htmlContent.includes('href="https://fluencyai.app"') && m.htmlContent.includes('>fluencyai.app</a>'));
      assert.ok(m.textContent.includes('https://fluencyai.app'));
      assert.ok(m.htmlContent.includes('https://fluencyai.app/privacy') && m.htmlContent.includes('https://fluencyai.app/terms'));
    }
  });
  await test('account email: first name, says the apps are not open yet, and points only to public pages', async () => {
    const m = W.accountWelcome({ name: 'Ann Lee' });
    assert.strictEqual(m.subject, 'Welcome to Fluency AI');
    assert.ok(m.htmlContent.includes('Hi Ann,') && m.htmlContent.includes('While you wait') && m.htmlContent.includes('Browse the exam guides'));
    assert.ok(/not open yet/.test(m.htmlContent) && m.htmlContent.includes('href="https://fluencyai.app/store"') && m.htmlContent.includes('href="https://fluencyai.app/#join"'));
    assert.ok(W.accountWelcome({}).htmlContent.includes('Hi there,'));
    assert.ok(!/Unsubscribe/.test(m.htmlContent), 'a one-off account email has nothing to unsubscribe from');
  });
  await test('partner email: code, hub link, earnings rules, payout line; escapes what people typed', async () => {
    const m = W.partnerWelcome({ name: '<b>Eve</b> X', email: 'e@x.com', code: 'EVE<1>', rate: 0.25 });
    assert.ok(!m.htmlContent.includes('<b>Eve</b>') && !m.htmlContent.includes('EVE<1>'));
    const h = W.partnerWelcome({ name: 'Ann', email: 'ann@example.com', code: 'ANNA', rate: 0.2 }).htmlContent;
    assert.ok(h.includes('ANNA') && h.includes('https://fluencyai.app/partner-hub') && h.includes('ann@example.com'));
    assert.ok(h.includes('20% of the first app subscription payment') && /14-day refund window/.test(h) && /\$20/.test(h) && /reply to this email/i.test(h));
    assert.ok(h.includes('applied to the Fluency AI Partner Program') && !h.includes('joined the Fluency AI waitlist'));
  });
  await test('waitlist email: has the unsubscribe link in the footer', async () => {
    const m = W.waitlistWelcome({ unsubscribeUrl: 'https://fluencyai.app/api/waitlist?unsubscribe=a&t=b' });
    assert.ok(m.htmlContent.includes('Unsubscribe') && m.htmlContent.includes('unsubscribe=a&amp;t=b') && m.htmlContent.includes('joined the Fluency AI waitlist'));
    assert.ok(!W.waitlistWelcome({}).htmlContent.includes('Unsubscribe'));
  });

  await test('sender: all three go out from WELCOME_FROM_ADDRESS, replies to support; fall back to EMAIL_FROM_ADDRESS when it is unset', async () => {
    await W.sendWaitlistWelcome({ to: 'w@x.com', unsubscribeUrl: 'https://u' });
    assert.strictEqual(await partnerEmails.sendDecisionEmail('approve', { name: 'Ann', email: 'ann@example.com', code: 'ANNA', rate: 0.2 }), true);
    accounts.u1 = newAccount(); await W.sendAccountWelcomeOnce(newAccount());
    assert.strictEqual(sent.length, 3);
    for (const b of sent) { assert.strictEqual(b.sender.email, 'welcome@fluencyai.app'); assert.strictEqual(b.replyTo.email, 'support@fluencyai.app'); assert.ok(b.htmlContent.includes('<html') && b.textContent); }
    sent = []; delete process.env.WELCOME_FROM_ADDRESS; await W.sendWaitlistWelcome({ to: 'w@x.com' });
    assert.strictEqual(sent[0].sender.email, 'hello@fluencyai.app');
  });
  await test('declined partner email is unchanged and keeps the normal sender', async () => {
    await partnerEmails.sendDecisionEmail('reject', { name: 'Eve', email: 'e@x.com' });
    assert.strictEqual(sent[0].sender.email, 'hello@fluencyai.app'); assert.ok(sent[0].htmlContent.includes('applied to the Fluency AI Partner Program'));
  });

  await test('account welcome: sends once, then never again for the same account', async () => {
    accounts.u1 = newAccount();
    assert.deepStrictEqual(await W.sendAccountWelcomeOnce(newAccount()), { sent: true });
    assert.strictEqual(sent.length, 1); assert.strictEqual(sent[0].to[0].email, 'ann@example.com'); assert.ok(sent[0].htmlContent.includes('Hi Ann,'));
    assert.ok(accounts.u1.app_metadata.welcome_email_sent_at);
    const again = await W.sendAccountWelcomeOnce(newAccount({ app_metadata: {} })); // a stale copy of the account: the fresh read still stops it
    assert.deepStrictEqual(again, { sent: false, reason: 'already_sent' }); assert.strictEqual(sent.length, 1);
  });
  await test('account welcome: not for unconfirmed, old or anonymous accounts', async () => {
    accounts.u1 = newAccount();
    assert.strictEqual((await W.sendAccountWelcomeOnce(newAccount({ email_confirmed_at: null }))).reason, 'unconfirmed');
    assert.strictEqual((await W.sendAccountWelcomeOnce(newAccount({ created_at: new Date(Date.now() - 10 * 86400000).toISOString() }))).reason, 'not_new');
    assert.strictEqual((await W.sendAccountWelcomeOnce(null)).reason, 'no_user');
    assert.strictEqual(sent.length, 0);
  });
  await test('account welcome: if the email fails the account is released so the next sign-in can try again', async () => {
    accounts.u1 = newAccount(); const f = global.fetch; global.fetch = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    await assert.rejects(() => W.sendAccountWelcomeOnce(newAccount())); global.fetch = f;
    assert.ok(!accounts.u1.app_metadata.welcome_email_sent_at);
    assert.deepStrictEqual(await W.sendAccountWelcomeOnce(newAccount()), { sent: true });
  });

  await test('welcome hook: needs a sign-in, never takes an address from the request, and never fails sign-in', async () => {
    const res = () => { const r = { statusCode: 200, body: undefined }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; return r; };
    let r = res(); await W.welcomeHook({ method: 'GET', headers: {} }, r); assert.strictEqual(r.statusCode, 405);
    r = res(); await W.welcomeHook({ method: 'POST', headers: {}, body: { email: 'victim@x.com' } }, r); assert.strictEqual(r.statusCode, 401); assert.strictEqual(sent.length, 0);
  });
  await test('vercel.json routes /api/welcome-email to the existing activity function', async () => {
    const v = require(path.join(root, 'vercel.json')); const r = v.rewrites.find((x) => x.source === '/api/welcome-email');
    assert.ok(r && r.destination === '/api/track-activity?hook=welcome');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})();
