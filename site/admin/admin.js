// site/admin/admin.js
(function () {
  const SUPABASE_URL = window.__SUPABASE_URL || '';
  const SUPABASE_ANON_KEY = window.__SUPABASE_ANON_KEY || '';

  if (!window.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    document.body.innerHTML =
      '<div class="loading">Admin dashboard isn\u2019t configured yet — config.js is missing real Supabase values.</div>';
    return;
  }

  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const loginScreen = document.getElementById('login-screen');
  const dashboard = document.getElementById('dashboard');
  const loginForm = document.getElementById('login-form');
  const loginErr = document.getElementById('login-err');
  const whoami = document.getElementById('whoami');
  const contentLoading = document.getElementById('content-loading');
  const content = document.getElementById('content');

  let currentPage = 1;
  let currentFilter = 'all';
  let currentSearch = '';
  let accessToken = null;

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  function fmtDateTime(iso) {
    if (!iso) return 'Never';
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  async function apiFetch(path, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers || {}, {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
    });
    const res = await fetch('/api' + path, Object.assign({}, options, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')');
    return data;
  }

  // ---------- Login ----------

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginErr.textContent = '';
    const submitBtn = document.getElementById('login-submit');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in\u2026';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session) {
        loginErr.textContent = error ? error.message : 'Incorrect email or password.';
        return;
      }
      await afterLogin(data.session);
    } catch (err) {
      console.error('Login failed:', err);
      loginErr.textContent = 'Something went wrong (' + (err.message || 'unknown error') + '). Check your connection and try again.';
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.reload();
  });

  async function afterLogin(session) {
    accessToken = session.access_token;
    whoami.textContent = session.user.email;

    try {
      // A successful call to any admin endpoint doubles as the access
      // check — 403 here means "signed in, but not an admin".
      loginScreen.classList.add('hidden');
      dashboard.classList.remove('hidden');
      await loadStats();
      await loadUsers();
      content.classList.remove('hidden');
      contentLoading.classList.add('hidden');
    } catch (err) {
      contentLoading.textContent =
        err.message === 'Not an admin'
          ? "This account isn't an admin. Signed in, but access denied."
          : 'Something went wrong: ' + err.message;
    }
  }

  // Restore an existing session on reload, if any.
  supabase.auth.getSession().then(({ data }) => {
    if (data.session) afterLogin(data.session);
  });

  // ---------- Stats ----------

  function barList(el, items, colorVar) {
    if (!items || items.length === 0) {
      el.innerHTML = '<div style="color:var(--tx-3);font-size:13px">No data yet</div>';
      return;
    }
    const max = Math.max.apply(null, items.map((i) => i.count));
    el.innerHTML = items
      .map(
        (i) => `
      <div class="bar-row">
        <span class="bar-label" title="${i.label}">${i.label}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(i.count / max) * 100}%"></span></span>
        <span class="bar-count">${i.count}</span>
      </div>`
      )
      .join('');
  }

  async function loadStats() {
    const stats = await apiFetch('/admin/stats');

    document.getElementById('stat-cards').innerHTML = [
      ['Total users', stats.total_users],
      ['Active (7d)', stats.active_users_7d],
      ['Active (30d)', stats.active_users_30d],
      ['Subscribed', stats.subscribed_users],
      ['Admins', stats.total_admins],
    ]
      .map(
        ([label, num]) => `
      <div class="card">
        <div class="stat-num">${num ?? 0}</div>
        <div class="stat-label">${label}</div>
      </div>`
      )
      .join('');

    barList(document.getElementById('by-country'), stats.by_country);
    barList(document.getElementById('by-device'), stats.by_device);
    barList(document.getElementById('by-subscription'), stats.by_subscription_status);
  }

  // ---------- Users table ----------

  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      currentPage = 1;
      loadUsers();
    });
  });

  let searchDebounce;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      currentSearch = e.target.value.trim();
      currentPage = 1;
      loadUsers();
    }, 350);
  });

  document.getElementById('prev-page').addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage -= 1;
      loadUsers();
    }
  });
  document.getElementById('next-page').addEventListener('click', () => {
    currentPage += 1;
    loadUsers();
  });

  function subscriptionPill(status) {
    const cls = 'pill-' + (status || 'free');
    return `<span class="pill ${cls}">${status || 'free'}</span>`;
  }

  async function loadUsers() {
    const params = new URLSearchParams({
      search: currentSearch,
      filter: currentFilter,
      page: String(currentPage),
      pageSize: '25',
    });
    const data = await apiFetch('/admin/users?' + params.toString());

    document.getElementById('users-tbody').innerHTML = data.users
      .map((u) => {
        const isAdmin = u.role === 'admin';
        const isSubscribed = u.subscription_status === 'active' || u.subscription_status === 'trialing';
        return `
        <tr>
          <td class="email">${u.email}</td>
          <td>${fmtDate(u.created_at)}</td>
          <td>${isAdmin ? '<span class="pill pill-admin">admin</span>' : '<span class="pill pill-user">user</span>'}</td>
          <td>${subscriptionPill(u.subscription_status)}</td>
          <td>${fmtDate(u.subscription_period_end)}</td>
          <td>${fmtDateTime(u.last_active_at)}</td>
          <td>${u.last_country || '—'}</td>
          <td>${u.last_device || '—'}</td>
          <td style="white-space:nowrap">
            <button class="row-btn" data-action="${isAdmin ? 'demote' : 'promote'}" data-id="${u.id}">${isAdmin ? 'Demote' : 'Promote'}</button>
            <button class="row-btn" data-action="${isSubscribed ? 'revoke' : 'grant'}" data-id="${u.id}">${isSubscribed ? 'Revoke' : 'Grant'}</button>
          </td>
        </tr>`;
      })
      .join('');

    document.getElementById('pager-info').textContent =
      `Page ${data.page} of ${data.totalPages} · ${data.totalCount} users`;
    document.getElementById('prev-page').disabled = data.page <= 1;
    document.getElementById('next-page').disabled = data.page >= data.totalPages;
  }

  document.getElementById('users-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    btn.disabled = true;

    try {
      if (action === 'promote' || action === 'demote') {
        await apiFetch('/admin/set-role', {
          method: 'POST',
          body: JSON.stringify({ userId: id, role: action === 'promote' ? 'admin' : 'user' }),
        });
      } else if (action === 'grant' || action === 'revoke') {
        await apiFetch('/admin/grant-access', {
          method: 'POST',
          body: JSON.stringify({ userId: id, status: action === 'grant' ? 'active' : 'canceled' }),
        });
      }
      await loadUsers();
      await loadStats();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });
})();
