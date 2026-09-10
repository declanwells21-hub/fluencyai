// api/stripe-webhook.js
//
// Stripe calls this endpoint on checkout/subscription lifecycle events so
// the app's idea of "is this person Pro" stays correct even if they never
// reopen the app right after paying (main.dart also refetches on app
// resume as a belt-and-suspenders backup, but this webhook is the real
// source of truth). Writes to the `subscription_status` column on the
// matching Supabase `profiles` row - run
// scripts/supabase_migration_subscription.sql once before wiring this up.
//
// REQUIRED ENV VARS:
//   STRIPE_SECRET_KEY          same key as create-checkout-session.js
//   STRIPE_WEBHOOK_SECRET      whsec_... - shown when you create the
//                              webhook endpoint in the Stripe Dashboard
//   SUPABASE_URL               your Supabase project URL
//   SUPABASE_SERVICE_ROLE_KEY  service-role key - bypasses Row Level
//                              Security, so it must NEVER be shipped to the
//                              Flutter app or committed to source control;
//                              it only ever belongs here, server-side
//
// SETUP:
//   1. Deploy this file so it's reachable at, e.g.,
//      https://<your-deploy>/api/stripe-webhook
//   2. In the Stripe Dashboard -> Developers -> Webhooks, add an endpoint
//      at that URL listening for: checkout.session.completed,
//      customer.subscription.created, customer.subscription.updated,
//      customer.subscription.deleted
//   3. Copy the "Signing secret" it gives you into STRIPE_WEBHOOK_SECRET.
//
// Stripe signature verification needs the RAW request body, not
// JSON-parsed - `config.api.bodyParser = false` below disables Vercel's
// default body parsing so readRawBody() can read the untouched bytes. If
// you deploy this somewhere other than Vercel, make sure whatever routes
// requests to this handler also gives you the raw body (adjust
// readRawBody/the config export to match your platform).
const Stripe = require('stripe');
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey || !webhookSecret || !supabaseUrl || !supabaseServiceKey) {
    console.error('stripe-webhook: missing required env vars - see file header.');
    return res.status(503).end();
  }

  const stripe = Stripe(secretKey);
  const raw = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, req.headers['stripe-signature'], webhookSecret);
  } catch (err) {
    console.error('stripe-webhook: signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  async function setStatus(userId, status, periodEnd) {
    if (!userId) {
      console.error('stripe-webhook: event had no supabase_user_id to update - skipping');
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({ subscription_status: status, subscription_period_end: periodEnd || null })
      .eq('id', userId);
    if (error) console.error('stripe-webhook: failed to update profile:', error.message);
  }

  // Fluency Creator Program: if this user originally signed up through a
  // creator's ?ref=CODE link (profiles.referred_by_code, set by
  // api/track-activity.js), log this checkout as a commission-earning
  // conversion so it shows up on the admin dashboard's Creators tab.
  // Silently does nothing for the vast majority of checkouts, which have
  // no referrer at all - that's expected, not an error.
  async function recordReferralConversion(supabase, userId, session, stripeEventId) {
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

    const grossCents = typeof session.amount_total === 'number' ? session.amount_total : 0;
    const commissionCents = Math.round(grossCents * Number(creator.commission_rate || 0));

    const { error } = await supabase.from('referral_events').insert({
      creator_id: creator.id,
      code,
      event_type: 'conversion',
      user_id: userId,
      amount_cents: commissionCents,
      stripe_event_id: stripeEventId,
      meta: { gross_amount_cents: grossCents, currency: session.currency || 'usd' },
    });
    // A duplicate stripe_event_id (Stripe redelivering the same webhook)
    // hits the unique index from the migration and lands here as an
    // error - that's the dedupe working as intended, not a real failure.
    if (error && !String(error.message || '').includes('duplicate key')) {
      console.error('stripe-webhook: referral conversion insert failed:', error.message);
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id;
        // The Subscription's own status (trialing/active) arrives more
        // precisely via customer.subscription.* below - set 'trialing'
        // here as a safe immediate default so the paywall clears right
        // after checkout even if that event lags slightly behind this one.
        await setStatus(userId, 'trialing');
        await recordReferralConversion(supabase, userId, session, event.id);
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata && sub.metadata.supabase_user_id;
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        // One of: trialing, active, past_due, canceled, unpaid, incomplete,
        // incomplete_expired, paused - the app treats anything except
        // trialing/active as free-tier (see subscription_provider.dart).
        await setStatus(userId, sub.status, periodEnd);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata && sub.metadata.supabase_user_id;
        await setStatus(userId, 'free', null);
        break;
      }
      default:
        break; // not something we track - ignore
    }
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('stripe-webhook: handler error:', err);
    return res.status(500).end();
  }
};
