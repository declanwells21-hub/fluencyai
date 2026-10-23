// Run with:  node tests/compliance.test.js
// Needs nothing installed: Supabase, Creem, Brevo and Deepgram are in-memory fakes. This proves the API code (who may export or
// delete, the order things happen in, what stops a deletion, the unsubscribe links). It does NOT run the SQL:
// scripts/compliance_self_test.sql does that on your real Supabase.

const Module = require('module');
const path = require('path');
const assert = require('assert');

// ---------- fake database ----------
const S = {};
const UID = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
function reset() {
  Object.assign(S, {
    tokens: { 'user-token': { id: UID, email: 'ada@example.com' }, 'admin-token': { id: ADMIN, email: 'boss@example.com' } },
    admins: new Set([ADMIN]),
    t: { profiles: [{ id: UID, subscription_status: 'free', creem_subscription_id: null }], account_requests: [], creators: [], partner_commissions: [],
         waitlist_signups: [{ id: 1, email: 'ada@example.com', unsubscribed_at: null, notified_at: null }, { id: 2, email: 'bob@example.com', unsubscribed_at: null, notified_at: null }, { id: 3, email: 'cy@example.com', unsubscribed_at: '2026-10-01', notified_at: null }] },
    calls: [], failRpc: null, failDeleteUser: false, missingUnsubColumn: false, fetchLog: [], creemStatus: 200,
  });
}
reset();
const rpcs = {
  fl_rate_limit_hit: () => [{ allowed: true, current_count: 1, retry_after: 0 }],
  fl_export_user_data: (a) => (a.p_user === UID ? { exported_at: 'now', account: { id: UID, email: 'ada@example.com' } } : null),
  fl_delete_user_data: () => ({ waitlist_removed: 1 }),
};
function table(name) {
  const rows = S.t[name] || (S.t[name] = []);
  const st = { op: 'select', f: [], payload: null, lim: null };
  const match = (r) => st.f.every(([kind, k, v]) => (kind === 'eq' ? r[k] === v : kind === 'is' ? (v === null ? r[k] === null || r[k] === undefined : r[k] === v) : kind === 'gte' ? String(r[k]) >= String(v) : true));
  async function exec(single, strict) {
    if (name === 'profiles' && st.op === 'select' && st.f[0] && st.f[0][1] === 'id' && S.admins.has(st.f[0][2]) && !rows.some((r) => r.id === st.f[0][2])) return { data: { role: 'admin' }, error: null };
    if (S.missingUnsubColumn && name === 'waitlist_signups' && JSON.stringify(st).includes('unsubscribed_at') ) return { data: null, error: { message: 'column waitlist_signups.unsubscribed_at does not exist' } };
    if (st.op === 'insert') { rows.push({ id: rows.length + 1, created_at: new Date().toISOString(), ...st.payload }); return { data: null, error: null }; }
    if (st.op === 'update') { rows.filter(match).forEach((r) => Object.assign(r, st.payload)); return { data: null, error: null }; }
    if (st.op === 'delete') { for (let i = rows.length - 1; i >= 0; i--) if (match(rows[i])) rows.splice(i, 1); return { data: null, error: null }; }
    let out = rows.filter(match); if (st.lim) out = out.slice(0, st.lim);
    if (single) return out.length ? { data: out[0], error: null } : strict ? { data: null, error: { message: 'no rows' } } : { data: null, error: null };
    return { data: out, error: null };
  }
  const api = {
    select() { return api; }, insert(p) { st.op = 'insert'; st.payload = p; return api; }, update(p) { st.op = 'update'; st.payload = p; return api; }, delete() { st.op = 'delete'; return api; },
    eq(k, v) { st.f.push(['eq', k, v]); return api; }, is(k, v) { st.f.push(['is', k, v]); return api; }, gte(k, v) { st.f.push(['gte', k, v]); return api; }, in() { return api; },
    order() { return api; }, limit(n) { st.lim = n; return api; },
    single: () => exec(true, true), maybeSingle: () => exec(true, false), then: (res, rej) => exec(false).then(res, rej),
  };
  return api;
}
const fakeClient = {
  auth: { async getUser(token) { const u = S.tokens[token]; return u ? { data: { user: u }, error: null } : { data: null, error: { status: 401, message: 'bad jwt' } }; },
          admin: { async deleteUser(id) { S.calls.push('deleteUser'); return S.failDeleteUser ? { error: { message: 'auth down' } } : { error: null }; } } },
  async rpc(name, args) { S.calls.push(name); if (S.failRpc === name) return { data: null, error: { message: 'db down' } }; return { data: rpcs[name](args), error: null }; },
  from: table,
};
const origLoad = Module._load;
Module._load = function (request) { if (request === '@supabase/supabase-js') return { createClient: () => fakeClient }; return origLoad.apply(this, arguments); };
const root = path.join(__dirname, '..');
const load = (p) => require(path.join(root, p));

global.fetch = async (url, init = {}) => {
  S.fetchLog.push({ url: String(url), init });
  if (/creem\.io/.test(url)) { S.calls.push('creemCancel'); return { ok: S.creemStatus < 300, status: S.creemStatus, json: async () => ({}) }; }
  if (/brevo\.com/.test(url)) return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
  if (/deepgram\.com\/v1\/listen/.test(url)) return { ok: true, status: 200, json: async () => ({ results: { channels: [{ alternatives: [{ transcript: 'hola' }] }] } }) };
  if (/deepgram\.com\/v1\/speak/.test(url)) return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1]).buffer };
  return { ok: true, status: 200, json: async () => ({}) };
};
function mockRes() { const r = { headers: {}, statusCode: 200, body: undefined }; r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; }; r.status = (c) => { r.statusCode = c; return r; }; r.json = (b) => { r.body = b; return r; }; r.send = (b) => { r.body = b; return r; }; r.end = () => r; return r; }
const bearer = (t) => ({ authorization: 'Bearer ' + t, 'x-forwarded-for': '7.7.7.7' });
const post = (body, token = 'user-token') => ({ method: 'POST', body, headers: token ? bearer(token) : { 'x-forwarded-for': '7.7.7.7' }, query: { hook: 'account' } });

let passed = 0, failed = 0;
async function test(name, fn) {
  reset();
  for (const k of ['CREEM_API_KEY', 'DEEPGRAM_MIP_OPT_OUT', 'UNSUBSCRIBE_SECRET', 'BREVO_API_KEY', 'EMAIL_FROM_ADDRESS', 'SITE_URL']) delete process.env[k];
  Object.assign(process.env, { SUPABASE_URL: 'http://fake', SUPABASE_SERVICE_ROLE_KEY: 'service-key-for-tests', CREEM_API_KEY: 'creem_test_abc', BREVO_API_KEY: 'k', EMAIL_FROM_ADDRESS: 'welcome@fluencyai.app', DEEPGRAM_API_KEY: 'k', CLAUDE_API_KEY: 'k', AI_RATE_LIMIT: 'off' });
  try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
}
const makeSub = (status = 'active') => { S.t.profiles[0].subscription_status = status; S.t.profiles[0].creem_subscription_id = 'sub_9'; };

(async () => {
  const account = load('api/_lib/account.js');
  const checkout = load('api/create-checkout-session.js');
  const router = load('api/admin/router.js');
  const waitlist = load('api/waitlist.js');
  const unsub = load('api/_lib/waitlistUnsub.js');
  const stt = load('api/stt.js'), tts = load('api/tts.js');
  const run = async (req) => { const res = mockRes(); await checkout(req, res); return res; };

  // ---------------- download my data ----------------
  await test('export: needs a sign-in, and the file is for the signed-in person only', async () => {
    assert.strictEqual((await run(post({ action: 'export' }, null))).statusCode, 401);
    const r = await run(post({ action: 'export', userId: 'someone-else' }));
    assert.strictEqual(r.statusCode, 200); assert.ok(/attachment/.test(r.headers['content-disposition'])); assert.strictEqual(JSON.parse(r.body).account.id, UID);
    assert.strictEqual(r.headers['cache-control'], 'no-store');
  });
  await test('export: asking again within five minutes is refused, and each export leaves an audit row', async () => {
    await run(post({ action: 'export' })); const r = await run(post({ action: 'export' }));
    assert.strictEqual(r.statusCode, 429); assert.strictEqual(S.t.account_requests.length, 1); assert.strictEqual(S.t.account_requests[0].kind, 'export');
  });
  await test('account endpoint: OPTIONS is answered, GET is refused, unknown actions are 400', async () => {
    assert.strictEqual((await run({ method: 'OPTIONS', headers: {}, query: { hook: 'account' } })).statusCode, 204);
    assert.strictEqual((await run({ method: 'GET', headers: bearer('user-token'), query: { hook: 'account' } })).statusCode, 405);
    assert.strictEqual((await run(post({ action: 'nope' }))).statusCode, 400);
  });
  await test('vercel.json rewrites /api/account to the checkout function with the account hook', async () => {
    const v = require(path.join(root, 'vercel.json')); const r = v.rewrites.find((x) => x.source === '/api/account'); assert.ok(r); assert.strictEqual(r.destination, '/api/create-checkout-session?hook=account');
  });

  // ---------------- delete my account ----------------
  await test('delete: needs a sign-in and the word DELETE', async () => {
    assert.strictEqual((await run(post({ action: 'delete', confirm: 'DELETE' }, null))).statusCode, 401);
    let r = await run(post({ action: 'delete' })); assert.strictEqual(r.statusCode, 400); assert.strictEqual(r.body.code, 'confirm_required');
    r = await run(post({ action: 'delete', confirm: 'delete' })); assert.strictEqual(r.statusCode, 400); assert.strictEqual(S.calls.includes('deleteUser'), false);
  });
  await test('delete: removes the data first, then the login, then records that it happened without recording who', async () => {
    const r = await run(post({ action: 'delete', confirm: 'DELETE' })); assert.strictEqual(r.statusCode, 200);
    const order = S.calls.filter((c) => ['fl_delete_user_data', 'deleteUser'].includes(c)); assert.deepStrictEqual(order, ['fl_delete_user_data', 'deleteUser']);
    const audit = S.t.account_requests.at(-1); assert.strictEqual(audit.kind, 'delete'); assert.strictEqual(audit.user_id, null); assert.strictEqual(audit.actor, 'self');
    assert.ok(!S.fetchLog.some((f) => /creem/.test(f.url)), 'no billing call for someone without a subscription');
  });
  await test('delete: an active subscription is cancelled at Creem immediately, BEFORE anything is deleted', async () => {
    makeSub('active'); const r = await run(post({ action: 'delete', confirm: 'DELETE' })); assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.subscriptionCanceled, true);
    const call = S.fetchLog.find((f) => /creem/.test(f.url)); assert.strictEqual(call.url, 'https://test-api.creem.io/v1/subscriptions/sub_9/cancel');
    assert.strictEqual(call.init.headers['x-api-key'], 'creem_test_abc'); assert.deepStrictEqual(JSON.parse(call.init.body), { mode: 'immediate' });
    assert.deepStrictEqual(S.calls.filter((c) => ['creemCancel', 'fl_delete_user_data', 'deleteUser'].includes(c)), ['creemCancel', 'fl_delete_user_data', 'deleteUser']);
  });
  await test('delete: the live Creem host is used with a live key; statuses that cannot bill are not cancelled', async () => {
    process.env.CREEM_API_KEY = 'creem_live_abc'; makeSub('trialing'); await run(post({ action: 'delete', confirm: 'DELETE' }));
    assert.ok(S.fetchLog.find((f) => /creem/.test(f.url)).url.startsWith('https://api.creem.io/'));
    reset(); makeSub('canceled'); await run(post({ action: 'delete', confirm: 'DELETE' })); assert.ok(!S.fetchLog.some((f) => /creem/.test(f.url)));
  });
  await test('delete: if the subscription cannot be cancelled NOTHING is deleted (Creem error, missing key, network failure)', async () => {
    makeSub('active'); S.creemStatus = 500; let r = await run(post({ action: 'delete', confirm: 'DELETE' }));
    assert.strictEqual(r.statusCode, 502); assert.strictEqual(r.body.code, 'billing_unavailable'); assert.ok(!S.calls.includes('fl_delete_user_data') && !S.calls.includes('deleteUser'));
    S.creemStatus = 200; delete process.env.CREEM_API_KEY; r = await run(post({ action: 'delete', confirm: 'DELETE' })); assert.strictEqual(r.statusCode, 503); assert.ok(!S.calls.includes('deleteUser'));
  });
  await test('delete: Creem not knowing the subscription any more (404) does not block the deletion', async () => {
    makeSub('active'); S.creemStatus = 404; const r = await run(post({ action: 'delete', confirm: 'DELETE' })); assert.strictEqual(r.statusCode, 200); assert.strictEqual(r.body.subscriptionCanceled, false); assert.ok(S.calls.includes('deleteUser'));
  });
  await test('delete: a partner with unpaid earnings is told to settle first, and nothing is deleted', async () => {
    S.t.creators.push({ id: 'cr1', user_id: UID }); S.t.partner_commissions.push({ creator_id: 'cr1', status: 'pending', commission_cents: 240 }, { creator_id: 'cr1', status: 'paid', commission_cents: 999 });
    const r = await run(post({ action: 'delete', confirm: 'DELETE' })); assert.strictEqual(r.statusCode, 409); assert.strictEqual(r.body.code, 'partner_balance'); assert.ok(!S.calls.includes('deleteUser'));
  });
  await test('delete: a partner with nothing unpaid (all paid or reversed) can delete', async () => {
    S.t.creators.push({ id: 'cr1', user_id: UID }); S.t.partner_commissions.push({ creator_id: 'cr1', status: 'paid', commission_cents: 240 }, { creator_id: 'cr1', status: 'reversed', commission_cents: 90 });
    assert.strictEqual((await run(post({ action: 'delete', confirm: 'DELETE' }))).statusCode, 200);
  });
  await test('delete: if removing the data fails the login is NOT deleted; if the login cannot be deleted the person is told', async () => {
    S.failRpc = 'fl_delete_user_data'; let r = await run(post({ action: 'delete', confirm: 'DELETE' })); assert.strictEqual(r.statusCode, 500); assert.ok(!S.calls.includes('deleteUser'));
    S.failRpc = null; S.failDeleteUser = true; r = await run(post({ action: 'delete', confirm: 'DELETE' })); assert.strictEqual(r.statusCode, 500); assert.ok(/login could not be deleted/.test(r.body.error)); assert.strictEqual(S.t.account_requests.filter((a) => a.kind === 'delete').length, 0);
  });

  // ---------------- admin ----------------
  const adm = async (method, route, o = {}) => { const res = mockRes(); await router({ method, headers: bearer(o.token || 'admin-token'), query: { path: [route], ...(o.query || {}) }, body: o.body }, res); return res; };
  await test('admin: delete-user uses the same full deletion (billing cancelled, data removed, login deleted) and records the actor', async () => {
    makeSub('active'); const r = await adm('POST', 'delete-user', { body: { userId: UID } }); assert.strictEqual(r.statusCode, 200);
    assert.deepStrictEqual(S.calls.filter((c) => ['creemCancel', 'fl_delete_user_data', 'deleteUser'].includes(c)), ['creemCancel', 'fl_delete_user_data', 'deleteUser']); assert.strictEqual(S.t.account_requests.at(-1).actor, 'admin');
  });
  await test('admin: delete-user refuses unpaid partner earnings unless force is set, refuses your own account, and non-admins get 403', async () => {
    S.t.creators.push({ id: 'cr1', user_id: UID }); S.t.partner_commissions.push({ creator_id: 'cr1', status: 'pending', commission_cents: 240 });
    assert.strictEqual((await adm('POST', 'delete-user', { body: { userId: UID } })).statusCode, 409);
    assert.strictEqual((await adm('POST', 'delete-user', { body: { userId: UID, force: true } })).statusCode, 200);
    assert.strictEqual((await adm('POST', 'delete-user', { body: { userId: ADMIN } })).statusCode, 400);
    assert.strictEqual((await adm('POST', 'delete-user', { body: { userId: UID }, token: 'user-token' })).statusCode, 403);
  });
  await test('admin: user-export returns the file for a data request that came by email, and records it', async () => {
    const r = await adm('GET', 'user-export', { query: { userId: UID } }); assert.strictEqual(r.statusCode, 200); assert.strictEqual(JSON.parse(r.body).account.email, 'ada@example.com'); assert.strictEqual(S.t.account_requests.at(-1).actor, 'admin');
    assert.strictEqual((await adm('GET', 'user-export', { query: { userId: 'bad' } })).statusCode, 400);
    assert.strictEqual((await adm('GET', 'user-export', { query: { userId: '99999999-9999-4999-8999-999999999999' } })).statusCode, 404);
    assert.strictEqual((await adm('GET', 'user-export', { query: { userId: UID }, token: 'user-token' })).statusCode, 403);
  });

  // ---------------- waitlist: unsubscribe ----------------
  const wl = (body) => ({ method: 'POST', body, headers: { 'x-forwarded-for': '8.8.8.8' }, query: {} });
  const brevoCalls = () => S.fetchLog.filter((f) => /brevo/.test(f.url)).map((f) => JSON.parse(f.init.body));
  await test('waitlist: the confirmation email carries a personal unsubscribe link in its footer and a List-Unsubscribe header', async () => {
    const res = mockRes(); await waitlist(wl({ email: 'new@example.com', source: 'home_waitlist' }), res); assert.strictEqual(res.statusCode, 200);
    const mail = brevoCalls()[0]; const url = unsub.unsubscribeUrl('new@example.com');
    assert.ok(mail.htmlContent.includes('>Unsubscribe</a>') && mail.htmlContent.includes(url.replace(/&/g, '&amp;')), 'footer link'); assert.strictEqual(mail.headers['List-Unsubscribe'], `<${url}>`);
  });
  await test('unsubscribe link: a valid link stops the emails, a forged or someone else\'s link does not, and the page never reveals who is on the list', async () => {
    const u = new URL(unsub.unsubscribeUrl('bob@example.com'));
    let res = mockRes(); await waitlist({ method: 'GET', headers: {}, query: { unsubscribe: 'bob@example.com', t: u.searchParams.get('t') } }, res);
    assert.strictEqual(res.statusCode, 200); assert.ok(/unsubscribed/i.test(res.body)); assert.ok(S.t.waitlist_signups.find((r) => r.email === 'bob@example.com').unsubscribed_at);
    res = mockRes(); await waitlist({ method: 'GET', headers: {}, query: { unsubscribe: 'ada@example.com', t: u.searchParams.get('t') } }, res); assert.strictEqual(res.statusCode, 400); assert.strictEqual(S.t.waitlist_signups.find((r) => r.email === 'ada@example.com').unsubscribed_at, null);
    res = mockRes(); await waitlist({ method: 'GET', headers: {}, query: { unsubscribe: 'ada@example.com', t: 'x' } }, res); assert.strictEqual(res.statusCode, 400);
    res = mockRes(); await waitlist({ method: 'GET', headers: {}, query: { unsubscribe: 'nobody@example.com', t: unsub.token('nobody@example.com') } }, res); assert.strictEqual(res.statusCode, 200);
  });
  await test('unsubscribe link: if the unsubscribe column is not there yet the address is removed instead (still stops the emails)', async () => {
    S.missingUnsubColumn = true; const res = mockRes(); await waitlist({ method: 'GET', headers: {}, query: { unsubscribe: 'bob@example.com', t: unsub.token('bob@example.com') } }, res);
    assert.strictEqual(res.statusCode, 200); assert.ok(!S.t.waitlist_signups.some((r) => r.email === 'bob@example.com'));
  });
  await test('waitlist: signing up again lifts an earlier unsubscribe (a fresh request for launch news)', async () => {
    const res = mockRes(); await waitlist(wl({ email: 'cy@example.com', source: 'home_waitlist' }), res); assert.strictEqual(res.statusCode, 200); assert.strictEqual(S.t.waitlist_signups.find((r) => r.email === 'cy@example.com').unsubscribed_at, null);
  });
  await test('unsubscribe tokens: depend on UNSUBSCRIBE_SECRET, differ per address, and without any key no link is made', async () => {
    const a = unsub.token('x@example.com'); process.env.UNSUBSCRIBE_SECRET = 'other'; assert.notStrictEqual(unsub.token('x@example.com'), a); assert.notStrictEqual(unsub.token('y@example.com'), unsub.token('x@example.com'));
    assert.strictEqual(unsub.token('X@Example.com'), unsub.token('x@example.com'));
    delete process.env.UNSUBSCRIBE_SECRET; delete process.env.SUPABASE_SERVICE_ROLE_KEY; assert.strictEqual(unsub.unsubscribeUrl('x@example.com'), null); assert.strictEqual(unsub.verify('x@example.com', 'abc'), false);
  });
  await test('launch email: skips people who unsubscribed, gives everyone else their own link, and refuses if the column is missing', async () => {
    S.t.waitlist_signups.push({ id: 4, email: 'dee@example.com', unsubscribed_at: null, notified_at: '2026-10-02' });
    const run2 = async () => { const res = mockRes(); await router({ method: 'POST', headers: bearer('admin-token'), query: { path: ['waitlist-notify-launch'] }, body: { iosUrl: 'https://apps.apple.com/x' } }, res); return res; };
    const res = await run2(); assert.strictEqual(res.statusCode, 200); const mails = brevoCalls(); const to = mails.map((m) => m.to[0].email).sort();
    assert.deepStrictEqual(to, ['ada@example.com', 'bob@example.com']); assert.ok(mails.every((m) => m.htmlContent.includes('>Unsubscribe</a>') && m.headers['List-Unsubscribe'].includes(encodeURIComponent(m.to[0].email))));
    reset(); S.missingUnsubColumn = true; const bad = await run2(); assert.strictEqual(bad.statusCode, 500); assert.ok(bad.body.error && !/\.sql/.test(bad.body.error)); assert.strictEqual(brevoCalls().length, 0);
  });

  // ---------------- speech providers keep nothing ----------------
  const wav = Buffer.alloc(44 + 32000);
  await test('speech: Deepgram requests opt out of model improvement by default, to match the Privacy Policy', async () => {
    await stt({ method: 'POST', body: wav, query: { language: 'es' }, headers: {} }, mockRes()); await tts({ method: 'POST', body: { text: 'hola', targetLanguage: 'es' }, headers: {}, query: {} }, mockRes());
    const dg = S.fetchLog.filter((f) => /deepgram/.test(f.url)); assert.ok(dg.length >= 1 && dg.every((f) => f.url.includes('mip_opt_out=true')), dg.map((f) => f.url));
  });
  await test('speech: the opt-out can be switched off deliberately (DEEPGRAM_MIP_OPT_OUT=false)', async () => {
    process.env.DEEPGRAM_MIP_OPT_OUT = 'false'; await stt({ method: 'POST', body: wav, query: { language: 'es' }, headers: {} }, mockRes());
    assert.ok(S.fetchLog.filter((f) => /deepgram/.test(f.url)).every((f) => !f.url.includes('mip_opt_out')));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
