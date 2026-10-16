// api/_lib/adminCredits.js
//
// Admin tools for credits, mounted in api/admin/router.js (one serverless function for all admin routes):
//   GET  /api/admin/credits-balance?userId=<uuid>                      -> { balance: { total, monthly, topup, expiresAt } }
//   POST /api/admin/credits-grant { userId, amount, note?, idempotencyKey? }   add top-up credits (never expire)
//   GET  /api/admin/credits-usage?days=30                              -> { mode, by_route: [...], top_users: [...] }
//
// The dashboard (site/admin/admin.js) already calls these. Early-access and waitlist members get their credits
// through credits-grant, because there are no free credits.

const { getMode } = require('./credits');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_GRANT = 100000; // a typo guard for the dashboard; the database allows up to 1,000,000

function toBalance(row) {
  const r = (Array.isArray(row) ? row[0] : row) || {};
  return {
    total: Number(r.total) || 0,
    monthly: Number(r.monthly) || 0,
    topup: Number(r.topup) || 0,
    expiresAt: r.expires_at || null,
  };
}

async function handleCreditsBalance(auth, req, res) {
  const userId = String((req.query || {}).userId || '');
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'userId must be an account id (uuid)' });

  const { data, error } = await auth.supabase.rpc('fl_credit_get', { p_user: userId });
  if (error) {
    console.error('admin/credits-balance failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ balance: toBalance(data) });
}

async function handleCreditsGrant(auth, req, res) {
  const body = req.body || {};
  const userId = String(body.userId || '');
  const amount = Number(body.amount);
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'userId must be an account id (uuid)' });
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) {
    return res.status(400).json({ error: `amount must be a whole number between 1 and ${MAX_GRANT.toLocaleString('en-US')}` });
  }
  const key = String(body.idempotencyKey || '').trim().slice(0, 100) || null;

  const { data, error } = await auth.supabase.rpc('fl_credit_grant', {
    p_user: userId,
    p_amount: amount,
    p_kind: 'admin_grant',
    p_note: String(body.note || '').trim().slice(0, 200) || null,
    p_by: auth.user.email || auth.user.id,
    p_key: key,
  });
  if (error) {
    if (error.code === '23503' || /foreign key/i.test(error.message)) {
      return res.status(404).json({ error: 'That account does not exist' });
    }
    console.error('admin/credits-grant failed:', error.message);
    return res.status(500).json({ error: 'Could not add the credits' });
  }
  const row = (Array.isArray(data) ? data[0] : data) || {};
  return res.status(200).json({ ok: true, duplicate: !!row.duplicate, balance: toBalance(row) });
}

async function handleCreditsUsage(auth, req, res) {
  const days = Math.min(365, Math.max(1, parseInt((req.query || {}).days, 10) || 30));
  const { data, error } = await auth.supabase.rpc('fl_admin_credit_usage', { p_days: days });
  if (error) {
    console.error('admin/credits-usage failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
  const report = data || {};
  return res.status(200).json({
    mode: getMode(),
    days,
    by_route: report.by_route || [],
    top_users: report.top_users || [],
  });
}

async function handleCreditsRevoke(auth, req, res) {
  const body = req.body || {};
  const userId = String(body.userId || '');
  const amount = Number(body.amount);
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'userId must be an account id (uuid)' });
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) {
    return res.status(400).json({ error: `amount must be a whole number between 1 and ${MAX_GRANT.toLocaleString('en-US')}` });
  }
  const { data, error } = await auth.supabase.rpc('fl_credit_revoke', {
    p_user: userId,
    p_amount: amount,
    p_note: String(body.note || '').trim().slice(0, 200) || null,
    p_by: auth.user.email || auth.user.id,
    p_key: String(body.idempotencyKey || '').trim().slice(0, 100) || null,
  });
  if (error) {
    console.error('admin/credits-revoke failed:', error.message);
    return res.status(500).json({ error: 'Could not take the credits back' });
  }
  const row = (Array.isArray(data) ? data[0] : data) || {};
  return res.status(200).json({ ok: true, duplicate: !!row.duplicate, revoked: Number(row.revoked) || 0, balance: toBalance(row) });
}

module.exports = { handleCreditsBalance, handleCreditsGrant, handleCreditsUsage, handleCreditsRevoke };
