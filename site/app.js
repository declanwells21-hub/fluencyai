// ============ ICONS ============
function renderIcons() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const size = el.getAttribute('data-size') || 18;
    if (window.lucide && lucide.createElement) {
      // handled by lucide.createIcons via <i> markers below instead
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.innerHTML = '';
    const i = document.createElement('i');
    i.setAttribute('data-lucide', name);
    i.style.width = size + 'px';
    i.style.height = size + 'px';
    el.appendChild(i);
  });
  if (window.lucide) lucide.createIcons();
}

// ============ THEME TOGGLE + MOBILE HAMBURGER MENU ============
// Wrapped together in one try/catch: previously, an unguarded
// getElementById().addEventListener() for the theme toggle ran BEFORE the
// hamburger menu was wired up. If that ever threw (e.g. the toggle
// missing on a given page/breakpoint), the hamburger's own click handler
// - declared further down in the same script - would silently never run
// at all, leaving the button visible but completely dead. Every lookup
// below is now null-checked, and the whole block is wrapped so a problem
// in one control can never take out another.
let isLight = false;
function syncKnob() {
  document.querySelectorAll('#fl-knob, #fl-knob-m').forEach(k => {
    k.style.transform = isLight ? 'translateX(27px)' : 'translateX(0)';
  });
  document.querySelectorAll('#fl-sun, #fl-sun-m').forEach(s => {
    s.style.opacity = isLight ? '0' : '.5';
  });
}
function toggleTheme() {
  isLight = !isLight;
  document.body.setAttribute('data-fl-theme', isLight ? 'light' : 'dark');
  syncKnob();
}
try {
  const themeToggle = document.getElementById('fl-theme-toggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
  const themeToggleM = document.getElementById('fl-theme-toggle-m');
  if (themeToggleM) themeToggleM.addEventListener('click', toggleTheme);
} catch (err) {
  console.error('[Fluency] Theme toggle setup failed:', err);
}

let hamburger, mobileMenu;
function closeMobileMenu() {
  if (!mobileMenu || !mobileMenu.classList.contains('open')) return;
  mobileMenu.classList.remove('open');
  mobileMenu.setAttribute('aria-hidden', 'true');
  if (hamburger) hamburger.setAttribute('aria-expanded', 'false');
  document.body.style.overflowY = '';
}
function openMobileMenu() {
  mobileMenu.classList.add('open');
  mobileMenu.setAttribute('aria-hidden', 'false');
  hamburger.setAttribute('aria-expanded', 'true');
  document.body.style.overflowY = 'hidden';
}
try {
  hamburger = document.getElementById('fl-hamburger');
  mobileMenu = document.getElementById('fl-mobile-menu');
  if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.contains('open') ? closeMobileMenu() : openMobileMenu();
  });
  mobileMenu.querySelectorAll('a.r-mm-link').forEach(a => {
    a.addEventListener('click', closeMobileMenu);
  });
  document.addEventListener('click', (e) => {
    if (!mobileMenu.classList.contains('open')) return;
    if (mobileMenu.contains(e.target) || hamburger.contains(e.target)) return;
    closeMobileMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobileMenu();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1040) closeMobileMenu();
  });
  }
} catch (err) {
  console.error('[Fluency] Hamburger menu setup failed:', err);
}

// ============ NAV SHRINK ON SCROLL ============
const nav = document.getElementById('fl-nav');
window.addEventListener('scroll', () => {
  const s = window.scrollY > 60;
  nav.style.width = s ? 'min(880px, calc(100% - 28px))' : 'min(1180px, calc(100% - 28px))';
  nav.style.padding = s ? '8px 8px 8px 18px' : '11px 11px 11px 22px';
  nav.style.boxShadow = s ? '0 14px 44px rgba(4,18,27,.42)' : '0 20px 60px rgba(4,18,27,.34)';
}, { passive: true });

// ============ HERO FLOATING GREETING WORDS ============
function spawnWords() {
  const host = document.getElementById('fl-words');
  if (!host || host.childElementCount) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const isMobile = window.innerWidth <= 1040;
  // Lanes assume a two-column hero (text on the left, product card on the
  // right) on desktop, scattered around that layout. On mobile the hero
  // stacks into a single column, so these lanes stay confined to the
  // badge/headline band at the very top (roughly the first quarter of the
  // hero's height) - kept well clear of the "No placement test..." /
  // "Free on iOS and Android..." checklist further down, which was
  // previously getting words drifting behind it and hurting legibility.
  const lanes = isMobile ? [
    [4, 30, 1, 5], [36, 30, 2, 6], [70, 26, 1, 5],
    [6, 26, 8, 5], [42, 24, 9, 6], [72, 24, 10, 5],
    [4, 24, 15, 5], [38, 28, 16, 5], [68, 28, 17, 5],
    [10, 30, 21, 4],
  ] : [
    [2, 12, 4, 78], [2, 14, 6, 82], [3, 13, 10, 70],
    [20, 62, 2, 12], [28, 58, 3, 10],
    [66, 30, 8, 74], [72, 26, 4, 66], [70, 28, 14, 60],
    [40, 30, 2, 9], [52, 24, 84, 12],
  ];
  const pool = GREETINGS.slice().sort(() => Math.random() - 0.5).slice(0, lanes.length);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const sizeRange = isMobile ? [12, 21] : [13, 30];

  pool.forEach(([text], i) => {
    const [lx, lw, ly, lh] = lanes[i];
    const el = document.createElement('span');
    el.textContent = text;
    el.className = 'fl-word fl-anim';
    const size = Math.round(rnd(sizeRange[0], sizeRange[1]));
    const op = +(0.1 + Math.random() * 0.24).toFixed(3);
    const s = el.style;
    s.left = rnd(lx, lx + lw).toFixed(2) + '%';
    s.top = rnd(ly, ly + lh).toFixed(2) + '%';
    s.font = '600 ' + size + 'px/1 var(--font-display)';
    s.color = Math.random() > 0.55 ? 'var(--cyan-400)' : 'var(--teal-400)';
    s.letterSpacing = '-.01em';
    s.filter = size < 17 ? 'blur(.6px)' : 'none';
    s.setProperty('--o', op);
    s.setProperty('--d', rnd(10, 18).toFixed(1) + 's');
    s.setProperty('--dl', (-Math.random() * 30).toFixed(1) + 's');
    s.setProperty('--r0', rnd(-2.5, 2.5).toFixed(2) + 'deg');
    s.setProperty('--r1', rnd(-3.5, 3.5).toFixed(2) + 'deg');
    for (let k = 1; k <= 3; k++) {
      s.setProperty('--x' + k, rnd(-46, 46).toFixed(1) + 'px');
      s.setProperty('--y' + k, rnd(-58, 58).toFixed(1) + 'px');
    }
    host.appendChild(el);
  });
}

// ============ HERO CARD PARALLAX ============
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && window.innerWidth > 1040) {
  window.addEventListener('mousemove', (e) => {
    const a = document.getElementById('fl-card-a'), b = document.getElementById('fl-card-b');
    const x = (e.clientX / window.innerWidth - 0.5), y = (e.clientY / window.innerHeight - 0.5);
    if (a) a.style.translate = (x * 18).toFixed(1) + 'px ' + (y * 13).toFixed(1) + 'px';
    if (b) b.style.translate = (x * -22).toFixed(1) + 'px ' + (y * -15).toFixed(1) + 'px';
  }, { passive: true });
}

// ============ REPAIR CHIPS ============
let repairIdx = 0;
function renderRepairs() {
  const host = document.getElementById('repair-chips');
  host.innerHTML = '';
  REPAIRS.forEach((r, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'repair-chip' + (i === repairIdx ? ' active' : '');
    btn.innerHTML = '<span class="fl-icon" data-icon="' + r[0] + '" data-size="16"></span>' + r[1];
    const pick = () => { repairIdx = i; renderRepairs(); renderRepairDetail(); renderIcons(); };
    btn.addEventListener('click', pick);
    btn.addEventListener('mouseenter', pick);
    host.appendChild(btn);
  });
  renderIcons();
}
function renderRepairDetail() {
  const r = REPAIRS[repairIdx];
  document.getElementById('repair-tag').textContent = r[2];
  document.getElementById('repair-said').textContent = r[3];
  document.getElementById('repair-does').textContent = r[4];
}

// ============ PHRASE MARQUEE ============
function renderPhraseMarquee() {
  const host = document.getElementById('phrase-marquee');
  const list = [...PHRASES, ...PHRASES];
  host.innerHTML = list.map(([text, gloss]) =>
    '<span style="display:flex;align-items:baseline;gap:11px;white-space:nowrap">' +
    '<span style="font:var(--fw-bold) clamp(.95rem,1.3vw,1.15rem)/1 var(--font-display);letter-spacing:-.02em;color:var(--tx);opacity:.34">' + text + '</span>' +
    '<span style="font:var(--fw-medium) 11px/1 var(--font-mono);color:var(--teal-400);opacity:.55">' + gloss + '</span>' +
    '</span>'
  ).join('');
}

// ============ STAGE TABS ============
let stageIdx = 0;
function renderStageTabs() {
  const host = document.getElementById('stage-tabs');
  host.innerHTML = '';
  STAGES.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'stage-tab' + (i === stageIdx ? ' active' : '');
    btn.innerHTML =
      '<span style="display:flex;align-items:center;gap:13px">' +
        '<span class="stage-dot"><span class="fl-icon" data-icon="' + s.icon + '" data-size="18"></span></span>' +
        '<span style="display:grid;gap:2px;text-align:left">' +
          '<span style="font:var(--type-title-s);color:var(--tx)">' + s.title + '</span>' +
          '<span style="font:var(--type-body-s);color:var(--tx-3)">' + s.blurb + '</span>' +
        '</span>' +
      '</span>' +
      '<span style="font:var(--fw-bold) 11px/1 var(--font-mono);color:var(--tx-3)">0' + (i + 1) + '</span>';
    btn.addEventListener('click', () => { stageIdx = i; renderStageTabs(); renderStageDetail(); renderIcons(); });
    host.appendChild(btn);
  });
  renderIcons();
}
const orbColors = { listening: 'var(--cyan-400)', thinking: 'var(--indigo-400)', speaking: 'var(--teal-400)' };
function renderStageDetail() {
  const s = STAGES[stageIdx];
  document.getElementById('stage-label').textContent = s.label;
  document.getElementById('stage-headline').textContent = s.headline;
  document.getElementById('stage-words').textContent = s.words;
  document.getElementById('stage-translation').textContent = s.translation;
  document.getElementById('stage-detail').textContent = s.detail;
  const orb = document.getElementById('stage-orb');
  orb.style.color = orbColors[s.orb] || 'var(--cyan-400)';
}

// ============ FEATURES GRID ============
function renderFeatures() {
  const host = document.getElementById('features-grid');
  host.innerHTML = FEATURES.map(([icon, title, body, col, bg]) =>
    '<div class="fl-hover-card" style="padding:24px 22px;border-radius:24px;background:var(--glass);border:1px solid var(--hair);display:grid;gap:14px;align-content:start;min-height:240px">' +
      '<span style="display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:' + bg + ';color:' + col + '"><span class="fl-icon" data-icon="' + icon + '" data-size="20"></span></span>' +
      '<span style="font:var(--type-title-s);color:var(--tx)">' + title + '</span>' +
      '<span style="font:var(--type-body-s);color:var(--tx-2)">' + body + '</span>' +
    '</div>'
  ).join('');
}

// ============ LANGUAGES ============
function styleObjToCss(o) {
  return Object.entries(o).map(([k, v]) => {
    const prop = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
    return prop + ':' + v;
  }).join(';');
}
function renderLanguages() {
  const grid = document.getElementById('languages-grid');
  grid.innerHTML = LANGUAGES.map(([name, hello, layers]) => {
    const flagLayers = layers.map(l => '<span style="position:absolute;' + styleObjToCss(l) + '"></span>').join('');
    return '<div class="fl-lang-card" style="padding:18px 20px;border-radius:18px;background:var(--glass);border:1px solid var(--hair);display:flex;align-items:center;justify-content:space-between;gap:12px">' +
      '<span style="display:flex;align-items:center;gap:11px;min-width:0">' +
        '<span aria-hidden="true" style="position:relative;width:24px;height:17px;flex:0 0 auto;border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,.22),0 2px 6px rgba(4,18,27,.3)">' + flagLayers + '</span>' +
        '<span style="font:var(--type-title-s);color:var(--tx)">' + name + '</span>' +
      '</span>' +
      '<span style="font:var(--fw-medium) 13px/1 var(--font-display);color:var(--teal-400)">' + hello + '</span>' +
    '</div>';
  }).join('');

  const ribbon = document.getElementById('lang-ribbon');
  const words = [...LANGUAGES.slice(0, 20), ...LANGUAGES.slice(0, 20)];
  ribbon.innerHTML = words.map(([name]) =>
    '<span style="font:var(--fw-black) clamp(1.4rem,2.6vw,2.2rem)/1 var(--font-display);letter-spacing:-.03em;color:var(--tx);opacity:.13;white-space:nowrap">' + name + '</span>'
  ).join('');
}

// ============ FAQ ============
function renderFAQ() {
  const host = document.getElementById('faq-list');
  host.innerHTML = '';
  FAQS.forEach(([q, a], i) => {
    const item = document.createElement('div');
    item.className = 'faq-item';
    item.innerHTML =
      '<button type="button" class="faq-q">' + q + '<span class="faq-plus">+</span></button>' +
      '<div class="faq-a"><p style="margin:0;padding:0 40px 24px 4px;font:var(--type-body-m);color:var(--tx-2);max-width:620px">' + a + '</p></div>';
    item.querySelector('.faq-q').addEventListener('click', () => {
      const wasOpen = item.classList.contains('open');
      host.querySelectorAll('.faq-item').forEach(el => el.classList.remove('open'));
      if (!wasOpen) item.classList.add('open');
    });
    host.appendChild(item);
  });
}

// ============ MINI WAVEFORM (product section) ============
function renderMiniWaveform() {
  const host = document.getElementById('mini-waveform');
  const bars = 22;
  let html = '';
  for (let i = 0; i < bars; i++) {
    const delay = (Math.random() * 0.9).toFixed(2);
    const h = Math.round(30 + Math.random() * 70);
    html += '<i style="width:3px;height:' + h + '%;animation-delay:' + delay + 's"></i>';
  }
  host.innerHTML = html;
}

// ============ SCROLL REVEAL ============
function setupScrollReveal() {
  document.documentElement.setAttribute('data-rv-on', '');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.rv').forEach((el, i) => {
    el.style.transitionDelay = (i % 3) * 90 + 'ms';
    io.observe(el);
  });
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  document.body.setAttribute('data-fl-theme', 'dark');
  syncKnob();
  renderRepairs();
  renderRepairDetail();
  renderPhraseMarquee();
  renderStageTabs();
  renderStageDetail();
  renderFeatures();
  renderLanguages();
  renderFAQ();
  renderMiniWaveform();
  renderIcons();
  spawnWords();
  setupScrollReveal();
  spawnReferralCapture();
});

// ============ FLUENCY CREATOR PROGRAM: REFERRAL CAPTURE ============
//
// Picks up ?ref=CODE from a creator's link (e.g. fluencyai.app/?ref=MARIA20),
// remembers it for 90 days so credit survives the visitor browsing around
// before they sign up, quietly pings api/referral.js to log the click, and
// rewrites every signup button on the page to carry the code through to
// /app/auth - where the Flutter app reads it and reports it back via
// api/track-activity.js once the account exists. See
// scripts/supabase_migration_creators.sql for the full chain.
function spawnReferralCapture() {
  try {
    const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

    const urlCode = new URLSearchParams(window.location.search).get('ref');
    if (urlCode && CODE_RE.test(urlCode)) {
      localStorage.setItem('fl_ref_code', urlCode);
      localStorage.setItem('fl_ref_set_at', String(Date.now()));
      fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'click', code: urlCode }),
      }).catch(() => {});
    }

    const storedCode = localStorage.getItem('fl_ref_code');
    const setAt = Number(localStorage.getItem('fl_ref_set_at') || 0);
    const stillValid = storedCode && setAt && Date.now() - setAt < NINETY_DAYS_MS;
    if (storedCode && !stillValid) {
      localStorage.removeItem('fl_ref_code');
      localStorage.removeItem('fl_ref_set_at');
    }
    const activeCode = stillValid ? storedCode : null;
    if (!activeCode) return;

    document.querySelectorAll('a.js-auth-trigger').forEach((a) => {
      try {
        const u = new URL(a.getAttribute('href'), window.location.origin);
        u.searchParams.set('ref', activeCode);
        a.setAttribute('href', u.pathname + u.search);
      } catch (_) {
        /* malformed href - leave it alone */
      }
    });
  } catch (_) {
    // localStorage can throw in some privacy modes - referral credit is a
    // nice-to-have, never something that should break the page over.
  }
}
