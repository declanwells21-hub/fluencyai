// api/_lib/account.js
//
// "Download my data" and "Delete my account" (Privacy Policy section 9, Terms sections 2 and 13).
// Reached as POST /api/account through a rewrite to api/create-checkout-session.js (the project is at the 12-function limit):
//
//   POST /api/account   Authorization: Bearer <the person's login token>
//     { "action": "export" }                      the person's data as a JSON file
//     { "action": "delete", "confirm": "DELETE" } deletes the account (see below)
//
// Deleting an account, in this order, and it stops at the first failure so nothing is half done:
//   1. refuse if the person is a partner with unpaid earnings (409 partner_balance): they must be settled first;
//   2. cancel an active subscription at Creem immediately, so billing cannot continue (if that fails, nothing is deleted);
//   3. fl_delete_user_data(): removes or de-identifies what the servers hold (see scripts/supabase_migration_compliance.sql);
//   4. delete the login itself, which cascades to the profile, plan items, credits and consent records;
//   5. record that a deletion happened, without recording who.
// The admin dashboard's "Delete" uses the same path (deleteAccount), so support deletions behave identically.
//
// Conversations, transcripts, the word bank and the coach's memory are stored on the person's device, not here:
// the app exports and clears those itself.

const { getServiceClient } = require('./supabase');
const { getUserFromRequest } = require('./userAuth');
const { hit, getClientIp } = require('./rateLimit');

const BILLING_STATUSES = ['active', 'trialing', 'past_due', 'paused', 'unpaid']; // statuses in which Creem may still bill

class AccountError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

async function pendingPartnerCents(supabase, userId) {
  const { data: creator, error } = await supabase.from('creators').select('id').eq('user_id', userId).maybeSingle();
  if (error) throw new AccountError(500, 'lookup_failed', 'Could not check your partner account.');
  if (!creator) return 0;
  const { data, error: e2 } = await supabase.from('partner_commissions').select('commission_cents').eq('creator_id', creator.id).eq('status', 'pending');
  if (e2) throw new AccountError(500, 'lookup_failed', 'Could not check your partner earnings.');
  return (data || []).reduce((n, r) => n + (Number(r.commission_cents) || 0), 0);
}

/** Cancels a Creem subscription immediately. Returns true if cancelled, false if Creem no longer knows it. Throws if it cannot be done. */
async function cancelSubscription(subscriptionId) {
  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) throw new AccountError(503, 'billing_unavailable', 'We could not cancel your subscription right now (billing is not reachable). Nothing was deleted. Please try again later or write to support@fluencyai.app.');
  const base = apiKey.startsWith('creem_test_') ? 'https://test-api.creem.io' : 'https://api.creem.io';
  let res;
  try {
    res = await fetch(`${base}/v1/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
      method: 'POST', headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'immediate' }),
    });
  } catch (err) {
    console.error('account: Creem cancel request failed:', err.message);
    throw new AccountError(502, 'billing_unavailable', 'We could not cancel your subscription right now. Nothing was deleted. Please try again later or write to support@fluencyai.app.');
  }
  if (res.ok) return true;
  if (res.status === 404) return false;
  console.error('account: Creem refused the cancellation:', res.status);
  throw new AccountError(502, 'billing_unavailable', 'We could not cancel your subscription right now. Nothing was deleted. Please try again later or write to support@fluencyai.app.');
}

/** Deletes an account completely (see the header). `force` skips only the unpaid-partner-earnings check (admin use). */
async function deleteAccount(supabase, userId, { actor = 'self', force = false } = {}) {
  const { data: profile, error: pErr } = await supabase.from('profiles').select('subscription_status, creem_subscription_id').eq('id', userId).maybeSingle();
  if (pErr) throw new AccountError(500, 'lookup_failed', 'Could not read the account.');

  if (!force) {
    const owed = await pendingPartnerCents(supabase, userId);
    if (owed > 0) {
      throw new AccountError(409, 'partner_balance', 'You have partner earnings that have not been paid out yet. Write to support@fluencyai.app to settle them first, then delete your account.');
    }
  }

  let subscriptionCanceled = false;
  if (profile && profile.creem_subscription_id && BILLING_STATUSES.includes(profile.subscription_status)) {
    subscriptionCanceled = await cancelSubscription(profile.creem_subscription_id);
  }

  const purge = await supabase.rpc('fl_delete_user_data', { p_user: userId });
  if (purge.error) {
    console.error('account: fl_delete_user_data failed:', purge.error.message);
    throw new AccountError(500, 'delete_failed', 'Something went wrong deleting your data. Nothing more was changed; please try again.');
  }
  const del = await supabase.auth.admin.deleteUser(userId);
  if (del.error) {
    console.error('account: deleting the login failed:', del.error.message);
    throw new AccountError(500, 'delete_failed', 'Your data was removed but the login could not be deleted. Please try again.');
  }
  const audit = await supabase.from('account_requests').insert({ kind: 'delete', user_id: null, actor });
  if (audit.error) console.error('account: could not record the deletion:', audit.error.message);
  return { ok: true, subscriptionCanceled, details: purge.data || null };
}

function bodyOf(req) {
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
  return req.body || {};
}

async function handleAccount(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const ip = await hit(`account:ip:${getClientIp(req)}`, { windowSeconds: 60, max: 30 });
  if (!ip.allowed) { res.setHeader('Retry-After', String(ip.retryAfter)); return res.status(429).json({ error: 'Too many requests. Please wait a moment.' }); }

  const auth = await getUserFromRequest(req);
  if (!auth.ok) return res.status(auth.status || 401).json({ error: auth.error || 'Please sign in.', code: 'auth_required' });
  const userId = auth.user.id;
  const body = bodyOf(req);
  const supabase = getServiceClient();

  try {
    if (body.action === 'export') {
      const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { data: recent, error } = await supabase.from('account_requests').select('id').eq('kind', 'export').eq('user_id', userId).gte('created_at', since).limit(1);
      if (error) throw new AccountError(500, 'export_failed', 'Could not prepare your data.');
      if (recent && recent.length) return res.status(429).json({ error: 'You just downloaded your data. Please wait a few minutes before asking again.', code: 'rate_limited' });
      const { data, error: rpcErr } = await supabase.rpc('fl_export_user_data', { p_user: userId });
      if (rpcErr) { console.error('account: export failed:', rpcErr.message); throw new AccountError(500, 'export_failed', 'Could not prepare your data.'); }
      if (!data) return res.status(404).json({ error: 'Account not found.' });
      await supabase.from('account_requests').insert({ kind: 'export', user_id: userId, actor: 'self' });
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="fluency-ai-data.json"');
      return res.status(200).send(JSON.stringify(data, null, 2));
    }

    if (body.action === 'delete') {
      if (body.confirm !== 'DELETE') return res.status(400).json({ error: 'Type DELETE to confirm.', code: 'confirm_required' });
      const limit = await hit(`account_delete:user:${userId}`, { windowSeconds: 3600, max: 5 });
      if (!limit.allowed) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      const result = await deleteAccount(supabase, userId, { actor: 'self' });
      return res.status(200).json({ ok: true, subscriptionCanceled: result.subscriptionCanceled });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  } catch (err) {
    if (err instanceof AccountError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('account: unexpected error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

// ----- admin ---------------------------------------------------------------------------------------------------

/** GET /api/admin/user-export?userId=<uuid>: the same export, for a data request that arrives by email. */
async function handleAdminUserExport(auth, req, res) {
  const userId = String((req.query || {}).userId || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) return res.status(400).json({ error: 'userId must be an account id (uuid)' });
  const { data, error } = await auth.supabase.rpc('fl_export_user_data', { p_user: userId });
  if (error) { console.error('admin/user-export failed:', error.message); return res.status(500).json({ error: error.message }); }
  if (!data) return res.status(404).json({ error: 'Account not found' });
  await auth.supabase.from('account_requests').insert({ kind: 'export', user_id: userId, actor: 'admin' });
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="fluency-ai-data.json"');
  return res.status(200).send(JSON.stringify(data, null, 2));
}

/** POST /api/admin/delete-user { userId, force? }: the same deletion a person gets from their own account. */
async function handleAdminDeleteUser(auth, req, res) {
  const { userId, force } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Body must include userId' });
  if (userId === auth.user.id) return res.status(400).json({ error: "Can't delete your own account from here." });
  try {
    const result = await deleteAccount(auth.supabase, userId, { actor: 'admin', force: force === true });
    return res.status(200).json({ ok: true, userId, subscriptionCanceled: result.subscriptionCanceled });
  } catch (err) {
    if (err instanceof AccountError) return res.status(err.status).json({ error: err.message, code: err.code });
    console.error('admin/delete-user failed:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { handleAccount, deleteAccount, AccountError, handleAdminUserExport, handleAdminDeleteUser };
