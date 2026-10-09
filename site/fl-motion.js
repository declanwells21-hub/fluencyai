/* Fluency site motion: inertial scroll (desktop pointer only) + scroll-reveal.
   Reveal uses the Web Animations API, so it never touches React-managed inline styles.
   Targets: children of [data-fl-chat], [data-fl-reveal] and its children marked [data-fl-stagger]. */
(() => {
  if (window.__flMotion) return; window.__flMotion = true;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;
  const EASE = "cubic-bezier(.16,1,.3,1)";

  // ---- inertial scroll ----
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
  if (!reduce && fine && !window.FL_NO_LENIS) {
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
    // Words stay vivid at the edges and fade almost out behind the reading column
    const fade = innerWidth < 760 ? "linear-gradient(180deg,#000 0%,rgba(0,0,0,.35) 18%,rgba(0,0,0,.18) 50%,rgba(0,0,0,.35) 82%,#000 100%)" : "linear-gradient(90deg,#000 0%,rgba(0,0,0,.55) 18%,rgba(0,0,0,.14) 38%,rgba(0,0,0,.14) 72%,rgba(0,0,0,.55) 88%,#000 100%)";
    layer.style.webkitMaskImage = fade; layer.style.maskImage = fade;
    const k = parseFloat(root.getAttribute("data-fl-void") || "1");
    layer.style.backgroundColor = cs.backgroundColor; layer.style.backgroundImage = cs.backgroundImage;
    root.style.background = "transparent"; root.style.position = "relative"; root.style.zIndex = "1";
    const small = innerWidth < 760, n = small ? 20 : HELLO.length, cols = small ? 4 : 8, rows = Math.ceil(n / cols);
    const order = HELLO.slice().sort(() => Math.random() - .5).slice(0, n);
    order.forEach((w, i) => {
      const c = i % cols, r = Math.floor(i / cols);
      const x = (c + .15 + Math.random() * .7) / cols * 100, y = (r + .15 + Math.random() * .7) / rows * 100;
      const s = document.createElement("span");
      const size = small ? 14 + Math.random() * 16 : 16 + Math.random() * 30;
      s.textContent = w;
      s.style.cssText = "position:absolute;white-space:nowrap;font-family:var(--font-display),system-ui,sans-serif;font-weight:700;letter-spacing:-.01em;color:#fff;will-change:transform;";
      s.style.left = x + "%"; s.style.top = y + "%"; s.style.fontSize = size.toFixed(0) + "px";
      s.style.opacity = (k * (0.03 + (size / 46) * 0.035)).toFixed(3);
      s.style.transform = "translate(-50%,-50%)";
      layer.appendChild(s);
      if (!reduce) {
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

  // ---- reveal ----
  if (reduce || !("IntersectionObserver" in window) || !Element.prototype.animate) return;
  const seen = new WeakSet();
  let batch = [], flushing = false;
  const flush = () => {
    batch.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
    batch.forEach((el, i) => { const a = el.__flAnim; if (a) { a.effect.updateTiming({ delay: Math.min(i, 6) * 70 }); a.play(); } });
    batch = []; flushing = false;
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target); batch.push(e.target);
      if (!flushing) { flushing = true; requestAnimationFrame(flush); }
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });

  const prep = (el) => {
    if (seen.has(el) || !(el instanceof HTMLElement) || el.hasAttribute("data-fl-stagger")) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight * 0.9 && r.bottom > 0 && performance.now() < 1200) return; // already on screen at load: no flash
    const js = getComputedStyle(el).justifySelf;
    const dx = js === "end" ? -0 : 0; // Y-only: X offsets caused horizontal overflow
    const from = { opacity: 0, transform: `translate3d(${dx}px, 22px, 0) scale(.985)`, transformOrigin: js === "end" ? "100% 0" : "0 0" };
    const a = el.animate([from, { opacity: 1, transform: "none" }], { duration: 760, easing: EASE, fill: "backwards" });
    a.pause(); a.currentTime = 0; el.__flAnim = a;
    io.observe(el);
  };
  const scan = () => {
    document.querySelectorAll("[data-fl-chat] > *, [data-fl-reveal], [data-fl-stagger] > *").forEach(prep);
  };
  const mo = new MutationObserver(() => { cancelAnimationFrame(mo.t); mo.t = requestAnimationFrame(scan); });
  const boot = () => { scan(); mo.observe(document.body, { childList: true, subtree: true }); };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot) : boot();
})();
