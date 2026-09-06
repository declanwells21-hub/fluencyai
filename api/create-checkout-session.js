// api/create-checkout-session.js
//
// Creates a Stripe Checkout Session for the "Fluency Builder (Pro)" plan
// and returns its URL - the Flutter app opens that URL in the browser (see
// lib/features/paywall/data/checkout_repository.dart), the person enters
// their card on Stripe's own hosted page (never inside this app), and
// Stripe starts their 3-day free trial before the first charge.
//
// REQUIRED ENV VARS (set these wherever you deploy this proxy):
//   STRIPE_SECRET_KEY     sk_test_... (or sk_live_... once you're ready)
//   STRIPE_PRICE_WEEKLY   price_... - a recurring $5.99/week Price
//   STRIPE_PRICE_YEARLY   price_... - a recurring $39.99/year Price
//   APP_SUCCESS_URL       where Stripe sends the person after paying
//   APP_CANCEL_URL        where Stripe sends them if they back out
//
// Both Prices should NOT have "require a free trial" baked in themselves -
// this endpoint requests the 3-day trial per-session via
// subscription_data.trial_period_days, and Checkout's `subscription` mode
// collects a card up front by default, matching the "Requires Card" promise
// in the paywall UI.
//
// This does NOT by itself mark anyone as Pro - that happens when Stripe
// calls api/stripe-webhook.js after the session completes. Until that
// webhook is wired up and scripts/supabase_migration_subscription.sql has
// been run, checkout will work but the app will never see the upgrade.
const Stripe = require('stripe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(503).json({ error: 'Payments are not configured yet - missing STRIPE_SECRET_KEY.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { plan, userId, email } = body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const isYearly = plan === 'yearly';
  const priceId = isYearly ? process.env.STRIPE_PRICE_YEARLY : process.env.STRIPE_PRICE_WEEKLY;
  if (!priceId) {
    const varName = isYearly ? 'STRIPE_PRICE_YEARLY' : 'STRIPE_PRICE_WEEKLY';
    return res.status(503).json({ error: `Payments are not configured yet - missing ${varName}.` });
  }

  try {
    const stripe = Stripe(secretKey);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 3,
        // Lets the webhook find the right Supabase user without a DB
        // lookup - carried onto the Subscription object itself.
        metadata: { supabase_user_id: userId },
      },
      client_reference_id: userId,
      customer_email: email || undefined,
      allow_promotion_codes: true,
      success_url: process.env.APP_SUCCESS_URL || 'https://example.com/checkout-success',
      cancel_url: process.env.APP_CANCEL_URL || 'https://example.com/checkout-cancelled',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
};
