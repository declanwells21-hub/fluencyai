/* Fluency AI: site account popup (sign up, sign in, password reset).
   Builds the dialog markup that /auth.js drives (same element ids as the original site) and styles it with the
   design tokens, so every page can offer a site account without carrying its own copy of the markup.
   Load order on a page: /config.js, /assets/js/fl-account.js, /auth.js.
   Sign-in buttons anywhere on the page just need the class "js-login-trigger" (auth.js listens for it).
   Nothing in this popup links to the Flutter web app. */
(function () {
  if (document.getElementById("auth-modal-overlay")) return;

  var css = [
    "#auth-modal-overlay{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));background:rgba(2,10,15,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);overflow-y:auto;overscroll-behavior:contain}",
    "#auth-modal-overlay.open{display:flex}",
    ".fla-card{position:relative;box-sizing:border-box;width:min(440px,100%);margin:auto;padding:28px 24px 24px;border-radius:24px;background:linear-gradient(180deg,rgba(14,42,60,.98),rgba(8,26,38,.98));border:1px solid rgba(255,255,255,.12);box-shadow:var(--shadow-l);color:#fff;font:400 15px/1.5 var(--font-body)}",
    ".fla-close{position:absolute;top:12px;right:12px;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:999px;background:rgba(255,255,255,.08);color:var(--ink-200);cursor:pointer;transition:background var(--dur-fast) var(--ease-standard)}",
    ".fla-close:hover{background:rgba(255,255,255,.16)}",
    ".fla-brand{font:var(--fw-bold) 18px/1 var(--font-display);letter-spacing:-.02em;margin:0 0 18px}",
    ".fla-brand b{color:var(--teal-400)}",
    ".auth-step{display:none}",
    ".auth-step.active{display:block;animation:fla-in var(--dur-base) var(--ease-out)}",
    "@keyframes fla-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    "@media (prefers-reduced-motion:reduce){.auth-step.active{animation:none}}",
    ".fla-h{margin:0 0 6px;font:var(--fw-bold) 24px/1.15 var(--font-display);letter-spacing:-.02em;color:#fff}",
    ".fla-sub{margin:0 0 18px;color:var(--ink-300);font:400 15px/1.5 var(--font-body)}",
    ".fla-sub strong{color:#fff;font-weight:600;word-break:break-all}",
    ".fla-form{display:grid;gap:14px}",
    ".fla-field{display:grid;gap:6px;font:600 13px/1 var(--font-body);color:var(--ink-200)}",
    ".fla-field input{box-sizing:border-box;width:100%;height:48px;padding:0 16px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(4,18,27,.6);color:#fff;font:400 16px/1 var(--font-body)}",
    ".fla-field input::placeholder{color:var(--ink-500)}",
    ".fla-field input:focus-visible{outline:none;border-color:var(--teal-400);box-shadow:var(--ring-focus-inverse)}",
    ".fla-hint{font:400 12px/1.4 var(--font-body);color:var(--ink-400)}",
    ".fla-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;box-sizing:border-box;height:46px;padding:0 20px;border:0;border-radius:var(--radius-button);font:var(--fw-bold) var(--fs-body-m)/1 var(--font-display);letter-spacing:-.01em;cursor:pointer;background:var(--brand);color:var(--text-on-brand);box-shadow:var(--edge-brand),var(--shadow-s);transition:transform var(--dur-fast) var(--ease-standard),filter var(--dur-fast) var(--ease-standard)}",
    ".fla-btn:hover{filter:brightness(1.06)}",
    ".fla-btn:active{transform:scale(var(--press-scale,.97))}",
    ".fla-btn[disabled]{opacity:.65;cursor:default;filter:none;transform:none}",
    ".fla-btn.ghost{background:rgba(255,255,255,.08);box-shadow:none;border:1px solid rgba(255,255,255,.16);color:#fff}",
    ".fla-btn.google{background:#fff;color:#1F2933;box-shadow:var(--shadow-xs);font-family:var(--font-body);font-weight:600}",
    ".fla-btn:focus-visible,.fla-link:focus-visible,.fla-close:focus-visible{outline:2px solid var(--teal-400);outline-offset:2px}",
    ".fla-or{display:flex;align-items:center;gap:12px;margin:2px 0;color:var(--ink-400);font:600 12px/1 var(--font-body);text-transform:uppercase;letter-spacing:.08em}",
    ".fla-or::before,.fla-or::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.12)}",
    ".fla-row{display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:center;margin-top:16px;color:var(--ink-300);font:400 14px/1.4 var(--font-body)}",
    ".fla-link{background:none;border:0;padding:4px 0;cursor:pointer;color:var(--teal-400);font:600 14px/1.4 var(--font-body);text-decoration:none}",
    ".fla-link:hover{text-decoration:underline}",
    ".fla-fine{margin:14px 0 0;color:var(--ink-400);font:400 12px/1.5 var(--font-body);text-align:center}",
    ".fla-fine a{color:var(--ink-200)}",
    ".fla-note{margin:0 0 16px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:var(--ink-300);font:400 14px/1.5 var(--font-body)}",
    ".fla-stack{display:grid;gap:10px}",
    ".fla-check{display:flex;gap:10px;align-items:flex-start;margin:2px 0 0;color:var(--ink-200);font:400 13px/1.5 var(--font-body);cursor:pointer}",
    ".fla-check input{flex:0 0 auto;width:20px;height:20px;margin:1px 0 0;accent-color:var(--teal-400);cursor:pointer}",
    ".fla-check a{color:var(--teal-300)}",
    ".fla-danger{color:#FF9E9E}",
    ".fla-btn.danger{background:#C23B3B;box-shadow:none;color:#fff}",
    ".fla-list{margin:0 0 16px;padding-left:18px;color:var(--ink-300);font:400 14px/1.6 var(--font-body)}",
    ".auth-error{display:none;margin:0;font:600 13px/1.45 var(--font-body)}",
    ".auth-error.show{display:block}",
    ".fla-notice{display:none;margin:0 0 14px;padding:10px 12px;border-radius:12px;background:rgba(255,106,106,.12);border:1px solid rgba(255,106,106,.35);color:#FFC9C9;font:600 13px/1.45 var(--font-body)}",
    ".fla-notice.show{display:block}",
    "#auth-modal-overlay .hidden{display:none!important}"
  ].join("\n");

  var G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  var html = [
    '<div id="auth-modal-overlay" aria-hidden="true" aria-labelledby="auth-title" data-lenis-prevent>',
    '<div class="fla-card">',
    '<button type="button" id="auth-close-btn" class="fla-close" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>',
    '<p class="fla-brand" id="auth-title"><b>F</b>luency AI</p>',
    '<p class="fla-notice" id="auth-config-notice" role="alert">Accounts aren\u2019t available right now. Please try again in a little while.</p>',

    /* sign up */
    '<section class="auth-step" id="auth-step-signup">',
    '<h2 class="fla-h">Create your account</h2>',
    '<p class="fla-sub">One Fluency AI account for this site, and for the apps when they launch.</p>',
    '<form class="fla-form" id="auth-signup-form" novalidate>',
    '<label class="fla-field">Email<input id="auth-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required></label>',
    '<label class="fla-field">Password<input id="auth-password" type="password" autocomplete="new-password" minlength="6" placeholder="At least 6 characters" required></label>',
    '<label class="fla-check"><input type="checkbox" id="auth-agree"><span>I am 16 or older, and I agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>',
    '<p class="auth-error" id="auth-signup-error" role="alert"></p>',
    '<button type="submit" class="fla-btn fl-press" id="auth-signup-submit">Create account</button>',
    '</form>',
    '<div class="fla-or" style="margin-top:14px">or</div>',
    '<button type="button" class="fla-btn google fl-press" id="auth-google-signup" style="margin-top:14px">' + G + 'Continue with Google</button>',
    '<div class="fla-row"><span>Already have an account? <button type="button" class="fla-link" id="auth-go-to-login-from-signup">Sign in</button></span><button type="button" class="fla-link" id="auth-forgot-link">Forgot your password?</button></div>',
    '<p class="fla-fine">The box above also applies if you continue with Google. Fluency AI is for people aged 16 and over.</p>',
    '</section>',

    /* confirm email */
    '<section class="auth-step" id="auth-step-verify">',
    '<h2 class="fla-h">Check your email</h2>',
    '<p class="fla-sub">We sent a code to <strong id="auth-verify-email"></strong>. Enter it to confirm your account.</p>',
    '<form class="fla-form" id="auth-verify-form" novalidate>',
    '<label class="fla-field">Confirmation code<input id="auth-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter the code" required></label>',
    '<p class="auth-error" id="auth-verify-error" role="alert"></p>',
    '<button type="submit" class="fla-btn fl-press" id="auth-verify-submit">Confirm account</button>',
    '</form>',
    '<div class="fla-row"><span>Didn\u2019t get it? <button type="button" class="fla-link" id="auth-resend-btn">Resend code</button></span></div>',
    '</section>',

    /* sign in */
    '<section class="auth-step" id="auth-step-login">',
    '<h2 class="fla-h">Welcome back</h2>',
    '<p class="fla-sub">Sign in to your Fluency AI account.</p>',
    '<form class="fla-form" id="auth-login-form" novalidate>',
    '<label class="fla-field">Email<input id="auth-login-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required></label>',
    '<label class="fla-field">Password<input id="auth-login-password" type="password" autocomplete="current-password" placeholder="Your password" required></label>',
    '<p class="auth-error" id="auth-login-error" role="alert"></p>',
    '<button type="submit" class="fla-btn fl-press" id="auth-login-submit">Sign in</button>',
    '</form>',
    '<div class="fla-or" style="margin-top:14px">or</div>',
    '<button type="button" class="fla-btn google fl-press" id="auth-google-login" style="margin-top:14px">' + G + 'Continue with Google</button>',
    '<div class="fla-row"><span>New here? <button type="button" class="fla-link" id="auth-go-to-signup">Create an account</button></span><button type="button" class="fla-link" id="auth-forgot-link-login">Forgot your password?</button></div>',
    '</section>',

    /* forgot password */
    '<section class="auth-step" id="auth-step-forgot">',
    '<h2 class="fla-h">Reset your password</h2>',
    '<p class="fla-sub">Enter your email and we\u2019ll send you a code to set a new password.</p>',
    '<form class="fla-form" id="auth-forgot-form" novalidate>',
    '<label class="fla-field">Email<input id="auth-forgot-email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com" required></label>',
    '<p class="auth-error" id="auth-forgot-error" role="alert"></p>',
    '<button type="submit" class="fla-btn fl-press" id="auth-forgot-submit">Send code</button>',
    '</form>',
    '<div class="fla-row"><button type="button" class="fla-link" id="auth-back-to-signup">Back to sign in</button></div>',
    '</section>',

    /* new password */
    '<section class="auth-step" id="auth-step-reset">',
    '<h2 class="fla-h">Choose a new password</h2>',
    '<p class="fla-sub">Enter the code we sent to <strong id="auth-reset-email"></strong>, then pick a new password.</p>',
    '<form class="fla-form" id="auth-reset-form" novalidate>',
    '<label class="fla-field">Code from your email<input id="auth-reset-code" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="Enter the code" required></label>',
    '<label class="fla-field">New password<input id="auth-new-password" type="password" autocomplete="new-password" minlength="6" placeholder="At least 6 characters" required></label>',
    '<p class="auth-error" id="auth-reset-error" role="alert"></p>',
    '<button type="submit" class="fla-btn fl-press" id="auth-reset-submit">Update password</button>',
    '</form>',
    '<div class="fla-row"><span>Didn\u2019t get it? <button type="button" class="fla-link" id="auth-resend-reset-btn">Resend code</button></span></div>',
    '</section>',

    /* agree to the current Terms (new accounts that skipped the form, and everyone when the Terms change) */
    '<section class="auth-step" id="auth-step-consent">',
    '<h2 class="fla-h">One more step</h2>',
    '<p class="fla-sub">Before you continue, please confirm the following.</p>',
    '<div class="fla-form">',
    '<label class="fla-check"><input type="checkbox" id="auth-consent-agree"><span>I am 16 or older, and I agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy" target="_blank" rel="noopener">Privacy Policy</a>.</span></label>',
    '<p class="auth-error" id="auth-consent-error" role="alert"></p>',
    '<button type="button" class="fla-btn fl-press" id="auth-consent-submit">Agree and continue</button>',
    '</div>',
    '<div class="fla-row"><button type="button" class="fla-link" id="auth-consent-decline">Sign out</button></div>',
    '</section>',

    /* delete account */
    '<section class="auth-step" id="auth-step-delete">',
    '<h2 class="fla-h">Delete your account</h2>',
    '<p class="fla-sub">This is permanent. Here is what happens:</p>',
    '<ul class="fla-list">',
    '<li>Your account, settings, plan and credits are deleted. Top-up credits have no cash value.</li>',
    '<li>Any subscription is cancelled straight away, and you lose the rest of the period you paid for.</li>',
    '<li>Exam guides you bought on Selar stay yours. We keep order records for as long as tax and accounting law requires.</li>',
    '<li>Conversations and your coach\u2019s memory live on your device; the app clears them.</li>',
    '</ul>',
    '<div class="fla-form">',
    '<label class="fla-field">Type DELETE to confirm<input id="auth-delete-confirm" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DELETE"></label>',
    '<p class="auth-error" id="auth-delete-error" role="alert"></p>',
    '<button type="button" class="fla-btn danger fl-press" id="auth-delete-submit">Delete my account for good</button>',
    '<button type="button" class="fla-btn ghost fl-press" id="auth-delete-cancel">Keep my account</button>',
    '</div>',
    '</section>',

    /* signed in */
    '<section class="auth-step" id="auth-step-welcome">',
    '<h2 class="fla-h" id="auth-welcome-title">You\u2019re signed in</h2>',
    '<p class="fla-sub" id="auth-welcome-sub"></p>',
    '<p class="fla-note">The Fluency AI apps are coming soon. When they launch, download one and sign in with these same account details.</p>',
    '<div class="fla-stack">',
    '<button type="button" class="fla-btn fl-press hidden" id="auth-go-to-admin">Go to admin dashboard</button>',
    '<button type="button" class="fla-btn fl-press" id="auth-join-waitlist">Join the waitlist</button>',
    '<button type="button" class="fla-btn ghost fl-press" id="auth-stay-on-site">Stay on this site</button>',
    '</div>',
    '<div class="fla-row"><button type="button" class="fla-link" id="auth-log-out">Log out</button></div>',
    '<p class="auth-error" id="auth-account-msg" role="status"></p>',
    '<div class="fla-row"><button type="button" class="fla-link" id="auth-download-data">Download my data</button><button type="button" class="fla-link fla-danger" id="auth-delete-account">Delete my account</button></div>',
    '</section>',

    '</div></div>'
  ].join("");

  var st = document.createElement("style");
  st.id = "fl-account-css";
  st.textContent = css;
  document.head.appendChild(st);

  var host = document.createElement("div");
  host.innerHTML = html;
  var overlay = host.firstChild;
  document.body.appendChild(overlay);

  /* "Join the waitlist" on the signed-in screen: close the popup, then go to the waitlist form on Home. */
  window.flOpenWaitlistReminder = function () {
    if (window.flAuth && window.flAuth.closeModal) window.flAuth.closeModal();
    var onHome = location.pathname === "/" || /\/index\.html$/.test(location.pathname);
    if (onHome && document.getElementById("join")) {
      if (window.flScrollTo) window.flScrollTo("join");
      else document.getElementById("join").scrollIntoView({ behavior: "smooth" });
    } else {
      location.href = "/#join";   /* the waitlist form lives on Home */
    }
  };

  /* The pages draw their nav after this script runs; once everything has loaded, make sure the sign-in buttons show the right label. */
  window.addEventListener("load", function () { if (window.flAuth && window.flAuth.refresh) window.flAuth.refresh(); });

  /* Accessibility: dialog role only while open, focus the first field of the step that is showing, keep Tab inside. */
  var lastTrigger = null;
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(".js-login-trigger, .js-auth-trigger");
    if (t) lastTrigger = t;
  }, true);

  function focusStep() {
    var step = overlay.querySelector(".auth-step.active");
    if (!step) return;
    var first = step.querySelector("input:not([type=hidden]), button.fla-btn:not(.hidden)");
    if (first) first.focus({ preventScroll: true });
  }
  var wasOpen = false;
  new MutationObserver(function () {
    var open = overlay.classList.contains("open");
    /* role and aria-modal exist only while the popup is open, so the page has no hidden dialog sitting in the DOM */
    if (open) { overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true"); }
    else { overlay.removeAttribute("role"); overlay.removeAttribute("aria-modal"); }
    if (open && !wasOpen) setTimeout(focusStep, 30);
    if (!open && wasOpen && lastTrigger && document.contains(lastTrigger)) lastTrigger.focus({ preventScroll: true });
    wasOpen = open;
  }).observe(overlay, { attributes: true, attributeFilter: ["class"] });

  /* When auth.js switches to another step (sign up, confirm, sign in...), move focus to it.
     Only step changes count; showing an error message must not move focus. */
  new MutationObserver(function (records) {
    if (!overlay.classList.contains("open")) return;
    var stepChanged = records.some(function (r) {
      return r.target.classList && r.target.classList.contains("auth-step") && r.target.classList.contains("active");
    });
    if (stepChanged) setTimeout(focusStep, 30);
  }).observe(overlay, { attributes: true, attributeFilter: ["class"], subtree: true });

  overlay.addEventListener("keydown", function (e) {
    if (e.key !== "Tab") return;
    var items = Array.prototype.filter.call(
      overlay.querySelectorAll(".auth-step.active input, .auth-step.active button, .auth-step.active a[href], .fla-close"),
      function (el) { return !el.disabled && el.offsetParent !== null; }
    );
    if (!items.length) return;
    var first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
})();
