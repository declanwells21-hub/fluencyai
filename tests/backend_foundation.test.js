// Run with:  node tests/backend_foundation.test.js
// Needs nothing installed: Supabase is replaced by a small in-memory fake, so no network, keys or database are touched.

const Module = require('module');
const path = require('path');
const assert = require('assert');

// ---------- in-memory fake of the parts of @supabase/supabase-js the API uses ----------
const state = {
  tokens: { 'good-token': { id: 'user-1', email: 'a@example.com' }, 'other-token': { id: 'user-2', email: 'b@example.com' } },
  authOutage: false,
  getUserCalls: 0,
  rateLimitRpcError: false,
  counters: new Map(),
  tables: { waitlist_signups: [], partner_interest: [], creator_applications: [] },
  missingColumns: false,
};
function resetState() {
  state.authOutage = false; state.getUserCalls = 0; state.rateLimitRpcError = false; state.counters = new Map();
  state.tables = { waitlist_signups: [], partner_interest: [], creator_applications: [] }; state.missingColumns = false;
}

function fakeClient() {
  return {
    auth: {
      async getUser(token) {
        state.getUserCalls++;
        if (state.authOutage) return { data: null, error: { status: 500, message: 'down' } };
        const user = state.tokens[token];
        return user ? { data: { user }, error: null } : { data: null, error: { status: 401, message: 'bad jwt' } };
      },
    },
    async rpc(name, args) {
      assert.strictEqual(name, 'fl_rate_limit_hit');
      if (state.rateLimitRpcError) return { data: null, error: { message: 'rpc failed' } };
      const now = Date.now(); const win = args.p_window_seconds * 1000;
      let c = state.counters.get(args.p_key);
      if (!c || c.start <= now - win) c = { start: now, count: 0 };
      c.count++; state.counters.set(args.p_key, c);
      return { data: [{ allowed: c.count <= args.p_max, current_count: c.count, retry_after: Math.max(0, Math.ceil((c.start + win - now) / 1000)) }], error: null };
    },
    from(table) {
      const rows = state.tables[table];
      const q = { _filters: [] };
      q.select = () => q; q.eq = (k, v) => { q._filters.push([k, v]); return q; };
      q.maybeSingle = async () => ({ data: rows.find((r) => q._filters.every(([k, v]) => r[k] === v)) || null, error: null });
      q.update = () => ({ eq: async () => ({ error: null }) });
      q.insert = async (row) => {
        if (state.missingColumns && ('language' in row || 'launch_state' in row || 'ref_code' in row)) {
          return { error: { code: '42703', message: 'column "language" of relation "waitlist_signups" does not exist' } };
        }
        if (rows.some((r) => r.email && r.email === row.email)) return { error: { code: '23505', message: 'duplicate' } };
        rows.push({ ...row }); return { error: null };
      };
      q.upsert = async (row, opts) => {
        if (rows.some((r) => r.email === row.email)) return { error: null };
        rows.push({ ...row }); return { error: null };
      };
      return q;
    },
  };
}
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === '@supabase/supabase-js') return { createClient: () => fakeClient() };
  if (request === './_lib/emailTemplate' || /emailTemplate$/.test(request)) return { sendBrandedEmail: async () => { state.emailsSent = (state.emailsSent || 0) + 1; } };
  return origLoad.apply(this, arguments);
};
process.env.SUPABASE_URL = 'http://fake'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
const root = path.join(__dirname, '..');
const load = (p) => require(path.join(root, p));

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined, ended: false };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.end = () => { res.ended = true; return res; };
  return res;
}
const mockReq = (o = {}) => ({ method: 'POST', headers: {}, body: {}, ...o, headers: { 'x-forwarded-for': '9.9.9.9', ...(o.headers || {}) } });

let passed = 0, failed = 0;
async function test(name, fn) {
  resetState();
  for (const k of Object.keys(process.env)) if (/^(REQUIRE_AUTH_AI|AI_RATE_)/.test(k)) delete process.env[k];
  try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.message)); }
}

(async () => {
  const { guardAiRequest } = load('api/_lib/aiGuard.js');
  const { getUserFromRequest } = load('api/_lib/userAuth.js');

  // ---------------- AI guard ----------------
  await test('flag off, no token: anonymous callers are allowed', async () => {
    const res = mockRes(); assert.strictEqual(await guardAiRequest(mockReq(), res, 'chat'), true); assert.strictEqual(res.statusCode, 200);
  });
  await test('flag off: anonymous caller is limited per IP (4th call with limit 3 gets 429 + Retry-After)', async () => {
    process.env.AI_RATE_CHAT_PER_MIN_IP = '3';
    for (let i = 0; i < 3; i++) assert.strictEqual(await guardAiRequest(mockReq(), mockRes(), 'chat'), true);
    const res = mockRes(); assert.strictEqual(await guardAiRequest(mockReq(), res, 'chat'), false);
    assert.strictEqual(res.statusCode, 429); assert.strictEqual(res.body.code, 'rate_limited'); assert.ok(Number(res.headers['Retry-After']) >= 1);
  });
  await test('a different IP is not affected by someone else hitting the limit', async () => {
    process.env.AI_RATE_CHAT_PER_MIN_IP = '1';
    await guardAiRequest(mockReq(), mockRes(), 'chat');
    assert.strictEqual(await guardAiRequest(mockReq({ headers: { 'x-forwarded-for': '8.8.8.8' } }), mockRes(), 'chat'), true);
  });
  await test('limits are tracked per route (chat does not use up tts)', async () => {
    process.env.AI_RATE_CHAT_PER_MIN_IP = '1';
    await guardAiRequest(mockReq(), mockRes(), 'chat');
    assert.strictEqual(await guardAiRequest(mockReq(), mockRes(), 'tts'), true);
  });
  await test('REQUIRE_AUTH_AI=true: no token gets 401 auth_required', async () => {
    process.env.REQUIRE_AUTH_AI = 'true';
    const res = mockRes(); assert.strictEqual(await guardAiRequest(mockReq(), res, 'chat'), false);
    assert.strictEqual(res.statusCode, 401); assert.strictEqual(res.body.code, 'auth_required');
  });
  await test('REQUIRE_AUTH_AI=true: a bad token gets 401', async () => {
    process.env.REQUIRE_AUTH_AI = 'true';
    const res = mockRes(); assert.strictEqual(await guardAiRequest(mockReq({ headers: { authorization: 'Bearer nope' } }), res, 'stt'), false);
    assert.strictEqual(res.statusCode, 401);
  });
  await test('REQUIRE_AUTH_AI=true: a good token passes and the user is attached to the request', async () => {
    process.env.REQUIRE_AUTH_AI = 'true';
    const req = mockReq({ headers: { authorization: 'Bearer good-token' } }); const res = mockRes();
    assert.strictEqual(await guardAiRequest(req, res, 'tts'), true); assert.strictEqual(req.flUser.id, 'user-1');
  });
  await test('signed-in callers are limited per account, not per IP', async () => {
    process.env.REQUIRE_AUTH_AI = 'true'; process.env.AI_RATE_CHAT_PER_MIN_USER = '2';
    const a = () => mockReq({ headers: { authorization: 'Bearer good-token' } });
    const b = () => mockReq({ headers: { authorization: 'Bearer other-token' } });
    await guardAiRequest(a(), mockRes(), 'chat'); await guardAiRequest(a(), mockRes(), 'chat');
    const blocked = mockRes(); assert.strictEqual(await guardAiRequest(a(), blocked, 'chat'), false); assert.strictEqual(blocked.statusCode, 429);
    assert.strictEqual(await guardAiRequest(b(), mockRes(), 'chat'), true); // same IP, other account
  });
  await test('REQUIRE_AUTH_AI=true while Supabase auth is down gives 503, not a false 401', async () => {
    process.env.REQUIRE_AUTH_AI = 'true'; state.authOutage = true;
    const res = mockRes(); assert.strictEqual(await guardAiRequest(mockReq({ headers: { authorization: 'Bearer never-seen-token' } }), res, 'chat'), false);
    assert.strictEqual(res.statusCode, 503);
  });
  await test('flag off: a bad token is treated as anonymous (still allowed)', async () => {
    assert.strictEqual(await guardAiRequest(mockReq({ headers: { authorization: 'Bearer nope' } }), mockRes(), 'chat'), true);
  });
  await test('AI_RATE_LIMIT=off switches the limits off', async () => {
    process.env.AI_RATE_LIMIT = 'off'; process.env.AI_RATE_CHAT_PER_MIN_IP = '1';
    for (let i = 0; i < 5; i++) assert.strictEqual(await guardAiRequest(mockReq(), mockRes(), 'chat'), true);
    delete process.env.AI_RATE_LIMIT;
  });
  await test('if the limiter is unreachable the request is allowed (fails open)', async () => {
    state.rateLimitRpcError = true; assert.strictEqual(await guardAiRequest(mockReq(), mockRes(), 'chat'), true);
  });
  await test('a valid session is checked with Supabase once, then remembered briefly', async () => {
    const req = () => mockReq({ headers: { authorization: 'Bearer good-token' } });
    state.getUserCalls = 0; await getUserFromRequest(req()); await getUserFromRequest(req());
    assert.ok(state.getUserCalls <= 1, 'getUser called ' + state.getUserCalls + ' times (it may already be cached from earlier tests)');
  });

  // ---------------- real endpoints, auth enforced ----------------
  for (const route of ['chat', 'stt', 'tts']) {
    await test(`api/${route}: OPTIONS allows the Authorization header`, async () => {
      const res = mockRes(); await load(`api/${route}.js`)(mockReq({ method: 'OPTIONS' }), res);
      assert.strictEqual(res.statusCode, 200); assert.ok(/Authorization/.test(res.headers['Access-Control-Allow-Headers']));
    });
    await test(`api/${route}: with REQUIRE_AUTH_AI=true an anonymous call is refused before anything is spent`, async () => {
      process.env.REQUIRE_AUTH_AI = 'true';
      const res = mockRes(); await load(`api/${route}.js`)(mockReq({ body: { mode: 'converse', messages: [] } }), res);
      assert.strictEqual(res.statusCode, 401); assert.strictEqual(res.body.code, 'auth_required');
    });
  }

  // ---------------- waitlist ----------------
  const waitlist = load('api/waitlist.js');
  const join = (body, headers) => { const res = mockRes(); return waitlist(mockReq({ body, headers }), res).then(() => res); };
  await test('waitlist: saves language, launch state and the partner code (JSON form, upper-cased)', async () => {
    const res = await join({ email: 'Kim@Example.com', source: 'home_waitlist', language: 'German', state: 'waitlist', ref: '{"code":"anna_1","at":1700000000000}' });
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.alreadyJoined, false);
    const row = state.tables.waitlist_signups[0];
    assert.deepStrictEqual([row.email, row.language, row.launch_state, row.ref_code], ['kim@example.com', 'German', 'waitlist', 'ANNA_1']);
  });
  await test('waitlist: a plain-text code works too, and a junk code is dropped', async () => {
    await join({ email: 'a@example.com', ref: 'maria' }); await join({ email: 'b@example.com', ref: '<script>' });
    assert.strictEqual(state.tables.waitlist_signups[0].ref_code, 'MARIA'); assert.strictEqual(state.tables.waitlist_signups[1].ref_code, null);
  });
  await test('waitlist: still saves the sign-up if the new columns are not in the database yet', async () => {
    state.missingColumns = true;
    const res = await join({ email: 'late@example.com', language: 'French', ref: 'ANNA' });
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(state.tables.waitlist_signups.length, 1);
    assert.strictEqual('language' in state.tables.waitlist_signups[0], false);
  });
  await test('waitlist: an address already on the list succeeds quietly', async () => {
    await join({ email: 'dup@example.com' }); const res = await join({ email: 'dup@example.com' });
    assert.strictEqual(res.body.alreadyJoined, true); assert.strictEqual(state.tables.waitlist_signups.length, 1);
  });
  await test('waitlist: a bad email is rejected', async () => {
    const res = await join({ email: 'nope' }); assert.strictEqual(res.statusCode, 400);
  });
  await test('waitlist: one connection cannot add more than 10 addresses an hour', async () => {
    for (let i = 0; i < 10; i++) assert.strictEqual((await join({ email: `p${i}@example.com` })).statusCode, 200);
    const res = await join({ email: 'p11@example.com' }); assert.strictEqual(res.statusCode, 429); assert.ok(res.headers['Retry-After']);
  });
  await test('waitlist: a failing limiter does not block sign-ups', async () => {
    state.rateLimitRpcError = true; assert.strictEqual((await join({ email: 'ok@example.com' })).statusCode, 200);
  });

  // ---------------- referral: partner pop-up email ----------------
  const referral = load('api/referral.js');
  const refCall = (body) => { const res = mockRes(); return referral(mockReq({ body }), res).then(() => res); };
  await test('partner_interest: stores the email with its source and partner code', async () => {
    const res = await refCall({ type: 'partner_interest', email: 'Lee@Example.com', source: 'home_partner_popup', ref: '{"code":"anna","at":1}' });
    assert.strictEqual(res.statusCode, 200);
    const row = state.tables.partner_interest[0]; assert.deepStrictEqual([row.email, row.source, row.ref_code], ['lee@example.com', 'home_partner_popup', 'ANNA']);
  });
  await test('partner_interest: the same email twice is stored once', async () => {
    await refCall({ type: 'partner_interest', email: 'lee@example.com' }); await refCall({ type: 'partner_interest', email: 'lee@example.com' });
    assert.strictEqual(state.tables.partner_interest.length, 1);
  });
  await test('partner_interest: a bad email is rejected', async () => {
    assert.strictEqual((await refCall({ type: 'partner_interest', email: 'x' })).statusCode, 400);
  });
  await test('partner_interest: limited to 10 an hour per connection', async () => {
    for (let i = 0; i < 10; i++) await refCall({ type: 'partner_interest', email: `q${i}@example.com` });
    assert.strictEqual((await refCall({ type: 'partner_interest', email: 'q11@example.com' })).statusCode, 429);
  });
  await test('partner application: still works, and is limited to 10 an hour per connection', async () => {
    const app = (i) => refCall({ type: 'apply', name: 'N', email: `n${i}@example.com`, platform: 'YouTube', handle: '@h', country: 'KE' });
    assert.strictEqual((await app(0)).statusCode, 200); assert.strictEqual(state.tables.creator_applications.length, 1);
    for (let i = 1; i < 10; i++) await app(i);
    assert.strictEqual((await app(11)).statusCode, 429);
  });
  await test('referral: an unknown type is still rejected with a helpful message', async () => {
    const res = await refCall({ type: 'nope' }); assert.strictEqual(res.statusCode, 400); assert.ok(/partner_interest/.test(res.body.error));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
