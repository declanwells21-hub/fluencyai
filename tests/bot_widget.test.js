// Run with:  node tests/bot_widget.test.js
// Tests the chat widget (site/assets/js/fl-bot.js) in a simulated browser page (jsdom) with a fake /api/bot.
// jsdom is not part of the site, so this file skips itself when it is not installed:
//   npm install --no-save jsdom     (then run again)
// What it proves: the launcher mounts only where it should, chips and answers render safely (no HTML from the
// server is ever interpreted, only our own links are clickable), pending answers are polled, errors and limits
// are friendly, a chat survives a reload, and the loader / CSS / link allowlist stay in step with the rest.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); } catch (e) {
  console.log('SKIP bot widget tests: jsdom is not installed (npm install --no-save jsdom)');
  process.exit(0);
}

const root = path.join(__dirname, '..');
const widgetSrc = fs.readFileSync(path.join(root, 'site/assets/js/fl-bot.js'), 'utf8');
const CID = '11111111-2222-4333-8444-555555555555';

function makePage({ pagePath = '/pricing', phone = false, config, storage = {}, api }) {
  const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body></body></html>', { url: 'https://fluencyai.app' + pagePath, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  if (config) w.FL_CONFIG = config;
  w.matchMedia = (q) => ({ matches: q.includes('max-width: 760px') ? phone : q.includes('min-width: 761px') ? !phone : false, addEventListener() {}, addListener() {} });
  const realTimeout = w.setTimeout.bind(w);
  w.setTimeout = (fn) => realTimeout(fn, 1);              // polling waits are shortened for the test
  const calls = [];
  w.fetch = async (url, opts = {}) => {
    const u = new URL(url, 'https://fluencyai.app');
    const call = { path: u.pathname, query: Object.fromEntries(u.searchParams), method: opts.method || 'GET', body: opts.body ? JSON.parse(opts.body) : null };
    calls.push(call);
    const r = await api(call);                           // may throw to simulate a network failure
    return { status: r.status || 200, json: async () => r.body };
  };
  w.eval(widgetSrc);
  const $ = (sel) => w.document.querySelector(sel);
  const api$ = {
    w, calls, $,
    launcher: () => $('.flbot-launcher'), panel: () => $('.flbot-panel'), input: () => $('.flbot-input'),
    msgs: (role) => Array.from(w.document.querySelectorAll('.flbot-msg--' + role)),
    open() { api$.launcher().click(); },
    type(text) { api$.input().value = text; api$.input().dispatchEvent(new w.Event('input', { bubbles: true })); },
    key(k, extra = {}) { const e = new w.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, extra)); api$.input().dispatchEvent(e); return e; },
  };
  return api$;
}
async function until(fn, label, ms = 2000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return; await new Promise((r) => setTimeout(r, 4)); }
  throw new Error('timed out waiting for: ' + label);
}
const done = (reply, extra = {}) => ({ body: Object.assign({ cid: CID, status: 'done', reply, human: false }, extra) });

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('the launcher mounts on public pages, but not on the Partner Hub or when switched off', () => {
  const p = makePage({ api: () => done('x') });
  assert.ok(p.launcher() && p.launcher().textContent.includes('Ask Fluency AI'));
  assert.strictEqual(p.panel().hidden, true);
  assert.ok(p.w.document.querySelector('link[data-fl-bot-css][href="/assets/css/fl-bot.css"]'));
  assert.strictEqual(makePage({ pagePath: '/partner-hub', api: () => done('x') }).launcher(), null);
  assert.strictEqual(makePage({ config: { botEnabled: false }, api: () => done('x') }).launcher(), null);
});

test('opening shows the greeting and four question chips; Escape closes and returns focus', () => {
  const p = makePage({ api: () => done('x') });
  p.open();
  assert.strictEqual(p.panel().hidden, false);
  assert.strictEqual(p.launcher().getAttribute('aria-expanded'), 'true');
  assert.ok(p.msgs('bot')[0].textContent.includes('Fluency AI assistant, an AI'));
  assert.strictEqual(p.w.document.querySelectorAll('.flbot-chip').length, 4);
  assert.ok(p.w.document.querySelector('.flbot-notice a[href="/privacy"]'), 'privacy link in the notice');
  p.w.document.dispatchEvent(new p.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.strictEqual(p.panel().hidden, true);
  assert.strictEqual(p.launcher().getAttribute('aria-expanded'), 'false');
});

test('a chip sends the question; the answer is shown safely and only our own links are clickable', async () => {
  const reply = 'The guide is $9. Buy it: https://selar.com/900z05076s or https://evil.example/x <img src=x onerror="window.pwned=1"> done.';
  const p = makePage({ api: () => done(reply, { human: true }) });
  p.open();
  p.w.document.querySelector('.flbot-chip').click();
  await until(() => p.msgs('bot').length === 2, 'the answer');
  const post = p.calls.find((c) => c.path === '/api/bot/chat');
  assert.strictEqual(post.method, 'POST');
  assert.deepStrictEqual([post.body.message, post.body.page], ['How much are the exam guides?', '/pricing']);
  const bubble = p.msgs('bot')[1];
  const anchors = Array.from(bubble.querySelectorAll('a'));
  assert.strictEqual(anchors.length, 1);
  assert.strictEqual(anchors[0].href, 'https://selar.com/900z05076s');
  assert.strictEqual(anchors[0].getAttribute('target'), '_blank');
  assert.ok(/noopener/.test(anchors[0].getAttribute('rel')));
  assert.ok(bubble.textContent.includes('https://evil.example/x') && bubble.textContent.includes('<img src=x'), 'shown as plain text');
  assert.strictEqual(p.w.document.querySelectorAll('.flbot img').length, 0);
  assert.strictEqual(p.w.pwned, undefined);
  assert.strictEqual(p.w.localStorage.getItem('flbot.cid.v1'), CID);
  const mail = p.w.document.querySelector('.flbot-human a.flbot-btn');
  assert.ok(mail.href.startsWith('mailto:support@fluencyai.app?subject='));
  assert.ok(decodeURIComponent(mail.href).includes('How much are the exam guides?'));
  assert.strictEqual(p.w.document.querySelector('.flbot-chips').hidden, true, 'chips go away after the first question');
});

test('a pending answer is polled with a typing indicator, then shown', async () => {
  let polls = 0;
  const p = makePage({
    api: (c) => {
      if (c.path === '/api/bot/chat') return { body: { cid: CID, status: 'pending', retryMs: 1500 } };
      polls++;
      return polls < 3 ? { body: { status: 'pending', retryMs: 1500 } } : { body: { status: 'done', reply: 'It is $12 per month.', human: false } };
    },
  });
  p.open(); p.type('How much is Fluency Plus?'); p.key('Enter');
  await until(() => p.w.document.querySelector('.flbot-typing'), 'typing indicator');
  assert.strictEqual(p.w.document.querySelector('.flbot').getAttribute('aria-busy'), 'true');
  await until(() => p.msgs('bot').length === 2, 'the polled answer');
  assert.strictEqual(p.w.document.querySelector('.flbot-typing'), null);
  assert.ok(p.msgs('bot')[1].textContent.includes('$12'));
  assert.ok(polls >= 3 && p.calls.filter((c) => c.path === '/api/bot/poll').every((c) => c.query.cid === CID));
  assert.strictEqual(p.w.document.querySelector('.flbot-send').disabled, false, 'ready for the next question');
});

test('Enter sends, Shift+Enter does not, empty input does nothing, and long input is cut to 500 characters', async () => {
  const p = makePage({ api: () => done('ok') });
  p.open();
  p.type('   '); p.key('Enter');
  p.type('first line'); const shift = p.key('Enter', { shiftKey: true });
  assert.strictEqual(shift.defaultPrevented, false);
  assert.strictEqual(p.calls.length, 0);
  p.type('x'.repeat(650)); p.key('Enter');
  await until(() => p.calls.length === 1, 'one request');
  assert.strictEqual(p.calls[0].body.message.length, 500);
  assert.strictEqual(p.input().value, '');
});

test('a network failure shows a friendly message and gives the text back', async () => {
  const p = makePage({ api: () => { throw new Error('offline'); } });
  p.open(); p.type('Is it live yet?'); p.key('Enter');
  await until(() => p.msgs('bot').some((m) => m.textContent.includes("couldn't reach")), 'the friendly message');
  assert.strictEqual(p.input().value, 'Is it live yet?');
  assert.strictEqual(p.w.document.querySelector('.flbot-typing'), null);
  assert.strictEqual(p.w.document.querySelector('.flbot-send').disabled, false);
});

test('rate-limit and server errors show their friendly reply with the email-support card', async () => {
  for (const status of [429, 502]) {
    const p = makePage({ api: () => ({ status, body: { error: 'x', reply: 'I am busy, try again soon or email support@fluencyai.app.', human: true } }) });
    p.open(); p.type('hello'); p.key('Enter');
    await until(() => p.msgs('bot').some((m) => m.textContent.includes('I am busy')), 'the reply for ' + status);
    assert.ok(p.w.document.querySelector('.flbot-human a[href^="mailto:support@fluencyai.app"]'));
  }
});

test('the length limit disables the box and "Start a new chat" begins again', async () => {
  const p = makePage({ api: () => done('This chat has reached its length limit.', { status: 'limit', human: true }) });
  p.open(); p.type('one more'); p.key('Enter');
  await until(() => p.input().disabled, 'the box to lock');
  const again = Array.from(p.w.document.querySelectorAll('.flbot-btn--ghost')).find((b) => /new chat/i.test(b.textContent));
  assert.ok(again);
  again.click();
  assert.strictEqual(p.input().disabled, false);
  assert.strictEqual(p.w.localStorage.getItem('flbot.cid.v1'), null);
  assert.ok(p.msgs('bot')[0].textContent.includes('Fluency AI assistant, an AI'));
});

test('reopening restores the transcript; a chat the server no longer knows starts clean', async () => {
  const p = makePage({
    storage: { 'flbot.cid.v1': CID },
    api: () => ({ body: { cid: CID, pending: false, messages: [{ role: 'user', content: 'Hi' }, { role: 'assistant', content: 'Hello! How can I help?' }] } }),
  });
  p.open();
  await until(() => p.msgs('bot').length === 1 && p.msgs('user').length === 1, 'the transcript');
  assert.ok(p.calls[0].path === '/api/bot/history' && p.calls[0].query.cid === CID);
  assert.strictEqual(p.msgs('bot')[0].textContent, 'Hello! How can I help?');
  assert.strictEqual(p.w.document.querySelector('.flbot-chips'), null, 'no chips in a chat that has started');

  const gone = makePage({ storage: { 'flbot.cid.v1': CID }, api: () => ({ status: 404, body: { error: 'not_found' } }) });
  gone.open();
  await until(() => gone.msgs('bot').length === 1 && gone.msgs('bot')[0].textContent.includes('assistant, an AI'), 'a fresh greeting');
  assert.strictEqual(gone.w.localStorage.getItem('flbot.cid.v1'), null);
});

test('a chat that was waiting for an answer when the page reloaded keeps waiting', async () => {
  const p = makePage({
    storage: { 'flbot.cid.v1': CID },
    api: (c) => c.path === '/api/bot/history'
      ? { body: { cid: CID, pending: true, messages: [{ role: 'user', content: 'How much is B1?' }] } }
      : { body: { status: 'done', reply: 'The Goethe B1 guide is $9.', human: false } },
  });
  p.open();
  await until(() => p.msgs('bot').some((m) => m.textContent.includes('$9')), 'the answer after reload');
  assert.strictEqual(p.w.document.querySelector('.flbot-typing'), null);
});

test('on phones, opening the chat locks page scroll and closing releases it', () => {
  const p = makePage({ phone: true, api: () => done('x') });
  p.open();
  assert.ok(p.w.document.documentElement.classList.contains('flbot-lock'));
  p.w.document.querySelector('.flbot-iconbtn[aria-label="Close chat"]').click();
  assert.ok(!p.w.document.documentElement.classList.contains('flbot-lock'));
});

test('"Start a new chat" icon in the header clears the conversation', async () => {
  const p = makePage({ api: () => done('Fine.') });
  p.open(); p.type('hello'); p.key('Enter');
  await until(() => p.msgs('bot').length === 2, 'an answer');
  p.w.document.querySelector('.flbot-iconbtn[aria-label="Start a new chat"]').click();
  assert.strictEqual(p.msgs('user').length, 0);
  assert.strictEqual(p.msgs('bot').length, 1);
  assert.strictEqual(p.w.localStorage.getItem('flbot.cid.v1'), null);
});

test('the loader in fl-mobile.js is present, and every public page includes fl-mobile.js', () => {
  const mobile = fs.readFileSync(path.join(root, 'site/assets/js/fl-mobile.js'), 'utf8');
  assert.ok(mobile.includes("/assets/js/fl-bot.js") && mobile.includes('botEnabled'));
  const pages = ['index', 'about', 'faq', 'pricing', 'store', 'partners', 'terms', 'privacy', 'partner-hub'].map((n) => 'site/' + n + '.html').concat('site/guides/index.html');
  for (const f of pages) assert.ok(fs.readFileSync(path.join(root, f), 'utf8').includes('/assets/js/fl-mobile.js'), f + ' must include fl-mobile.js');
});

test('fl-mobile.js really adds the widget script once, and respects botEnabled:false', () => {
  const src = fs.readFileSync(path.join(root, 'site/assets/js/fl-mobile.js'), 'utf8');
  const run = (cfg) => {
    const d = new JSDOM('<!doctype html><html><head></head><body><main>hi</main></body></html>', { url: 'https://fluencyai.app/pricing', runScripts: 'outside-only', pretendToBeVisual: true });
    d.window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
    if (cfg) d.window.FL_CONFIG = cfg;
    d.window.eval(src);
    return Array.from(d.window.document.querySelectorAll('script[data-fl-bot]')).map((s) => s.getAttribute('src'));
  };
  assert.deepStrictEqual(run(), ['/assets/js/fl-bot.js']);
  assert.deepStrictEqual(run({ botEnabled: false }), []);
});

test('the CSS is scoped to the widget and the phone sheet sits above the bottom tab bar', () => {
  const css = fs.readFileSync(path.join(root, 'site/assets/css/fl-bot.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = css.replace(/@media[^{]*\{/g, '').replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g, '').split('}').map((r) => r.split('{')[0].trim()).filter(Boolean);
  for (const sel of selectors.join(',').split(',').map((s) => s.trim()).filter(Boolean)) {
    assert.ok(/^(\.flbot|html\.flbot-lock)/.test(sel), 'unscoped selector: ' + sel);
  }
  const phone = css.slice(css.indexOf('@media (max-width: 760px)'));
  assert.ok(/\.flbot-panel\s*\{[^}]*z-index:\s*1001/.test(phone), 'panel above the tab bar (900) and the More sheet (1000)');
  assert.ok(/--fl-tab-h/.test(phone), 'launcher floats above the tab bar');
});

test('the link allowlist in the widget matches the server\'s', () => {
  const grab = (src, re) => (re.exec(src) || [])[1].match(/'([^']+)'/g).map((s) => s.replace(/'/g, '')).sort();
  const server = grab(fs.readFileSync(path.join(root, 'api/_lib/bot/brain.js'), 'utf8'), /DEFAULT_LINK_HOSTS = \[([^\]]*)\]/);
  const widget = grab(widgetSrc, /LINK_HOSTS = \[([^\]]*)\]/);
  assert.deepStrictEqual(widget, server);
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
