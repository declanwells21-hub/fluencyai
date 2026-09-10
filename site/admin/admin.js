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
      await loadCreators();
      await loadApplications();
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
      ['Suspended', stats.suspended_users],
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
        const isSuspended = u.banned_until && new Date(u.banned_until) > new Date();
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
          <td>${isSuspended ? '<span class="pill pill-suspended">suspended</span>' : '<span class="pill pill-ok">active</span>'}</td>
          <td style="white-space:nowrap">
            <button class="row-btn" data-action="${isAdmin ? 'demote' : 'promote'}" data-id="${u.id}">${isAdmin ? 'Demote' : 'Promote'}</button>
            <button class="row-btn" data-action="${isSubscribed ? 'revoke' : 'grant'}" data-id="${u.id}">${isSubscribed ? 'Revoke' : 'Grant'}</button>
            <button class="row-btn" data-action="${isSuspended ? 'unsuspend' : 'suspend'}" data-id="${u.id}">${isSuspended ? 'Unsuspend' : 'Suspend'}</button>
            <button class="row-btn" data-action="delete" data-id="${u.id}" data-email="${u.email}" style="border-color:var(--coral-400);color:var(--coral-400)">Delete</button>
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
    const { action, id, email } = btn.dataset;

    if (action === 'delete') {
      if (!confirm(`Permanently delete ${email}? This deletes their account and all their data. This cannot be undone.`)) {
        return;
      }
    }
    if (action === 'suspend') {
      if (!confirm(`Suspend ${email || 'this user'}? They won't be able to log in until unsuspended.`)) {
        return;
      }
    }

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
      } else if (action === 'suspend' || action === 'unsuspend') {
        await apiFetch('/admin/suspend-user', {
          method: 'POST',
          body: JSON.stringify({ userId: id, suspend: action === 'suspend' }),
        });
      } else if (action === 'delete') {
        await apiFetch('/admin/delete-user', {
          method: 'POST',
          body: JSON.stringify({ userId: id }),
        });
      }
      await loadUsers();
      await loadStats();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });

  // ---------- Communication center ----------

  const TEMPLATES = {
    general: {
      subject: 'An update from Fluency AI',
      message:
        "Hi,\n\nWe wanted to share a quick update with you.\n\n[Write your announcement here.]\n\nThanks for being part of Fluency AI.",
    },
    subscription: {
      subject: 'Your Fluency AI subscription',
      message:
        "Hi,\n\nThis is a note about your Fluency AI subscription.\n\n[Explain the billing/subscription update here.]\n\nIf you have any questions, just reply to this email.",
    },
    info: {
      subject: "What's new in Fluency AI",
      message:
        "Hi,\n\nHere's a quick look at what's new.\n\n[Describe the update or feature here.]\n\nHappy speaking!",
    },
    custom: { subject: '', message: '' },
  };

  const commAudience = document.getElementById('comm-audience');
  const commSpecificWrap = document.getElementById('comm-specific-wrap');
  const commSpecificEmail = document.getElementById('comm-specific-email');
  const commTemplate = document.getElementById('comm-template');
  const commSubject = document.getElementById('comm-subject');
  const commMessage = document.getElementById('comm-message');
  const commResult = document.getElementById('comm-result');
  const commSendBtn = document.getElementById('comm-send-btn');

  commAudience.addEventListener('change', () => {
    commSpecificWrap.style.display = commAudience.value === 'specific' ? 'grid' : 'none';
  });

  commTemplate.addEventListener('change', () => {
    const t = TEMPLATES[commTemplate.value];
    if (t) {
      commSubject.value = t.subject;
      commMessage.value = t.message;
    }
  });
  // Load the default template's text in on first render.
  commTemplate.dispatchEvent(new Event('change'));

  commSendBtn.addEventListener('click', async () => {
    commResult.textContent = '';
    commResult.classList.remove('show');

    const audience = commAudience.value;
    const specificEmail = commSpecificEmail.value.trim();
    const subject = commSubject.value.trim();
    const message = commMessage.value.trim();

    if (!subject || !message) {
      commResult.textContent = 'Subject and message are both required.';
      commResult.classList.add('show');
      return;
    }
    if (audience === 'specific' && !specificEmail) {
      commResult.textContent = 'Enter the recipient\u2019s email.';
      commResult.classList.add('show');
      return;
    }

    const audienceLabel =
      audience === 'specific'
        ? specificEmail
        : { all: 'ALL users', subscribed: 'subscribed users', free: 'free users', suspended: 'suspended users' }[audience];
    if (!confirm(`Send this email to ${audienceLabel}?`)) return;

    commSendBtn.disabled = true;
    commSendBtn.textContent = 'Sending\u2026';
    try {
      const result = await apiFetch('/admin/send-email', {
        method: 'POST',
        body: JSON.stringify({ audience, specificEmail, subject, message }),
      });
      commResult.textContent = `Sent to ${result.sent} of ${result.total} recipient(s)${result.failed ? ` — ${result.failed} failed` : ''}.`;
      commResult.style.color = result.failed ? 'var(--amber-400)' : 'var(--mint-400)';
      commResult.classList.add('show');
    } catch (err) {
      commResult.textContent = err.message;
      commResult.style.color = 'var(--coral-400)';
      commResult.classList.add('show');
    } finally {
      commSendBtn.disabled = false;
      commSendBtn.textContent = 'Send email';
    }
  });

  // ---------- Fluency Creator Program: creators ----------

  function money(cents) {
    return '$' + ((cents || 0) / 100).toFixed(2);
  }
  function pct(rate) {
    return Math.round((rate || 0) * 100) + '%';
  }

  async function loadCreators() {
    const { creators } = await apiFetch('/admin/creators');

    const totalClicks = creators.reduce((s, c) => s + Number(c.clicks || 0), 0);
    const totalSignups = creators.reduce((s, c) => s + Number(c.signups || 0), 0);
    const totalOwed = creators.reduce((s, c) => s + Number(c.commission_owed_cents || 0), 0);
    document.getElementById('creator-totals').textContent =
      `${creators.length} creator(s) · ${totalClicks} clicks · ${totalSignups} signups · ${money(totalOwed)} owed`;

    document.getElementById('creators-tbody').innerHTML = creators
      .map((c) => {
        const link = `https://fluencyai.app/?ref=${c.code}`;
        const isActive = c.status === 'active';
        return `
        <tr>
          <td style="color:var(--tx);font-weight:600">${escapeHtml(c.name)}</td>
          <td><code style="color:var(--teal-400)">${escapeHtml(c.code)}</code>
            <button class="copy-link" data-copy="${link}" title="${link}">Copy link</button>
          </td>
          <td>${c.niche ? escapeHtml(c.niche) : '—'}</td>
          <td>${c.clicks}</td>
          <td>${c.signups}</td>
          <td>${c.conversions}</td>
          <td>${money(c.commission_owed_cents)} <span style="color:var(--tx-3)">(${pct(c.commission_rate)})</span></td>
          <td><span class="pill ${isActive ? 'pill-ok' : 'pill-paused'}">${c.status}</span></td>
          <td style="white-space:nowrap">
            <button class="row-btn" data-creator-action="${isActive ? 'pause' : 'resume'}" data-id="${c.id}">${isActive ? 'Pause' : 'Resume'}</button>
          </td>
        </tr>`;
      })
      .join('') || `<tr><td colspan="9" style="color:var(--tx-3)">No creators yet — add one above, or approve an application below.</td></tr>`;
  }

  document.getElementById('creator-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('creator-add-err');
    errEl.textContent = '';
    const name = document.getElementById('creator-name').value.trim();
    const code = document.getElementById('creator-code').value.trim();
    const niche = document.getElementById('creator-niche').value.trim();
    const contactEmail = document.getElementById('creator-email').value.trim();
    const ratePct = parseFloat(document.getElementById('creator-rate').value);

    if (!name) {
      errEl.textContent = 'Creator name is required.';
      return;
    }

    try {
      await apiFetch('/admin/creator-create', {
        method: 'POST',
        body: JSON.stringify({
          name,
          code: code || undefined,
          niche: niche || undefined,
          contactEmail: contactEmail || undefined,
          commissionRate: Number.isFinite(ratePct) ? ratePct / 100 : 0.2,
        }),
      });
      document.getElementById('creator-add-form').reset();
      document.getElementById('creator-rate').value = '20';
      await loadCreators();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  document.getElementById('creators-tbody').addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('button[data-copy]');
    if (copyBtn) {
      navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
        const original = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = original), 1200);
      });
      return;
    }
    const actionBtn = e.target.closest('button[data-creator-action]');
    if (!actionBtn) return;
    const { creatorAction, id } = actionBtn.dataset;
    actionBtn.disabled = true;
    try {
      await apiFetch('/admin/creator-update', {
        method: 'POST',
        body: JSON.stringify({ creatorId: id, status: creatorAction === 'pause' ? 'paused' : 'active' }),
      });
      await loadCreators();
    } catch (err) {
      alert(err.message);
      actionBtn.disabled = false;
    }
  });

  // ---------- Fluency Creator Program: applications ----------

  let currentAppFilter = 'pending';

  async function loadApplications() {
    const { applications } = await apiFetch('/admin/applications?status=' + currentAppFilter);
    document.getElementById('applications-tbody').innerHTML =
      applications
        .map(
          (a) => `
        <tr>
          <td style="color:var(--tx);font-weight:600">${escapeHtml(a.name)}</td>
          <td>${escapeHtml(a.email)}</td>
          <td>${escapeHtml(a.platform)}</td>
          <td>${escapeHtml(a.handle)}</td>
          <td>${a.niche ? escapeHtml(a.niche) : '—'}</td>
          <td>${a.follower_count ? escapeHtml(a.follower_count) : '—'}</td>
          <td>${fmtDate(a.created_at)}</td>
          <td><span class="pill pill-${a.status}">${a.status}</span></td>
          <td style="white-space:nowrap">
            ${
              a.status === 'pending'
                ? `<button class="row-btn" data-app-action="approve" data-id="${a.id}">Approve</button>
                   <button class="row-btn" data-app-action="reject" data-id="${a.id}" style="border-color:var(--coral-400);color:var(--coral-400)">Reject</button>`
                : '—'
            }
          </td>
        </tr>`
        )
        .join('') || `<tr><td colspan="9" style="color:var(--tx-3)">No applications here yet.</td></tr>`;
  }

  document.querySelectorAll('[data-app-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-app-filter]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentAppFilter = btn.dataset.appFilter;
      loadApplications();
    });
  });

  document.getElementById('applications-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-app-action]');
    if (!btn) return;
    const { appAction, id } = btn.dataset;
    if (appAction === 'reject' && !confirm('Reject this application?')) return;

    btn.disabled = true;
    try {
      const result = await apiFetch('/admin/application-decide', {
        method: 'POST',
        body: JSON.stringify({ applicationId: id, decision: appAction }),
      });
      if (appAction === 'approve' && result.creator) {
        alert(`Approved! Referral code: ${result.creator.code}\nLink: https://fluencyai.app/?ref=${result.creator.code}`);
      }
      await loadApplications();
      await loadCreators();
    } catch (err) {
      alert(err.message);
      btn.disabled = false;
    }
  });

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
