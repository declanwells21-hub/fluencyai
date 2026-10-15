// Run with:  node tests/selar.test.js
// Needs nothing installed: Supabase is replaced by an in-memory fake (including the rules of fl_selar_commission and
// fl_partner_reverse_commission, re-implemented in JavaScript). It proves the receiver and admin code; the SQL itself
// is not run here. Selar's real payload is not known yet, so these tests also cover several plausible shapes.

const Module = require('module');
const path = require('path');
const assert = require('assert');

// ---------- fake database ----------
const S = {};
function reset() {
  Object.assign(S, {
    tokens: { 'admin-token': { id: '22222222-2222-4222-8222-222222222222', email: 'boss@example.com' }, 'user-token': { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com' } },
    admins: new Set(['22222222-2222-4222-8222-222222222222']),
    creators: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', code: 'AMARA20', contact_email: 'amara@example.com', status: 'active' },
               { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', code: 'PAUSED', contact_email: 'p@example.com', status: 'paused' }],
    accounts: [{ id: '33333333-3333-4333-8333-333333333333', email: 'buyer@example.com' }],
    commissions: new Map(), orders: [], rpc: [], seq: 0, failCommission: false, rateLimited: false,
  });
}
reset();

const rpcs = {
  fl_rate_limit_hit: (a) => [{ allowed: !(S.rateLimited && /bad_key/.test(a.p_key)), current_count: 1, retry_after: 60 }],
  fl_selar_commission: (a) => {
    if (S.failCommission) return { error: { message: 'db down' } };
    const c = S.creators.find((x) => x.code.toUpperCase() === String(a.p_code).trim().toUpperCase() && x.status === 'active');
    if (!c) return [{ created: false, reason: 'unknown_or_inactive_code', commission_cents: 0, creator_id: null }];
    if (a.p_buyer_email && a.p_buyer_email.toLowerCase() === c.contact_email.toLowerCase()) return [{ created: false, reason: 'self_referral', commission_cents: 0, creator_id: c.id }];
    if (S.commissions.has(a.p_order_ref)) return [{ created: false, reason: 'already_recorded', commission_cents: 0, creator_id: c.id }];
    const cents = Math.round(a.p_gross_cents * 0.2);
    S.commissions.set(a.p_order_ref, { creator: c.id, cents, status: 'held', product: a.p_product, currency: a.p_currency, gross: a.p_gross_cents });
    return [{ created: true, reason: 'ok', commission_cents: cents, creator_id: c.id }];
  },
  fl_partner_reverse_commission: (a) => {
    const c = S.commissions.get(a.p_source_ref); if (!c) return 'not_found'; if (c.status === 'paid') return 'already_paid'; c.status = 'reversed'; return 'reversed';
  },
};
function table(name) {
  const rows = name === 'selar_orders' ? S.orders : [];
  const st = { op: 'select', filters: [], payload: null, lim: null };
  const match = (r) => st.filters.every(([k, v]) => r[k] === v);
  async function exec(single, strict) {
    if (name === 'profiles') { const id = st.filters[0][1]; return { data: S.admins.has(id) ? { role: 'admin' } : { role: 'user' }, error: null }; }
    if (st.op === 'insert') {
      if (rows.some((r) => r.order_ref === st.payload.order_ref)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
      const row = { id: `00000000-0000-4000-8000-${String(++S.seq).padStart(12, '0')}`, received_at: new Date().toISOString(), status: 'received', note: null, ...st.payload };
      rows.push(row); return { data: single ? { id: row.id } : null, error: null };
    }
    if (st.op === 'update') { rows.filter(match).forEach((r) => Object.assign(r, st.payload)); return { data: null, error: null }; }
    let out = rows.filter(match); if (st.lim) out = out.slice(0, st.lim);
    if (single) { if (out.length === 0) return strict ? { data: null, error: { message: 'no rows' } } : { data: null, error: null }; return { data: out[0], error: null }; }
    return { data: out, error: null };
  }
  const api = {
    select() { return api; }, insert(p) { st.op = 'insert'; st.payload = p; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; },
    eq(k, v) { st.filters.push([k, v]); return api; }, order() { return api; }, limit(n) { st.lim = n; return api; },
    single: () => exec(true, true), maybeSingle: () => exec(true, false), then: (res, rej) => exec(false).then(res, rej),
  };
  return api;
}
const fakeClient = { auth: { async getUser(token) { const u = S.tokens[token]; return u ? { data: { user: u }, error: null } : { data: null, error: { status: 401, message: 'bad jwt' } }; } },
  async rpc(name, args) { S.rpc.push(name); const out = rpcs[name](args); if (out && out.error) return { data: null, error: out.error }; return { data: out, error: null }; }, from: table };
const origLoad = Module._load;
Module._load = function (request) { if (request === '@supabase/supabase-js') return { createClient: () => fakeClient }; return origLoad.apply(this, arguments); };
process.env.SUPABASE_URL = 'http://fake'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
const root = path.join(__dirname, '..');
const load = (p) => require(path.join(root, p));

function mockRes() { const r = { headers: {}, statusCode: 200, body: undefined }; r.setHeader = (k, v) => { r.headers[k] = v; }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.end = () => r; return r; }
const SECRET = 'test-secret-123';
const hook = (body, o = {}) => ({ method: 'POST', body, query: { hook: 'selar', key: SECRET }, headers: { 'x-forwarded-for': '5.5.5.5' }, ...o });
const bearer = (t) => ({ authorization: 'Bearer ' + t });
const GOETHE_B1 = '0008zz6970'; // any known code works; the real list is read from selarProducts.js

let passed = 0, failed = 0;
async function test(name, fn) {
  reset(); process.env.SELAR_WEBHOOK_SECRET = SECRET; delete process.env.SELAR_USD_RATES;
  try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
}
const order = (extra = {}) => ({ order_id: 'ORD-1', customer_email: 'buyer@example.com', customer_name: 'Ada Buyer', product_name: 'Goethe B1 Exam Blueprint', amount: '9.00', currency: 'USD', ...extra });

(async () => {
  const { handleSelarOrder, parseOrder, toUsdCents } = load('api/_lib/selarOrders.js');
  const products = load('api/_lib/selarProducts.js');
  const admin = load('api/_lib/adminSelar.js');
  const router = load('api/admin/router.js');
  const referral = load('api/referral.js');
  const run = async (req) => { const res = mockRes(); await handleSelarOrder(req, res); return res; };

  // ---------- door ----------
  await test('refuses everything when no secret is configured (503)', async () => {
    delete process.env.SELAR_WEBHOOK_SECRET; const r = await run(hook(order({ ref: 'AMARA20' }))); assert.strictEqual(r.statusCode, 503); assert.strictEqual(S.orders.length, 0);
  });
  await test('a wrong or missing key is 401 and nothing is stored', async () => {
    let r = await run(hook(order(), { query: { hook: 'selar', key: 'nope' } })); assert.strictEqual(r.statusCode, 401);
    r = await run(hook(order(), { query: { hook: 'selar' } })); assert.strictEqual(r.statusCode, 401); assert.strictEqual(S.orders.length, 0);
  });
  await test('repeated wrong keys from one address are rate limited (429)', async () => {
    S.rateLimited = true; const r = await run(hook(order(), { query: { hook: 'selar', key: 'nope' } })); assert.strictEqual(r.statusCode, 429);
  });
  await test('the key is also accepted in the x-selar-key header', async () => {
    const r = await run(hook(order({ ref: 'AMARA20' }), { query: { hook: 'selar' }, headers: { 'x-forwarded-for': '5.5.5.5', 'x-selar-key': SECRET } })); assert.strictEqual(r.statusCode, 200);
  });
  await test('an empty body is a 400; only POST, PUT and GET are accepted', async () => {
    assert.strictEqual((await run(hook({}))).statusCode, 400); assert.strictEqual((await run(hook({}, { method: 'DELETE' }))).statusCode, 405);
  });

  // ---------- attribution ----------
  await test('a ref field attributes the sale: stored raw, commission is 20% of the dollar amount', async () => {
    const r = await run(hook(order({ ref: 'amara20' }))); assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.status, 'commission_recorded');
    const o = S.orders[0]; assert.strictEqual(o.partner_code, 'AMARA20'); assert.strictEqual(o.code_source, 'ref'); assert.strictEqual(o.gross_cents_usd, 900); assert.strictEqual(o.commission_cents, 180);
    assert.strictEqual(o.raw.customer_name, 'Ada Buyer'); assert.strictEqual(S.commissions.get('ORD-1').cents, 180);
  });
  await test('a coupon code that equals the partner code attributes the sale', async () => {
    const r = await run(hook(order({ coupon_code: 'AMARA20' }))); assert.strictEqual(r.body.status, 'commission_recorded'); assert.strictEqual(S.orders[0].code_source, 'coupon');
  });
  await test('works with a nested payload (data.customer.email, data.coupon.code style)', async () => {
    const r = await run(hook({ event: 'order.completed', data: { id: 'N-9', customer: { email: 'buyer@example.com', name: 'Ada' }, product: { name: 'TCF Canada NCLC 7' }, amount_paid: 'USD 9', discount_code: 'AMARA20' } }));
    assert.strictEqual(r.body.status, 'commission_recorded'); assert.strictEqual(S.orders[0].buyer_email, 'buyer@example.com'); assert.strictEqual(S.orders[0].gross_cents_usd, 900);
  });
  await test('a ?ref= inside any link in the payload attributes the sale', async () => {
    const r = await run(hook(order({ page_url: 'https://selar.com/abc123?ref=AMARA20&x=1' }))); assert.strictEqual(r.body.status, 'commission_recorded'); assert.strictEqual(S.orders[0].code_source, 'url');
  });
  await test('the first code that belongs to a real partner wins (a junk ref does not block a good coupon)', async () => {
    const r = await run(hook(order({ ref: 'NOBODY', coupon_code: 'AMARA20' }))); assert.strictEqual(r.body.status, 'commission_recorded'); assert.strictEqual(S.orders[0].code_source, 'coupon');
  });
  await test('no partner code at all: kept as unattributed, no commission is created', async () => {
    const r = await run(hook(order())); assert.strictEqual(r.body.status, 'unattributed'); assert.strictEqual(S.commissions.size, 0); assert.ok(!S.rpc.includes('fl_selar_commission'));
  });
  await test('an unknown or paused partner code is unattributed, with the code in the note', async () => {
    let r = await run(hook(order({ ref: 'NOBODY' }))); assert.strictEqual(r.body.status, 'unattributed'); assert.ok(/NOBODY/.test(S.orders[0].note));
    r = await run(hook(order({ order_id: 'ORD-2', ref: 'PAUSED' }))); assert.strictEqual(r.body.status, 'unattributed');
  });
  await test('a numeric discount value is never mistaken for a partner code', async () => {
    const r = await run(hook(order({ discount: '20' }))); assert.strictEqual(r.body.status, 'unattributed'); assert.ok(!S.rpc.includes('fl_selar_commission'));
  });
  await test('a partner buying with their own code gets no commission (self referral)', async () => {
    const r = await run(hook(order({ customer_email: 'Amara@Example.com', ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'self_referral'); assert.strictEqual(S.commissions.size, 0);
  });

  // ---------- money ----------
  await test('a non-dollar order is converted with SELAR_USD_RATES and the rate is kept', async () => {
    process.env.SELAR_USD_RATES = '{"NGN":0.00065}';
    const r = await run(hook(order({ amount: '14000', currency: 'NGN', ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'commission_recorded');
    assert.strictEqual(S.orders[0].gross_cents_usd, 910); assert.strictEqual(S.orders[0].fx_rate, 0.00065); assert.strictEqual(S.commissions.get('ORD-1').currency, 'usd');
  });
  await test('a non-dollar order with no rate waits as needs_review and pays nothing', async () => {
    const r = await run(hook(order({ amount: '14000', currency: 'NGN', ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'needs_review');
    assert.ok(/SELAR_USD_RATES/.test(S.orders[0].note)); assert.strictEqual(S.orders[0].partner_code, 'AMARA20'); assert.strictEqual(S.commissions.size, 0);
  });
  await test('an amount far above the list price needs review (wrong currency or rate)', async () => {
    const p = products[0]; const r = await run(hook(order({ product_name: p.full, amount: String(p.usd * 100), currency: 'USD', ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'needs_review'); assert.strictEqual(S.commissions.size, 0);
  });
  await test('currency written inside the amount ("₦14,000", "$9") is understood', async () => {
    process.env.SELAR_USD_RATES = '{"NGN":0.00065}';
    let r = await run(hook(order({ amount: '₦14,000.00', currency: undefined, ref: 'AMARA20' }))); assert.strictEqual(S.orders[0].currency, 'NGN'); assert.strictEqual(S.orders[0].gross_cents_usd, 910);
    r = await run(hook(order({ order_id: 'ORD-2', amount: '$9', currency: undefined, ref: 'AMARA20' }))); assert.strictEqual(S.orders[1].gross_cents_usd, 900);
  });
  await test('a zero-amount order is ignored', async () => {
    const r = await run(hook(order({ amount: '0', ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'ignored'); assert.strictEqual(S.commissions.size, 0);
  });
  await test('toUsdCents: guards', async () => {
    assert.ok(toUsdCents(null, 'USD').problem); assert.ok(toUsdCents(5, null).problem); assert.strictEqual(toUsdCents(5, 'usd').cents, 500); assert.ok(toUsdCents(5, 'XYZ').problem);
  });

  // ---------- products ----------
  await test('the product is recognised by its Selar code anywhere in the payload', async () => {
    const p = products[3]; await run(hook(order({ product_name: 'something unrecognisable', link: `https://selar.com/${p.code}`, ref: 'AMARA20' })));
    assert.strictEqual(S.orders[0].product_code, p.code); assert.strictEqual(S.orders[0].product_name, p.full || p.name);
  });
  await test('the product is recognised by name when there is no code', async () => {
    const p = products.find((x) => x.id === 'tcf-nclc7') || products[5]; await run(hook(order({ product_name: `${p.name} (PDF)`, ref: 'AMARA20' }))); assert.strictEqual(S.orders[0].product_code, p.code);
  });

  // ---------- retries, refunds, odd statuses ----------
  await test('the same order delivered twice records one commission and says duplicate', async () => {
    await run(hook(order({ ref: 'AMARA20' }))); const r = await run(hook(order({ ref: 'AMARA20' })));
    assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.duplicate, true); assert.strictEqual(S.orders.length, 1); assert.strictEqual(S.rpc.filter((n) => n === 'fl_selar_commission').length, 1);
  });
  await test('an order whose processing failed is processed again when Selar retries', async () => {
    S.failCommission = true; let r = await run(hook(order({ ref: 'AMARA20' }))); assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.status, 'error'); assert.strictEqual(S.orders[0].status, 'error');
    S.failCommission = false; r = await run(hook(order({ ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'commission_recorded'); assert.strictEqual(S.orders.length, 1);
  });
  await test('a refund reverses the commission and marks the order refunded', async () => {
    await run(hook(order({ ref: 'AMARA20' }))); const r = await run(hook(order({ status: 'refunded' })));
    assert.strictEqual(r.body.status, 'refunded'); assert.strictEqual(S.commissions.get('ORD-1').status, 'reversed'); assert.strictEqual(S.orders[0].status, 'refunded'); assert.strictEqual(S.orders.length, 1);
  });
  await test('a refund after the commission was already paid says so, and does not claw back by itself', async () => {
    await run(hook(order({ ref: 'AMARA20' }))); S.commissions.get('ORD-1').status = 'paid'; const r = await run(hook(order({ event: 'order.refunded' })));
    assert.strictEqual(r.body.status, 'refunded'); assert.ok(/already paid/i.test(S.orders[0].note)); assert.strictEqual(S.commissions.get('ORD-1').status, 'paid');
  });
  await test('a refund for an order we never saw is stored, not lost', async () => {
    const r = await run(hook(order({ order_id: 'GHOST', status: 'refunded' }))); assert.strictEqual(r.statusCode, 200); assert.strictEqual(S.orders[0].status, 'refunded');
  });
  await test('a pending or failed payment is stored but earns nothing', async () => {
    let r = await run(hook(order({ status: 'pending', ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'ignored');
    r = await run(hook(order({ order_id: 'ORD-2', payment_status: 'Failed', ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'ignored'); assert.strictEqual(S.commissions.size, 0);
  });
  await test('a "successful" status is treated as paid', async () => {
    const r = await run(hook(order({ status: 'successful', ref: 'AMARA20' }))); assert.strictEqual(r.body.status, 'commission_recorded');
  });

  // ---------- body shapes ----------
  await test('a form-encoded string body and a JSON string body both work', async () => {
    let r = await run(hook('order_id=F-1&customer_email=buyer%40example.com&product_name=Goethe+B1&amount=9&currency=USD&ref=AMARA20')); assert.strictEqual(r.body.status, 'commission_recorded');
    r = await run(hook(JSON.stringify(order({ order_id: 'J-1', ref: 'AMARA20' })))); assert.strictEqual(r.body.status, 'commission_recorded');
  });
  await test('GET with the order in the query string works, and the key is not stored as data', async () => {
    const r = await run({ method: 'GET', body: undefined, headers: { 'x-forwarded-for': '5.5.5.5' }, query: { hook: 'selar', key: SECRET, ...order({ ref: 'AMARA20' }) } });
    assert.strictEqual(r.body.status, 'commission_recorded'); assert.ok(!('key' in S.orders[0].raw) && !('hook' in S.orders[0].raw));
  });
  await test('without any order id the body is hashed so a repeat is still caught', async () => {
    const body = { customer_email: 'buyer@example.com', product_name: 'Goethe B1', amount: '9', currency: 'USD', ref: 'AMARA20' };
    const a = parseOrder(body), b = parseOrder({ ...body }); assert.ok(a.orderRef.startsWith('hash:')); assert.strictEqual(a.orderRef, b.orderRef);
    await run(hook(body)); const r = await run(hook({ ...body })); assert.strictEqual(r.body.duplicate, true);
  });
  await test('a huge payload is stored truncated rather than rejected', async () => {
    const r = await run(hook(order({ ref: 'AMARA20', blob: 'x'.repeat(60000) }))); assert.strictEqual(r.statusCode, 200); assert.strictEqual(S.orders[0].raw.truncated, true);
  });

  // ---------- through the real entry point ----------
  await test('/api/selar-order reaches the receiver through api/referral.js, and normal referral traffic is unchanged', async () => {
    let res = mockRes(); await referral(hook(order({ ref: 'AMARA20' })), res); assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.status, 'commission_recorded');
    res = mockRes(); await referral({ method: 'GET', query: {}, body: {}, headers: {} }, res); assert.strictEqual(res.statusCode, 405);
  });
  await test('vercel.json rewrites /api/selar-order to the referral function', async () => {
    const v = require(path.join(root, 'vercel.json')); const r = v.rewrites.find((x) => x.source === '/api/selar-order'); assert.ok(r); assert.strictEqual(r.destination, '/api/referral?hook=selar');
  });

  // ---------- admin ----------
  const aReq = (o = {}) => ({ method: 'POST', headers: bearer('admin-token'), query: {}, body: {}, ...o });
  const auth = { supabase: fakeClient, user: S.tokens['admin-token'] };
  const adm = async (fn, req) => { const res = mockRes(); await fn(auth, req, res); return res; };

  await test('admin list: newest orders without the raw payload; one order with it', async () => {
    await run(hook(order({ ref: 'AMARA20' }))); S.orders[0].raw.secret_note = 'visible only on the single view';
    const list = await adm(admin.handleSelarOrders, aReq({ method: 'GET' })); assert.strictEqual(list.body.orders.length, 1);
    const one = await adm(admin.handleSelarOrders, aReq({ method: 'GET', query: { id: S.orders[0].id } })); assert.strictEqual(one.body.order.raw.secret_note, 'visible only on the single view');
    assert.strictEqual((await adm(admin.handleSelarOrders, aReq({ method: 'GET', query: { id: 'bad' } }))).statusCode, 400);
  });
  await test('admin attribute: an unattributed order is given to a partner and earns its commission', async () => {
    await run(hook(order())); assert.strictEqual(S.orders[0].status, 'unattributed');
    // it has a dollar amount already (9.00 USD), so no amount is needed
    const res = await adm(admin.handleSelarOrderAttribute, aReq({ body: { orderId: S.orders[0].id, code: 'amara20' } }));
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(S.orders[0].status, 'commission_recorded'); assert.strictEqual(S.orders[0].code_source, 'admin'); assert.strictEqual(S.orders[0].commission_cents, 180);
    assert.ok(/boss@example.com/.test(S.orders[0].note));
  });
  await test('admin attribute: an order waiting for a dollar amount needs one, and rejects nonsense', async () => {
    await run(hook(order({ amount: '14000', currency: 'NGN' }))); const id = S.orders[0].id;
    assert.strictEqual((await adm(admin.handleSelarOrderAttribute, aReq({ body: { orderId: id, code: 'AMARA20' } }))).statusCode, 400);
    assert.strictEqual((await adm(admin.handleSelarOrderAttribute, aReq({ body: { orderId: id, code: 'AMARA20', usdAmount: -3 } }))).statusCode, 400);
    const res = await adm(admin.handleSelarOrderAttribute, aReq({ body: { orderId: id, code: 'AMARA20', usdAmount: 9.5 } }));
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(S.orders[0].gross_cents_usd, 950); assert.strictEqual(S.commissions.get('ORD-1').cents, 190);
  });
  await test('admin attribute: an unknown code is a 404 and changes nothing; an already-settled order is a 409; a bad code format is a 400', async () => {
    await run(hook(order())); const id = S.orders[0].id;
    let res = await adm(admin.handleSelarOrderAttribute, aReq({ body: { orderId: id, code: 'NOBODY' } })); assert.strictEqual(res.statusCode, 404); assert.strictEqual(S.orders[0].status, 'unattributed');
    assert.strictEqual((await adm(admin.handleSelarOrderAttribute, aReq({ body: { orderId: id, code: 'a b' } }))).statusCode, 400);
    await adm(admin.handleSelarOrderAttribute, aReq({ body: { orderId: id, code: 'AMARA20' } }));
    res = await adm(admin.handleSelarOrderAttribute, aReq({ body: { orderId: id, code: 'AMARA20' } })); assert.strictEqual(res.statusCode, 409);
  });
  await test('admin refund: reverses the commission by hand and cannot be done twice', async () => {
    await run(hook(order({ ref: 'AMARA20' }))); const id = S.orders[0].id;
    let res = await adm(admin.handleSelarOrderRefund, aReq({ body: { orderId: id } })); assert.strictEqual(res.statusCode, 200); assert.strictEqual(S.commissions.get('ORD-1').status, 'reversed'); assert.strictEqual(S.orders[0].status, 'refunded');
    res = await adm(admin.handleSelarOrderRefund, aReq({ body: { orderId: id } })); assert.strictEqual(res.statusCode, 409);
  });
  await test('admin router: the three routes work for an admin and are refused for everyone else', async () => {
    await run(hook(order()));
    let res = mockRes(); await router({ method: 'GET', headers: bearer('admin-token'), query: { path: ['selar-orders'] } }, res); assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.orders.length, 1);
    res = mockRes(); await router({ method: 'POST', headers: bearer('admin-token'), query: { path: ['selar-order-attribute'] }, body: { orderId: S.orders[0].id, code: 'AMARA20' } }, res); assert.strictEqual(res.statusCode, 200);
    res = mockRes(); await router({ method: 'POST', headers: bearer('admin-token'), query: { path: ['selar-order-refund'] }, body: { orderId: S.orders[0].id } }, res); assert.strictEqual(res.statusCode, 200);
    res = mockRes(); await router({ method: 'GET', headers: bearer('user-token'), query: { path: ['selar-orders'] } }, res); assert.strictEqual(res.statusCode, 403);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
