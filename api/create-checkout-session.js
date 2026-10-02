// api/create-checkout-session.js
//
// Creates a Creem Checkout Session and returns its URL - the Flutter app
// opens that URL in the browser (see
// lib/features/paywall/data/checkout_repository.dart) and the person
// enters their card on Creem's own hosted page (never inside this app).
// Creem is a Merchant of Record: it is the legal seller on the receipt,
// and it handles sales tax/VAT and the actual payment processing - this
// file only ever creates a checkout session and hands back its URL.
//
// Three purchase options are supported, driven by the `plan` field in the
// request body - each maps to a Product you create ahead of time in the
// Creem dashboard (Products -> New Product):
//
//   plan: 'founding'  - a ONE-TIME product, for lifetime access.
//   plan: 'weekly' |
//   plan: 'yearly'    - a recurring SUBSCRIPTION product. Set the 3-day
//                       free trial on the product itself in the Creem
//                       dashboard when you create it - unlike Stripe,
//                       Creem does not take a trial length on the
//                       checkout request, only as a product setting.
//
// All three are shown together, both in the app's paywall
// (lib/features/paywall/presentation/paywall_content.dart) and on the
// site's pricing section (site/index.html, wired up in site/auth.js).
//
// REQUIRED ENV VARS (set these wherever you deploy this proxy):
//   CREEM_API_KEY          starts with "creem_test_..." while you're in
//                          Test Mode, or "creem_..." once you're live -
//                          which API host to call (test-api.creem.io vs
//                          api.creem.io) is detected automatically from
//                          this prefix, so you never need to change code
//                          to go live, just swap the key.
//   CREEM_PRODUCT_FOUNDING prod_... - the one-time "founding user" Product
//   CREEM_PRODUCT_WEEKLY   prod_... - the recurring weekly Product
//   CREEM_PRODUCT_YEARLY   prod_... - the recurring yearly Product
//   APP_SUCCESS_URL        default success redirect, used when the caller
//                          (the app or the site) doesn't send its own
//
// Note: Creem's checkout API doesn't take a separate "cancel URL" the way
// Stripe did - someone who backs out just uses the checkout page's own
// back link. site/auth.js still builds its own cancelUrl for its local
// "Checkout cancelled" message, but this file never sends that to Creem.
//
// This does NOT by itself mark anyone as Pro - that happens when Creem
// calls api/creem-webhook.js after the checkout completes. Until that
// webhook is wired up and scripts/supabase_migration_subscription.sql has
// been run, checkout will work but the app will never see the upgrade.

const ALLOWED_REDIRECT_HOSTS = new Set(['fluencyai.app', 'www.fluencyai.app', 'localhost', '127.0.0.1']);

// Only trust a caller-supplied redirect URL if it actually points back at
// this site/app - otherwise fall back to the env var default. Without
// this, `successUrl` in the request body would let anyone redirect a real
// Creem Checkout session to a domain of their choosing.
function safeRedirect(candidate, fallback) {
  if (!candidate) return fallback;
  try {
    const u = new URL(candidate);
    if ((u.protocol === 'https:' || u.protocol === 'http:') && ALLOWED_REDIRECT_HOSTS.has(u.hostname)) {
      return candidate;
    }
  } catch (_) {
    // not a valid absolute URL - ignore it
  }
  return fallback;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.CREEM_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'Payments are not configured yet - missing CREEM_API_KEY.' });
  }
  // A creem_test_... key only works against the test API host; a live
  // creem_... key only works against the production one - detect which
  // from the key itself so there's no separate "mode" env var to keep in
  // sync with it.
  const baseUrl = apiKey.startsWith('creem_test_') ? 'https://test-api.creem.io' : 'https://api.creem.io';

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const { plan, userId, email, successUrl } = body;
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  const resolvedSuccessUrl = safeRedirect(successUrl, process.env.APP_SUCCESS_URL || 'https://example.com/checkout-success');

  const productEnvVar = plan === 'founding' ? 'CREEM_PRODUCT_FOUNDING' : plan === 'yearly' ? 'CREEM_PRODUCT_YEARLY' : 'CREEM_PRODUCT_WEEKLY';
  const productId = process.env[productEnvVar];
  if (!productId) {
    return res.status(503).json({ error: `Payments are not configured yet - missing ${productEnvVar}.` });
  }

  try {
    const creemRes = await fetch(`${baseUrl}/v1/checkouts`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        // Lets the webhook find the right Supabase user without a DB
        // lookup - Creem echoes this metadata back on the webhook events
        // tied to this checkout (see api/creem-webhook.js).
        metadata: { supabase_user_id: userId },
        request_id: `${plan || 'founding'}_${userId}_${Date.now()}`,
        customer: email ? { email } : undefined,
        success_url: resolvedSuccessUrl,
      }),
    });
    const checkout = await creemRes.json();
    if (!creemRes.ok) {
      console.error('create-checkout-session: Creem error:', checkout);
      return res.status(502).json({ error: checkout.message || 'Could not start checkout.' });
    }
    return res.status(200).json({ url: checkout.checkout_url });
  } catch (err) {
    console.error('create-checkout-session error:', err);
    return res.status(500).json({ error: 'Could not start checkout.' });
  }
};
