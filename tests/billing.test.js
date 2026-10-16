// Run with:  node tests/billing.test.js
// Needs nothing installed: Supabase and Creem are replaced by in-memory fakes. Creem event payloads follow the examples
// in Creem's webhook documentation (docs.creem.io). The fake database re-implements the rules of the credit and
// commission SQL functions in JavaScript, so this proves the billing code, not the SQL (scripts/billing_self_test.sql does that).

const Module = require('module');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const fs = require('fs');
const { EventEmitter } = require('events');
const assert = require('assert');

// ---------- fake database ----------
const S = {};
const UID = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
function reset() {
  Object.assign(S, {
    tables: { profiles: [{ id: UID, subscription_status: 'free', referred_by_code: null }], billing_events: [], creators: [{ id: 'cr1', code: 'AMARA20', status: 'active' }], referral_events: [] },
    tokens: { 'user-token': { id: UID, email: 'a@example.com' }, 'admin-token': { id: ADMIN, email: 'boss@example.com' } },
    admins: new Set([ADMIN]),
    credits: new Map(),            // user -> { monthly, monthlyExpires, topup }
    keys: new Map(),               // idempotency key -> true
    commissions: new Map(),        // source_ref -> { user, cents, status }
    commissionUsers: new Set(),    // users who already have an app_subscription commission
    failRpc: null, rpcLog: [],
  });
}
reset();
const bal = (u) => { const c = S.credits.get(u) || { monthly: 0, monthlyExpires: null, topup: 0 }; const m = c.monthlyExpires && new Date(c.monthlyExpires) <= new Date() ? 0 : c.monthly; return { total: m + c.topup, monthly: m, topup: c.topup, expires_at: c.monthlyExpires }; };
const getC = (u) => { if (!S.credits.has(u)) S.credits.set(u, { monthly: 0, monthlyExpires: null, topup: 0 }); return S.credits.get(u); };
const rpcs = {
  fl_rate_limit_hit: () => [{ allowed: true, current_count: 1, retry_after: 0 }],
  fl_credit_set_monthly: (a) => {
    if (a.p_key && S.keys.has(a.p_key)) return [{ duplicate: true, ...bal(a.p_user) }];
    if (a.p_key) S.keys.set(a.p_key, true);
    const c = getC(a.p_user); c.monthly = a.p_amount; c.monthlyExpires = a.p_amount > 0 ? a.p_period_end : null; return [{ duplicate: false, ...bal(a.p_user) }];
  },
  fl_credit_grant: (a) => {
    if (a.p_key && S.keys.has(a.p_key)) return [{ duplicate: true, ...bal(a.p_user) }];
    if (a.p_key) S.keys.set(a.p_key, true);
    getC(a.p_user).topup += a.p_amount; return [{ duplicate: false, ...bal(a.p_user) }];
  },
  fl_credit_revoke: (a) => {
    if (a.p_key && S.keys.has(a.p_key)) return [{ duplicate: true, revoked: 0, ...bal(a.p_user) }];
    if (a.p_key) S.keys.set(a.p_key, true);
    const c = getC(a.p_user); const take = Math.min(c.topup, a.p_amount); c.topup -= take; return [{ duplicate: false, revoked: take, ...bal(a.p_user) }];
  },
  fl_credit_get: (a) => [bal(a.p_user)],
  fl_record_partner_commission: (a) => {
    if (S.commissions.has(a.p_source_ref) || S.commissionUsers.has(a.p_user)) return [{ created: false, reason: 'already_recorded', commission_cents: 0 }];
    S.commissionUsers.add(a.p_user); const cents = Math.round(a.p_gross_cents * 0.2);
    S.commissions.set(a.p_source_ref, { user: a.p_user, cents, status: 'pending', gross: a.p_gross_cents, code: a.p_code, currency: a.p_currency });
    return [{ created: true, reason: 'ok', commission_cents: cents }];
  },
  fl_partner_reverse_commission: (a) => { const c = S.commissions.get(a.p_source_ref); if (!c) return 'not_found'; if (c.status === 'paid') return 'already_paid'; c.status = 'reversed'; return 'reversed'; },
};
function table(name) {
  const rows = S.tables[name] || (S.tables[name] = []);
  const st = { op: 'select', filters: [], inF: null, payload: null, lim: null };
  const match = (r) => st.filters.every(([k, v]) => r[k] === v) && (!st.inF || st.inF[1].includes(r[st.inF[0]]));
  async function exec(single, strict) {
    if (name === 'profiles' && st.op === 'select' && st.filters.length === 1 && st.filters[0][0] === 'id' && S.admins.has(st.filters[0][1]) && !rows.some((r) => r.id === st.filters[0][1])) return { data: { role: 'admin' }, error: null };
    if (st.op === 'insert') {
      const pk = name === 'billing_events' ? 'event_id' : null;
      if (pk && rows.some((r) => r[pk] === st.payload[pk])) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      const row = { outcome: name === 'billing_events' ? 'received' : undefined, received_at: new Date().toISOString(), ...st.payload }; rows.push(row); return { data: single ? { ...row } : null, error: null };
    }
    if (st.op === 'update') { rows.filter(match).forEach((r) => Object.assign(r, st.payload)); return { data: null, error: null }; }
    let out = rows.filter(match); if (st.lim) out = out.slice(0, st.lim);
    if (single) { if (!out.length) return strict ? { data: null, error: { message: 'no rows' } } : { data: null, error: null }; return { data: out[0], error: null }; }
    return { data: out, error: null };
  }
  const api = { select() { return api; }, insert(p) { st.op = 'insert'; st.payload = p; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; },
    eq(k, v) { st.filters.push([k, v]); return api; }, in(k, v) { st.inF = [k, v]; return api; }, order() { return api; }, limit(n) { st.lim = n; return api; },
    single: () => exec(true, true), maybeSingle: () => exec(true, false), then: (res, rej) => exec(false).then(res, rej) };
  return api;
}
const fakeClient = {
  auth: { async getUser(token) { const u = S.tokens[token]; return u ? { data: { user: u }, error: null } : { data: null, error: { status: 401, message: 'bad jwt' } }; } },
  async rpc(name, args) { S.rpcLog.push(name); if (S.failRpc === name) return { data: null, error: { message: 'db down' } }; const out = rpcs[name](args); return { data: out, error: null }; },
  from: table,
};
const origLoad = Module._load;
Module._load = function (request) { if (request === '@supabase/supabase-js') return { createClient: () => fakeClient }; return origLoad.apply(this, arguments); };
const root = path.join(__dirname, '..');
const load = (p) => require(path.join(root, p));

// ---------- helpers ----------
const SECRET = 'whsec_test';
const PROD = { plus: 'prod_plus', t5: 'prod_t5', t10: 'prod_t10', t20: 'prod_t20', founding: 'prod_found', weekly: 'prod_week' };
function env() {
  for (const k of Object.keys(process.env)) if (/^(CREEM_|PLUS_|ALLOW_TOPUP)/.test(k)) delete process.env[k];
  Object.assign(process.env, { SUPABASE_URL: 'http://fake', SUPABASE_SERVICE_ROLE_KEY: 'fake', CREEM_WEBHOOK_SECRET: SECRET, CREEM_API_KEY: 'creem_test_x', APP_SUCCESS_URL: 'https://fluencyai.app/ok',
    CREEM_PRODUCT_PLUS: PROD.plus, CREEM_PRODUCT_TOPUP_5: PROD.t5, CREEM_PRODUCT_TOPUP_10: PROD.t10, CREEM_PRODUCT_TOPUP_20: PROD.t20, CREEM_PRODUCT_FOUNDING: PROD.founding, CREEM_PRODUCT_WEEKLY: PROD.weekly });
}
function mockRes() { const r = { headers: {}, statusCode: 200, body: undefined }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.send = (b) => { r.body = b; return r; }; r.end = () => r; return r; }
function rawReq(body, headers = {}, method = 'POST') {
  const req = new EventEmitter(); req.method = method; req.headers = headers;
  process.nextTick(() => { if (body !== undefined) req.emit('data', body); req.emit('end'); }); return req;
}
const sign = (raw, secret = SECRET) => crypto.createHmac('sha256', secret).update(raw).digest('hex');
let evtSeq = 0;
const EV = (eventType, object, id) => ({ id: id || `evt_${++evtSeq}`, eventType, created_at: 1728734325927, object });
const START = '2026-10-12T11:58:38.000Z', END = '2026-11-12T11:58:38.000Z';
const subPaid = (o = {}) => ({ id: 'sub_1', object: 'subscription', status: 'active', product: { id: PROD.plus, name: 'Fluency Plus', price: 1200, currency: 'USD', billing_type: 'recurring', billing_period: 'every-month' },
  customer: { id: 'cust_1', email: 'a@example.com' }, last_transaction_id: 'tran_1', last_transaction_date: START, current_period_start_date: START, current_period_end_date: END, canceled_at: null, metadata: { supabase_user_id: UID }, ...o });
const checkoutSub = (o = {}) => ({ id: 'ch_1', object: 'checkout', status: 'completed', order: { id: 'ord_1', customer: 'cust_1', product: PROD.plus, amount: 1200, currency: 'USD', status: 'paid', type: 'recurring' }, product: { id: PROD.plus, name: 'Fluency Plus' },
  customer: { id: 'cust_1', email: 'a@example.com' }, subscription: { id: 'sub_1', object: 'subscription', status: 'active', metadata: { supabase_user_id: UID } }, metadata: { supabase_user_id: UID }, ...o });
const checkoutTopup = (pid, o = {}) => ({ id: 'ch_2', object: 'checkout', status: 'completed', order: { id: 'ord_t1', customer: 'cust_1', product: pid, amount: 1000, currency: 'USD', status: 'paid', type: 'onetime' }, product: { id: pid, name: 'Top-up' },
  customer: { id: 'cust_1', email: 'a@example.com' }, metadata: { supabase_user_id: UID }, ...o });
const refund = (o = {}) => ({ id: 'ref_1', object: 'refund', status: 'succeeded', refund_amount: 1200, refund_currency: 'USD', reason: 'requested_by_customer', transaction: { id: 'tran_1', amount: 1200, amount_paid: 1200, status: 'refunded' },
  subscription: { id: 'sub_1', status: 'canceled' }, customer: { id: 'cust_1', email: 'a@example.com' }, ...o });

let passed = 0, failed = 0;
async function test(name, fn) { reset(); env(); try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); } }

(async () => {
  const webhook = load('api/creem-webhook.js');
  const billing = load('api/_lib/billing.js');
  const checkout = load('api/create-checkout-session.js');
  const adminCredits = load('api/_lib/adminCredits.js');
  const adminBilling = load('api/_lib/adminBilling.js');
  const router = load('api/admin/router.js');

  const send = async (event, o = {}) => {
    const raw = o.raw !== undefined ? o.raw : JSON.stringify(event);
    const headers = o.noSig ? {} : { 'creem-signature': o.sig || sign(raw) };
    const res = mockRes(); await webhook(rawReq(raw, headers, o.method), res); return res;
  };
  const profile = () => S.tables.profiles.find((p) => p.id === UID);
  const evRow = (id) => S.tables.billing_events.find((e) => e.event_id === id);

  // ---------------- the door ----------------
  await test('webhook: no secret configured is 503; missing, wrong or forged signature is 400; GET is 405', async () => {
    delete process.env.CREEM_WEBHOOK_SECRET; assert.strictEqual((await send(EV('subscription.paid', subPaid()))).statusCode, 503); env();
    assert.strictEqual((await send(EV('subscription.paid', subPaid()), { noSig: true })).statusCode, 400);
    assert.strictEqual((await send(EV('subscription.paid', subPaid()), { sig: 'abc' })).statusCode, 400);
    assert.strictEqual((await send(EV('subscription.paid', subPaid()), { sig: sign('{}', 'other') })).statusCode, 400);
    assert.strictEqual((await send(null, { method: 'GET' })).statusCode, 405); assert.strictEqual(S.tables.billing_events.length, 0);
  });
  await test('webhook: not JSON, or JSON without an event type, is 400', async () => {
    assert.strictEqual((await send(null, { raw: 'not json' })).statusCode, 400); assert.strictEqual((await send({ hello: 1 })).statusCode, 400);
  });

  // ---------------- Plus ----------------
  await test('Plus: checkout.completed starts the subscription but gives NO credits yet; subscription.paid gives 3,000 until the period end', async () => {
    let r = await send(EV('checkout.completed', checkoutSub()));
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(profile().subscription_status, 'active'); assert.strictEqual(profile().creem_subscription_id, 'sub_1'); assert.strictEqual(profile().creem_customer_id, 'cust_1'); assert.strictEqual(bal(UID).total, 0);
    r = await send(EV('subscription.paid', subPaid()));
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(bal(UID).monthly, 3000); assert.strictEqual(S.credits.get(UID).monthlyExpires, new Date(END).toISOString());
    assert.strictEqual(profile().subscription_period_end, new Date(END).toISOString()); assert.strictEqual(profile().plan_product_id, PROD.plus);
  });
  await test('Plus: a trial starts as "trialing" and the first payment later turns it active with credits', async () => {
    await send(EV('checkout.completed', checkoutSub({ subscription: { id: 'sub_1', status: 'trialing', metadata: { supabase_user_id: UID } }, order: { id: 'ord_1', status: 'paid', amount: 0, currency: 'USD', product: PROD.plus } })));
    assert.strictEqual(profile().subscription_status, 'trialing'); assert.strictEqual(bal(UID).total, 0);
    await send(EV('subscription.paid', subPaid())); assert.strictEqual(profile().subscription_status, 'active'); assert.strictEqual(bal(UID).monthly, 3000);
  });
  await test('Plus: a renewal REPLACES the monthly credits (unused ones do not stack)', async () => {
    await send(EV('subscription.paid', subPaid())); S.credits.get(UID).monthly = 1000; // the person spent 2,000
    await send(EV('subscription.paid', subPaid({ last_transaction_id: 'tran_2', current_period_start_date: END, current_period_end_date: '2026-12-12T11:58:38.000Z' })));
    assert.strictEqual(bal(UID).monthly, 3000); assert.strictEqual(S.credits.get(UID).monthlyExpires, new Date('2026-12-12T11:58:38.000Z').toISOString());
  });
  await test('Plus: the same event twice, and a different event for the same period, give credits once', async () => {
    const e = EV('subscription.paid', subPaid()); await send(e); S.credits.get(UID).monthly = 2500;
    let r = await send(e); assert.strictEqual(r.body.outcome, 'processed'); assert.strictEqual(bal(UID).monthly, 2500); assert.strictEqual(S.tables.billing_events.length, 1);
    await send(EV('subscription.paid', subPaid())); assert.strictEqual(bal(UID).monthly, 2500); // new event id, same subscription + period
  });
  await test('Plus: top-up credits are kept when the monthly allowance is replaced', async () => {
    S.credits.set(UID, { monthly: 100, monthlyExpires: START, topup: 700 }); await send(EV('subscription.paid', subPaid()));
    assert.strictEqual(bal(UID).monthly, 3000); assert.strictEqual(bal(UID).topup, 700);
  });
  await test('PLUS_MONTHLY_CREDITS overrides the allowance', async () => {
    process.env.PLUS_MONTHLY_CREDITS = '4000'; await send(EV('subscription.paid', subPaid())); assert.strictEqual(bal(UID).monthly, 4000);
  });
  await test('an unknown product on a payment is flagged for review and gives nothing', async () => {
    const r = await send(EV('subscription.paid', subPaid({ product: { id: 'prod_mystery', name: 'X', price: 100, currency: 'USD' } })));
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(bal(UID).total, 0); assert.strictEqual(S.tables.billing_events[0].outcome, 'needs_review');
  });

  // ---------------- top-ups ----------------
  await test('top-ups: each pack gives its credits once per order, and they never expire', async () => {
    for (const [pid, credits] of [[PROD.t5, 500], [PROD.t10, 1100], [PROD.t20, 2400]]) {
      reset(); env(); await send(EV('checkout.completed', checkoutTopup(pid)));
      assert.strictEqual(bal(UID).topup, credits, pid); assert.strictEqual(S.credits.get(UID).monthlyExpires, null);
    }
  });
  await test('top-ups: redelivery and a second event for the same order do not add twice', async () => {
    const e = EV('checkout.completed', checkoutTopup(PROD.t10)); await send(e); await send(e); await send(EV('checkout.completed', checkoutTopup(PROD.t10)));
    assert.strictEqual(bal(UID).topup, 1100);
  });
  await test('top-ups: two different orders add up', async () => {
    await send(EV('checkout.completed', checkoutTopup(PROD.t5))); await send(EV('checkout.completed', checkoutTopup(PROD.t5, { order: { id: 'ord_t2', status: 'paid', product: PROD.t5 } })));
    assert.strictEqual(bal(UID).topup, 1000);
  });
  await test('top-ups: an unpaid order, an unknown one-time product, and a checkout without our user id all give nothing and are flagged', async () => {
    await send(EV('checkout.completed', checkoutTopup(PROD.t5, { order: { id: 'o9', status: 'pending', product: PROD.t5 } })));
    await send(EV('checkout.completed', checkoutTopup('prod_mystery')));
    await send(EV('checkout.completed', checkoutTopup(PROD.t5, { metadata: {} })));
    assert.strictEqual(bal(UID).total, 0); assert.deepStrictEqual(S.tables.billing_events.map((e) => e.outcome), ['needs_review', 'needs_review', 'needs_review']);
  });
  await test('legacy lifetime purchase still marks the person active, with no credits and no commission', async () => {
    await send(EV('checkout.completed', checkoutTopup(PROD.founding))); assert.strictEqual(profile().subscription_status, 'active'); assert.strictEqual(profile().subscription_period_end, null); assert.strictEqual(bal(UID).total, 0);
  });

  // ---------------- finding the person ----------------
  await test('a renewal with no metadata finds the person from the saved subscription id', async () => {
    await send(EV('checkout.completed', checkoutSub())); const r = await send(EV('subscription.paid', subPaid({ metadata: {} }))); assert.strictEqual(r.statusCode, 200); assert.strictEqual(bal(UID).monthly, 3000);
  });
  await test('a payment event that arrives before we know the person returns 500 (Creem retries) and works on the retry', async () => {
    const e = EV('subscription.paid', subPaid({ metadata: {} })); let r = await send(e); assert.strictEqual(r.statusCode, 500); assert.strictEqual(evRow(e.id).outcome, 'error'); assert.strictEqual(bal(UID).total, 0);
    await send(EV('checkout.completed', checkoutSub())); r = await send(e); assert.strictEqual(r.statusCode, 200); assert.strictEqual(bal(UID).monthly, 3000); assert.strictEqual(S.tables.billing_events.filter((x) => x.event_id === e.id).length, 1);
  });
  await test('a failure part-way (database error) returns 500, and the retry does not double anything', async () => {
    const e = EV('subscription.paid', subPaid()); S.failRpc = 'fl_credit_set_monthly'; assert.strictEqual((await send(e)).statusCode, 500);
    S.failRpc = null; assert.strictEqual((await send(e)).statusCode, 200); assert.strictEqual(bal(UID).monthly, 3000);
  });

  // ---------------- partner commission ----------------
  const referred = () => { profile().referred_by_code = 'AMARA20'; };
  await test('commission: a referred person\'s first payment earns 20% of the product price, tied to the transaction id', async () => {
    referred(); await send(EV('subscription.paid', subPaid()));
    const c = S.commissions.get('tran_1'); assert.ok(c); assert.strictEqual(c.cents, 240); assert.strictEqual(c.gross, 1200); assert.strictEqual(c.currency, 'usd'); assert.strictEqual(c.code, 'AMARA20');
    assert.strictEqual(S.tables.referral_events.length, 1); assert.strictEqual(S.tables.referral_events[0].amount_cents, 240);
  });
  await test('commission: renewals earn nothing', async () => {
    referred(); await send(EV('subscription.paid', subPaid())); await send(EV('subscription.paid', subPaid({ last_transaction_id: 'tran_2', current_period_start_date: END, current_period_end_date: '2026-12-12T11:58:38.000Z' })));
    assert.strictEqual(S.commissions.size, 1);
  });
  await test('commission: a trial start is not a payment, so the first real payment still earns it', async () => {
    referred(); await send(EV('checkout.completed', checkoutSub({ subscription: { id: 'sub_1', status: 'trialing', metadata: { supabase_user_id: UID } }, order: { id: 'o', status: 'paid', amount: 0, product: PROD.plus } })));
    assert.strictEqual(S.commissions.size, 0); await send(EV('subscription.paid', subPaid())); assert.strictEqual(S.commissions.size, 1);
  });
  await test('commission: a person nobody referred, and top-ups, earn nothing', async () => {
    await send(EV('subscription.paid', subPaid())); referred(); await send(EV('checkout.completed', checkoutTopup(PROD.t20)));
    assert.strictEqual(S.commissions.size, 0);
  });
  await test('commission: a product priced in another currency is flagged, not guessed', async () => {
    referred(); await send(EV('subscription.paid', subPaid({ product: { id: PROD.plus, name: 'Plus', price: 1200, currency: 'EUR' } })));
    assert.strictEqual(S.commissions.size, 0); assert.strictEqual(S.tables.billing_events[0].outcome, 'needs_review'); assert.ok(/EUR/.test(S.tables.billing_events[0].note)); assert.strictEqual(bal(UID).monthly, 3000);
  });
  await test('commission: a failure recording it never blocks the credits (and is flagged)', async () => {
    referred(); S.failRpc = 'fl_record_partner_commission'; const r = await send(EV('subscription.paid', subPaid()));
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(bal(UID).monthly, 3000); assert.strictEqual(S.tables.billing_events[0].outcome, 'needs_review');
  });

  // ---------------- cancel, expire, pause ----------------
  await test('canceled: status becomes canceled with the period end, and the paid-for credits are left alone', async () => {
    await send(EV('subscription.paid', subPaid())); await send(EV('subscription.canceled', subPaid({ status: 'canceled', canceled_at: START })));
    assert.strictEqual(profile().subscription_status, 'canceled'); assert.strictEqual(profile().subscription_period_end, new Date(END).toISOString()); assert.strictEqual(bal(UID).monthly, 3000);
  });
  await test('expired and unpaid: back to free, monthly credits end, top-up credits stay', async () => {
    S.credits.set(UID, { monthly: 900, monthlyExpires: END, topup: 400 }); await send(EV('subscription.expired', subPaid()));
    assert.strictEqual(profile().subscription_status, 'free'); assert.strictEqual(profile().subscription_period_end, null); assert.strictEqual(bal(UID).monthly, 0); assert.strictEqual(bal(UID).topup, 400);
    S.credits.set(UID, { monthly: 900, monthlyExpires: END, topup: 400 }); await send(EV('subscription.unpaid', subPaid())); assert.strictEqual(profile().subscription_status, 'unpaid'); assert.strictEqual(bal(UID).monthly, 0);
  });
  await test('past_due, paused, trialing, active and update set the status', async () => {
    await send(EV('subscription.past_due', subPaid({ status: 'past_due' }))); assert.strictEqual(profile().subscription_status, 'past_due');
    await send(EV('subscription.paused', subPaid({ status: 'paused' }))); assert.strictEqual(profile().subscription_status, 'paused');
    await send(EV('subscription.active', subPaid())); assert.strictEqual(profile().subscription_status, 'active');
    await send(EV('subscription.update', subPaid({ status: 'past_due' }))); assert.strictEqual(profile().subscription_status, 'past_due');
    await send(EV('subscription.trialing', subPaid({ status: 'trialing' }))); assert.strictEqual(profile().subscription_status, 'trialing');
  });
  await test('events we do not use are stored as ignored', async () => {
    const r = await send(EV('subscription.scheduled_cancel', subPaid())); assert.strictEqual(r.statusCode, 200); assert.strictEqual(S.tables.billing_events[0].outcome, 'ignored');
  });

  // ---------------- refunds and disputes ----------------
  await test('full refund of a subscription payment: commission reversed, subscription ended, monthly credits removed, top-up kept', async () => {
    referred(); await send(EV('subscription.paid', subPaid())); S.credits.get(UID).topup = 300;
    const r = await send(EV('refund.created', refund())); assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(S.commissions.get('tran_1').status, 'reversed'); assert.strictEqual(profile().subscription_status, 'free'); assert.strictEqual(bal(UID).monthly, 0); assert.strictEqual(bal(UID).topup, 300);
    assert.strictEqual(S.tables.billing_events.at(-1).outcome, 'processed');
  });
  await test('refund after the commission was already paid out is flagged to recover it', async () => {
    referred(); await send(EV('subscription.paid', subPaid())); S.commissions.get('tran_1').status = 'paid'; await send(EV('refund.created', refund()));
    const row = S.tables.billing_events.at(-1); assert.strictEqual(row.outcome, 'needs_review'); assert.ok(/ALREADY PAID/.test(row.note)); assert.strictEqual(S.commissions.get('tran_1').status, 'paid');
  });
  await test('partial refund changes nothing automatically and is flagged', async () => {
    await send(EV('subscription.paid', subPaid())); await send(EV('refund.created', refund({ refund_amount: 300 })));
    assert.strictEqual(S.tables.billing_events.at(-1).outcome, 'needs_review'); assert.strictEqual(bal(UID).monthly, 3000); assert.strictEqual(profile().subscription_status, 'active');
  });
  await test('refund of a one-time purchase (a top-up) is flagged with instructions, credits untouched', async () => {
    await send(EV('checkout.completed', checkoutTopup(PROD.t5))); await send(EV('refund.created', refund({ subscription: undefined, transaction: { id: 'tran_9', amount: 500, amount_paid: 500 } })));
    const row = S.tables.billing_events.at(-1); assert.strictEqual(row.outcome, 'needs_review'); assert.ok(/negative number/.test(row.note)); assert.strictEqual(bal(UID).topup, 500);
  });
  await test('a refund that did not succeed is ignored', async () => {
    await send(EV('subscription.paid', subPaid())); await send(EV('refund.created', refund({ status: 'failed' }))); assert.strictEqual(S.tables.billing_events.at(-1).outcome, 'ignored'); assert.strictEqual(bal(UID).monthly, 3000);
  });
  await test('a chargeback reverses the commission, ends the monthly credits and always asks for a person', async () => {
    referred(); await send(EV('subscription.paid', subPaid()));
    await send(EV('dispute.created', { id: 'disp_1', object: 'dispute', amount: 1200, currency: 'USD', transaction: { id: 'tran_1', status: 'chargeback' }, subscription: { id: 'sub_1', status: 'active' }, customer: { id: 'cust_1' } }));
    assert.strictEqual(S.commissions.get('tran_1').status, 'reversed'); assert.strictEqual(bal(UID).monthly, 0); assert.strictEqual(S.tables.billing_events.at(-1).outcome, 'needs_review');
  });

  // ---------------- checkout sessions ----------------
  let creemCall = null; let creemFail = false;
  global.fetch = async (url, init) => { creemCall = { url: String(url), body: JSON.parse(init.body), headers: init.headers }; return creemFail ? { ok: false, json: async () => ({ message: 'no' }) } : { ok: true, json: async () => ({ checkout_url: 'https://creem.example/pay' }) }; };
  const co = async (body, headers = { authorization: 'Bearer user-token' }) => { creemCall = null; const res = mockRes(); await checkout({ method: 'POST', body, headers, query: {} }, res); return res; };

  await test('checkout: Plus needs a sign-in, then uses the Plus product and the verified user id (a different userId in the body is ignored)', async () => {
    assert.strictEqual((await co({ plan: 'plus' }, {})).statusCode, 401); assert.strictEqual(creemCall, null);
    const r = await co({ plan: 'plus', userId: 'someone-else', email: 'x@y.z' });
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.url, 'https://creem.example/pay'); assert.strictEqual(creemCall.body.product_id, PROD.plus);
    assert.strictEqual(creemCall.body.metadata.supabase_user_id, UID); assert.strictEqual(creemCall.body.metadata.plan, 'plus'); assert.strictEqual(creemCall.body.customer.email, 'a@example.com');
    assert.ok(creemCall.url.startsWith('https://test-api.creem.io'));
  });
  await test('checkout: Plus is refused while already subscribed', async () => {
    profile().subscription_status = 'active'; const r = await co({ plan: 'plus' }); assert.strictEqual(r.statusCode, 409); assert.strictEqual(r.body.code, 'already_subscribed'); assert.strictEqual(creemCall, null);
    profile().subscription_status = 'trialing'; assert.strictEqual((await co({ plan: 'plus' })).statusCode, 409);
    profile().subscription_status = 'canceled'; assert.strictEqual((await co({ plan: 'plus' })).statusCode, 200);
  });
  await test('checkout: a top-up needs an active Plus (unless ALLOW_TOPUP_WITHOUT_PLUS=true) and picks the right product', async () => {
    let r = await co({ plan: 'topup10' }); assert.strictEqual(r.statusCode, 403); assert.strictEqual(r.body.code, 'plus_required');
    profile().subscription_status = 'active'; for (const [plan, pid] of [['topup5', PROD.t5], ['topup10', PROD.t10], ['topup20', PROD.t20]]) { r = await co({ plan }); assert.strictEqual(r.statusCode, 200); assert.strictEqual(creemCall.body.product_id, pid); }
    profile().subscription_status = 'free'; process.env.ALLOW_TOPUP_WITHOUT_PLUS = 'true'; assert.strictEqual((await co({ plan: 'topup5' })).statusCode, 200);
  });
  await test('checkout: unknown plan is 400, a missing product variable is 503, a Creem failure is 502, and a bad token is refused', async () => {
    assert.strictEqual((await co({ plan: 'banana' })).statusCode, 400);
    delete process.env.CREEM_PRODUCT_PLUS; assert.strictEqual((await co({ plan: 'plus' })).statusCode, 503); env();
    creemFail = true; assert.strictEqual((await co({ plan: 'plus' })).statusCode, 502); creemFail = false;
    assert.strictEqual((await co({ plan: 'plus' }, { authorization: 'Bearer nope' })).statusCode, 401);
  });
  await test('checkout: legacy plans still work with a body userId, and no plan means the old weekly default', async () => {
    let r = await co({ plan: 'founding', userId: UID }, {}); assert.strictEqual(r.statusCode, 200); assert.strictEqual(creemCall.body.product_id, PROD.founding);
    r = await co({ userId: UID }, {}); assert.strictEqual(r.statusCode, 200); assert.strictEqual(creemCall.body.product_id, PROD.weekly);
    assert.strictEqual((await co({ plan: 'weekly' }, {})).statusCode, 400); // no userId at all
  });
  await test('checkout: only our own site may be a redirect target', async () => {
    await co({ plan: 'plus', successUrl: 'https://evil.example/x' }); assert.strictEqual(creemCall.body.success_url, 'https://fluencyai.app/ok');
    await co({ plan: 'plus', successUrl: 'https://fluencyai.app/thanks' }); assert.strictEqual(creemCall.body.success_url, 'https://fluencyai.app/thanks');
  });

  // ---------------- catalog stays in step with the site ----------------
  await test('catalog: Plus credits and the top-up packs match site/fluency-data.js (what the Pricing page promises)', async () => {
    const w = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'site/fluency-data.js'), 'utf8'), { window: w, document: {}, localStorage: {}, console });
    const D = w.FluencyData; const plus = D.PLANS.find((p) => p.id === 'plus'); assert.strictEqual(billing.plusCredits(), plus.credits);
    const packs = { topup5: 'p5', topup10: 'p10', topup20: 'p20' };
    for (const pack of billing.TOPUP_PACKS) { const t = D.TOPUPS.find((x) => x.id === packs[pack.id]); assert.ok(t, pack.id); assert.strictEqual(pack.credits, t.credits, pack.id); assert.strictEqual(pack.usd, t.price, pack.id); }
  });

  // ---------------- admin ----------------
  const auth = () => ({ supabase: fakeClient, user: S.tokens['admin-token'] });
  const adm = async (fn, req) => { const res = mockRes(); await fn(auth(), req, res); return res; };
  await test('admin: a negative credits entry takes top-up credits back, never below zero, never monthly credits, and not twice', async () => {
    S.credits.set(UID, { monthly: 500, monthlyExpires: '2099-01-01T00:00:00.000Z', topup: 300 });
    let r = await adm(adminCredits.handleCreditsRevoke, { method: 'POST', body: { userId: UID, amount: 200, note: 'refunded top-up', idempotencyKey: 'k1' }, query: {} });
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.revoked, 200); assert.strictEqual(bal(UID).topup, 100);
    r = await adm(adminCredits.handleCreditsRevoke, { method: 'POST', body: { userId: UID, amount: 200, idempotencyKey: 'k1' }, query: {} }); assert.strictEqual(r.body.duplicate, true); assert.strictEqual(bal(UID).topup, 100);
    r = await adm(adminCredits.handleCreditsRevoke, { method: 'POST', body: { userId: UID, amount: 5000, idempotencyKey: 'k2' }, query: {} }); assert.strictEqual(r.body.revoked, 100); assert.strictEqual(bal(UID).topup, 0); assert.strictEqual(bal(UID).monthly, 500);
    assert.strictEqual((await adm(adminCredits.handleCreditsRevoke, { method: 'POST', body: { userId: UID, amount: 0 }, query: {} })).statusCode, 400);
    assert.strictEqual((await adm(adminCredits.handleCreditsRevoke, { method: 'POST', body: { userId: 'x', amount: 5 }, query: {} })).statusCode, 400);
  });
  await test('admin: billing events list (needs attention by default), single event with raw payload, and Done', async () => {
    await send(EV('subscription.paid', subPaid())); await send(EV('refund.created', refund({ subscription: undefined, transaction: { id: 'tran_9', amount: 500, amount_paid: 500 } })));
    let r = await adm(adminBilling.handleBillingEvents, { method: 'GET', query: {} }); assert.strictEqual(r.body.events.length, 1); assert.strictEqual(r.body.events[0].event_type, 'refund.created');
    r = await adm(adminBilling.handleBillingEvents, { method: 'GET', query: { status: 'all' } }); assert.strictEqual(r.body.events.length, 2);
    const id = S.tables.billing_events.at(-1).event_id; r = await adm(adminBilling.handleBillingEvents, { method: 'GET', query: { id } }); assert.strictEqual(r.body.event.raw.eventType, 'refund.created');
    r = await adm(adminBilling.handleBillingEventResolve, { method: 'POST', body: { eventId: id, note: 'took 500 credits back' }, query: {} }); assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(evRow(id).outcome, 'processed'); assert.ok(/boss@example.com/.test(evRow(id).note));
    r = await adm(adminBilling.handleBillingEventResolve, { method: 'POST', body: { eventId: id }, query: {} }); assert.strictEqual(r.statusCode, 409);
    assert.strictEqual((await adm(adminBilling.handleBillingEventResolve, { method: 'POST', body: { eventId: 'nope' }, query: {} })).statusCode, 404);
  });
  await test('admin router: credits-revoke and billing routes work for an admin and are refused for everyone else', async () => {
    await send(EV('subscription.paid', subPaid({ product: { id: 'prod_mystery', price: 1, currency: 'USD' } })));
    let res = mockRes(); await router({ method: 'GET', headers: { authorization: 'Bearer admin-token' }, query: { path: ['billing-events'] } }, res); assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.events.length, 1);
    res = mockRes(); await router({ method: 'POST', headers: { authorization: 'Bearer admin-token' }, query: { path: ['credits-revoke'] }, body: { userId: UID, amount: 1 } }, res); assert.strictEqual(res.statusCode, 200);
    res = mockRes(); await router({ method: 'GET', headers: { authorization: 'Bearer user-token' }, query: { path: ['billing-events'] } }, res); assert.strictEqual(res.statusCode, 403);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
