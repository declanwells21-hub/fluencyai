// api/admin/router.js
//
// Handles /api/admin/stats, /api/admin/users, /api/admin/set-role, and
// /api/admin/grant-access - all in ONE serverless function instead of four
// separate files.
//
// Why one file: Vercel's free Hobby plan caps a deployment at 12
// serverless functions total. Between the original 8 (chat, stt, tts,
// tatoeba x3, create-checkout-session, stripe-webhook) and 4 separate admin
// files + track-activity.js, that was 13 - one over the limit.
//
// Why "router.js" and not "[...path].js": bracket-based catch-all
// filenames ([...path].js) are a Next.js-specific routing convention, not
// a general Vercel platform feature - since this project has no framework
// (plain static site + serverless functions), Vercel doesn't parse the
// brackets as a dynamic segment at all. It found this out the hard way: a
// [...path].js version deployed fine and ran without crashing, but the
// literal text "...path" leaked into the query string instead of Vercel
// populating a clean "path" key, so every request 404'd with "Unknown
// admin route: undefined" no matter what URL hit it.
//
// The fix is the rewrite rule in vercel.json:
//   { "source": "/api/admin/:path*", "destination": "/api/admin/router?path=:path*" }
// Rewrites are a core platform feature independent of framework detection,
// so this works the same way any static/"Other" project.
//
// This file replaces (delete these from your repo, if not already gone):
//   api/admin/[...path].js
//   api/admin/stats.js / users.js / set-role.js / grant-access.js (older still)
//
// site/admin/admin.js needs NO changes - it still calls the exact same
// URLs (/api/admin/stats etc.), the rewrite handles the redirection.

const { requireAdmin } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
    const route = segments[0];

    if (route === 'stats' && req.method === 'GET') {
      return handleStats(auth, res);
    }
    if (route === 'users' && req.method === 'GET') {
      return handleUsers(auth, req, res);
    }
    if (route === 'set-role' && req.method === 'POST') {
      return handleSetRole(auth, req, res);
    }
    if (route === 'grant-access' && req.method === 'POST') {
      return handleGrantAccess(auth, req, res);
    }

    return res.status(404).json({ error: 'Unknown admin route: ' + route });
  } catch (err) {
    console.error('api/admin: unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
};

async function handleStats(auth, res) {
  const { data, error } = await auth.supabase.rpc('admin_get_stats');
  if (error) {
    console.error('admin/stats: admin_get_stats failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json(data);
}

async function handleUsers(auth, req, res) {
  const search = (req.query.search || '').trim();
  const filter = req.query.filter || 'all';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;

  const { data, error } = await auth.supabase.rpc('admin_list_users', {
    p_search: search || null,
    p_filter: filter,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) {
    console.error('admin/users: admin_list_users failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  const totalCount = data && data.length > 0 ? Number(data[0].total_count) : 0;
  const users = (data || []).map((row) => {
    const { total_count, ...rest } = row;
    return rest;
  });

  res.status(200).json({
    users,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  });
}

async function handleSetRole(auth, req, res) {
  const { userId, role } = req.body || {};
  if (!userId || !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Body must include userId and role ("admin" or "user")' });
  }

  if (role === 'user') {
    const { count, error: countErr } = await auth.supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (countErr) return res.status(500).json({ error: countErr.message });
    if ((count || 0) <= 1) {
      return res.status(400).json({ error: "Can't demote the last remaining admin." });
    }
  }

  const { error } = await auth.supabase.from('profiles').upsert({ id: userId, role }, { onConflict: 'id' });
  if (error) {
    console.error('admin/set-role: upsert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, userId, role });
}

async function handleGrantAccess(auth, req, res) {
  const ALLOWED_STATUSES = ['active', 'free', 'canceled'];
  const { userId, status, periodEndDays } = req.body || {};
  if (!userId || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Body must include userId and status (one of: ${ALLOWED_STATUSES.join(', ')})`,
    });
  }

  let periodEnd = null;
  if (status === 'active') {
    const days = Number.isFinite(periodEndDays) && periodEndDays > 0 ? periodEndDays : 365;
    periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const { error } = await auth.supabase
    .from('profiles')
    .upsert({ id: userId, subscription_status: status, subscription_period_end: periodEnd }, { onConflict: 'id' });

  if (error) {
    console.error('admin/grant-access: upsert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, userId, status, periodEnd });
}
