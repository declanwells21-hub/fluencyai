// Run with:  node tests/partner_hub.test.js
// Covers the Partner Program backend code: the accepted / declined emails, the admin partner tools, the approval
// endpoint, the click beacon, and the billing webhook's commission hook. Supabase and the email provider are
// replaced by in-memory fakes (no network, keys or database). The SQL is tested separately on a real PostgreSQL.

const Module = require('module');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const { Readable } = require('stream');

// ---------- a small in-memory Supabase ----------
const db = { tables: {}, calls: [], rpcCalls: [], rpcResult: {}, failures: {}, users: {} };
function resetDb() {
  db.tables = { profiles: [{ id: 'admin-1', role: 'admin' }, { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', referred_by_code: 'ANNA' }, { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2' }], creators: [], creator_applications: [], referral_events: [] };
  db.calls = []; db.rpcCalls = []; db.rpcResult = {}; db.failures = {};
  db.users = { 'admin-token': { id: 'admin-1', email: 'boss@example.com' } };
}
let idCounter = 0;
function fakeClient() {
  return {
    auth: { async getUser(token) { const u = db.users[token]; return u ? { data: { user: u }, error: null } : { data: null, error: { status: 401, message: 'bad' } }; } },
    async rpc(name, args) {
      db.rpcCalls.push({ name, args });
      if (name === 'fl_rate_limit_hit') return { data: [{ allowed: true, current_count: 1, retry_after: 60 }], error: null };
      if (db.failures['rpc:' + name]) return { data: null, error: { message: db.failures['rpc:' + name] } };
      return { data: db.rpcResult[name] !== undefined ? db.rpcResult[name] : null, error: null };
    },
    from(name) {
      const q = { op: 'select', filters: [], payload: null, one: false };
      const rows = () => (db.tables[name] = db.tables[name] || []);
      const exec = async () => {
        db.calls.push({ table: name, op: q.op, payload: q.payload, filters: q.filters.length });
        if (db.failures[name + '.' + q.op]) return { data: null, error: { message: db.failures[name + '.' + q.op] } };
        const hit = rows().filter((r) => q.filters.every((f) => f(r)));
        if (q.op === 'insert') { const row = { id: 'id-' + ++idCounter, ...q.payload }; rows().push(row); return { data: q.one ? row : null, error: null }; }
        if (q.op === 'update') { hit.forEach((r) => Object.assign(r, q.payload)); return { data: null, error: null }; }
        return { data: q.one ? hit[0] || null : hit, error: null };
      };
      q.select = () => q; q.order = () => q; q.limit = () => q;
      q.eq = (k, v) => { q.filters.push((r) => r[k] === v); return q; };
      q.ilike = (k, v) => { const rx = new RegExp('^' + String(v).replace(/\\_/g, '_').replace(/%/g, '.*') + '$', 'i'); q.filters.push((r) => rx.test(r[k] || '')); return q; };
      q.insert = (p) => { q.op = 'insert'; q.payload = p; return q; };
      q.update = (p) => { q.op = 'update'; q.payload = p; return q; };
      q.maybeSingle = () => { q.one = true; return exec(); };
      q.single = () => { q.one = true; return exec(); };
      q.then = (a, b) => exec().then(a, b);
      return q;
    },
  };
}
const origLoad = Module._load;
Module._load = function (request) { return request === '@supabase/supabase-js' ? { createClient: () => fakeClient() } : origLoad.apply(this, arguments); };
process.env.SUPABASE_URL = 'http://fake'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

// ---------- fake email provider ----------
const realFetch = global.fetch; let sent = []; let emailFails = false;
function fakeBrevo() { global.fetch = async (url, opts) => { sent.push({ url, body: JSON.parse(opts.body), headers: opts.headers }); return emailFails ? { ok: false, status: 500, text: async () => 'down' } : { ok: true, json: async () => ({ messageId: 'm1' }) }; }; }

const root = path.join(__dirname, '..'); const load = (p) => require(path.join(root, p));
function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k] = v; }; res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; }; res.send = (b) => { res.body = b; return res; }; res.end = () => res;
  return res;
}
const mockReq = (o = {}) => ({ method: 'POST', body: {}, query: {}, ...o, headers: { 'x-forwarded-for': '9.9.9.9', ...(o.headers || {}) } });

let passed = 0, failed = 0;
async function test(name, fn) {
  resetDb(); sent = []; emailFails = false; global.fetch = realFetch; fakeBrevo();
  process.env.BREVO_API_KEY = 'key'; process.env.EMAIL_FROM_ADDRESS = 'hello@fluencyai.app';
  try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.message)); }
}
const UID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

(async () => {
  const emails = load('api/_lib/partnerEmails.js');
  const { sendBrandedEmail } = load('api/_lib/emailTemplate.js');
  const adminPartners = load('api/_lib/adminPartners.js');
  const auth = () => ({ user: { id: 'admin-1', email: 'boss@example.com' }, supabase: fakeClient() });

  // ---------- emails ----------
  await test('accepted email: has the code, the hub link, the rules and asks for payout details', async () => {
    const m = emails.acceptedEmail({ name: 'Ann Partner', email: 'ann@example.com', code: 'ANNA', rate: 0.2 });
    assert.ok(/Hi Ann,/.test(m.textBody)); assert.ok(m.textBody.includes('Your partner code: ANNA'));
    assert.ok(m.textBody.includes('https://fluencyai.app/partner-hub') && m.textBody.includes('ann@example.com'));
    assert.ok(m.textBody.includes('20% of the first app subscription payment') && m.textBody.includes('20% of every exam blueprint'));
    assert.ok(/14-day refund window/.test(m.textBody) && /\$20/.test(m.textBody) && /reply to this email/i.test(m.textBody));
    assert.ok(/You're in/.test(m.subject) && /Partner Program/.test(m.subject));
  });
  await test('accepted email uses the partner\'s own rate', async () => {
    assert.ok(emails.acceptedEmail({ name: 'B', email: 'b@x.com', code: 'BB', rate: 0.3 }).textBody.includes('30% of the first'));
  });
  await test('declined email is kind, and has no code or money terms', async () => {
    const m = emails.declinedEmail({ name: 'Eve Smith' });
    assert.ok(m.textBody.includes('Hi Eve,') && /apply again/.test(m.textBody) && !/commission|code/i.test(m.textBody));
  });
  await test('sendDecisionEmail sends through the provider with the partner footer, not the waitlist one', async () => {
    assert.strictEqual(await emails.sendDecisionEmail('approve', { name: 'Ann', email: 'ann@example.com', code: 'ANNA', rate: 0.2 }), true);
    assert.strictEqual(sent.length, 1); assert.strictEqual(sent[0].body.to[0].email, 'ann@example.com');
    assert.ok(sent[0].body.htmlContent.includes('applied to the Fluency AI Partner Program'));
    assert.ok(!sent[0].body.htmlContent.includes('joined the Fluency AI waitlist'));
  });
  await test('the waitlist email footer is unchanged when no footer note is given', async () => {
    await sendBrandedEmail({ to: 'w@example.com', subject: 'Hi', textBody: 'Hello' });
    assert.ok(sent[0].body.htmlContent.includes('joined the Fluency AI waitlist'));
  });
  await test('a failing email provider never throws; it just reports false', async () => {
    emailFails = true; assert.strictEqual(await emails.sendDecisionEmail('reject', { name: 'E', email: 'e@x.com' }), false);
    delete process.env.BREVO_API_KEY; assert.strictEqual(await emails.sendDecisionEmail('reject', { name: 'E', email: 'e@x.com' }), false);
  });

  // ---------- approval endpoint ----------
  const router = load('api/admin/router.js');
  const decide = async (decision, extra = {}) => { const res = mockRes(); await router(mockReq({ headers: { authorization: 'Bearer admin-token' }, query: { path: ['application-decide'] }, body: { applicationId: 'app1', decision, ...extra } }), res); return res; };
  const seedApp = () => db.tables.creator_applications.push({ id: 'app1', name: 'Dee Lee', email: 'dee@example.com', platform: 'TikTok', handle: '@dee', country: 'KE', niche: 'German', status: 'pending' });

  await test('approving creates the partner, emails them their code, and records that it was sent', async () => {
    seedApp(); const res = await decide('approve');
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.emailed, true);
    const creator = db.tables.creators[0]; assert.ok(creator.code); assert.strictEqual(creator.contact_email, 'dee@example.com');
    assert.strictEqual(sent.length, 1); assert.ok(sent[0].body.htmlContent.includes(creator.code));
    assert.ok(creator.welcome_email_sent_at, 'welcome_email_sent_at recorded');
    assert.strictEqual(db.tables.creator_applications[0].status, 'approved');
  });
  await test('approving still works when the email fails, and says so (nothing is marked as sent)', async () => {
    seedApp(); emailFails = true; const res = await decide('approve');
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.emailed, false);
    assert.strictEqual(db.tables.creators.length, 1); assert.ok(!db.tables.creators[0].welcome_email_sent_at);
  });
  await test('rejecting sends the decline email and creates no partner', async () => {
    seedApp(); const res = await decide('reject');
    assert.strictEqual(res.body.emailed, true); assert.strictEqual(db.tables.creators.length, 0); assert.strictEqual(db.tables.creator_applications[0].status, 'rejected');
    assert.ok(/not able to offer/.test(sent[0].body.htmlContent));
  });
  await test('an application cannot be decided twice (so nobody gets a second email)', async () => {
    seedApp(); await decide('approve'); sent = []; const res = await decide('approve');
    assert.strictEqual(res.statusCode, 400); assert.strictEqual(sent.length, 0);
  });

  // ---------- admin partner tools ----------
  await test('partner-balances returns the list and the $20 minimum', async () => {
    db.rpcResult.fl_admin_partner_balances = [{ id: UID, name: 'Ann', payable_cents: 2500 }];
    const res = mockRes(); await adminPartners.handlePartnerBalances(auth(), mockReq(), res);
    assert.strictEqual(res.body.partners.length, 1); assert.strictEqual(res.body.minPayoutCents, 2000);
  });
  await test('partner-payout: validates the id, passes the reference, records who paid, uses the $20 minimum', async () => {
    let res = mockRes(); await adminPartners.handlePartnerPayout(auth(), mockReq({ body: { creatorId: 'nope' } }), res); assert.strictEqual(res.statusCode, 400);
    db.rpcResult.fl_partner_mark_paid = { payout_id: 'p1', amount_cents: 2500, commissions: 3 };
    res = mockRes(); await adminPartners.handlePartnerPayout(auth(), mockReq({ body: { creatorId: UID, reference: '  BANK-1  ', note: 'October' } }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.amount_cents, 2500);
    const a = db.rpcCalls.find((c) => c.name === 'fl_partner_mark_paid').args;
    assert.deepStrictEqual([a.p_reference, a.p_note, a.p_by, a.p_min_cents], ['BANK-1', 'October', 'boss@example.com', 2000]);
  });
  await test('partner-payout: known refusals are explained (400), anything else is a plain 500 with no internals', async () => {
    db.failures['rpc:fl_partner_mark_paid'] = 'below the minimum payout';
    let res = mockRes(); await adminPartners.handlePartnerPayout(auth(), mockReq({ body: { creatorId: UID } }), res);
    assert.strictEqual(res.statusCode, 400); assert.strictEqual(res.body.error, 'below the minimum payout');
    db.failures['rpc:fl_partner_mark_paid'] = 'connection reset by peer at 10.0.0.5';
    res = mockRes(); await adminPartners.handlePartnerPayout(auth(), mockReq({ body: { creatorId: UID } }), res);
    assert.strictEqual(res.statusCode, 500); assert.ok(!/10\.0\.0\.5/.test(res.body.error));
  });
  await test('resend welcome: sends the email and records it; handles unknown partner, no email, and a failing provider', async () => {
    db.tables.creators.push({ id: UID, name: 'Ann Partner', code: 'ANNA', contact_email: 'ann@example.com', commission_rate: 0.2, status: 'active' });
    let res = mockRes(); await adminPartners.handleCreatorResendWelcome(auth(), mockReq({ body: { creatorId: UID } }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(sent.length, 1); assert.ok(db.tables.creators[0].welcome_email_sent_at);
    res = mockRes(); await adminPartners.handleCreatorResendWelcome(auth(), mockReq({ body: { creatorId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' } }), res); assert.strictEqual(res.statusCode, 404);
    db.tables.creators[0].contact_email = ''; res = mockRes(); await adminPartners.handleCreatorResendWelcome(auth(), mockReq({ body: { creatorId: UID } }), res); assert.strictEqual(res.statusCode, 400);
    db.tables.creators[0].contact_email = 'ann@example.com'; delete db.tables.creators[0].welcome_email_sent_at; emailFails = true;
    res = mockRes(); await adminPartners.handleCreatorResendWelcome(auth(), mockReq({ body: { creatorId: UID } }), res);
    assert.strictEqual(res.statusCode, 502); assert.ok(!db.tables.creators[0].welcome_email_sent_at, 'not marked as sent when it failed');
  });
  await test('the new admin routes need an admin (a normal signed-in user gets 403)', async () => {
    db.users['user-token'] = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', email: 'u2@example.com' };
    const res = mockRes(); await router(mockReq({ method: 'GET', headers: { authorization: 'Bearer user-token' }, query: { path: ['partner-balances'] } }), res);
    assert.strictEqual(res.statusCode, 403);
  });

  // ---------- click beacon ----------
  const referral = load('api/referral.js');
  const click = async (code) => { const res = mockRes(); await referral(mockReq({ body: { type: 'click', code } }), res); return res; };
  await test('a click is recorded for the partner whatever case the code arrives in', async () => {
    db.tables.creators.push({ id: UID, code: 'ANNA', status: 'active' });
    assert.strictEqual((await click('anna')).statusCode, 200);
    const ev = db.tables.referral_events[0]; assert.strictEqual(ev.creator_id, UID); assert.strictEqual(ev.code, 'ANNA'); assert.strictEqual(ev.event_type, 'click');
  });
  await test('a click for an unknown or paused code records nothing but still answers 200', async () => {
    db.tables.creators.push({ id: UID, code: 'PAUSED', status: 'paused' });
    assert.strictEqual((await click('NOSUCH')).statusCode, 200); assert.strictEqual((await click('PAUSED')).statusCode, 200);
    assert.strictEqual(db.tables.referral_events.length, 0);
  });
  await test('an underscore in a code is not treated as a wildcard', async () => {
    db.tables.creators.push({ id: UID, code: 'ANNA', status: 'active' });
    await click('AN_A'); assert.strictEqual(db.tables.referral_events.length, 0);
  });

  // ---------- billing webhook ----------
  process.env.CREEM_WEBHOOK_SECRET = 'whsec';
  const webhook = load('api/creem-webhook.js');
  const post = async (event, secret = 'whsec') => {
    const raw = Buffer.from(JSON.stringify(event));
    const req = Readable.from([raw]); req.method = 'POST';
    req.headers = { 'creem-signature': crypto.createHmac('sha256', secret).update(raw).digest('hex') };
    const res = mockRes(); await webhook(req, res); return res;
  };
  // Since the billing rework (step 7) the commission is recorded on the first paid subscription payment, not at checkout.
  const checkout = (userId, id = 'evt_1') => ({ id, eventType: 'subscription.paid', object: { id: 's1', object: 'subscription', metadata: { supabase_user_id: userId }, customer: { id: 'c1' },
    product: { id: 'prod_x', name: 'Fluency Plus', price: 1200, currency: 'USD' }, last_transaction_id: 'tran_1', current_period_start_date: '2026-10-12T11:58:38.000Z', current_period_end_date: '2026-11-12T11:58:38.000Z' } });
  const log = console.log; const quiet = () => { console.log = () => {}; }; const loud = () => { console.log = log; };

  await test('billing: a referred person\'s first payment records the commission (once per transaction id)', async () => {
    db.tables.creators.push({ id: UID, code: 'ANNA', commission_rate: 0.2, status: 'active' });
    db.rpcResult.fl_record_partner_commission = [{ created: true, reason: 'ok', commission_cents: 240 }];
    quiet(); const res = await post(checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')); loud();
    assert.strictEqual(res.statusCode, 200);
    const c = db.rpcCalls.find((x) => x.name === 'fl_record_partner_commission'); assert.ok(c, 'commission function called');
    assert.deepStrictEqual([c.args.p_code, c.args.p_kind, c.args.p_user, c.args.p_gross_cents, c.args.p_currency, c.args.p_source_ref], ['ANNA', 'app_subscription', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', 1200, 'usd', 'tran_1']);
    assert.strictEqual(db.tables.referral_events.length, 1, 'the admin dashboard event is still written when a commission is created');
  });
  await test('billing: someone who was not referred earns nobody anything', async () => {
    db.tables.creators.push({ id: UID, code: 'ANNA', commission_rate: 0.2, status: 'active' });
    quiet(); await post(checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2')); loud();
    assert.strictEqual(db.rpcCalls.filter((x) => x.name === 'fl_record_partner_commission').length, 0);
  });
  await test('billing: a commission error never fails the webhook (Creem would retry and double-process)', async () => {
    db.tables.creators.push({ id: UID, code: 'ANNA', commission_rate: 0.2, status: 'active' }); db.failures['rpc:fl_record_partner_commission'] = 'db down';
    const err = console.error; console.error = () => {}; quiet(); const res = await post(checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1')); loud(); console.error = err;
    assert.strictEqual(res.statusCode, 200);
  });
  await test('billing: a forged signature is rejected and nothing is recorded', async () => {
    db.tables.creators.push({ id: UID, code: 'ANNA', commission_rate: 0.2, status: 'active' });
    const err = console.error; console.error = () => {}; const res = await post(checkout('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'), 'wrong-secret'); console.error = err;
    assert.strictEqual(res.statusCode, 400); assert.strictEqual(db.rpcCalls.length, 0);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
