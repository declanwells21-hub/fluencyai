// ============ FLUENCY AI — INLINE SIGNUP (site/auth.js) ============
// Uses the same Supabase project + OTP flow as the Flutter app's
// verifyOTP(type: OtpType.signup). Config comes from config.js, which is
// regenerated at build time from Vercel's SUPABASE_URL / SUPABASE_ANON_KEY
// environment variables — never hardcode real values in this file.

(function () {
  const SUPABASE_URL = window.__SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || '';

  let supabase = null;
  if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  const overlay = document.getElementById('auth-modal-overlay');
  const closeBtn = document.getElementById('auth-close-btn');
  const signupForm = document.getElementById('auth-signup-form');
  const verifyForm = document.getElementById('auth-verify-form');
  const resendBtn = document.getElementById('auth-resend-btn');
  const signupSubmit = document.getElementById('auth-signup-submit');
  const verifySubmit = document.getElementById('auth-verify-submit');

  let pendingEmail = '';
  let pendingPassword = '';

  function showStep(name) {
    document.querySelectorAll('.auth-step').forEach((el) => el.classList.remove('active'));
    document.getElementById('auth-step-' + name).classList.add('active');
  }

  function showError(id, message) {
    const el = document.getElementById(id);
    el.textContent = message;
    el.classList.add('show');
  }
  function clearError(id) {
    const el = document.getElementById(id);
    el.textContent = '';
    el.classList.remove('show');
  }
  function setLoading(btn, loading, label) {
    btn.disabled = loading;
    if (loading) {
      btn.dataset.label = btn.innerHTML;
      btn.innerHTML = label || 'One moment&hellip;';
    } else if (btn.dataset.label) {
      btn.innerHTML = btn.dataset.label;
    }
  }

  function humanizeError(error) {
    const msg = (error && error.message) || 'Something went wrong. Please try again.';
    if (/already registered|already exists/i.test(msg)) {
      return "That email already has an account — try logging in instead.";
    }
    if (/password/i.test(msg) && /least|short|weak/i.test(msg)) {
      return 'Please use a password with at least 6 characters.';
    }
    if (/invalid.*(email|format)/i.test(msg)) {
      return 'That email address doesn\u2019t look right — please check it.';
    }
    if (/token|otp|code/i.test(msg)) {
      return 'That code is incorrect or has expired. Double check it, or resend a new one.';
    }
    return msg;
  }

  function openModal() {
    if (!supabase) {
      // Config not available for some reason — fall back to the app directly
      // rather than showing a broken form.
      window.location.href = '/app/auth?mode=signup';
      return;
    }
    showStep('signup');
    clearError('auth-signup-error');
    clearError('auth-verify-error');
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('auth-email').focus(), 200);
  }

  function closeModal() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.js-auth-trigger').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supabase) { window.location.href = '/app/auth?mode=signup'; return; }
    clearError('auth-signup-error');
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    setLoading(signupSubmit, true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(signupSubmit, false);

    if (error) {
      showError('auth-signup-error', humanizeError(error));
      return;
    }

    pendingEmail = email;
    pendingPassword = password;
    document.getElementById('auth-verify-email').textContent = email;
    showStep('verify');
    setTimeout(() => document.getElementById('auth-code').focus(), 200);
  });

  verifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!supabase) { window.location.href = '/app/auth?mode=signup'; return; }
    clearError('auth-verify-error');
    const token = document.getElementById('auth-code').value.trim();

    setLoading(verifySubmit, true);
    const { error } = await supabase.auth.verifyOTP({
      email: pendingEmail,
      token: token,
      type: 'signup',
    });
    setLoading(verifySubmit, false);

    if (error) {
      showError('auth-verify-error', humanizeError(error));
      return;
    }

    showStep('success');
    setTimeout(() => {
      window.location.href = '/app/auth?mode=login';
    }, 1800);
  });

  resendBtn.addEventListener('click', async () => {
    if (!supabase) return;
    clearError('auth-verify-error');
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending\u2026';
    const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });
    resendBtn.disabled = false;
    resendBtn.textContent = 'Resend code';
    if (error) {
      showError('auth-verify-error', humanizeError(error));
    } else {
      showError('auth-verify-error', 'Code resent — check your inbox.');
      document.getElementById('auth-verify-error').style.color = 'var(--mint-400)';
    }
  });
})();
