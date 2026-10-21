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
// What can be bought, chosen by the `plan` field in the request body. Each maps to a Product created ahead of time
// in the Creem dashboard (Products -> New Product); docs/billing.md has the exact setup.
//
//   plan: 'plus'                          Fluency Plus, $12 a month (recurring) with 3,000 monthly credits.
//   plan: 'topup5' | 'topup10' | 'topup20'  one-time credit packs: 500 / 1,100 / 2,400 credits, never expire.
//   plan: 'founding' | 'weekly' | 'yearly'  LEGACY products from before credits. Still accepted so nothing existing
//                                           breaks; they are removed together with the Flutter paywall rework.
//
// Plus and top-ups need a signed-in person: send the account's "Authorization: Bearer <token>" header. The person is
// taken from that token, never from the request body. (Legacy plans still accept a userId in the body.)
//   - Plus is refused while the person already has an active subscription.
//   - A top-up needs an active Plus, unless ALLOW_TOPUP_WITHOUT_PLUS=true.
//
// REQUIRED ENV VARS (set these wherever you deploy this proxy):
//   CREEM_API_KEY          starts with "creem_test_..." while you're in
//                          Test Mode, or "creem_..." once you're live -
//                          which API host to call (test-api.creem.io vs
//                          api.creem.io) is detected automatically from
//                          this prefix, so you never need to change code
//                          to go live, just swap the key.
//   CREEM_PRODUCT_PLUS     prod_... - the recurring monthly Plus product ($12)
//   CREEM_PRODUCT_TOPUP_5 / _10 / _20   prod_... - the three one-time top-up products ($5 / $10 / $20)
//   CREEM_PRODUCT_FOUNDING / _WEEKLY / _YEARLY   prod_... - legacy products, only if still sold
//   PLUS_MONTHLY_CREDITS   optional, default 3000 (read by api/_lib/billing.js)
//   ALLOW_TOPUP_WITHOUT_PLUS  optional, "true" lets someone buy a top-up without a subscription
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

const { getUserFromRequest } = require('./_lib/userAuth');
const { getServiceClient } = require('./_lib/supabase');
const { CHECKOUT_PLANS } = require('./_lib/billing');

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
  // Account actions (download my data, delete my account) arrive here too (rewrite /api/account in vercel.json):
  // the project is at the 12-function limit, so this function carries both jobs.
  if (req.query && req.query.hook === 'account') return require('./_lib/account').handleAccount(req, res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
  const { plan, successUrl } = body;
  const planKey = plan === undefined || plan === null || plan === '' ? 'weekly' : String(plan); // no plan = the old default
  const planInfo = CHECKOUT_PLANS[planKey];
  if (!planInfo) return res.status(400).json({ error: 'Unknown plan' });

  // Who is buying. Plus and top-ups: only a verified sign-in counts. Legacy plans keep accepting a body userId.
  let userId = body.userId;
  let email = body.email;
  const auth = await getUserFromRequest(req);
  if (auth.ok) {
    userId = auth.user.id;
    email = auth.user.email || email;
  } else if (planInfo.kind !== 'legacy') {
    return res.status(auth.status || 401).json({ error: 'Please sign in to continue.', code: 'auth_required' });
  }
  if (!userId) return res.status(400).json({ error: 'Missing userId' });

  if (planInfo.kind === 'plus' || planInfo.kind === 'topup') {
    const { data: profile, error: profileErr } = await getServiceClient().from('profiles').select('subscription_status').eq('id', userId).maybeSingle();
    if (profileErr) {
      console.error('create-checkout-session: could not read the profile:', profileErr.message);
      return res.status(500).json({ error: 'Could not start checkout.' });
    }
    const subscribed = !!profile && ['active', 'trialing'].includes(profile.subscription_status);
    if (planInfo.kind === 'plus' && subscribed) {
      return res.status(409).json({ error: 'You already have an active Fluency Plus subscription.', code: 'already_subscribed' });
    }
    if (planInfo.kind === 'topup' && !subscribed && String(process.env.ALLOW_TOPUP_WITHOUT_PLUS || '').toLowerCase() !== 'true') {
      return res.status(403).json({ error: 'Top-ups are for Fluency Plus members. Start Plus first.', code: 'plus_required' });
    }
  }

  const resolvedSuccessUrl = safeRedirect(successUrl, process.env.APP_SUCCESS_URL || 'https://example.com/checkout-success');

  const productEnvVar = planInfo.env;
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
        metadata: { supabase_user_id: userId, plan: planKey },
        request_id: `${planKey}_${userId}_${Date.now()}`,
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
