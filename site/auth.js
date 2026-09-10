// ============ FLUENCY AI — INLINE AUTH (site/auth.js) ============
// Sign up, log in, and password recovery, all using the same Supabase
// project + OTP-code flow as the Flutter app. Config comes from config.js,
// regenerated at build time from Vercel's SUPABASE_URL / SUPABASE_ANON_KEY
// - never hardcode real values in this file.
//
// Every async handler below is wrapped in try/catch/finally. Earlier
// versions weren't, which meant an unexpected error (a network hiccup, a
// Supabase call throwing instead of returning {error}) could leave a
// button stuck on "One moment..." forever with no feedback. finally{}
// guarantees the loading state always clears, no matter what happens.

(function () {
  const SUPABASE_URL = window.__SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || '';

  // Custom auth lock: by default, supabase-js serializes auth calls (login,
  // signup, verifyOTP, refresh, etc.) using the browser's Web Locks API,
  // and that lock is shared across every tab open on this site - on
  // purpose, so two tabs don't race to refresh the same session's token.
  //
  // The problem: if any one tab ever gets stuck mid-auth-call (a hung
  // network request, a crashed tab, a background tab throttled by the
  // browser before it could release the lock), it holds that lock forever
  // - and every other tab, for every other visitor, silently hangs on
  // their next login/signup/verify call with no error and no network
  // request ever firing. That's what was happening here: a correct code
  // would just hang indefinitely because some other, unrelated tab never
  // released this shared lock.
  //
  // This replaces it with a lock that behaves the same in the normal case
  // but automatically gives up and proceeds after 5 seconds instead of
  // hanging forever, so one broken tab can never freeze auth for everyone
  // else. A very rare double-refresh race is a far smaller risk than every
  // user being unable to log in.
  async function timeBoundedLock(lockName, acquireTimeout, fn) {
    if (!('locks' in navigator)) return fn();
    try {
      return await navigator.locks.request(
        lockName,
        { signal: AbortSignal.timeout(5000) },
        () => fn()
      );
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
        console.warn('[Fluency] Auth lock timed out after 5s (likely a stuck tab elsewhere) - proceeding without it.');
        return fn();
      }
      throw err;
    }
  }

  let supabase = null;
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { lock: timeBoundedLock },
    });
  }

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
  const goToAdminBtn = document.getElementById('auth-go-to-admin');
  const continueToAppBtn = document.getElementById('auth-continue-to-app');

  const forgotLink = document.getElementById('auth-forgot-link');
  const forgotLinkFromLogin = document.getElementById('auth-forgot-link-login');
  const backToSignupBtn = document.getElementById('auth-back-to-signup');
  const forgotForm = document.getElementById('auth-forgot-form');
  const forgotSubmit = document.getElementById('auth-forgot-submit');
  const resetForm = document.getElementById('auth-reset-form');
  const resetSubmit = document.getElementById('auth-reset-submit');
  const resendResetBtn = document.getElementById('auth-resend-reset-btn');

  // Pending emails are stored in sessionStorage, not just a JS variable -
  // this is the actual fix for "That code is incorrect or has expired"
  // showing up even with a fresh, correctly-typed code. A plain variable
  // resets to empty on any page reload; if that happened between
  // requesting a code and entering it, verifyOTP would silently be called
  // with an empty email attached to a real code, and Supabase returns the
  // exact same generic error for that as it does for a genuinely wrong
  // code. sessionStorage survives a reload within the same tab and clears
  // itself when the tab closes.
  const PENDING_SIGNUP_KEY = 'fl_pending_signup_email';
  const PENDING_RESET_KEY = 'fl_pending_reset_email';

  function getPendingEmail() {
    return sessionStorage.getItem(PENDING_SIGNUP_KEY) || '';
  }
  function setPendingEmail(email) {
    sessionStorage.setItem(PENDING_SIGNUP_KEY, email);
  }
  function clearPendingEmail() {
    sessionStorage.removeItem(PENDING_SIGNUP_KEY);
  }
  function getPendingResetEmail() {
    return sessionStorage.getItem(PENDING_RESET_KEY) || '';
  }
  function setPendingResetEmail(email) {
    sessionStorage.setItem(PENDING_RESET_KEY, email);
  }
  function clearPendingResetEmail() {
    sessionStorage.removeItem(PENDING_RESET_KEY);
  }

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
    if (/already registered|already exists/i.test(msg)) {
      return "That email already has an account — try logging in instead.";
    }
    if (/password/i.test(msg) && /least|short|weak/i.test(msg)) {
      return 'Please use a password with at least 6 characters.';
    }
    if (/invalid login credentials/i.test(msg)) {
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

  function openModal(step) {
    if (!supabase) {
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
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openModal('signup');
    });
  });
  document.querySelectorAll('.js-login-trigger').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openModal('login');
    });
  });

  // If the page reloaded while a code was pending (switched tabs, browser
  // restored the page, etc.), reopen straight to the right step instead of
  // silently losing track and producing a confusing "incorrect or expired
  // code" error later for what looks like a perfectly valid code.
  if (supabase) {
    const pendingSignup = getPendingEmail();
    const pendingReset = getPendingResetEmail();
    if (pendingSignup) {
      document.getElementById('auth-verify-email').textContent = pendingSignup;
      openModal('verify');
    } else if (pendingReset) {
      document.getElementById('auth-reset-email').textContent = pendingReset;
      openModal('reset');
    }
  }

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  // ---------- Sign up ----------

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supabase) { window.location.href = '/app/auth?mode=signup'; return; }
    clearError('auth-signup-error');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    setLoading(signupSubmit, true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        showError('auth-signup-error', humanizeError(error));
        return;
      }
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
    if (!supabase) { window.location.href = '/app/auth?mode=signup'; return; }
    clearError('auth-verify-error');
    const token = document.getElementById('auth-code').value.trim();
    const email = getPendingEmail();

    if (!email) {
      showError('auth-verify-error', 'We lost track of which email this code was for — please sign up again to get a fresh code.');
      return;
    }

    setLoading(verifySubmit, true);
    try {
      const { error } = await supabase.auth.verifyOTP({ email, token, type: 'signup' });
      if (error) {
        showError('auth-verify-error', humanizeError(error));
        return;
      }
      clearPendingEmail();
      showStep('success');
      setTimeout(() => { window.location.href = '/app/auth?mode=login'; }, 1800);
    } catch (err) {
      showError('auth-verify-error', humanizeError(err));
    } finally {
      setLoading(verifySubmit, false);
    }
  });

  resendBtn.addEventListener('click', async () => {
    if (!supabase) return;
    clearError('auth-verify-error');
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending\u2026';
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: getPendingEmail() });
      if (error) {
        showError('auth-verify-error', humanizeError(error));
      } else {
        showError('auth-verify-error', 'Code resent — check your inbox.', true);
      }
    } catch (err) {
      showError('auth-verify-error', humanizeError(err));
    } finally {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Resend code';
    }
  });

  // ---------- Log in (with admin detection) ----------

  goToSignupBtn.addEventListener('click', () => showStep('signup'));
  document.getElementById('auth-go-to-login-from-signup').addEventListener('click', () => showStep('login'));

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supabase) { window.location.href = '/app/auth?mode=login'; return; }
    clearError('auth-login-error');
    const email = document.getElementById('auth-login-email').value.trim();
    const password = document.getElementById('auth-login-password').value;

    setLoading(loginSubmit, true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        showError('auth-login-error', humanizeError(error));
        return;
      }

      // Check role directly - RLS already allows a user to read their own
      // profiles row, no elevated privilege or extra endpoint needed here.
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileErr) {
        // Logged in fine, just couldn't confirm role - fail safe by
        // treating as a normal (non-admin) user rather than blocking login.
        console.error('Could not check role:', profileErr.message);
      }

      if (profile && profile.role === 'admin') {
        showStep('login-admin');
      } else {
        showStep('login-success');
      }
    } catch (err) {
      showError('auth-login-error', humanizeError(err));
    } finally {
      setLoading(loginSubmit, false);
    }
  });

  goToAdminBtn.addEventListener('click', () => {
    window.location.href = '/admin';
  });
  continueToAppBtn.addEventListener('click', () => {
    window.location.href = '/app';
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
    if (!supabase) return;
    clearError('auth-forgot-error');
    const email = document.getElementById('auth-forgot-email').value.trim();

    setLoading(forgotSubmit, true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        showError('auth-forgot-error', humanizeError(error));
        return;
      }
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
    if (!supabase) return;
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
      // Step 1: verify the recovery code - logs the browser into a
      // temporary session for this user, same as the app's
      // verifyOTP(type: OtpType.recovery).
      const { error: verifyError } = await supabase.auth.verifyOTP({
        email,
        token,
        type: 'recovery',
      });
      if (verifyError) {
        showError('auth-reset-error', humanizeError(verifyError));
        return;
      }

      // Step 2: now that we have a session, set the new password.
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        showError('auth-reset-error', humanizeError(updateError));
        return;
      }

      // Sign out of this temporary browser session - actual login still
      // happens explicitly, same as after signup.
      await supabase.auth.signOut().catch(() => {});
      clearPendingResetEmail();

      showStep('reset-success');
      setTimeout(() => { window.location.href = '/app/auth?mode=login'; }, 1800);
    } catch (err) {
      showError('auth-reset-error', humanizeError(err));
    } finally {
      setLoading(resetSubmit, false);
    }
  });

  resendResetBtn.addEventListener('click', async () => {
    if (!supabase) return;
    clearError('auth-reset-error');
    resendResetBtn.disabled = true;
    resendResetBtn.textContent = 'Sending\u2026';
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(getPendingResetEmail());
      if (error) {
        showError('auth-reset-error', humanizeError(error));
      } else {
        showError('auth-reset-error', 'Code resent — check your inbox.', true);
      }
    } catch (err) {
      showError('auth-reset-error', humanizeError(err));
    } finally {
      resendResetBtn.disabled = false;
      resendResetBtn.textContent = 'Resend code';
    }
  });
})();
