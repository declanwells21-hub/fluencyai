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
//    password reset, offering Continue to app / Go to admin dashboard (if
//    admin) / Stay on this site - instead of auto-redirecting or only
//    offering one option.
//  - The nav's "Log in" link turning into "My account" when a valid
//    session already exists, so returning users see they're signed in
//    without having to open the modal first.

(function () {
  const SUPABASE_URL = (window.__SUPABASE_URL || '').replace(/\/$/, '');
  const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || '';
  const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

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
  // default (sb-<project-ref>-auth-token), so the Flutter web app at /app
  // can pick up an existing session from the site without the user having
  // to log in twice. Kept in localStorage (not sessionStorage), so it
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
  }
  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
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
  const continueToAppBtn = document.getElementById('auth-continue-to-app');
  const stayOnSiteBtn = document.getElementById('auth-stay-on-site');
  const logOutBtn = document.getElementById('auth-log-out');

  const forgotLink = document.getElementById('auth-forgot-link');
  const forgotLinkFromLogin = document.getElementById('auth-forgot-link-login');
  const backToSignupBtn = document.getElementById('auth-back-to-signup');
  const forgotForm = document.getElementById('auth-forgot-form');
  const forgotSubmit = document.getElementById('auth-forgot-submit');
  const resetForm = document.getElementById('auth-reset-form');
  const resetSubmit = document.getElementById('auth-reset-submit');
  const resendResetBtn = document.getElementById('auth-resend-reset-btn');

  const navLoginLinks = [document.getElementById('fl-nav-login'), document.getElementById('fl-nav-login-m')].filter(Boolean);

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

  // ---------- The shared "you're in" screen ----------
  // Used after login, after confirming a signup code, and after resetting
  // a password - the only differences are the heading/subtext and whether
  // "Go to admin dashboard" is shown, so this is one function instead of
  // three near-duplicate screens.
  async function showWelcome({ title, subtitle, session }) {
    welcomeTitle.textContent = title;
    welcomeSub.textContent = subtitle;
    showStep('welcome');

    goToAdminBtn.classList.add('hidden');
    const isAdmin = await checkIsAdmin(session);
    if (isAdmin) goToAdminBtn.classList.remove('hidden');

    refreshNavLoginState();
  }

  function refreshNavLoginState() {
    const session = loadSession();
    const loggedIn = !!(session && session.expires_at && session.expires_at > Math.floor(Date.now() / 1000));
    navLoginLinks.forEach((el) => {
      el.textContent = loggedIn ? 'My account' : 'Log in';
    });
  }

  function openModal(step) {
    if (!configured) {
      window.location.href = '/app/auth?mode=signup';
      return;
    }
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

  document.querySelectorAll('.js-auth-trigger').forEach((el) => {
    el.addEventListener('click', (e) => { e.preventDefault(); openModal('signup'); });
  });
  document.querySelectorAll('.js-login-trigger').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.preventDefault();
      // Already signed in (from a previous visit)? Skip straight to the
      // welcome screen instead of asking them to log in again.
      const session = await getValidSession();
      if (session) {
        await showWelcome({ title: 'Welcome back', subtitle: "You're already signed in.", session });
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
      } else {
        openModal('login');
      }
    });
  });

  // Resume mid-flow if a code was already sent and the page reloaded.
  if (configured) {
    const pendingSignup = getPendingEmail();
    const pendingReset = getPendingResetEmail();
    if (pendingSignup) {
      document.getElementById('auth-verify-email').textContent = pendingSignup;
      openModal('verify');
    } else if (pendingReset) {
      document.getElementById('auth-reset-email').textContent = pendingReset;
      openModal('reset');
    }
    refreshNavLoginState();
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  // ---------- Sign up ----------

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!configured) { window.location.href = '/app/auth?mode=signup'; return; }
    clearError('auth-signup-error');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    setLoading(signupSubmit, true);
    try {
      await authRequest('/auth/v1/signup', { body: { email, password } });
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
    if (!configured) { window.location.href = '/app/auth?mode=signup'; return; }
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
    if (!configured) { window.location.href = '/app/auth?mode=login'; return; }
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
  continueToAppBtn.addEventListener('click', () => { window.location.href = '/app'; });
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

  // ---------- Forgot password / recovery flow ----------

  function openForgot() {
    clearError('auth-forgot-error');
    showStep('forgot');
  }
  forgotLink.addEventListener('click', openForgot);
  forgotLinkFromLogin.addEventListener('click', openForgot);

  backToSignupBtn.addEventListener('click', () => showStep('signup'));

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
