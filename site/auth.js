// ============ FLUENCY AI — INLINE AUTH (site/auth.js) ============
// Talks to Supabase's Auth REST API directly with plain fetch() calls,
// instead of going through the @supabase/supabase-js library - see the
// git history on this file for why (a confirmed upstream SDK lock bug was
// causing correct codes to be rejected).
//
// This version adds:
//  - A session that actually persists across visits (checked on every
//    page load, not just right after signing in).
//  - One shared "you're in" screen after login, signup verification, or
//    password reset, offering Join the waitlist / Go to admin dashboard (if
//    admin) / Stay on this site - instead of auto-redirecting or only
//    offering one option.
//  - The nav's "Log in" link turning into "My account" when a valid
//    session already exists, so returning users see they're signed in
//    without having to open the modal first.

(function () {
  const SUPABASE_URL = (window.__SUPABASE_URL || '').replace(/\/$/, '');
  const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || '';
  const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
  // The version of the Terms and Privacy Policy people agree to = the "Last updated" date on those pages (fluency-config.js).
  const LEGAL = (window.FL_CONFIG && window.FL_CONFIG.legal) || { termsVersion: '2026-09-09', privacyVersion: '2026-09-09' };
  const CONSENT_INTENT_KEY = 'fl_consent_intent';

  // ---------- Low-level REST helper ----------
  async function authRequest(path, { method = 'POST', body, accessToken, query } = {}) {
    const headers = {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    };
    if (accessToken) headers.Authorization = 'Bearer ' + accessToken;

    let url = SUPABASE_URL + path;
    if (query) url += '?' + new URLSearchParams(query).toString();

    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (networkErr) {
      // fetch() itself only throws for genuine network failures (offline,
      // DNS, CORS) - never for a normal 4xx/5xx response from the server.
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      // Some endpoints (e.g. logout) return an empty body on success.
    }

    if (!res.ok) {
      const message =
        (data && (data.msg || data.error_description || data.message || data.error)) ||
        `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  // ---------- Persistent local session storage ----------
  // Stored under the same key format supabase-js/supabase_flutter use by
  // default (sb-<project-ref>-auth-token), so a session from the site is
  // recognised by other Fluency AI clients without logging in twice. Kept in localStorage (not sessionStorage), so it
  // survives closing the tab/browser entirely - a real "stay logged in."
  function projectRef() {
    const m = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/);
    return m ? m[1] : 'fluencyai';
  }
  const SESSION_KEY = 'sb-' + projectRef() + '-auth-token';

  function saveSession(session) {
    if (!session) return;
    const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
    const toStore = { ...session, expires_at: expiresAt };
    localStorage.setItem(SESSION_KEY, JSON.stringify(toStore));
    announceAuthChange();
    claimReferralOnce(toStore);
    requestWelcomeEmail(toStore);
  }

  // A brand-new account gets one welcome email. The server decides (it only ever sends once, and only to new,
  // confirmed accounts), so this just asks, at most once per browser and account, and never blocks sign-in.
  function requestWelcomeEmail(session) {
    try {
      const user = session && session.user;
      if (!user || !user.id || !session.access_token) return;
      if (!(Date.now() - Date.parse(user.created_at || 0) < 3 * 86400000)) return;
      const key = 'fl_welcome_asked_' + user.id;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
      fetch('/api/welcome-email', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token } }).catch(function () {});
    } catch (_) { /* never in the way of signing in */ }
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    announceAuthChange();
  }

  // Pages that show account-specific content (the Partner Hub) listen for this and reload what they show.
  function announceAuthChange() {
    try { window.dispatchEvent(new Event('fl-auth-changed')); } catch (_) { /* old browser: nothing listens anyway */ }
  }

  // If the visitor arrived through a partner link (fl-ref.js keeps it for 30 days), tell the database which partner
  // brought this new account. The database only accepts it for accounts a few days old and never for the partner's own
  // account. Tried once per account per browser; failures are ignored, they must never get in the way of signing in.
  function claimReferralOnce(session) {
    try {
      const userId = session && session.user && session.user.id;
      if (!userId || !session.access_token) return;
      const flag = 'fl_ref_claim:' + userId;
      if (localStorage.getItem(flag)) return;
      const stored = JSON.parse(localStorage.getItem('fl_ref') || 'null');
      if (!stored || !stored.code || (stored.at && Date.now() - stored.at > 30 * 864e5)) return;
      localStorage.setItem(flag, '1');
      authRequest('/rest/v1/rpc/fl_claim_referral', { body: { p_code: stored.code }, accessToken: session.access_token }).catch(() => {});
    } catch (_) { /* never block sign-in */ }
  }
  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      if (!session || !session.access_token) return null;
      return session;
    } catch (_) {
      return null;
    }
  }

  /// Refreshes an expired-but-recent session using its refresh token, so
  /// "stay logged in" actually lasts (access tokens are short-lived by
  /// design; refresh tokens are what make persistence real).
  async function getValidSession() {
    const session = loadSession();
    if (!session) return null;
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at > now + 30) return session;
    if (!session.refresh_token) return null;
    try {
      const refreshed = await authRequest('/auth/v1/token', {
        query: { grant_type: 'refresh_token' },
        body: { refresh_token: session.refresh_token },
      });
      if (refreshed && refreshed.access_token) {
        saveSession(refreshed);
        return refreshed;
      }
    } catch (_) {
      clearSession();
    }
    return null;
  }

  async function checkIsAdmin(session) {
    try {
      const rows = await authRequest('/rest/v1/profiles', {
        method: 'GET',
        accessToken: session.access_token,
        query: { id: 'eq.' + session.user.id, select: 'role' },
      });
      const profile = Array.isArray(rows) ? rows[0] : null;
      return !!(profile && profile.role === 'admin');
    } catch (err) {
      // Logged in fine, just couldn't confirm role - fail safe by
      // treating as a normal (non-admin) user rather than blocking access.
      console.error('Could not check role:', err.message);
      return false;
    }
  }

  // ---------- DOM wiring ----------
  const overlay = document.getElementById('auth-modal-overlay');
  const closeBtn = document.getElementById('auth-close-btn');

  const signupForm = document.getElementById('auth-signup-form');
  const signupSubmit = document.getElementById('auth-signup-submit');
  const verifyForm = document.getElementById('auth-verify-form');
  const verifySubmit = document.getElementById('auth-verify-submit');
  const resendBtn = document.getElementById('auth-resend-btn');

  const loginForm = document.getElementById('auth-login-form');
  const loginSubmit = document.getElementById('auth-login-submit');
  const goToSignupBtn = document.getElementById('auth-go-to-signup');

  const welcomeTitle = document.getElementById('auth-welcome-title');
  const welcomeSub = document.getElementById('auth-welcome-sub');
  const goToAdminBtn = document.getElementById('auth-go-to-admin');
  const joinWaitlistBtn = document.getElementById('auth-join-waitlist');
  const stayOnSiteBtn = document.getElementById('auth-stay-on-site');
  const logOutBtn = document.getElementById('auth-log-out');
  const agreeBox = document.getElementById('auth-agree');
  const consentBox = document.getElementById('auth-consent-agree');
  const consentSubmit = document.getElementById('auth-consent-submit');
  const consentDecline = document.getElementById('auth-consent-decline');
  const downloadDataBtn = document.getElementById('auth-download-data');
  const deleteAccountBtn = document.getElementById('auth-delete-account');
  const deleteConfirmInput = document.getElementById('auth-delete-confirm');
  const deleteSubmit = document.getElementById('auth-delete-submit');
  const deleteCancel = document.getElementById('auth-delete-cancel');

  const forgotLink = document.getElementById('auth-forgot-link');
  const forgotLinkFromLogin = document.getElementById('auth-forgot-link-login');
  const backToSignupBtn = document.getElementById('auth-back-to-signup');
  const forgotForm = document.getElementById('auth-forgot-form');
  const forgotSubmit = document.getElementById('auth-forgot-submit');
  const resetForm = document.getElementById('auth-reset-form');
  const resetSubmit = document.getElementById('auth-reset-submit');
  const resendResetBtn = document.getElementById('auth-resend-reset-btn');

  // Sign-in buttons are found when needed (the new pages re-render their nav), by class rather than by id.
  function navLoginLinks() { return Array.from(document.querySelectorAll('.js-login-trigger')); }
  const googleSignupBtn = document.getElementById('auth-google-signup');
  const googleLoginBtn = document.getElementById('auth-google-login');
  const pricingCheckoutBtn = document.getElementById('pricing-checkout-btn');

  // Pending emails live in sessionStorage (not just a JS variable) so a
  // reload between "code sent" and "code entered" doesn't silently lose
  // track of which email a code belongs to.
  const PENDING_SIGNUP_KEY = 'fl_pending_signup_email';
  const PENDING_RESET_KEY = 'fl_pending_reset_email';

  function getPendingEmail() { return sessionStorage.getItem(PENDING_SIGNUP_KEY) || ''; }
  function setPendingEmail(email) { sessionStorage.setItem(PENDING_SIGNUP_KEY, email); }
  function clearPendingEmail() { sessionStorage.removeItem(PENDING_SIGNUP_KEY); }
  function getPendingResetEmail() { return sessionStorage.getItem(PENDING_RESET_KEY) || ''; }
  function setPendingResetEmail(email) { sessionStorage.setItem(PENDING_RESET_KEY, email); }
  function clearPendingResetEmail() { sessionStorage.removeItem(PENDING_RESET_KEY); }

  function showStep(name) {
    document.querySelectorAll('.auth-step').forEach((el) => el.classList.remove('active'));
    document.getElementById('auth-step-' + name).classList.add('active');
  }
  function showError(id, message, isSuccess) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.classList.add('show');
    el.style.color = isSuccess ? 'var(--mint-400)' : 'var(--coral-400)';
  }
  function clearError(id) {
    const el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('show');
  }
  function setLoading(btn, loading, label) {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.label = btn.dataset.label || btn.innerHTML;
      btn.innerHTML = label || 'One moment&hellip;';
    } else if (btn.dataset.label) {
      btn.innerHTML = btn.dataset.label;
    }
  }

  function humanizeError(error) {
    const msg = (error && error.message) || 'Something went wrong. Please check your connection and try again.';
    if (/already registered|already exists|user_already_exists/i.test(msg)) {
      return "That email already has an account — try logging in instead.";
    }
    if (/password/i.test(msg) && /least|short|weak/i.test(msg)) {
      return 'Please use a password with at least 6 characters.';
    }
    if (/invalid login credentials|invalid_credentials/i.test(msg)) {
      return 'Incorrect email or password.';
    }
    if (/invalid.*(email|format)/i.test(msg)) {
      return 'That email address doesn\u2019t look right — please check it.';
    }
    if (/token|otp|code/i.test(msg)) {
      return 'That code is incorrect or has expired. Double check it, or resend a new one.';
    }
    return msg;
  }

  // ---------- Pricing: start checkout ----------
  // Lives here rather than app.js because it needs getValidSession() and
  // openModal(), both private to this file. Shares one endpoint
  // (api/create-checkout-session.js) with the app's own paywall - see
  // lib/features/paywall/data/checkout_repository.dart - so a price
  // change only ever needs to happen in one place (Creem's dashboard),
  // never in this code.
  if (pricingCheckoutBtn) {
    pricingCheckoutBtn.addEventListener('click', async () => {
      const msg = document.getElementById('pricing-checkout-msg');
      const plan = pricingCheckoutBtn.dataset.plan || 'founding';

      const session = await getValidSession();
      if (!session) {
        // Not signed in yet - get them an account first. They can come
        // back to Pricing and pick a plan again once they're in; chaining
        // straight into checkout from here would mean trusting a plan
        // choice made before they even had an account.
        openModal('signup');
        return;
      }

      if (msg) { msg.style.color = 'var(--tx-2)'; msg.textContent = 'Opening checkout\u2026'; }
      pricingCheckoutBtn.disabled = true;
      try {
        const res = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan,
            userId: session.user.id,
            email: session.user.email,
            successUrl: window.location.origin + '/?checkout=success#pricing',
            cancelUrl: window.location.origin + '/?checkout=cancelled#pricing',
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout.');
        window.location.href = data.url;
      } catch (err) {
        if (msg) { msg.style.color = '#f87171'; msg.textContent = err.message; }
        pricingCheckoutBtn.disabled = false;
      }
    });
  }

  // Came back from Creem Checkout? Say so, then clean the URL - this
  // covers both a completed payment and someone backing out of checkout.
  (function announceCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;
    const msg = document.getElementById('pricing-checkout-msg');
    if (msg) {
      if (checkout === 'success') {
        msg.style.color = 'var(--teal-400)';
        msg.textContent = "You're in! Check your email for a receipt. We'll let you know when the app goes live.";
      } else {
        msg.style.color = 'var(--tx-2)';
        msg.textContent = 'Checkout cancelled \u2014 no charge was made.';
      }
    }
    params.delete('checkout');
    const q = params.toString();
    history.replaceState(null, '', window.location.pathname + (q ? '?' + q : '') + window.location.hash);
  })();

  // ---------- Google sign-in ----------
  // Full-page redirect to Supabase's own OAuth endpoint - no supabase-js
  // involved, so the cross-tab lock bug mentioned above never enters the
  // picture here either. Supabase sends the browser to Google, then back
  // to redirect_to with the new session appended as a URL fragment
  // (#access_token=...), which the init block below picks up on load.
  function beginGoogleAuth() {
    if (!configured) { document.getElementById('waitlist') && document.getElementById('waitlist').scrollIntoView({ behavior: 'smooth' }); return; }
    const url = SUPABASE_URL + '/auth/v1/authorize?' + new URLSearchParams({
      provider: 'google',
      redirect_to: window.location.origin + '/',
    }).toString();
    window.location.href = url;
  }
  if (googleSignupBtn) googleSignupBtn.addEventListener('click', () => {
    if (agreeBox && !agreeBox.checked) {
      showError('auth-signup-error', 'Please confirm you are 16 or older and agree to the Terms and Privacy Policy.');
      return;
    }
    // The page leaves for Google and comes back, so remember the tick until the account is signed in.
    try { sessionStorage.setItem(CONSENT_INTENT_KEY, JSON.stringify({ terms: LEGAL.termsVersion, privacy: LEGAL.privacyVersion, age16: true })); } catch (_) { /* the gate asks again */ }
    beginGoogleAuth();
  });
  if (googleLoginBtn) googleLoginBtn.addEventListener('click', beginGoogleAuth);

  // Reads the '#access_token=...' fragment Supabase appends after a Google
  // redirect. Returns null on every ordinary page load (no fragment, or a
  // plain '#pricing'-style anchor link - neither contains 'access_token').
  function parseOAuthHash() {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw || raw.indexOf('access_token=') === -1) return raw && raw.indexOf('error=') !== -1 ? { error: true } : null;
    const params = new URLSearchParams(raw);
    const accessToken = params.get('access_token');
    if (!accessToken) return null;
    return {
      access_token: accessToken,
      refresh_token: params.get('refresh_token'),
      expires_in: params.get('expires_in') ? parseInt(params.get('expires_in'), 10) : undefined,
      token_type: params.get('token_type') || 'bearer',
    };
  }

  async function completeGoogleAuthIfPresent() {
    const partial = parseOAuthHash();
    if (!partial) return false;
    // Clear the tokens from the address bar/history either way - they
    // should never linger there, successful or not.
    history.replaceState(null, '', window.location.pathname + window.location.search);
    if (partial.error) return false;
    try {
      const user = await authRequest('/auth/v1/user', { method: 'GET', accessToken: partial.access_token });
      const session = { ...partial, user };
      saveSession(session);
      await showWelcome({ title: 'Welcome!', subtitle: "You're signed in with Google.", session });
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      return true;
    } catch (err) {
      console.error('Google sign-in: could not complete session:', err.message);
      return false;
    }
  }

  // ---------- The shared "you're in" screen ----------
  // Used after login, after confirming a signup code, and after resetting
  // a password - the only differences are the heading/subtext and whether
  // "Go to admin dashboard" is shown, so this is one function instead of
  // three near-duplicate screens.
  // ---------- Agreeing to the Terms and Privacy Policy (and being 16 or older) ----------
  // Every way of signing in ends in showWelcome(), which first makes sure the person has agreed to the CURRENT versions.
  // Ticked the box when signing up (email or Google)? That is recorded for them. Otherwise they are asked, once.
  // If the check itself cannot run (offline, or the compliance migration is not in the database yet) people are not locked out.
  let pendingWelcome = null;
  let consentRecordedFor = null; // the access token of a session whose agreement was just saved: no second check needed
  function recordConsent(session, source) {
    return authRequest('/rest/v1/rpc/fl_record_consent', {
      body: { p_terms: LEGAL.termsVersion, p_privacy: LEGAL.privacyVersion, p_age_confirmed: true, p_source: source },
      accessToken: session.access_token,
    });
  }
  function consentIntentIsCurrent() {
    try {
      const i = JSON.parse(sessionStorage.getItem(CONSENT_INTENT_KEY) || 'null');
      return !!i && i.age16 === true && i.terms === LEGAL.termsVersion && i.privacy === LEGAL.privacyVersion;
    } catch (_) { return false; }
  }
  async function ensureConsent(session) {
    if (consentRecordedFor && consentRecordedFor === session.access_token) return true;
    try {
      const rows = await authRequest('/rest/v1/rpc/fl_my_consent', { body: {}, accessToken: session.access_token });
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (row && row.age_16_confirmed && row.terms_version === LEGAL.termsVersion && row.privacy_version === LEGAL.privacyVersion) return true;
      const meta = (session.user && session.user.user_metadata) || {};
      const tickedAtSignup = meta.age_16_confirmed === true && meta.terms_version === LEGAL.termsVersion && meta.privacy_version === LEGAL.privacyVersion;
      if (tickedAtSignup || consentIntentIsCurrent()) {
        await recordConsent(session, 'signup_form');
        consentRecordedFor = session.access_token;
        try { sessionStorage.removeItem(CONSENT_INTENT_KEY); } catch (_) { /* fine */ }
        return true;
      }
      if (!consentBox) return true; // a page without the popup markup cannot ask
      consentBox.checked = false;
      clearError('auth-consent-error');
      showStep('consent');
      return false;
    } catch (err) {
      console.error('consent check could not run, continuing:', err.message);
      return true;
    }
  }

  async function showWelcome({ title, subtitle, session }) {
    pendingWelcome = { title, subtitle, session };
    if (!(await ensureConsent(session))) { refreshNavLoginState(); return; }
    welcomeTitle.textContent = title;
    welcomeSub.textContent = subtitle;
    showStep('welcome');

    goToAdminBtn.classList.add('hidden');
    const isAdmin = await checkIsAdmin(session);
    // The Partner Hub page (body[data-fl-no-admin]) never shows the admin shortcut, even to an admin account.
    if (isAdmin && !document.body.hasAttribute('data-fl-no-admin')) goToAdminBtn.classList.remove('hidden');

    refreshNavLoginState();
  }

  function refreshNavLoginState() {
    const session = loadSession();
    const loggedIn = !!(session && session.expires_at && session.expires_at > Math.floor(Date.now() / 1000));
    navLoginLinks().forEach((el) => {
      // Labels can be set per button with data-logged-in / data-logged-out.
      el.textContent = loggedIn ? (el.dataset.loggedIn || 'My account') : (el.dataset.loggedOut || 'Log in');
    });
  }

  function openModal(step) {
    const notice = document.getElementById('auth-config-notice');
    if (notice) notice.classList.toggle('show', !configured);
    showStep(step || 'signup');
    document.querySelectorAll('.auth-error').forEach((el) => clearError(el.id));
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Delegated, so buttons the page adds or re-renders later still work.
  async function openLogin() {
    // Already signed in (from a previous visit)? Skip straight to the
    // welcome screen instead of asking them to log in again.
    const session = configured ? await getValidSession() : null;
    if (session) {
      await showWelcome({ title: 'Welcome back', subtitle: "You're already signed in.", session });
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
    } else {
      openModal('login');
    }
  }
  document.addEventListener('click', (e) => {
    const target = e.target.closest ? e.target.closest('.js-auth-trigger, .js-login-trigger') : null;
    if (!target) return;
    e.preventDefault();
    if (target.classList.contains('js-auth-trigger')) openModal('signup');
    else openLogin();
  });
  window.flAuth = { openModal, closeModal, openLogin, refresh: refreshNavLoginState, getSession: getValidSession };

  // Resume mid-flow if a code was already sent and the page reloaded - but
  // a Google redirect (if that's why we're here) takes priority over a
  // stale pending signup/reset from before the user left for Google's page.
  if (configured) {
    const pendingSignup = getPendingEmail();
    const pendingReset = getPendingResetEmail();
    completeGoogleAuthIfPresent().then((handled) => {
      if (handled) return;
      if (pendingSignup) {
        document.getElementById('auth-verify-email').textContent = pendingSignup;
        openModal('verify');
      } else if (pendingReset) {
        document.getElementById('auth-reset-email').textContent = pendingReset;
        openModal('reset');
      }
      refreshNavLoginState();
    });
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  // ---------- Sign up ----------

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!configured) { document.getElementById('waitlist') && document.getElementById('waitlist').scrollIntoView({ behavior: 'smooth' }); return; }
    clearError('auth-signup-error');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    if (agreeBox && !agreeBox.checked) {
      showError('auth-signup-error', 'Please confirm you are 16 or older and agree to the Terms and Privacy Policy.');
      return;
    }

    setLoading(signupSubmit, true);
    try {
      // The tick travels with the new account (it is recorded properly once the email is confirmed and they sign in).
      await authRequest('/auth/v1/signup', { body: { email, password, data: { age_16_confirmed: true, terms_version: LEGAL.termsVersion, privacy_version: LEGAL.privacyVersion, consent_at: new Date().toISOString() } } });
      setPendingEmail(email);
      document.getElementById('auth-verify-email').textContent = email;
      showStep('verify');
    } catch (err) {
      showError('auth-signup-error', humanizeError(err));
    } finally {
      setLoading(signupSubmit, false);
    }
  });

  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!configured) { document.getElementById('waitlist') && document.getElementById('waitlist').scrollIntoView({ behavior: 'smooth' }); return; }
    clearError('auth-verify-error');
    const token = document.getElementById('auth-code').value.trim();
    const email = getPendingEmail();

    if (!email) {
      showError('auth-verify-error', 'We lost track of which email this code was for — please sign up again to get a fresh code.');
      return;
    }

    setLoading(verifySubmit, true);
    try {
      const session = await authRequest('/auth/v1/verify', { body: { email, token, type: 'signup' } });
      clearPendingEmail();
      if (session && session.access_token) {
        saveSession(session);
        await showWelcome({
          title: "You're all set",
          subtitle: 'Your email is confirmed and you\u2019re signed in.',
          session,
        });
      } else {
        // Auto-confirm is off and this didn't return a session - fall
        // back to asking them to log in.
        showStep('login');
      }
    } catch (err) {
      showError('auth-verify-error', humanizeError(err));
    } finally {
      setLoading(verifySubmit, false);
    }
  });

  resendBtn.addEventListener('click', async () => {
    if (!configured) return;
    clearError('auth-verify-error');
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending\u2026';
    try {
      await authRequest('/auth/v1/resend', { body: { type: 'signup', email: getPendingEmail() } });
      showError('auth-verify-error', 'Code resent — check your inbox.', true);
    } catch (err) {
      showError('auth-verify-error', humanizeError(err));
    } finally {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend code';
    }
  });

  // ---------- Log in ----------

  goToSignupBtn.addEventListener('click', () => showStep('signup'));
  document.getElementById('auth-go-to-login-from-signup').addEventListener('click', () => showStep('login'));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!configured) { document.getElementById('waitlist') && document.getElementById('waitlist').scrollIntoView({ behavior: 'smooth' }); return; }
    clearError('auth-login-error');
    const email = document.getElementById('auth-login-email').value.trim();
    const password = document.getElementById('auth-login-password').value;

    setLoading(loginSubmit, true);
    try {
      const session = await authRequest('/auth/v1/token', {
        query: { grant_type: 'password' },
        body: { email, password },
      });
      saveSession(session);
      await showWelcome({ title: "You're logged in", subtitle: 'Pick up where you left off.', session });
    } catch (err) {
      showError('auth-login-error', humanizeError(err));
    } finally {
      setLoading(loginSubmit, false);
    }
  });

  // ---------- Welcome screen actions (shared by login / signup / reset) ----------

  goToAdminBtn.addEventListener('click', () => { window.location.href = '/admin'; });
  joinWaitlistBtn.addEventListener('click', () => { if (window.flOpenWaitlistReminder) window.flOpenWaitlistReminder(); });
  stayOnSiteBtn.addEventListener('click', () => { closeModal(); refreshNavLoginState(); });
  logOutBtn.addEventListener('click', async () => {
    const session = loadSession();
    if (session && session.access_token) {
      try {
        await authRequest('/auth/v1/logout', { accessToken: session.access_token, query: { scope: 'local' } });
      } catch (_) {
        // Best-effort - clear locally regardless of whether this succeeded.
      }
    }
    clearSession();
    refreshNavLoginState();
    showStep('login');
  });

  // ---------- Consent step ----------
  if (consentSubmit) consentSubmit.addEventListener('click', async () => {
    clearError('auth-consent-error');
    if (!consentBox.checked) { showError('auth-consent-error', 'Please tick the box to continue.'); return; }
    const session = pendingWelcome && pendingWelcome.session;
    if (!session) { showStep('login'); return; }
    setLoading(consentSubmit, true);
    try {
      await recordConsent(session, 'consent_gate');
      consentRecordedFor = session.access_token;
      await showWelcome(pendingWelcome);
    } catch (err) {
      showError('auth-consent-error', humanizeError(err));
    } finally {
      setLoading(consentSubmit, false);
    }
  });
  if (consentDecline) consentDecline.addEventListener('click', () => logOutBtn.click());

  // ---------- Download my data / Delete my account ----------
  async function accountRequest(action, extra) {
    const session = await getValidSession();
    if (!session) throw new Error('Please sign in again.');
    const res = await fetch('/api/account', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
      body: JSON.stringify({ action, ...(extra || {}) }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error || 'Something went wrong. Please try again.');
    }
    return res;
  }
  if (downloadDataBtn) downloadDataBtn.addEventListener('click', async () => {
    clearError('auth-account-msg');
    downloadDataBtn.disabled = true;
    showError('auth-account-msg', 'Preparing your data\u2026', true);
    try {
      const res = await accountRequest('export');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'fluency-ai-data.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      showError('auth-account-msg', 'Your data has been downloaded. Conversations and your coach\u2019s memory are on your device: export them in the app.', true);
    } catch (err) {
      showError('auth-account-msg', err.message);
    } finally {
      downloadDataBtn.disabled = false;
    }
  });
  if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', () => {
    clearError('auth-delete-error');
    deleteConfirmInput.value = '';
    showStep('delete');
    deleteConfirmInput.focus();
  });
  if (deleteCancel) deleteCancel.addEventListener('click', () => showStep('welcome'));
  if (deleteSubmit) deleteSubmit.addEventListener('click', async () => {
    clearError('auth-delete-error');
    if (deleteConfirmInput.value.trim() !== 'DELETE') { showError('auth-delete-error', 'Type DELETE (in capital letters) to confirm.'); return; }
    setLoading(deleteSubmit, true);
    try {
      await accountRequest('delete', { confirm: 'DELETE' });
      clearSession();
      try { sessionStorage.removeItem(CONSENT_INTENT_KEY); } catch (_) { /* fine */ }
      refreshNavLoginState();
      showStep('login');
      showError('auth-login-error', 'Your account has been deleted.', true);
    } catch (err) {
      showError('auth-delete-error', err.message);
    } finally {
      setLoading(deleteSubmit, false);
    }
  });

  // ---------- Forgot password / recovery flow ----------

  function openForgot() {
    clearError('auth-forgot-error');
    showStep('forgot');
  }
  forgotLink.addEventListener('click', openForgot);
  forgotLinkFromLogin.addEventListener('click', openForgot);

  backToSignupBtn.addEventListener('click', () => showStep('login'));

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!configured) return;
    clearError('auth-forgot-error');
    const email = document.getElementById('auth-forgot-email').value.trim();

    setLoading(forgotSubmit, true);
    try {
      await authRequest('/auth/v1/recover', { body: { email } });
      setPendingResetEmail(email);
      document.getElementById('auth-reset-email').textContent = email;
      showStep('reset');
    } catch (err) {
      showError('auth-forgot-error', humanizeError(err));
    } finally {
      setLoading(forgotSubmit, false);
    }
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!configured) return;
    clearError('auth-reset-error');
    const token = document.getElementById('auth-reset-code').value.trim();
    const newPassword = document.getElementById('auth-new-password').value;
    const email = getPendingResetEmail();

    if (!email) {
      showError('auth-reset-error', 'We lost track of which email this code was for — please request a new reset code.');
      return;
    }

    setLoading(resetSubmit, true);
    try {
      // Step 1: verify the recovery code - this returns a real session for
      // this user (access_token + refresh_token), same as the app's
      // verifyOTP(type: OtpType.recovery).
      const session = await authRequest('/auth/v1/verify', {
        body: { email, token, type: 'recovery' },
      });

      // Step 2: use that session's access token to set the new password.
      await authRequest('/auth/v1/user', {
        method: 'PUT',
        accessToken: session.access_token,
        body: { password: newPassword },
      });

      // Keep this session (rather than signing out) so "credentials
      // persist across sessions" applies here too - a password reset now
      // logs you in, the same as signup and login do.
      saveSession(session);
      clearPendingResetEmail();

      await showWelcome({
        title: 'Password updated',
        subtitle: 'You\u2019re signed in with your new password.',
        session,
      });
    } catch (err) {
      showError('auth-reset-error', humanizeError(err));
    } finally {
      setLoading(resetSubmit, false);
    }
  });

  resendResetBtn.addEventListener('click', async () => {
    if (!configured) return;
    clearError('auth-reset-error');
    resendResetBtn.disabled = true;
    resendResetBtn.textContent = 'Sending\u2026';
    try {
      await authRequest('/auth/v1/recover', { body: { email: getPendingResetEmail() } });
      showError('auth-reset-error', 'Code resent — check your inbox.', true);
    } catch (err) {
      showError('auth-reset-error', humanizeError(err));
    } finally {
      resendResetBtn.disabled = false;
      resendResetBtn.textContent = 'Resend code';
    }
  });
})();
