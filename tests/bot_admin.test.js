// Run with:  node tests/bot_admin.test.js
// Tests the admin side of the website chat assistant: api/_lib/adminBot.js (with an in-memory fake Supabase), its route in
// api/admin/router.js, and the "Website chat assistant" card in site/admin (in a simulated page when jsdom is installed:
//   npm install --no-save jsdom ). Without jsdom the card's page test is skipped; everything else still runs.

const Module = require('module');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const root = path.join(__dirname, '..');

// ---------- fake Supabase (just what adminBot.js uses) ----------
const T = { bot_conversations: [], bot_messages: [], bot_handoffs: [] };
function reset() { for (const k of Object.keys(T)) T[k].length = 0; }
function table(name) {
  const st = { op: 'select', filters: [], order: null, lim: null, count: false, head: false, patch: null };
  const run = () => {
    const rows = T[name];
    const ok = (r) => st.filters.every(([kind, k, v]) => (kind === 'eq' ? r[k] === v : kind === 'in' ? v.includes(r[k]) : kind === 'gte' ? String(r[k]) >= String(v) : true));
    if (st.op === 'update') { const hit = rows.filter(ok); hit.forEach((r) => Object.assign(r, st.patch)); return { data: hit.map((r) => ({ id: r.id })), error: null }; }
    let out = rows.filter(ok);
    if (st.count) return { count: out.length, data: st.head ? null : out, error: null };
    if (st.order) out = out.slice().sort((a, b) => (a[st.order.k] > b[st.order.k] ? 1 : a[st.order.k] < b[st.order.k] ? -1 : 0) * (st.order.asc ? 1 : -1));
    if (st.lim) out = out.slice(0, st.lim);
    return { data: out, error: null };
  };
  const api = {
    select(cols, opts) { if (opts && opts.count) st.count = true; if (opts && opts.head) st.head = true; return api; },
    update(p) { st.op = 'update'; st.patch = p; return api; },
    eq(k, v) { st.filters.push(['eq', k, v]); return api; },
    in(k, v) { st.filters.push(['in', k, v]); return api; },
    gte(k, v) { st.filters.push(['gte', k, v]); return api; },
    order(k, o) { st.order = { k, asc: !o || o.ascending !== false }; return api; },
    limit(n) { st.lim = n; return api; },
    maybeSingle: () => Promise.resolve({ data: run().data[0] || null, error: null }),
    then: (a, b) => Promise.resolve(run()).then(a, b),
  };
  return api;
}
const fake = { from: table };

const origLoad = Module._load;
let adminOk = true;
Module._load = function (request) {
  if (request === '@supabase/supabase-js') return { createClient: () => fake };
  if (/\/adminAuth$/.test(request)) return { requireAdmin: async () => (adminOk ? { ok: true, user: { email: 'admin@fluencyai.app' }, supabase: fake } : { ok: false, status: 403, error: 'Not an admin' }) };
  return origLoad.apply(this, arguments);
};

const adminBot = require('../api/_lib/adminBot');
const router = require('../api/admin/router');

function makeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const auth = { supabase: fake, user: { email: 'admin@fluencyai.app' } };
const CID1 = '11111111-1111-4111-8111-111111111111';
const CID2 = '22222222-2222-4222-8222-222222222222';
const CID3 = '33333333-3333-4333-8333-333333333333';
const iso = (daysAgo, mins = 0) => new Date(Date.now() - daysAgo * 86400000 + mins * 60000).toISOString();

function seed() {
  reset();
  T.bot_conversations.push(
    { id: CID1, created_at: iso(1), updated_at: iso(1, 5), user_turns: 2, provider: 'tokenharbor', page: '/pricing', lang: 'en', status: 'idle' },
    { id: CID2, created_at: iso(2), updated_at: iso(2, 5), user_turns: 1, provider: 'manus', page: '/store', lang: 'fr', status: 'idle' },
    { id: CID3, created_at: iso(20), updated_at: iso(20, 5), user_turns: 1, provider: 'tokenharbor', page: '/faq', lang: 'en', status: 'idle' },
  );
  let id = 0;
  const m = (cid, role, content, daysAgo, human = false) => T.bot_messages.push({ id: ++id, conversation_id: cid, role, content, human_flag: human, created_at: iso(daysAgo, id) });
  // oldest first, like real data (ids grow with time)
  m(CID3, 'user', 'Old question from last month', 20); m(CID3, 'assistant', 'Old answer', 20, true);
  m(CID2, 'user', 'Combien coûte le guide DELF B2 ?', 2); m(CID2, 'assistant', 'Le guide coûte 9 $.', 2);
  m(CID1, 'user', 'How much is Fluency Plus?', 1); m(CID1, 'assistant', 'It is $12 per month.', 1);
  m(CID1, 'user', 'Can I get a refund on my order?', 1); m(CID1, 'assistant', 'I cannot see orders. Please email support. [asked for a person]', 1, true);
  T.bot_handoffs.push(
    { id: 1, conversation_id: CID1, contact_email: 'ada@example.com', note: 'my order', status: 'open', created_at: iso(1, 10), emailed_at: iso(1, 10) },
    { id: 2, conversation_id: null, contact_email: 'bob@example.com', note: null, status: 'answered', created_at: iso(3), emailed_at: null },
    { id: 3, conversation_id: CID2, contact_email: 'cy@example.com', note: '<b>hi</b>', status: 'open', created_at: iso(0, -30), emailed_at: iso(0, -30) },
  );
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('overview: numbers for the last 7 days, requests for a person (newest first), unanswered questions with their answer, recent chats', async () => {
  seed();
  const res = makeRes();
  await adminBot.handleBotOverview(auth, { query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  const d = res.body;
  assert.deepStrictEqual(d.stats, { conversations7d: 2, messages7d: 3, unanswered7d: 1, handoffsOpen: 2 });
  assert.deepStrictEqual(d.handoffs.map((h) => h.id), [3, 1, 2]);
  assert.strictEqual(d.unanswered[0].question, 'Can I get a refund on my order?', 'newest first');
  assert.ok(d.unanswered[0].answer.startsWith('I cannot see orders'));
  assert.strictEqual(d.unanswered[0].conversationId, CID1);
  const oldOne = d.unanswered.find((u) => u.conversationId === CID3);
  assert.strictEqual(oldOne.question, 'Old question from last month', 'older unanswered questions are listed too');
  assert.deepStrictEqual(d.recent.map((c) => c.id), [CID1, CID2, CID3]);
  assert.strictEqual(d.recent[0].firstQuestion, 'How much is Fluency Plus?');
  assert.strictEqual(d.recent[1].page, '/store');
});

test('overview works on an empty database', async () => {
  reset();
  const res = makeRes();
  await adminBot.handleBotOverview(auth, { query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.stats, { conversations7d: 0, messages7d: 0, unanswered7d: 0, handoffsOpen: 0 });
  assert.deepStrictEqual([res.body.handoffs, res.body.unanswered, res.body.recent], [[], [], []]);
});

test('conversation: validates the id, 404 when it is gone, otherwise every message in order', async () => {
  seed();
  let res = makeRes(); await adminBot.handleBotConversation(auth, { query: { id: 'nope' } }, res);
  assert.strictEqual(res.statusCode, 400);
  res = makeRes(); await adminBot.handleBotConversation(auth, { query: { id: '99999999-9999-4999-8999-999999999999' } }, res);
  assert.strictEqual(res.statusCode, 404);
  res = makeRes(); await adminBot.handleBotConversation(auth, { query: { id: CID1 } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.strictEqual(res.body.messages[3].human_flag, true);
  assert.strictEqual(res.body.conversation.page, '/pricing');
});

test('hand-off status: only open, answered or closed; unknown ids are 404', async () => {
  seed();
  const call = async (body) => { const res = makeRes(); await adminBot.handleBotHandoffUpdate(auth, { body }, res); return res; };
  assert.strictEqual((await call({ id: 'x', status: 'closed' })).statusCode, 400);
  assert.strictEqual((await call({ id: 1, status: 'deleted' })).statusCode, 400);
  assert.strictEqual((await call({ id: 99, status: 'closed' })).statusCode, 404);
  const ok = await call({ id: 1, status: 'answered' });
  assert.deepStrictEqual([ok.statusCode, ok.body.ok, T.bot_handoffs.find((h) => h.id === 1).status], [200, true, 'answered']);
  await call({ id: 1, status: 'open' });
  assert.strictEqual(T.bot_handoffs.find((h) => h.id === 1).status, 'open', 'can be reopened');
});

test('router: the three routes are mounted, and a non-admin is turned away', async () => {
  seed();
  const go = async (route, method, extra = {}) => { const res = makeRes(); await router(Object.assign({ method, query: { path: route }, headers: {}, body: {} }, extra), res); return res; };
  assert.strictEqual((await go('bot-overview', 'GET')).body.stats.handoffsOpen, 2);
  assert.strictEqual((await go('bot-conversation', 'GET', { query: { path: 'bot-conversation', id: CID2 } })).body.messages.length, 2);
  assert.strictEqual((await go('bot-handoff-update', 'POST', { body: { id: 3, status: 'closed' } })).body.status, 'closed');
  adminOk = false;
  try { assert.strictEqual((await go('bot-overview', 'GET')).statusCode, 403); } finally { adminOk = true; }
});

test('the admin page has every element the chat assistant card needs', () => {
  const html = fs.readFileSync(path.join(root, 'site/admin/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'site/admin/admin.js'), 'utf8');
  for (const id of ['bot-refresh', 'bot-stats', 'bot-handoffs', 'bot-unanswered', 'bot-recent', 'bot-transcript']) {
    assert.ok(html.includes('id="' + id + '"'), 'index.html needs #' + id);
    assert.ok(js.includes("'" + id + "'"), 'admin.js uses #' + id);
  }
  assert.ok(js.includes('loadBotOverview(); // same'), 'loaded when the dashboard opens');
  assert.ok(js.includes('escHtml(h.contact_email)') && js.includes('escHtml(m.content)') && js.includes('escHtml(u.question)'), 'visitor text is escaped');
});

test('the admin card renders requests, unanswered questions and transcripts safely (simulated page)', async () => {
  let JSDOM;
  try { ({ JSDOM } = require('jsdom')); } catch (e) { console.log('     (skipped: jsdom is not installed)'); return; }
  const html = fs.readFileSync(path.join(root, 'site/admin/index.html'), 'utf8');
  const js = fs.readFileSync(path.join(root, 'site/admin/admin.js'), 'utf8');
  const a = js.indexOf('// ---------- Website chat assistant ----------');
  const b = js.indexOf('// ---------- Selar orders ----------');
  assert.ok(a > 0 && b > a);
  const block = js.slice(a, b);
  const card = html.slice(html.indexOf('<div class="card" style="margin-top:28px">\n        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px">\n          <div style="font-weight:700">Website chat assistant'));
  const dom = new JSDOM('<!doctype html><body>' + card.slice(0, card.indexOf('<div class="card" style="margin-top:28px">', 20)) + '</body>', { runScripts: 'outside-only' });
  const w = dom.window;
  const api = { '/admin/bot-overview': null };
  w.__calls = [];
  w.__api = async (p, o) => { w.__calls.push([p, o && o.method]); if (p.startsWith('/admin/bot-overview')) return api['/admin/bot-overview']; if (p.startsWith('/admin/bot-conversation')) return api.convo; return { ok: true }; };
  api['/admin/bot-overview'] = {
    stats: { conversations7d: 12, messages7d: 40, unanswered7d: 3, handoffsOpen: 1 },
    handoffs: [{ id: 7, conversation_id: CID1, contact_email: 'ada@example.com', note: '<img src=x onerror="window.pwned=1">', status: 'open', created_at: iso(0), emailed_at: null }],
    unanswered: [{ conversationId: CID1, at: iso(0), question: '<script>window.pwned=2</script>', answer: 'Not sure.' }],
    recent: [{ id: CID1, created_at: iso(0), updated_at: iso(0), user_turns: 2, provider: 'tokenharbor', page: '/pricing', lang: 'en', firstQuestion: 'Hello' }],
  };
  api.convo = { conversation: { id: CID1, created_at: iso(0), provider: 'manus', page: '/store' }, messages: [{ role: 'user', content: '<b>hi</b>', human_flag: false }, { role: 'assistant', content: 'Hello!', human_flag: true }] };
  w.eval(`(function(){
    const apiFetch = window.__api;
    const escHtml = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const fmtNum = (n) => Number(n || 0).toLocaleString('en-US');
    const fmtDateTime = (i) => i;
    ${block}
    window.__load = loadBotOverview;
  })();`);
  await w.__load();
  const d = w.document;
  assert.ok(d.getElementById('bot-stats').textContent.includes('12 chats') && d.getElementById('bot-stats').textContent.includes('waiting: 1'));
  assert.ok(d.querySelector('#bot-handoffs a[href^="mailto:ada@example.com"]'));
  assert.ok(d.getElementById('bot-handoffs').textContent.includes('did not go out'), 'warns when the email to support failed');
  assert.ok(d.getElementById('bot-handoffs').textContent.includes('<img src=x'), 'shown as text');
  assert.strictEqual(d.querySelectorAll('#bot-handoffs img, #bot-unanswered script').length, 0);
  assert.strictEqual(w.pwned, undefined);
  d.querySelector('#bot-handoffs [data-bot-view]').click();
  await new Promise((r) => setTimeout(r, 20));
  const t = d.getElementById('bot-transcript');
  assert.strictEqual(t.hidden, false);
  assert.ok(t.textContent.includes('<b>hi</b>') && t.textContent.includes('asked for a person'));
  d.querySelector('#bot-handoffs [data-bot-handoff][data-bot-status="answered"]').click();
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(w.__calls.some(([p, m]) => p === '/admin/bot-handoff-update' && m === 'POST'), 'the Answered button posts the new status');
  d.getElementById('bot-transcript-close').click();
  assert.strictEqual(t.hidden, true);
});

(async () => {
  let pass = 0, fail = 0;
  for (const [name, fn] of tests) {
    try { await fn(); pass++; console.log('PASS ' + name); }
    catch (err) { fail++; console.log('FAIL ' + name + '\n     ' + String((err && err.stack) || err).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
