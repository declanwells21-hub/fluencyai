/* Fluency AI: phone "app shell".

   On phones (760px wide and below) this adds a fixed bottom tab bar to every public page:
     Home, Guides, Pricing, Partners (shown as "Hub" to partners), Account, More (About, FAQ, Privacy, Terms).
   The styles live in /assets/css/fl-mobile.css; on wider screens the bar is simply hidden.

   Also here:
     - "Account" opens the same sign-in popup as the Sign in buttons (/#signin opens it from pages that do not have it).
     - On the Partner Hub the page has its own tabs, so no bar is added; the logo there goes to Home instead.
   Nothing here is needed for the pages to work: if this file fails to load, the pages behave as before. */
(function () {
  'use strict';
  var doc = document;

  function cleanPath() {
    var p = location.pathname.replace(/\/+$/, '').replace(/\.html$/, '').replace(/\/index$/, '');
    return p || '/';
  }
  var path = cleanPath();

  function waitFor(test, ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function tick() {
        var v = test();
        if (v) return resolve(v);
        if (Date.now() - t0 > ms) return resolve(null);
        setTimeout(tick, 80);
      })();
    });
  }

  // ---- "/#signin" opens the sign-in popup (used by the Account tab on pages that do not carry the popup) ----
  function openSigninFromHash() {
    if (location.hash !== '#signin') return;
    waitFor(function () { return window.flAuth && window.flAuth.openLogin && window.flAuth; }, 5000).then(function (auth) {
      if (!auth) return;
      try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ignore */ }
      auth.openLogin();
    });
  }
  openSigninFromHash();

  // ---- Partner Hub: own tabs, no bar. Logo goes Home (it used to point at /partners, which sends partners back here). ----
  if (doc.querySelector('[data-screen-label="Partner hub"]')) {
    var fixLogo = function () {
      var links = doc.querySelectorAll('[data-screen-label="Partner hub"] > header a[href="/partners"]');
      for (var i = 0; i < links.length; i++) links[i].setAttribute('href', '/');
    };
    fixLogo();
    var header = doc.querySelector('[data-screen-label="Partner hub"] > header');
    if (header && window.MutationObserver) new MutationObserver(fixLogo).observe(header, { childList: true, subtree: true });
    return;
  }

  // ---- is the signed-in person a partner? (cache written by fl-partner-route.js; this only reads it) ----
  function knownPartner() {
    try {
      var uid = null;
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (/^sb-.+-auth-token$/.test(key)) {
          var s = JSON.parse(localStorage.getItem(key));
          if (s && s.user && s.user.id) { uid = s.user.id; break; }
        }
      }
      if (!uid) return false;
      var c = JSON.parse(localStorage.getItem('fl_partner_state') || 'null');
      return !!(c && c.uid === uid && c.partner);
    } catch (e) { return false; }
  }

  // ---- icons (Lucide, ISC licence) ----
  function icon(inner) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + inner + '</svg>';
  }
  var ICONS = {
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    guides: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    pricing: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    partners: '<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>',
    account: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    about: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    faq: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
    blog: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    privacy: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    terms: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
  };

  function el(tag, cls, html) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  // ---- which tab is "current" ----
  function currentTabId() {
    if (path === '/') return 'home';
    if (path === '/store' || path.indexOf('/guides') === 0) return 'guides';
    if (path === '/pricing') return 'pricing';
    if (path === '/partners' || path === '/partner-hub') return 'partners';
    if (/^\/(about|faq|privacy|terms)$/.test(path) || path === '/blog' || path.indexOf('/blog/') === 0) return 'more';
    return '';
  }

  // ---- the bar ----
  var bar = el('nav', 'fl-tabbar');
  bar.setAttribute('aria-label', 'Main');
  var current = currentTabId();
  var partnersTab, moreBtn;

  function addTab(id, label, href, onClick) {
    var t = href ? el('a', 'fl-tab') : el('button', 'fl-tab');
    if (href) t.setAttribute('href', href); else t.setAttribute('type', 'button');
    t.setAttribute('data-tab', id);
    t.innerHTML = icon(ICONS[id]) + '<span class="fl-tab-label">' + label + '</span>';
    if (id === current) t.setAttribute('aria-current', 'page');
    if (onClick) t.addEventListener('click', onClick);
    bar.appendChild(t);
    return t;
  }

  addTab('home', 'Home', '/');
  addTab('guides', 'Guides', '/store');
  addTab('pricing', 'Pricing', '/pricing');
  partnersTab = addTab('partners', 'Partners', '/partners');
  addTab('account', 'Account', null, function () {
    if (window.flAuth && window.flAuth.openLogin) window.flAuth.openLogin();
    else location.href = '/#signin';
  });
  moreBtn = addTab('more', 'More', null, function () { openSheet(); });
  moreBtn.setAttribute('aria-haspopup', 'dialog');

  function refreshPartnerTab() {
    var p = knownPartner();
    partnersTab.setAttribute('href', p ? '/partner-hub' : '/partners');
    partnersTab.querySelector('.fl-tab-label').textContent = p ? 'Hub' : 'Partners';
  }
  refreshPartnerTab();
  window.addEventListener('fl-auth-changed', function () {
    refreshPartnerTab();
    if (window.flPartnerRoute) window.flPartnerRoute.check().then(refreshPartnerTab);
  });
  window.addEventListener('storage', refreshPartnerTab);
  if (window.flPartnerRoute) window.flPartnerRoute.check().then(refreshPartnerTab);

  // ---- the "More" sheet ----
  var overlay = el('div', 'fl-sheet-overlay');
  var panel = el('div', 'fl-sheet');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'More');
  overlay.hidden = true;

  var head = el('div', 'fl-sheet-head');
  head.appendChild(el('span', 'fl-sheet-grip'));
  var title = el('span', 'fl-sheet-title', 'More');
  var closeBtn = el('button', 'fl-sheet-close', icon(ICONS.close));
  closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute('aria-label', 'Close');
  head.appendChild(title);
  head.appendChild(closeBtn);
  panel.appendChild(head);

  var list = el('div', 'fl-sheet-list');
  function addRow(id, label, href) {
    var a = el('a', 'fl-sheet-row', icon(ICONS[id]) + '<span>' + label + '</span>' + icon(ICONS.chevron));
    a.setAttribute('href', href);
    if (href === path || (href === '/' + path.slice(1))) a.setAttribute('aria-current', 'page');
    list.appendChild(a);
  }
  addRow('about', 'About', '/about');
  addRow('faq', 'FAQ', '/faq');
  addRow('blog', 'Blog', '/blog');
  addRow('privacy', 'Privacy policy', '/privacy');
  addRow('terms', 'Terms of use', '/terms');
  var support = window.FL_CONFIG && window.FL_CONFIG.supportEmail;
  if (support) addRow('mail', 'Contact support', 'mailto:' + support);
  panel.appendChild(list);
  overlay.appendChild(panel);

  var lastFocus = null;
  function openSheet() {
    lastFocus = doc.activeElement;
    overlay.hidden = false;
    // next frame, so the slide-in transition runs
    requestAnimationFrame(function () { overlay.classList.add('open'); });
    doc.documentElement.classList.add('fl-lock');
    moreBtn.setAttribute('aria-expanded', 'true');
    setTimeout(function () { closeBtn.focus({ preventScroll: true }); }, 30);
  }
  function closeSheet() {
    if (overlay.hidden) return;
    overlay.classList.remove('open');
    panel.style.transform = '';
    doc.documentElement.classList.remove('fl-lock');
    moreBtn.setAttribute('aria-expanded', 'false');
    setTimeout(function () { overlay.hidden = true; }, 220);
    if (lastFocus && doc.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }
  closeBtn.addEventListener('click', closeSheet);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeSheet(); });
  doc.addEventListener('keydown', function (e) {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { closeSheet(); return; }
    if (e.key === 'Tab') {
      var items = panel.querySelectorAll('button, a[href]');
      var first = items[0], last = items[items.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  // Tapping a link inside the sheet is a normal navigation; the page is replaced, so nothing else to do.

  // Drag the top of the sheet down to dismiss it, like a native sheet.
  (function () {
    var startY = null, dy = 0;
    head.addEventListener('touchstart', function (e) { startY = e.touches[0].clientY; dy = 0; panel.style.transition = 'none'; }, { passive: true });
    head.addEventListener('touchmove', function (e) {
      if (startY == null) return;
      dy = Math.max(0, e.touches[0].clientY - startY);
      panel.style.transform = 'translateY(' + dy + 'px)';
    }, { passive: true });
    function end() {
      if (startY == null) return;
      panel.style.transition = '';
      startY = null;
      if (dy > 80) closeSheet(); else panel.style.transform = '';
    }
    head.addEventListener('touchend', end);
    head.addEventListener('touchcancel', end);
  })();

  // Going back to a wide screen: close the sheet.
  if (window.matchMedia) {
    var mq = window.matchMedia('(min-width: 761px)');
    var onChange = function (e) { if (e.matches) closeSheet(); };
    if (mq.addEventListener) mq.addEventListener('change', onChange); else if (mq.addListener) mq.addListener(onChange);
  }

  doc.body.appendChild(bar);
  doc.body.appendChild(overlay);
  doc.body.classList.add('fl-has-tabbar');
})();

/* Website assistant: loads the chat widget (/assets/js/fl-bot.js) on the public pages, which all include this file.
   The widget skips the Partner Hub itself. To take the chat off the whole site, set  botEnabled: false  in
   fluency-config.js (FL_CONFIG), or delete this block. */
(function () {
  'use strict';
  if (window.__flBotLoaded || (window.FL_CONFIG && window.FL_CONFIG.botEnabled === false)) return;
  if (document.querySelector('script[data-fl-bot]')) return;
  var s = document.createElement('script');
  s.src = '/assets/js/fl-bot.js';
  s.defer = true;
  s.setAttribute('data-fl-bot', '');
  document.head.appendChild(s);
})();
