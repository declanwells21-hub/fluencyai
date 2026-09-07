// POST /api/admin/grant-access
//   body: { userId, status: "active" | "free" | "canceled", periodEndDays?: number }
//
// Manually overrides a user's subscription status - independent of Stripe.
// For refunds, complimentary access, support cases, etc. This writes
// directly to profiles.subscription_status / subscription_period_end, the
// same columns api/stripe-webhook.js keeps in sync automatically - a real
// Stripe event for this user later will simply overwrite whatever you set
// here, same as it would overwrite anything else.

const { requireAdmin } = require('../_lib/adminAuth');

const ALLOWED_STATUSES = ['active', 'free', 'canceled'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

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
    .upsert(
      { id: userId, subscription_status: status, subscription_period_end: periodEnd },
      { onConflict: 'id' }
    );

  if (error) {
    console.error('admin/grant-access: upsert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, userId, status, periodEnd });
};
