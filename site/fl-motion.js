/* Fluency site motion: scroll-reveal, floating background, clean section URLs.
   Scrolling is native (mouse wheel, keyboard and touchpad behave exactly like the browser). The old inertial-scroll
   library is now opt-in only: set window.FL_LENIS = true before this file loads to bring it back.
   Reveal uses the Web Animations API, so it never touches React-managed inline styles.
   Targets: children of [data-fl-chat], [data-fl-reveal] and its children marked [data-fl-stagger]. */
(() => {
  if (window.__flMotion) return; window.__flMotion = true;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const EASE = "cubic-bezier(.16,1,.3,1)";

  // Sections reached by a link or a clean URL (/how, /features, /join) stop below the sticky header
  const sm = document.createElement("style");
  sm.textContent = "section[id],main[id]{scroll-margin-top:96px}";
  document.head.appendChild(sm);

  // ---- inertial scroll (opt-in only, see top of file) ----
  let lenis = null;
  const startLenis = () => {
    if (reduce || !fine || !window.Lenis || lenis) return;
    const st = document.createElement("style");
    st.textContent = "html.lenis,html.lenis body{height:auto}.lenis.lenis-smooth{scroll-behavior:auto!important}.lenis.lenis-stopped{overflow:hidden}";
    document.head.appendChild(st);
    lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 0.9, smoothWheel: true, anchors: { offset: -90 } });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // Pause while a modal is open so the dialog scrolls, not the page
    new MutationObserver(() => {
      const open = !!document.querySelector('[role="dialog"][aria-modal="true"]');
      open ? lenis.stop() : lenis.start();
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (!reduce && fine && window.FL_LENIS === true) {
    const s = document.createElement("script");
    s.src = "/assets/vendor/lenis-1.1.13.min.js";
    s.onload = startLenis; document.head.appendChild(s);
  }
  window.flScrollTo = (target, offset = -90) => {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset, duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: reduce ? "auto" : "smooth" });
  };


  // ---- floating multilingual background ----
  const HELLO = ["Hello","Bonjour","Hallo","Hola","Ciao","Olá","Merhaba","Cześć","Hej","Hoi","Привет","Γειά σου","مرحبا","שלום","नमस्ते","হ্যালো","こんにちは","안녕하세요","你好","Xin chào","สวัสดี","Halo","Habari","Sannu","Ndewo","Ẹ n lẹ","Sawubona","Molo","Salut","Ahoj","Szia","Bună","Здравейте","Hei","Tere","Labas","Sveiki","Kamusta","Salam","ሰላም"];
  const floatBg = () => {
    if (document.getElementById("fl-void")) return;
    const root = document.querySelector("[data-fl-page]");
    if (!root) return;
    const cs = getComputedStyle(root);
    const layer = document.createElement("div");
    layer.id = "fl-void"; layer.setAttribute("aria-hidden", "true");
    layer.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;contain:strict;";
    const small = innerWidth < 760 || matchMedia("(pointer: coarse)").matches;
    // Words stay vivid at the edges and fade almost out behind the reading column. The fade is baked into each word's
    // opacity (a full-screen mask over 40 moving words made the browser repaint the whole screen on every scroll frame).
    const STOPS = [[0, 1], [18, .55], [38, .14], [72, .14], [88, .55], [100, 1]];
    const edgeAt = (x) => { for (let i = 1; i < STOPS.length; i++) if (x <= STOPS[i][0]) { const [x0, a] = STOPS[i - 1], [x1, b] = STOPS[i]; return a + (b - a) * (x - x0) / (x1 - x0); } return 1; };
    const k = parseFloat(root.getAttribute("data-fl-void") || "1");
    layer.style.backgroundColor = cs.backgroundColor; layer.style.backgroundImage = cs.backgroundImage;
    root.style.background = "transparent"; root.style.position = "relative"; root.style.zIndex = "1";
    const n = small ? 14 : HELLO.length, cols = small ? 4 : 8, rows = Math.ceil(n / cols);
    const order = HELLO.slice().sort(() => Math.random() - .5).slice(0, n);
    order.forEach((w, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = (c + .15 + Math.random() * .7) / cols * 100, y = (r + .15 + Math.random() * .7) / rows * 100;
      const s = document.createElement("span");
      const size = small ? 14 + Math.random() * 16 : 16 + Math.random() * 30;
      s.textContent = w;
      s.style.cssText = "position:absolute;white-space:nowrap;font-family:var(--font-display),system-ui,sans-serif;font-weight:700;letter-spacing:-.01em;color:#fff;" + (small ? "" : "will-change:transform;");
      s.style.left = x + "%"; s.style.top = y + "%"; s.style.fontSize = size.toFixed(0) + "px";
      // phones: the edge fade is baked into each word's opacity instead of a screen-sized mask, and the words stay still
      const edge = small ? 0.18 + 0.82 * Math.pow(Math.abs(y / 50 - 1), 2) : edgeAt(x);
      s.style.opacity = (k * edge * (0.03 + (size / 46) * 0.035)).toFixed(3);
      s.style.transform = "translate(-50%,-50%)";
      layer.appendChild(s);
      if (!reduce && !small) {
        const amp = 10 + size * .45, dur = 9000;
        s.animate([{ transform: `translate(-50%,calc(-50% - ${amp}px))` }, { transform: `translate(-50%,calc(-50% + ${amp}px))` }],
          { duration: dur, iterations: Infinity, direction: "alternate", easing: "cubic-bezier(.45,0,.55,1)", delay: -((x / 100) * dur * 1.6 + (y / 100) * dur * .4) });
      }
    });
    document.body.prepend(layer);
  };
  let bgTries = 0;
  const bootBg = () => { floatBg(); if (!document.getElementById("fl-void") && ++bgTries < 25) setTimeout(bootBg, 120); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", bootBg) : bootBg();

  // ---- clean section URLs: /how, /features, /join open the home page at that section (no "#" needed) ----
  const SECTION_PATHS = { "/how": "how", "/features": "features", "/join": "join" };
  const pathKey = (path) => (path || "").replace(/\/+$/, "") || "/";
  const jumpTo = (id, smooth) => {
    const el = document.getElementById(id); if (!el) return false;
    const top = el.getBoundingClientRect().top + window.scrollY - 90;
    window.scrollTo({ top, behavior: smooth && !reduce ? "smooth" : "auto" });
    return true;
  };
  // Opening the page at /how (or /features, /join): scroll there once the page has rendered, and again after
  // images and fonts settle, unless the visitor has already started scrolling themselves.
  const startId = window.FL_SECTION || SECTION_PATHS[pathKey(location.pathname)];
  if (startId) {
    let moved = false;
    ["wheel", "touchstart", "keydown", "mousedown"].forEach((t) => addEventListener(t, () => { moved = true; }, { passive: true, once: true }));
    let tries = 0;
    const go = () => { if (moved) return; if (!jumpTo(startId, false) && ++tries < 40) setTimeout(go, 100); };
    document.readyState === "complete" ? go() : addEventListener("load", go);
    addEventListener("load", () => setTimeout(() => { if (!moved) jumpTo(startId, false); }, 900));
  }
  // On the page that has the section, clicking its link scrolls smoothly and updates the address bar without a reload.
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]"); if (!a) return;
    let u; try { u = new URL(a.getAttribute("href"), location.href); } catch (_) { return; }
    if (u.origin !== location.origin) return;
    const id = SECTION_PATHS[pathKey(u.pathname)];
    if (!id || !document.getElementById(id)) return;
    e.preventDefault();
    jumpTo(id, true);
    if (pathKey(location.pathname) !== pathKey(u.pathname)) history.pushState({ flSection: id }, "", u.pathname);
  });
  addEventListener("popstate", () => {
    const id = SECTION_PATHS[pathKey(location.pathname)];
    if (id) jumpTo(id, true); else if (pathKey(location.pathname) === "/") window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  });

  // ---- reveal ----
  if (reduce || !("IntersectionObserver" in window) || !Element.prototype.animate) return;
  const seen = new WeakSet();
  let batch = [], flushing = false;
  const flush = () => {
    batch.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    batch.forEach((el, i) => { const a = el.__flAnim; if (a) { a.effect.updateTiming({ delay: Math.min(i, 6) * 70 }); a.play(); } });
    batch = []; flushing = false;
  };
  const pending = new Set();   // revealed-on-scroll elements still waiting to play
  const onHit = (entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      ioSmall.unobserve(e.target); ioTall.unobserve(e.target); pending.delete(e.target); batch.push(e.target);
      if (!flushing) { flushing = true; requestAnimationFrame(flush); }
    });
  };
  const MARGIN = "0px 0px -8% 0px";
  // Small elements: reveal once 8% is visible. Tall elements (e.g. the whole guide list, 10,000px+ on a phone)
  // can never show 8% of themselves in a phone-sized screen, so they reveal as soon as they touch the viewport.
  const ioSmall = new IntersectionObserver(onHit, { rootMargin: MARGIN, threshold: 0.08 });
  const ioTall = new IntersectionObserver(onHit, { rootMargin: MARGIN, threshold: 0 });
  // Safety net: if a browser never delivers the observer callback, anything on screen is shown after scrolling stops.
  let rescueT = 0;
  const rescue = () => {
    pending.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        ioSmall.unobserve(el); ioTall.unobserve(el); pending.delete(el); batch.push(el);
      }
    });
    if (batch.length && !flushing) { flushing = true; requestAnimationFrame(flush); }
  };
  const kickRescue = () => { clearTimeout(rescueT); rescueT = setTimeout(rescue, 350); };
  addEventListener("scroll", kickRescue, { passive: true });
  addEventListener("resize", kickRescue, { passive: true });
  addEventListener("load", () => setTimeout(rescue, 1500));

  const prep = (el) => {
    if (seen.has(el) || !(el instanceof HTMLElement) || el.hasAttribute("data-fl-stagger")) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.9 && r.bottom > 0 && performance.now() < 1200) return; // already on screen at load: no flash
    const js = getComputedStyle(el).justifySelf;
    const dx = js === "end" ? -0 : 0; // Y-only: X offsets caused horizontal overflow
    const from = { opacity: 0, transform: fine ? `translate3d(${dx}px, 22px, 0) scale(.985)` : "translate3d(0, 12px, 0)", transformOrigin: js === "end" ? "100% 0" : "0 0" };
    const a = el.animate([from, { opacity: 1, transform: "none" }], { duration: fine ? 760 : 420, easing: EASE, fill: "backwards" });
    a.pause(); a.currentTime = 0; el.__flAnim = a;
    pending.add(el);
    (r.height > innerHeight * 0.6 ? ioTall : ioSmall).observe(el);
  };
  const scan = () => {
    document.querySelectorAll("[data-fl-chat] > *, [data-fl-reveal], [data-fl-stagger] > *").forEach(prep);
  };
  const mo = new MutationObserver(() => { cancelAnimationFrame(mo.t); mo.t = requestAnimationFrame(scan); });
  const boot = () => { scan(); mo.observe(document.body, { childList: true, subtree: true }); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
