// api/_lib/adminPartners.js
//
// Admin tools for the Partner Program, mounted in api/admin/router.js (one serverless function for all admin routes):
//   GET  /api/admin/partner-balances                  what each partner has held / payable / paid
//   POST /api/admin/partner-payout   { creatorId, reference?, note? }   mark everything payable as paid (min $20)
//   POST /api/admin/creator-resend-welcome { creatorId }              send the "you're accepted" email again

const { sendDecisionEmail } = require('./partnerEmails');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PAYOUT_CENTS = 2000;

async function handlePartnerBalances(auth, req, res) {
  const { data, error } = await auth.supabase.rpc('fl_admin_partner_balances');
  if (error) {
    console.error('admin/partner-balances failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
  return res.status(200).json({ partners: data || [], minPayoutCents: MIN_PAYOUT_CENTS });
}

async function handlePartnerPayout(auth, req, res) {
  const body = req.body || {};
  const creatorId = String(body.creatorId || '');
  if (!UUID_RE.test(creatorId)) return res.status(400).json({ error: 'creatorId must be a partner id (uuid)' });

  const { data, error } = await auth.supabase.rpc('fl_partner_mark_paid', {
    p_creator: creatorId,
    p_reference: String(body.reference || '').trim().slice(0, 120) || null,
    p_note: String(body.note || '').trim().slice(0, 200) || null,
    p_by: auth.user.email || auth.user.id,
    p_min_cents: MIN_PAYOUT_CENTS,
  });
  if (error) {
    const known = /nothing payable|below the minimum/i.test(error.message);
    if (!known) console.error('admin/partner-payout failed:', error.message);
    return res.status(known ? 400 : 500).json({ error: known ? error.message : 'Could not record the payout' });
  }
  return res.status(200).json({ ok: true, ...data });
}

async function handleCreatorResendWelcome(auth, req, res) {
  const creatorId = String((req.body || {}).creatorId || '');
  if (!UUID_RE.test(creatorId)) return res.status(400).json({ error: 'creatorId must be a partner id (uuid)' });

  const { data: creator, error } = await auth.supabase
    .from('creators')
    .select('id, name, code, contact_email, commission_rate, status')
    .eq('id', creatorId)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!creator) return res.status(404).json({ error: 'Partner not found' });
  if (!creator.contact_email) return res.status(400).json({ error: 'This partner has no email address on file' });

  const sent = await sendDecisionEmail('approve', {
    name: creator.name, email: creator.contact_email, code: creator.code, rate: creator.commission_rate,
  });
  if (!sent) return res.status(502).json({ error: 'The email could not be sent. Check the email settings (BREVO_API_KEY, EMAIL_FROM_ADDRESS).' });
  await auth.supabase.from('creators').update({ welcome_email_sent_at: new Date().toISOString() }).eq('id', creatorId);
  return res.status(200).json({ ok: true });
}

module.exports = { handlePartnerBalances, handlePartnerPayout, handleCreatorResendWelcome };
