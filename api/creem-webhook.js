// api/creem-webhook.js
//
// Creem calls this endpoint on checkout/subscription lifecycle events so
// the app's idea of "is this person Pro" stays correct even if they never
// reopen the app right after paying (main.dart also refetches on app
// resume as a belt-and-suspenders backup, but this webhook is the real
// source of truth). Writes to the `subscription_status` column on the
// matching Supabase `profiles` row - run
// scripts/supabase_migration_subscription.sql once before wiring this up,
// and scripts/supabase_migration_creem_rename.sql to rename the old
// Stripe-era columns.
//
// REQUIRED ENV VARS:
//   CREEM_WEBHOOK_SECRET       shown when you create the webhook endpoint
//                              in the Creem Dashboard (Developers ->
//                              Webhooks) - looks nothing like the
//                              CREEM_API_KEY, don't mix them up.
//   SUPABASE_URL               your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  service-role key - bypasses Row Level
//                              Security, so it must NEVER be shipped to the
//                              Flutter app or committed to source control;
//                              it only ever belongs here, server-side
//
// SETUP:
//   1. Deploy this file so it's reachable at, e.g.,
//      https://fluencyai.app/api/creem-webhook
//   2. In the Creem Dashboard -> Developers -> Webhooks, click "Add
//      Webhook" and enter that URL. Creem doesn't offer a per-event
//      subscribe list the way Stripe did - it sends every event type to
//      the one URL, and this handler just ignores anything it doesn't
//      recognize (refunds, disputes, etc).
//   3. Copy the signing secret it shows you into CREEM_WEBHOOK_SECRET.
//
// Signature verification needs the RAW request body - Creem signs the
// exact bytes it sent, so re-serializing JSON (even to equivalent JSON)
// would make the signature mismatch. `config.api.bodyParser = false`
// below disables Vercel's default body parsing so readRawBody() can read
// the untouched bytes.
//
// A note for whoever wires this up: the exact field names inside
// event.object below (e.g. current_period_end_date) are based on Creem's
// published docs at the time this was written, not a live payload. The
// console.log a few lines down prints the full event - when you send a
// real Test Mode webhook, check your Vercel function logs against it and
// adjust any field name that doesn't match before relying on this in
// production.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

// Creem signs the raw payload with HMAC-SHA256 using the webhook secret as
// the key, then sends the hex digest in the `creem-signature` header -
// recompute it here and compare before trusting anything in the body.
function verifySignature(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  // timingSafeEqual throws on mismatched lengths instead of just
  // returning false, which a forged/truncated signature would trigger.
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('creem-webhook: missing required env vars - see file header.');
    return res.status(503).end();
  }

  const raw = await readRawBody(req);
  const signature = req.headers['creem-signature'];
  if (!verifySignature(raw, signature, webhookSecret)) {
    console.error('creem-webhook: signature verification failed.');
    return res.status(400).send('Webhook Error: invalid signature');
  }

  let event;
  try {
    event = JSON.parse(raw);
  } catch (err) {
    console.error('creem-webhook: could not parse body:', err.message);
    return res.status(400).send('Webhook Error: invalid JSON');
  }

  // Remove this once you've checked a real payload's field names against
  // the code below (see the file header note) - it's here to make that
  // check easy, not meant to stay on indefinitely logging customer data.
  console.log('creem-webhook: received', event.eventType, JSON.stringify(event));

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  async function setStatus(userId, status, periodEnd, creemCustomerId) {
    if (!userId) {
      console.error('creem-webhook: event had no supabase_user_id in metadata - skipping');
      return;
    }
    const update = { subscription_status: status, subscription_period_end: periodEnd || null };
    if (creemCustomerId) update.creem_customer_id = creemCustomerId;
    const { error } = await supabase.from('profiles').update(update).eq('id', userId);
    if (error) console.error('creem-webhook: failed to update profile:', error.message);
  }

  // Fluency Creator Program: if this user originally signed up through a
  // creator's ?ref=CODE link (profiles.referred_by_code, set by
  // api/track-activity.js), log this checkout as a commission-earning
  // conversion so it shows up on the admin dashboard's Creators tab.
  // Silently does nothing for the vast majority of checkouts, which have
  // no referrer at all - that's expected, not an error.
  async function recordReferralConversion(userId, amountCents, currency, creemEventId) {
    if (!userId) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('referred_by_code')
      .eq('id', userId)
      .maybeSingle();
    const code = profile && profile.referred_by_code;
    if (!code) return;

    const { data: creator } = await supabase
      .from('creators')
      .select('id, commission_rate, status')
      .eq('code', code)
      .maybeSingle();
    if (!creator || creator.status !== 'active') return;

    const commissionCents = Math.round((amountCents || 0) * Number(creator.commission_rate || 0));

    const { error } = await supabase.from('referral_events').insert({
      creator_id: creator.id,
      code,
      event_type: 'conversion',
      user_id: userId,
      amount_cents: commissionCents,
      creem_event_id: creemEventId,
      meta: { gross_amount_cents: amountCents || 0, currency: currency || 'usd' },
    });
    // A duplicate creem_event_id (Creem redelivering the same webhook)
    // hits the unique index from the migration and lands here as an
    // error - that's the dedupe working as intended, not a real failure.
    if (error && !String(error.message || '').includes('duplicate key')) {
      console.error('creem-webhook: referral conversion insert failed:', error.message);
    }
  }

  try {
    const obj = event.object || {};
    const userId = obj.metadata && obj.metadata.supabase_user_id;

    switch (event.eventType) {
      case 'checkout.completed': {
        // One-time "founding user" purchase: there's no subscription
        // object for this at all, so this webhook call is the ONLY signal
        // we'll ever get for it - grant Pro directly and permanently
        // (null period end = never expires). For the weekly/yearly flow,
        // the subscription.* events below carry the real status - this
        // just sets a safe immediate default so the paywall clears right
        // after checkout even if those lag slightly behind this one.
        const isSubscription = !!obj.subscription;
        await setStatus(userId, isSubscription ? 'trialing' : 'active', null, obj.customer && obj.customer.id);
        await recordReferralConversion(userId, obj.order && obj.order.amount, obj.order && obj.order.currency, event.id);
        break;
      }
      case 'subscription.active':
      case 'subscription.trialing':
      case 'subscription.paid':
      case 'subscription.update': {
        const sub = obj;
        const periodEnd = sub.current_period_end_date ? new Date(sub.current_period_end_date).toISOString() : null;
        // One of: trialing, active, past_due, paused - the app treats
        // anything except trialing/active as free-tier (see
        // subscription_provider.dart), same as it did for Stripe.
        await setStatus(userId, sub.status, periodEnd, sub.customer && sub.customer.id);
        break;
      }
      case 'subscription.canceled':
      case 'subscription.expired':
      case 'subscription.unpaid': {
        await setStatus(userId, 'free', null);
        break;
      }
      case 'subscription.paused': {
        await setStatus(userId, 'paused', null);
        break;
      }
      default:
        break; // not something we track (refund.created, dispute.created, etc.) - ignore
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('creem-webhook: handler error:', err);
    return res.status(500).end();
  }
};
