/* Fluency AI: website assistant (chat widget).

   A floating "Ask Fluency AI" button on every public page. It talks to /api/bot/chat, /api/bot/poll and
   /api/bot/history (api/bot.js). The answer comes back either straight away ({status:"done"}) or later
   ({status:"pending"}, then the widget polls). No AI key is ever in the browser.

   Loaded by a small block at the end of /assets/js/fl-mobile.js, which every public page already includes.
   Switch it off for the whole site with  window.FL_CONFIG.botEnabled = false  (fluency-config.js),
   or remove that block from fl-mobile.js. The Partner Hub never shows it.
   Nothing here is needed for the pages to work: if this file fails to load, the pages behave as before. */
(function () {
  'use strict';
  if (window.__flBotLoaded) return;
  window.__flBotLoaded = true;

  var cfg = window.FL_CONFIG || {};
  if (cfg.botEnabled === false) return;

  var doc = document;
  var path = (location.pathname.replace(/\/+$/, '').replace(/\.html$/, '').replace(/\/index$/, '')) || '/';
  if (path === '/partner-hub') return;

  var API = cfg.botApi || '/api/bot';
  var SUPPORT = cfg.supportEmail || 'support@fluencyai.app';
  var MAX_CHARS = 500;
  var POLL_LIMIT_MS = 100000;
  var KEY_CID = 'flbot.cid.v1';
  var KEY_OPEN = 'flbot.open';
  var LINK_HOSTS = ['fluencyai.app', 'www.fluencyai.app', 'selar.com', 'www.selar.com', 'selar.co'];

  var GREETING = "Hi! I'm the Fluency AI assistant, an AI. Ask me about the app, plans, exam guides or the partner programme.";
  var CHIPS = ['How much are the exam guides?', 'What does Fluency Plus include?', 'Which exams do you cover?', 'How does the partner programme work?'];
  var NOTICE = "AI assistant: it can make mistakes. Please don't share passwords or payment details. Chats are saved to improve our support. ";
  var FALLBACK_NET = "I couldn't reach the assistant. Please check your connection and try again.";
  var FALLBACK_GENERIC = 'Sorry, I can\'t answer right now. Please try again in a moment, or email ' + SUPPORT + ' and a person will help you.';

  // ---------- small helpers ----------
  var store = {
    get: function (area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
    set: function (area, k, v) { try { window[area].setItem(k, v); } catch (e) { /* private mode */ } },
    del: function (area, k) { try { window[area].removeItem(k); } catch (e) { /* ignore */ } }
  };

  function el(tag, cls, attrs) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  var ICONS = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.6-.8L3 20.5l1.5-4.6A8.4 8.4 0 1 1 21 11.5Z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>',
    fresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>'
  };

  function hostAllowed(url) {
    try { return LINK_HOSTS.indexOf(new URL(url).hostname.toLowerCase()) !== -1; } catch (e) { return false; }
  }

  /** Text -> nodes. Only our own links (and Selar) become clickable; everything else stays plain text. */
  function fillText(node, text) {
    var re = /https?:\/\/[^\s<>"')\]]+/g, last = 0, m;
    text = String(text);
    while ((m = re.exec(text))) {
      var url = m[0].replace(/[.,;:!?]+$/, '');
      if (m.index > last) node.appendChild(doc.createTextNode(text.slice(last, m.index)));
      if (hostAllowed(url)) {
        var a = el('a', '', { href: url, rel: 'noopener noreferrer' });
        var same = false;
        try { same = new URL(url).origin === location.origin; } catch (e) { /* ignore */ }
        if (!same) a.setAttribute('target', '_blank');
        a.textContent = url.replace(/^https?:\/\/(www\.)?/, '');
        node.appendChild(a);
      } else {
        node.appendChild(doc.createTextNode(url));
      }
      last = m.index + url.length;
      re.lastIndex = last;
    }
    if (last < text.length) node.appendChild(doc.createTextNode(text.slice(last)));
  }

  // ---------- CSS ----------
  if (!doc.querySelector('link[data-fl-bot-css]')) {
    var css = el('link', '', { rel: 'stylesheet', href: '/assets/css/fl-bot.css', 'data-fl-bot-css': '' });
    doc.head.appendChild(css);
  }

  // ---------- state ----------
  var state = { cid: store.get('localStorage', KEY_CID) || '', open: false, busy: false, greeted: false, restored: false, pollTimer: null, pollStart: 0, lastQuestion: '', ended: false, typingNode: null, handoffSent: false };

  // ---------- DOM ----------
  var root = el('div', 'flbot');
  var launcher = el('button', 'flbot-launcher', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'flbot-panel', 'aria-label': 'Open chat with the Fluency AI assistant' });
  launcher.innerHTML = ICONS.chat + '<span class="flbot-launcher-label">Ask Fluency AI</span>';

  var panel = el('section', 'flbot-panel', { id: 'flbot-panel', role: 'dialog', 'aria-label': 'Fluency AI assistant' });
  panel.hidden = true;

  var head = el('header', 'flbot-head');
  var avatar = el('div', 'flbot-avatar'); avatar.innerHTML = ICONS.chat;
  var title = el('div', 'flbot-title');
  title.innerHTML = '<strong>Fluency AI assistant</strong><span>AI · answers in a few seconds</span>';
  var freshBtn = el('button', 'flbot-iconbtn', { type: 'button', 'aria-label': 'Start a new chat', title: 'New chat' }); freshBtn.innerHTML = ICONS.fresh;
  var closeBtn = el('button', 'flbot-iconbtn', { type: 'button', 'aria-label': 'Close chat' }); closeBtn.innerHTML = ICONS.close;
  head.appendChild(avatar); head.appendChild(title); head.appendChild(freshBtn); head.appendChild(closeBtn);

  var log = el('div', 'flbot-log', { role: 'log', 'aria-live': 'polite', 'aria-relevant': 'additions' });
  var chips = el('div', 'flbot-chips');

  var foot = el('div', 'flbot-foot');
  var notice = el('p', 'flbot-notice');
  notice.appendChild(doc.createTextNode(NOTICE));
  var priv = el('a', '', { href: '/privacy', target: '_blank', rel: 'noopener' }); priv.textContent = 'Privacy';
  notice.appendChild(priv);
  notice.appendChild(doc.createTextNode(' · '));
  var talk = el('button', 'flbot-linkbtn', { type: 'button' }); talk.textContent = 'Talk to a person';
  talk.addEventListener('click', function () { greet(); addHumanCard(true); });
  notice.appendChild(talk);
  var form = el('form', 'flbot-form', { novalidate: '' });
  var label = el('label', 'flbot-sr', { for: 'flbot-input' }); label.textContent = 'Your question';
  var input = el('textarea', 'flbot-input', { id: 'flbot-input', rows: '1', maxlength: String(MAX_CHARS), placeholder: 'Ask a question…', autocomplete: 'off', enterkeyhint: 'send' });
  var sendBtn = el('button', 'flbot-send', { type: 'submit', 'aria-label': 'Send' }); sendBtn.innerHTML = ICONS.send;
  var count = el('div', 'flbot-count'); count.hidden = true;
  form.appendChild(label); form.appendChild(input); form.appendChild(sendBtn);
  foot.appendChild(notice); foot.appendChild(form); foot.appendChild(count);

  panel.appendChild(head); panel.appendChild(log); panel.appendChild(foot);
  root.appendChild(panel); root.appendChild(launcher);

  // ---------- rendering ----------
  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function addMsg(role, text) {
    var n = el('div', 'flbot-msg flbot-msg--' + role);
    fillText(n, text);
    log.insertBefore(n, state.typingNode && state.typingNode.parentNode === log ? state.typingNode : null);
    scrollDown();
    return n;
  }
  function addNote(text) {
    var n = el('div', 'flbot-msg flbot-msg--note'); n.textContent = text; log.appendChild(n); scrollDown(); return n;
  }
  function showTyping() {
    if (state.typingNode && state.typingNode.parentNode === log) return;
    var t = el('div', 'flbot-typing', { 'aria-hidden': 'true' });
    t.innerHTML = '<i></i><i></i><i></i>';
    state.typingNode = t; log.appendChild(t); scrollDown();
    var live = el('span', 'flbot-sr'); live.textContent = 'The assistant is typing'; t.appendChild(live);
  }
  function hideTyping() {
    if (state.typingNode && state.typingNode.parentNode) state.typingNode.parentNode.removeChild(state.typingNode);
    state.typingNode = null;
  }
  // "Talk to a person": a small form in the chat. It posts to /api/bot/handoff, which saves the request and emails
  // support (Reply-To = the visitor's address). If the server cannot take it, a plain email link is the way out.
  var EMAIL_OK = /^[^\s@<>"',;:()\[\]\\]+@[^\s@<>"',;:()\[\]\\]+\.[^\s@<>"',;:()\[\]\\]{2,}$/;
  function mailtoHref() {
    var subject = 'Question from the Fluency AI website';
    var body = 'Hi Fluency AI team,\n\n' + (state.lastQuestion ? 'My question: ' + state.lastQuestion + '\n\n' : '') + '(Sent from ' + location.href + ')';
    return 'mailto:' + SUPPORT + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }
  function addHumanCard(openForm) {
    if (state.handoffSent) return;
    var existing = log.querySelector('.flbot-human');
    if (existing) { if (openForm) { var open = existing.querySelector('[data-flbot-open-form]'); if (open) open.click(); } existing.scrollIntoView && existing.scrollIntoView({ block: 'nearest' }); return; }
    var card = el('div', 'flbot-human');
    var intro = el('div'); intro.textContent = 'Want a person to look at this?';
    var ask = el('button', 'flbot-btn', { type: 'button', 'data-flbot-open-form': '' }); ask.textContent = 'Talk to a person';
    card.appendChild(intro); card.appendChild(ask);
    log.appendChild(card); scrollDown();
    ask.addEventListener('click', function () { buildHandoffForm(card); });
    if (openForm) ask.click();
  }
  function buildHandoffForm(card) {
    card.innerHTML = '';
    var f = el('form', 'flbot-hform', { novalidate: '' });
    var l1 = el('label', 'flbot-flabel', { for: 'flbot-h-email' }); l1.textContent = 'Your email';
    var email = el('input', 'flbot-finput', { id: 'flbot-h-email', type: 'email', autocomplete: 'email', inputmode: 'email', placeholder: 'you@example.com', required: '', maxlength: '254' });
    var l2 = el('label', 'flbot-flabel', { for: 'flbot-h-note' }); l2.textContent = 'Anything to add? (optional)';
    var note = el('textarea', 'flbot-finput flbot-fnote', { id: 'flbot-h-note', rows: '3', maxlength: '1000', placeholder: 'Tell us more so we can help faster.' });
    var trap = el('input', 'flbot-sr', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
    var fine = el('p', 'flbot-ffine'); fine.textContent = "We'll use your email only to reply to this question. We'll email you from our support address.";
    var err = el('p', 'flbot-ferr', { role: 'alert' }); err.hidden = true;
    var row = el('div', 'flbot-frow');
    var go = el('button', 'flbot-btn', { type: 'submit' }); go.textContent = 'Send to our team';
    var cancel = el('button', 'flbot-btn flbot-btn--ghost', { type: 'button' }); cancel.textContent = 'Cancel';
    row.appendChild(go); row.appendChild(cancel);
    [l1, email, l2, note, trap, fine, err, row].forEach(function (n) { f.appendChild(n); });
    card.appendChild(f); scrollDown(); email.focus();

    cancel.addEventListener('click', function () { card.parentNode && card.parentNode.removeChild(card); addHumanCard(false); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var addr = email.value.trim();
      err.hidden = true;
      if (!EMAIL_OK.test(addr)) { err.textContent = 'Please enter a valid email address so we can reply.'; err.hidden = false; email.focus(); return; }
      go.disabled = true; cancel.disabled = true; go.textContent = 'Sending…';
      jsonFetch(API + '/handoff', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: addr, note: note.value.trim(), cid: state.cid || undefined, hp: trap.value })
      }).then(function (r) {
        if (r.status === 200 && r.body && r.body.ok) {
          state.handoffSent = true;
          card.innerHTML = '';
          var ok = el('div'); ok.textContent = 'Thanks! Our team will reply to ';
          var strong = el('strong'); strong.textContent = addr; ok.appendChild(strong); ok.appendChild(doc.createTextNode(' by email.'));
          card.appendChild(ok); scrollDown();
          return;
        }
        throw new Error(r.status === 400 ? 'bad' : r.status === 429 ? 'limit' : 'server');
      }).catch(function (e2) {
        go.disabled = false; cancel.disabled = false; go.textContent = 'Send to our team';
        var kind = e2 && e2.message;
        err.textContent = kind === 'bad' ? 'That email address does not look right. Please check it.'
          : kind === 'limit' ? 'Too many requests from this device. Please email us directly instead:'
          : "We couldn't send that just now. You can try again, or email us directly:";
        if (kind !== 'bad') { var a = el('a', '', { href: mailtoHref() }); a.textContent = SUPPORT; err.appendChild(doc.createTextNode(' ')); err.appendChild(a); }
        err.hidden = false;
      });
    });
  }
  function showChips() {
    chips.innerHTML = '';
    CHIPS.forEach(function (c) {
      var b = el('button', 'flbot-chip', { type: 'button' }); b.textContent = c;
      b.addEventListener('click', function () { send(c); });
      chips.appendChild(b);
    });
    log.appendChild(chips); chips.hidden = false; scrollDown();
  }
  function hideChips() { chips.hidden = true; }

  function setBusy(b) {
    state.busy = b;
    sendBtn.disabled = b || state.ended;
    root.setAttribute('aria-busy', b ? 'true' : 'false');
  }
  function resetLog() {
    stopPoll(); hideTyping(); log.innerHTML = ''; state.greeted = false; state.ended = false; state.lastQuestion = ''; state.handoffSent = false;
    input.disabled = false; input.value = ''; autoGrow(); setBusy(false);
  }
  function greet() {
    if (state.greeted) return;
    state.greeted = true;
    addMsg('bot', GREETING);
    showChips();
  }

  // ---------- network ----------
  function stopPoll() { if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; } }

  function jsonFetch(url, opts) {
    opts = opts || {};
    opts.credentials = 'same-origin';
    return fetch(url, opts).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) { return { status: res.status, body: body || {} }; });
    });
  }

  function deliver(body) {
    stopPoll(); hideTyping();
    var text = body.reply || FALLBACK_GENERIC;
    addMsg('bot', text);
    if (body.human) addHumanCard(false);
    if (body.status === 'limit') endChat();
    setBusy(false);
    if (!panel.hidden && window.matchMedia && !window.matchMedia('(max-width: 760px)').matches && !state.ended) input.focus();
  }
  function endChat() {
    state.ended = true; input.disabled = true; sendBtn.disabled = true;
    var b = el('button', 'flbot-btn flbot-btn--ghost', { type: 'button' }); b.textContent = 'Start a new chat';
    b.addEventListener('click', newChat);
    log.appendChild(b); scrollDown();
  }

  function send(text) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    if (!text || state.busy || state.ended) return;
    if (text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS);
    hideChips();
    state.lastQuestion = text;
    addMsg('user', text);
    input.value = ''; autoGrow(); updateCount();
    setBusy(true); showTyping();

    jsonFetch(API + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, cid: state.cid || undefined, page: path, lang: (doc.documentElement.lang || navigator.language || '').slice(0, 12) })
    }).then(function (r) {
      var b = r.body;
      if (b.cid && /^[0-9a-f-]{36}$/i.test(b.cid) && b.cid !== '00000000-0000-4000-8000-000000000000') { state.cid = b.cid; store.set('localStorage', KEY_CID, b.cid); }
      if (b.status === 'pending') { startPoll(b.retryMs); return; }
      if (b.status === 'done' || b.status === 'limit') { deliver(b); return; }
      if (r.status === 400) { hideTyping(); setBusy(false); return; }
      deliver({ reply: b.reply, human: b.human !== false, status: b.status });
    }).catch(function () {
      hideTyping(); setBusy(false);
      addMsg('bot', FALLBACK_NET);
      input.value = text; autoGrow(); updateCount();
    });
  }

  function startPoll(retryMs) {
    state.pollStart = Date.now();
    schedulePoll(retryMs);
  }
  function schedulePoll(ms) {
    stopPoll();
    ms = Math.min(8000, Math.max(1200, Number(ms) || 2500));
    state.pollTimer = setTimeout(poll, ms);
  }
  function poll() {
    if (!state.cid) { deliver({ reply: FALLBACK_GENERIC, human: true }); return; }
    if (Date.now() - state.pollStart > POLL_LIMIT_MS) { deliver({ reply: "That is taking longer than expected. Please try again, or email " + SUPPORT + " and a person will help you.", human: true }); return; }
    jsonFetch(API + '/poll?cid=' + encodeURIComponent(state.cid)).then(function (r) {
      var b = r.body;
      if (r.status === 404) { state.cid = ''; store.del('localStorage', KEY_CID); deliver({ reply: 'Sorry, something went wrong with this chat. Please send your question again.', human: false }); return; }
      if (b.status === 'pending') { schedulePoll(b.retryMs); return; }
      if (b.status === 'done' || b.status === 'error' || b.status === 'timeout') { deliver(b); return; }
      if (b.status === 'idle') { restoreHistory(true); return; }
      schedulePoll(3000);
    }).catch(function () { schedulePoll(4000); });
  }

  function restoreHistory(afterIdle) {
    if (!state.cid) { greet(); return; }
    jsonFetch(API + '/history?cid=' + encodeURIComponent(state.cid)).then(function (r) {
      if (r.status === 404) { state.cid = ''; store.del('localStorage', KEY_CID); resetLog(); greet(); return; }
      var msgs = (r.body && r.body.messages) || [];
      if (!msgs.length) { setBusy(false); hideTyping(); greet(); return; }
      stopPoll(); hideTyping(); log.innerHTML = ''; state.greeted = true;
      msgs.forEach(function (m) { addMsg(m.role === 'assistant' ? 'bot' : 'user', m.content); if (m.role === 'user') state.lastQuestion = m.content; });
      if (r.body.pending && !afterIdle) { setBusy(true); showTyping(); startPoll(1500); } else { setBusy(false); }
    }).catch(function () { greet(); });
  }

  function newChat() {
    state.cid = ''; store.del('localStorage', KEY_CID);
    resetLog(); greet(); input.focus();
  }

  // ---------- composer behaviour ----------
  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 112) + 'px'; }
  function updateCount() {
    var n = input.value.length;
    if (n < MAX_CHARS - 100) { count.hidden = true; return; }
    count.hidden = false;
    count.textContent = n + ' / ' + MAX_CHARS;
    count.className = 'flbot-count' + (n >= MAX_CHARS ? ' is-over' : ' is-near');
  }
  input.addEventListener('input', function () { autoGrow(); updateCount(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
  freshBtn.addEventListener('click', newChat);

  // ---------- open / close ----------
  function isPhone() { return !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches); }
  function open() {
    if (!panel.hidden) return;
    panel.hidden = false; state.open = true;
    launcher.setAttribute('aria-expanded', 'true');
    launcher.setAttribute('aria-label', 'Close chat with the Fluency AI assistant');
    store.set('sessionStorage', KEY_OPEN, '1');
    if (isPhone()) doc.documentElement.classList.add('flbot-lock');
    if (!state.restored) { state.restored = true; if (state.cid) restoreHistory(false); else greet(); } else { scrollDown(); }
    if (!isPhone()) input.focus();
  }
  function close() {
    if (panel.hidden) return;
    panel.hidden = true; state.open = false;
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-label', 'Open chat with the Fluency AI assistant');
    store.del('sessionStorage', KEY_OPEN);
    doc.documentElement.classList.remove('flbot-lock');
    launcher.focus();
  }
  launcher.addEventListener('click', function () { if (panel.hidden) open(); else close(); });
  closeBtn.addEventListener('click', close);
  doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) close(); });
  if (window.matchMedia) {
    var mq = window.matchMedia('(min-width: 761px)');
    var onChange = function (e) { if (e.matches) doc.documentElement.classList.remove('flbot-lock'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  // ---------- go ----------
  function mount() {
    doc.body.appendChild(root);
    if (store.get('sessionStorage', KEY_OPEN) === '1') open();
  }
  if (doc.body) mount(); else doc.addEventListener('DOMContentLoaded', mount);

  // a tiny hook so other buttons on the site can open the chat: <a href="#chat" data-fl-open-chat>
  window.flBot = { open: open, close: close };
  doc.addEventListener('click', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-fl-open-chat]') : null;
    if (t) { e.preventDefault(); open(); }
  });
})();
