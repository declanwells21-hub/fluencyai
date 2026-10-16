// api/creem-webhook.js
//
// Creem calls this endpoint for every payment event. This file only (1) checks the signature and (2) hands the event
// to api/_lib/billing.js, which decides what it means (credits, subscription status, partner commission, refunds) and
// records the outcome in the billing_events table. Read docs/billing.md for the rules and the Creem dashboard setup.
//
// REQUIRED ENV VARS
//   CREEM_WEBHOOK_SECRET       shown when you create the webhook in the Creem Dashboard (Developers -> Webhooks). Not the API key.
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   server-side only, never in the app or in source control.
//
// SETUP: in the Creem Dashboard add a webhook pointing at https://fluencyai.app/api/creem-webhook. Creem sends every
// event type to that one URL; events this code does not use are stored as "ignored".
//
// Signature: Creem signs the exact bytes it sends (HMAC-SHA256, hex, header `creem-signature`), so the RAW body is
// needed. `config.api.bodyParser = false` stops Vercel from parsing it first.
//
// Replies: 200 for anything handled, ignored, flagged for review or already seen. 500 only when something failed that a
// retry can fix (Creem then retries after 30 s, 1 min, 5 min and 1 h); every grant is idempotent, so retries are safe.
const crypto = require('crypto');
const { processEvent } = require('./_lib/billing');

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifySignature(rawBody, signature, secret) {
  if (!signature) return false;
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(String(signature));
  // timingSafeEqual throws on different lengths, which a forged or truncated signature would trigger.
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

module.exports = Object.assign(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const webhookSecret = process.env.CREEM_WEBHOOK_SECRET;
  if (!webhookSecret || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('creem-webhook: missing required env vars - see file header.');
    return res.status(503).end();
  }

  const raw = await readRawBody(req);
  if (!verifySignature(raw, req.headers['creem-signature'], webhookSecret)) {
    console.error('creem-webhook: signature verification failed.');
    return res.status(400).send('Webhook Error: invalid signature');
  }

  let event;
  try { event = JSON.parse(raw); } catch (err) {
    console.error('creem-webhook: could not parse body:', err.message);
    return res.status(400).send('Webhook Error: invalid JSON');
  }
  if (!event || typeof event !== 'object' || !event.eventType) return res.status(400).send('Webhook Error: not a Creem event');

  try {
    const result = await processEvent(event);
    console.log('creem-webhook:', event.eventType, event.id, '->', result.outcome + (result.duplicate ? ' (duplicate)' : ''));
    return result.outcome === 'error' ? res.status(500).json({ received: false }) : res.status(200).json({ received: true, outcome: result.outcome });
  } catch (err) {
    console.error('creem-webhook: could not process the event:', err);
    return res.status(500).end(); // not stored: let Creem retry
  }
}, { config: { api: { bodyParser: false } } });
