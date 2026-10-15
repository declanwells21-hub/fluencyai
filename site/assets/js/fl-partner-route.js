/* Fluency AI: sends partners straight to the Partner Hub.

   The "Partners" link on every page normally opens /partners (the page where people apply). For someone who is
   already a partner that is the wrong page, so this script:

     1. On a click on any "Partners" link: if the signed-in person is a partner, opens /partner-hub directly.
     2. On /partners itself (typed address, bookmark, the sign-in popup finishing): sends partners to /partner-hub.
     3. Remembers the answer in this browser (key "fl_partner_state") so the click is instant, and re-checks it in
        the background every 10 minutes. It asks the same database function the Partner Hub uses (fl_my_partner).

   Everyone else (signed out, or signed in but not a partner) keeps the normal /partners page.
   A partner can still open the apply page with /partners?view=apply.

   Needs /config.js loaded before it (for the Supabase address and key). Never blocks a page: if anything fails,
   the link simply behaves like a normal link. */
(function () {
  'use strict';

  var HUB = '/partner-hub';
  var APPLY = '/partners';
  var CACHE_KEY = 'fl_partner_state';
  var FRESH_MS = 10 * 60 * 1000;   // how long an answer is trusted before it is checked again
  var WAIT_MS = 2500;              // longest a click waits for an unknown answer before using the normal link

  function cleanPath(p) { return String(p || '').replace(/\/+$/, '') || '/'; }
  var path = cleanPath(location.pathname);

  function wantsApplyPage() { return /[?&]view=apply(&|$)/.test(location.search); }

  // ---- the signed-in person (same storage the sign-in popup writes: sb-<project>-auth-token) ----
  function readSession() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (/^sb-.+-auth-token$/.test(key)) {
          var s = JSON.parse(localStorage.getItem(key));
          if (s && s.access_token && s.user && s.user.id) return s;
        }
      }
    } catch (e) { /* storage blocked: treat as signed out */ }
    return null;
  }

  // ---- the remembered answer ----
  function readCache(uid) {
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (c && c.uid === uid) return c;
    } catch (e) { /* ignore */ }
    return null;
  }
  function writeCache(uid, partner) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: uid, partner: !!partner, at: Date.now() })); } catch (e) { /* ignore */ }
  }
  function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* ignore */ } }

  function isKnownPartner() {
    var s = readSession();
    var c = s && readCache(s.user.id);
    return !!(c && c.partner);
  }

  // ---- ask the database ----
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

  function getToken(session) {
    var now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at > now + 30) return Promise.resolve(session.access_token);
    // Expired: let the sign-in script refresh it (it knows how), if it is on this page.
    return waitFor(function () { return window.flAuth && window.flAuth.getSession && window.flAuth; }, 3000).then(function (auth) {
      if (!auth) return null;
      return auth.getSession().then(function (fresh) { return fresh && fresh.access_token ? fresh.access_token : null; });
    });
  }

  var inflight = null;
  /** Resolves to true (partner), false (not a partner / signed out) or null (could not find out). */
  function check() {
    if (inflight) return inflight;
    var session = readSession();
    if (!session) { clearCache(); return Promise.resolve(false); }
    var url = window.__SUPABASE_URL, anon = window.__SUPABASE_ANON_KEY;
    if (!url || !anon) return Promise.resolve(null);

    inflight = getToken(session).then(function (token) {
      if (!token) return null;
      return fetch(url + '/rest/v1/rpc/fl_my_partner', {
        method: 'POST',
        headers: { apikey: anon, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: '{}'
      }).then(function (res) {
        if (!res.ok) return null;
        return res.json();
      }).then(function (data) {
        if (!data || !data.status) return null;
        // "approved" and "paused" both have a hub to look at; "none", "pending" and "rejected" do not.
        var partner = data.status === 'approved' || data.status === 'paused';
        writeCache(session.user.id, partner);
        return partner;
      });
    }).catch(function () { return null; }).then(function (answer) { inflight = null; return answer; });
    return inflight;
  }

  // ---- 1. clicks on "Partners" links ----
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || (a.target && a.target !== '_self')) return;

    var u;
    try { u = new URL(a.getAttribute('href'), location.href); } catch (err) { return; }
    if (u.origin !== location.origin || cleanPath(u.pathname) !== APPLY || u.hash) return;
    if (/[?&]view=apply(&|$)/.test(u.search)) return;

    var session = readSession();
    if (!session) return;                                   // signed out: normal link

    var cached = readCache(session.user.id);
    if (cached && cached.partner) {                         // known partner: straight to the hub
      e.preventDefault();
      location.href = HUB;
      return;
    }
    if (cached && Date.now() - cached.at < FRESH_MS) return; // known non-partner: normal link

    // Not known yet: find out, but never keep the person waiting for long.
    e.preventDefault();
    var finished = false;
    function go(partner) {
      if (finished) return;
      finished = true;
      location.href = partner ? HUB : a.href;
    }
    a.setAttribute('aria-busy', 'true');
    setTimeout(function () { go(false); }, WAIT_MS);
    check().then(function (partner) { go(partner === true); });
  }, true);

  // ---- 2. landing on /partners, and keeping the answer fresh ----
  function onPageLoad() {
    var session = readSession();
    if (!session) { clearCache(); return; }
    var onApplyPage = path === APPLY && !wantsApplyPage();
    var cached = readCache(session.user.id);

    if (onApplyPage && cached && cached.partner) { location.replace(HUB); return; }

    if (!cached || Date.now() - cached.at > FRESH_MS) {
      check().then(function (partner) {
        if (partner === true && onApplyPage) location.replace(HUB);
      });
    }
  }
  onPageLoad();

  // ---- 3. signing in or out (the sign-in popup announces this) ----
  window.addEventListener('fl-auth-changed', function () {
    if (!readSession()) { clearCache(); return; }
    check().then(function (partner) {
      if (partner === true && path === APPLY && !wantsApplyPage()) location.replace(HUB);
    });
  });

  // Other scripts (the mobile tab bar) can ask the same questions.
  window.flPartnerRoute = { check: check, isKnownPartner: isKnownPartner, hubPath: HUB };
})();
