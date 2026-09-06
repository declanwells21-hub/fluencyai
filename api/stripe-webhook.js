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
