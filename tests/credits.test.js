// Run with:  node tests/credits.test.js
// Needs nothing installed: Supabase and the paid providers (Claude, Deepgram, ElevenLabs) are replaced by in-memory fakes.
//
// The fake database below re-implements the rules of scripts/supabase_migration_credits.sql in JavaScript, so these
// tests prove the API code (modes, prices, 402, charge-after-success) but NOT the SQL itself. The SQL is checked by
// scripts/credits_self_test.sql, which you run once in the Supabase SQL editor.

const Module = require('module');
const path = require('path');
const assert = require('assert');

// ---------- fake database ----------
const T0 = Date.now();
const state = {};
function resetState() {
  Object.assign(state, {
    tokens: { 'good-token': { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.com' },
              'admin-token': { id: '22222222-2222-4222-8222-222222222222', email: 'boss@example.com' } },
    admins: new Set(['22222222-2222-4222-8222-222222222222']),
    balances: new Map(),       // user -> { monthly, monthlyExpires, topup }
    ledger: [], usage: [], rpcCalls: [], creditsDown: false, knownUsers: new Set(['11111111-1111-4111-8111-111111111111']),
  });
}
resetState();

function effective(b) { return b.monthlyExpires && b.monthlyExpires <= Date.now() ? 0 : b.monthly; }
function getBal(u) {
  const b = state.balances.get(u); if (!b) return { total: 0, monthly: 0, topup: 0, expires_at: null };
  const m = effective(b); return { total: m + b.topup, monthly: m, topup: b.topup, expires_at: m > 0 ? new Date(b.monthlyExpires).toISOString() : null };
}
function touch(u) {
  if (!state.balances.has(u)) state.balances.set(u, { monthly: 0, monthlyExpires: null, topup: 0 });
  const b = state.balances.get(u); if (b.monthly > 0 && b.monthlyExpires && b.monthlyExpires <= Date.now()) b.monthly = 0; return b;
}
const rpcs = {
  fl_rate_limit_hit: () => [{ allowed: true, current_count: 1, retry_after: 0 }],
  fl_credit_get: (a) => [getBal(a.p_user)],
  fl_credit_charge: (a) => {
    let takeM = 0, takeT = 0, short = 0;
    if (!a.p_shadow) {
      const b = touch(a.p_user); takeM = Math.min(b.monthly, a.p_cost); takeT = Math.min(b.topup, a.p_cost - takeM); short = a.p_cost - takeM - takeT;
      b.monthly -= takeM; b.topup -= takeT;
    }
    state.usage.push({ user: a.p_user, route: a.p_route, mode: a.p_mode, credits: a.p_cost, shadow: a.p_shadow, takeM, takeT, short,
      input_tokens: a.p_input_tokens, output_tokens: a.p_output_tokens, audio_seconds: a.p_audio_seconds, chars: a.p_chars });
    return [{ usage_id: state.usage.length, charged: takeM + takeT, shortfall: short, ...getBal(a.p_user) }];
  },
  fl_credit_grant: (a) => {
    if (!state.knownUsers.has(a.p_user)) return { error: { code: '23503', message: 'violates foreign key constraint' } };
    if (a.p_key && state.ledger.some((l) => l.key === a.p_key)) return [{ duplicate: true, ...getBal(a.p_user) }];
    const b = touch(a.p_user); b.topup += a.p_amount; state.ledger.push({ user: a.p_user, kind: a.p_kind, amount: a.p_amount, key: a.p_key, by: a.p_by, note: a.p_note });
    return [{ duplicate: false, ...getBal(a.p_user) }];
  },
  fl_admin_credit_usage: (a) => {
    const by = {}; for (const u of state.usage) { const k = u.route + (u.mode ? ':' + u.mode : ''); by[k] = by[k] || { route: k, calls: 0, credits: 0, users: 1, input_tokens: 0, output_tokens: 0, audio_seconds: 0, chars: 0 }; by[k].calls++; by[k].credits += u.credits; }
    return { by_route: Object.values(by), top_users: [] };
  },
};
function fakeClient() {
  return {
    auth: { async getUser(token) { const u = state.tokens[token]; return u ? { data: { user: u }, error: null } : { data: null, error: { status: 401, message: 'bad jwt' } }; } },
    async rpc(name, args) {
      state.rpcCalls.push(name);
      if (state.creditsDown && /^fl_credit|^fl_admin_credit/.test(name)) return { data: null, error: { message: 'connection refused' } };
      const out = rpcs[name](args); if (out && out.error) return { data: null, error: out.error }; return { data: out, error: null };
    },
    from(table) {
      const q = { _f: [] }; q.select = () => q; q.eq = (k, v) => { q._f.push([k, v]); return q; };
      q.maybeSingle = async () => ({ data: table === 'profiles' ? (state.admins.has(q._f[0][1]) ? { role: 'admin' } : { role: 'user' }) : null, error: null });
      return q;
    },
  };
}
const origLoad = Module._load;
Module._load = function (request) { if (request === '@supabase/supabase-js') return { createClient: () => fakeClient() }; return origLoad.apply(this, arguments); };
process.env.SUPABASE_URL = 'http://fake'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
const root = path.join(__dirname, '..');
const load = (p) => require(path.join(root, p));

// ---------- fake providers ----------
const providerCalls = []; let providerFail = false;
global.fetch = async (url) => {
  providerCalls.push(String(url));
  if (providerFail) return { ok: false, status: 500, text: async () => 'provider down', json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  if (/anthropic|CLAUDE/.test(String(url)) || /\/v1\/messages/.test(String(url))) return { ok: true, status: 200, json: async () => ({ content: [{ text: '{"reply":"hola","translation":"hello","correction":null,"explanation":null}' }], usage: { input_tokens: 120, output_tokens: 30 } }) };
  if (/deepgram.com\/v1\/listen/.test(String(url))) return { ok: true, status: 200, json: async () => ({ results: { channels: [{ alternatives: [{ transcript: 'hola amigo' }] }] } }) };
  return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
};

function mockRes() {
  const res = { headers: {}, statusCode: 200, body: undefined };
  res.setHeader = (k, v) => { res.headers[k] = v; }; res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; }; res.send = (b) => { res.body = b; return res; }; res.end = () => res;
  return res;
}
const bearer = (t) => ({ authorization: 'Bearer ' + t });
const mockReq = (o = {}) => ({ method: 'POST', body: {}, query: {}, ...o, headers: { 'x-forwarded-for': '9.9.9.9', ...(o.headers || {}) } });
const USER = '11111111-1111-4111-8111-111111111111';
function give(user, { monthly = 0, topup = 0, expires = T0 + 86400000 * 20 } = {}) { state.balances.set(user, { monthly, monthlyExpires: monthly ? expires : null, topup }); }

let passed = 0, failed = 0;
async function test(name, fn) {
  resetState(); providerCalls.length = 0; providerFail = false;
  for (const k of Object.keys(process.env)) if (/^(REQUIRE_AUTH_AI|AI_RATE_|CREDITS_MODE|CREDIT_)/.test(k)) delete process.env[k];
  process.env.AI_RATE_LIMIT = 'off'; process.env.CLAUDE_API_KEY = 'k'; process.env.ELEVENLABS_API_KEY = 'k'; process.env.DEEPGRAM_API_KEY = 'k';
  try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.stack || e)); }
}

(async () => {
  const credits = load('api/_lib/credits.js');
  const { guardAiRequest } = load('api/_lib/aiGuard.js');
  const chat = load('api/chat.js'), stt = load('api/stt.js'), tts = load('api/tts.js');
  const admin = load('api/_lib/adminCredits.js');

  // ---------------- prices ----------------
  await test('prices: defaults for chat modes, and unknown modes cost like a normal reply', async () => {
    assert.strictEqual(credits.costFor('chat', { mode: 'converse' }), 1);
    assert.strictEqual(credits.costFor('chat', { mode: 'plan' }), 10);
    assert.strictEqual(credits.costFor('chat', { mode: 'analyze' }), 4);
    assert.strictEqual(credits.costFor('chat', { mode: 'something-new' }), 1);
  });
  await test('prices: stt is 1 per started 10 seconds (min 1); tts is 1 per started 250 characters (min 1)', async () => {
    assert.strictEqual(credits.costFor('stt', { audioSeconds: 0 }), 1);
    assert.strictEqual(credits.costFor('stt', { audioSeconds: 10 }), 1);
    assert.strictEqual(credits.costFor('stt', { audioSeconds: 11 }), 2);
    assert.strictEqual(credits.costFor('tts', { chars: 250 }), 1);
    assert.strictEqual(credits.costFor('tts', { chars: 251 }), 2);
    assert.strictEqual(credits.costFor('tts', { chars: 0 }), 1);
  });
  await test('prices: a typical spoken turn (listen + think + speak) is about 3 credits', async () => {
    assert.strictEqual(credits.costFor('stt', { audioSeconds: 8 }) + credits.costFor('chat', { mode: 'converse' }) + credits.costFor('tts', { chars: 200 }), 3);
  });
  await test('prices: environment variables override the defaults', async () => {
    process.env.CREDIT_COST_CHAT_PLAN = '25'; process.env.CREDIT_STT_SECONDS_PER_CREDIT = '5'; process.env.CREDIT_TTS_CHARS_PER_CREDIT = '100';
    assert.strictEqual(credits.costFor('chat', { mode: 'plan' }), 25);
    assert.strictEqual(credits.costFor('stt', { audioSeconds: 10 }), 2);
    assert.strictEqual(credits.costFor('tts', { chars: 250 }), 3);
  });
  await test('wavSeconds: reads the header (16 kHz mono 16-bit = 32000 bytes a second) and survives rubbish', async () => {
    const wav = Buffer.alloc(44 + 32000 * 5); wav.write('RIFF', 0, 'ascii'); wav.write('WAVE', 8, 'ascii'); wav.writeUInt32LE(32000, 28);
    assert.strictEqual(credits.wavSeconds(wav), 5);
    const wav48 = Buffer.alloc(44 + 96000 * 3); wav48.write('RIFF', 0, 'ascii'); wav48.write('WAVE', 8, 'ascii'); wav48.writeUInt32LE(96000, 28);
    assert.strictEqual(credits.wavSeconds(wav48), 3);
    assert.strictEqual(credits.wavSeconds(Buffer.alloc(0)), 0);
    assert.strictEqual(credits.wavSeconds(Buffer.from('not a wav file at all')), 0);
  });

  // ---------------- modes ----------------
  await test('mode: unset or unknown means off', async () => {
    assert.strictEqual(credits.getMode(), 'off'); process.env.CREDITS_MODE = 'banana'; assert.strictEqual(credits.getMode(), 'off');
    process.env.CREDITS_MODE = 'ENFORCE'; assert.strictEqual(credits.getMode(), 'enforce');
  });
  await test('off: a signed-in chat call records nothing and never touches the credits database', async () => {
    const req = mockReq({ headers: bearer('good-token'), body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }); const res = mockRes();
    await chat(req, res); assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.reply, 'hola');
    assert.ok(!state.rpcCalls.some((n) => /^fl_credit/.test(n))); assert.strictEqual(state.usage.length, 0);
  });
  await test('shadow: chat is recorded with its cost and real token counts, and nothing is taken', async () => {
    process.env.CREDITS_MODE = 'shadow'; give(USER, { topup: 50 });
    const req = mockReq({ headers: bearer('good-token'), body: { mode: 'analyze', targetLanguage: 'es' } }); const res = mockRes();
    await chat(req, res); assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(state.usage.length, 1);
    const u = state.usage[0]; assert.strictEqual(u.route, 'chat'); assert.strictEqual(u.mode, 'analyze'); assert.strictEqual(u.credits, 4); assert.strictEqual(u.shadow, true);
    assert.strictEqual(u.input_tokens, 120); assert.strictEqual(u.output_tokens, 30);
    assert.strictEqual(getBal(USER).total, 50);
  });
  await test('shadow: an anonymous call (no sign-in) is allowed and not recorded', async () => {
    process.env.CREDITS_MODE = 'shadow';
    const res = mockRes(); await chat(mockReq({ body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(state.usage.length, 0);
  });
  await test('shadow: a person with zero credits is not blocked', async () => {
    process.env.CREDITS_MODE = 'shadow';
    const res = mockRes(); await chat(mockReq({ headers: bearer('good-token'), body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(state.usage.length, 1);
  });

  // ---------------- enforce ----------------
  await test('enforce: no sign-in means 401 (credits belong to an account) and the provider is not called', async () => {
    process.env.CREDITS_MODE = 'enforce';
    const res = mockRes(); await chat(mockReq({ body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), res);
    assert.strictEqual(res.statusCode, 401); assert.strictEqual(res.body.code, 'auth_required'); assert.strictEqual(providerCalls.length, 0);
  });
  await test('enforce: zero credits gets 402 insufficient_credits, and the paid provider is never called', async () => {
    process.env.CREDITS_MODE = 'enforce';
    const res = mockRes(); await chat(mockReq({ headers: bearer('good-token'), body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), res);
    assert.strictEqual(res.statusCode, 402); assert.strictEqual(res.body.code, 'insufficient_credits'); assert.strictEqual(res.body.credits, 0); assert.strictEqual(res.body.needed, 1);
    assert.strictEqual(providerCalls.length, 0); assert.strictEqual(state.usage.length, 0);
  });
  await test('enforce: a call is charged after it succeeds, monthly credits first, then top-up', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { monthly: 2, topup: 10 });
    for (let i = 0; i < 3; i++) { const res = mockRes(); await chat(mockReq({ headers: bearer('good-token'), body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), res); assert.strictEqual(res.statusCode, 200); }
    const b = getBal(USER); assert.strictEqual(b.monthly, 0); assert.strictEqual(b.topup, 9);
    assert.deepStrictEqual(state.usage.map((u) => [u.takeM, u.takeT]), [[1, 0], [1, 0], [0, 1]]);
  });
  await test('enforce: a mode that costs more than the balance is refused up front (plan costs 10, only 4 left)', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { topup: 4 });
    const res = mockRes(); await chat(mockReq({ headers: bearer('good-token'), body: { mode: 'plan', targetLanguage: 'es' } }), res);
    assert.strictEqual(res.statusCode, 402); assert.strictEqual(res.body.needed, 10); assert.strictEqual(res.body.credits, 4); assert.strictEqual(getBal(USER).total, 4);
  });
  await test('enforce: a failed provider call costs nothing', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { topup: 5 }); providerFail = true;
    const res = mockRes(); await chat(mockReq({ headers: bearer('good-token'), body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), res);
    assert.strictEqual(res.statusCode, 502); assert.strictEqual(getBal(USER).total, 5); assert.strictEqual(state.usage.length, 0);
  });
  await test('enforce: if the credits database is down the call is allowed (and nothing breaks)', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { topup: 5 }); state.creditsDown = true;
    const res = mockRes(); await chat(mockReq({ headers: bearer('good-token'), body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), res);
    assert.strictEqual(res.statusCode, 200);
  });
  await test('enforce: expired monthly credits do not count', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { monthly: 100, expires: T0 - 1000 });
    const res = mockRes(); await chat(mockReq({ headers: bearer('good-token'), body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), res);
    assert.strictEqual(res.statusCode, 402);
  });

  // ---------------- stt / tts ----------------
  const wavOf = (sec) => { const b = Buffer.alloc(44 + 32000 * sec); b.write('RIFF', 0, 'ascii'); b.write('WAVE', 8, 'ascii'); b.writeUInt32LE(32000, 28); return b; };
  await test('stt: 25 seconds of audio costs 3 credits and is recorded with the audio length', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { topup: 10 });
    const res = mockRes(); await stt(mockReq({ headers: bearer('good-token'), body: wavOf(25), query: { language: 'es' } }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.transcript, 'hola amigo');
    assert.strictEqual(getBal(USER).total, 7); assert.strictEqual(state.usage[0].audio_seconds, 25);
  });
  await test('stt: too few credits gets 402 before the audio is sent to the provider', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { topup: 1 });
    const res = mockRes(); await stt(mockReq({ headers: bearer('good-token'), body: wavOf(25), query: {} }), res);
    assert.strictEqual(res.statusCode, 402); assert.strictEqual(providerCalls.length, 0);
  });
  await test('tts: 600 characters costs 3 credits, charged only after the audio came back', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { topup: 10 });
    const res = mockRes(); await tts(mockReq({ headers: bearer('good-token'), body: { text: 'x'.repeat(600), targetLanguage: 'es', gender: 'female' } }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(getBal(USER).total, 7); assert.strictEqual(state.usage[0].chars, 600);
  });
  await test('tts: a failed provider call costs nothing', async () => {
    process.env.CREDITS_MODE = 'enforce'; give(USER, { topup: 10 }); providerFail = true;
    const res = mockRes(); await tts(mockReq({ headers: bearer('good-token'), body: { text: 'hola', targetLanguage: 'es' } }), res);
    assert.strictEqual(res.statusCode, 502); assert.strictEqual(getBal(USER).total, 10);
  });
  await test('tts: the other providers (azure, deepgram) are charged too', async () => {
    process.env.CREDITS_MODE = 'enforce'; process.env.AZURE_SPEECH_REGION = 'x'; process.env.AZURE_SPEECH_KEY = 'k'; give(USER, { topup: 10 });
    process.env.TTS_PROVIDER = 'azure';
    let res = mockRes(); await tts(mockReq({ headers: bearer('good-token'), body: { text: 'hola', targetLanguage: 'es' } }), res); assert.strictEqual(res.statusCode, 200);
    process.env.TTS_PROVIDER = 'deepgram';
    res = mockRes(); await tts(mockReq({ headers: bearer('good-token'), body: { text: 'hola', targetLanguage: 'es' } }), res); assert.strictEqual(res.statusCode, 200);
    delete process.env.TTS_PROVIDER; assert.strictEqual(getBal(USER).total, 8);
  });

  // ---------------- guard ----------------
  await test('guard: with the rate limiter switched off the signed-in user is still attached to the request', async () => {
    process.env.AI_RATE_LIMIT = 'off';
    const req = mockReq({ headers: bearer('good-token') }); assert.strictEqual(await guardAiRequest(req, mockRes(), 'chat'), true); assert.strictEqual(req.flUser.id, USER);
  });
  await test('guard: REQUIRE_AUTH_AI is unchanged (off by default, anonymous allowed)', async () => {
    assert.strictEqual(await guardAiRequest(mockReq(), mockRes(), 'chat'), true);
  });

  // ---------------- admin ----------------
  const adminReq = (o = {}) => mockReq({ headers: bearer('admin-token'), ...o });
  const auth = { supabase: fakeClient(), user: state.tokens['admin-token'] };
  await test('admin balance: returns the shape the dashboard reads (total, monthly, topup)', async () => {
    give(USER, { monthly: 30, topup: 70 });
    const res = mockRes(); await admin.handleCreditsBalance(auth, adminReq({ method: 'GET', query: { userId: USER } }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.balance.total, 100); assert.strictEqual(res.body.balance.monthly, 30); assert.strictEqual(res.body.balance.topup, 70);
  });
  await test('admin balance: a bad id is a 400', async () => {
    const res = mockRes(); await admin.handleCreditsBalance(auth, adminReq({ query: { userId: 'nope' } }), res); assert.strictEqual(res.statusCode, 400);
  });
  await test('admin grant: adds top-up credits, records who and why, and a repeated key does not grant twice', async () => {
    const body = { userId: USER, amount: 500, note: 'early access', idempotencyKey: 'k-1' };
    let res = mockRes(); await admin.handleCreditsGrant(auth, adminReq({ body }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.balance.total, 500); assert.strictEqual(res.body.duplicate, false);
    assert.strictEqual(state.ledger[0].by, 'boss@example.com'); assert.strictEqual(state.ledger[0].kind, 'admin_grant'); assert.strictEqual(state.ledger[0].note, 'early access');
    res = mockRes(); await admin.handleCreditsGrant(auth, adminReq({ body }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.duplicate, true); assert.strictEqual(res.body.balance.total, 500); assert.strictEqual(state.ledger.length, 1);
  });
  await test('admin grant: rejects fractions, zero, negatives, huge numbers and bad ids', async () => {
    for (const amount of [0, -5, 1.5, 'abc', 100001, null]) { const res = mockRes(); await admin.handleCreditsGrant(auth, adminReq({ body: { userId: USER, amount } }), res); assert.strictEqual(res.statusCode, 400, 'amount ' + amount); }
    const res = mockRes(); await admin.handleCreditsGrant(auth, adminReq({ body: { userId: 'x', amount: 5 } }), res); assert.strictEqual(res.statusCode, 400);
  });
  await test('admin grant: an account that does not exist is a 404, not a 500', async () => {
    const res = mockRes(); await admin.handleCreditsGrant(auth, adminReq({ body: { userId: '99999999-9999-4999-8999-999999999999', amount: 5 } }), res);
    assert.strictEqual(res.statusCode, 404);
  });
  await test('admin usage: reports the mode and the per-endpoint rows', async () => {
    process.env.CREDITS_MODE = 'shadow';
    await chat(mockReq({ headers: bearer('good-token'), body: { mode: 'converse', targetLanguage: 'es', userText: 'hola' } }), mockRes());
    const res = mockRes(); await admin.handleCreditsUsage(auth, adminReq({ method: 'GET', query: { days: '7' } }), res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.mode, 'shadow'); assert.strictEqual(res.body.days, 7);
    assert.strictEqual(res.body.by_route[0].route, 'chat:converse'); assert.ok(Array.isArray(res.body.top_users));
  });
  await test('admin router: /credits-grant and /credits-balance work through the real router for an admin, and are refused for others', async () => {
    const router = load('api/admin/router.js');
    let res = mockRes(); await router({ method: 'POST', headers: bearer('admin-token'), query: { path: ['credits-grant'] }, body: { userId: USER, amount: 40 } }, res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.balance.total, 40);
    res = mockRes(); await router({ method: 'GET', headers: bearer('admin-token'), query: { path: ['credits-balance'], userId: USER } }, res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.balance.total, 40);
    res = mockRes(); await router({ method: 'GET', headers: bearer('admin-token'), query: { path: ['credits-usage'], days: '30' } }, res);
    assert.strictEqual(res.statusCode, 200); assert.strictEqual(res.body.mode, 'off');
    res = mockRes(); await router({ method: 'POST', headers: bearer('good-token'), query: { path: ['credits-grant'] }, body: { userId: USER, amount: 40 } }, res);
    assert.strictEqual(res.statusCode, 403);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
