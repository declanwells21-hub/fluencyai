/* Home page behaviour. Replays states recorded from the design handoff (home-states.js).
   Launch state: this build is the "waitlist" state of the design. */
(function () {
  "use strict";
  var D = window.FL_HOME; if (!D) return;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var chat = document.querySelector("[data-fl-chat]");
  var tpl = document.createElement("template");

  /* ---- morph: make `dst` match `html`, touching only what differs (keeps focus, hover, transitions) ---- */
  function parse(html) { tpl.innerHTML = html.trim(); return tpl.content; }
  function syncAttrs(d, s) {
    for (var i = d.attributes.length - 1; i >= 0; i--) { var n = d.attributes[i].name; if (!s.hasAttribute(n) && n !== "value") d.removeAttribute(n); }
    for (var j = 0; j < s.attributes.length; j++) { var a = s.attributes[j]; if (a.name === "value" && d.tagName === "INPUT") continue; if (d.getAttribute(a.name) !== a.value) d.setAttribute(a.name, a.value); }
  }
  function syncNode(d, s) {
    if (d.nodeType !== s.nodeType || d.nodeName !== s.nodeName) { d.replaceWith(s.cloneNode(true)); return; }
    if (d.nodeType === 3) { if (d.nodeValue !== s.nodeValue) d.nodeValue = s.nodeValue; return; }
    if (d.nodeType !== 1) return;
    syncAttrs(d, s);
    var tag = d.nodeName; if (tag === "FL-COACH" || tag === "SELECT" || tag === "SVG") { if (tag === "SVG" && d.innerHTML !== s.innerHTML) d.innerHTML = s.innerHTML; return; }
    syncKids(d, s);
  }
  function syncKids(d, s) {
    var dk = d.childNodes, sk = s.childNodes, i = 0;
    for (; i < sk.length; i++) { if (i < dk.length) syncNode(dk[i], sk[i]); else d.appendChild(sk[i].cloneNode(true)); }
    while (dk.length > sk.length) d.removeChild(d.lastChild);
  }
  function morphInner(el, html) { syncKids(el, parse(html)); }
  function morphSelf(el, html) { var f = parse(html).firstElementChild; if (f) syncNode(el, f); }

  /* ---- hero demo (timer from the design: 420 ms per tick) ---- */
  var hero = document.querySelector('[data-w="hero"]');
  if (hero && !reduce) {
    var i = 0, T = D.hero.table, S = D.hero.seq;
    morphInner(hero, T[S[0]]);
    setInterval(function () { if (document.hidden) return; i = (i + 1) % S.length; morphInner(hero, T[S[i]]); }, 420);
  }

  /* ---- selector widgets ---- */
  function keepFocus(el, j, fn) { fn(); var b = el.querySelectorAll("button")[j]; if (b && document.activeElement !== b) b.focus({ preventScroll: true }); }
  ["repair", "stage", "corr"].forEach(function (name) {
    var el = chat.querySelector('[data-w="' + name + '"]'); if (!el) return;
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !el.contains(b)) return;
      var j = [].indexOf.call(el.querySelectorAll("button"), b); if (j < 0) return;
      keepFocus(el, j, function () { morphInner(el, D.widgets[name].states[j]); });
    });
  });
  var faq = chat.querySelector('[data-w="faq"]'), faqOpen = null;
  if (faq) faq.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b || !faq.contains(b)) return;
    var j = [].indexOf.call(faq.querySelectorAll("button"), b); if (j < 0 || j >= 10) return;
    faqOpen = faqOpen === j ? null : j;
    keepFocus(faq, j, function () { morphInner(faq, faqOpen === null ? D.widgets.faq.init : D.widgets.faq.states[j]); });
  });

  /* ---- coach follows the conversation ---- */
  var coach = document.querySelector('[data-w="coach"]'), cur = "happy";
  if (coach && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return; var k = e.target.getAttribute("data-cx");
        if (k !== cur && D.coach[k]) { cur = k; morphSelf(coach, D.coach[k]); }
      });
    }, { rootMargin: "-35% 0px -55% 0px" });
    document.querySelectorAll("[data-cx]").forEach(function (n) { io.observe(n); });
  }

  /* ---- scroll to the waitlist ---- */
  function toJoin() { if (window.flScrollTo) window.flScrollTo("join"); else { var j = document.getElementById("join"); if (j) j.scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); } }
  document.querySelectorAll("button").forEach(function (b) {
    if (b.textContent.trim() === "Join the waitlist" && !b.closest("#join")) b.addEventListener("click", toJoin);
  });

  /* ---- pop-ups (Partners, Exam guides) ---- */
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/, popEl = null, opener = null;
  function closePop() { if (!popEl) return; popEl.remove(); popEl = null; if (opener) { opener.focus({ preventScroll: true }); opener = null; } }
  function openPop(name, from) {
    closePop(); opener = from;
    var wrap = document.createElement("div"); wrap.innerHTML = D.pops[name].open.trim(); popEl = wrap.firstElementChild;
    popEl.addEventListener("click", function (e) {
      if (e.target === popEl) return closePop();
      var b = e.target.closest("button"); if (!b) return;
      if (b.getAttribute("aria-label") === "Close") return closePop();
      if (name === "partners" && /Apply to become a partner/.test(b.textContent)) {
        var inp = popEl.querySelector("input[type=email]"), v = inp ? inp.value.trim() : "";
        if (!EMAIL.test(v)) return;
        if (window.flSubmit) window.flSubmit("partner", { email: v, source: "home_partner_popup" });
        var f = parse(D.pops.partners.sent).firstElementChild; if (f) syncNode(popEl, f);
      }
    });
    document.body.appendChild(popEl);
    var c = popEl.querySelector('[aria-label="Close"]'); if (c) c.focus({ preventScroll: true });
  }
  document.querySelectorAll("[data-pop]").forEach(function (b) { b.addEventListener("click", function () { openPop(b.getAttribute("data-pop"), b); }); });
  window.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });

  /* ---- waitlist form ---- */
  var join = document.getElementById("join"), erroring = false, done = false;
  if (join) {
    var input = function () { return join.querySelector("input[type=email]"); };
    var submit = function () {
      if (done) return; var inp = input(), sel = join.querySelector("select"), v = inp ? inp.value.trim() : "";
      if (!EMAIL.test(v)) { erroring = true; morphSelf(join, D.join.err); if (input()) input().focus({ preventScroll: true }); return; }
      var lang = sel ? sel.value : "French"; done = true;
      if (window.flSubmit) window.flSubmit("waitlist", { email: v, language: lang, state: (window.FL_CONFIG && FL_CONFIG.launchState) || "waitlist", source: "home_waitlist" });
      morphSelf(join, D.join.done.replace("{{email}}", v.replace(/&/g, "&amp;").replace(/</g, "&lt;")).replace("{{lang}}", lang.replace(/&/g, "&amp;").replace(/</g, "&lt;")));
    };
    join.addEventListener("click", function (e) { var b = e.target.closest("button"); if (b && join.contains(b)) submit(); });
    join.addEventListener("input", function (e) { if (erroring && e.target.type === "email") { erroring = false; morphSelf(join, D.join.init); } });
    join.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.type === "email") { e.preventDefault(); submit(); } });
  }
})();
