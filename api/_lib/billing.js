// api/_lib/billing.js
//
// What a Creem payment event does to a person's account. Used by api/creem-webhook.js (events in) and
// api/create-checkout-session.js (which products can be sold).
//
// The money rules (docs/billing.md has them with the Creem dashboard setup):
//   Fluency Plus   $12 a month. Each paid month REPLACES the monthly credits with 3,000 (unused ones do not stack) and
//                  they expire at the end of the paid period. Granted on `subscription.paid`, as Creem recommends.
//   Top-ups        one-time products of $5 / $10 / $20 = 500 / 1,100 / 2,400 credits. They never expire and are used after
//                  the monthly credits. Granted on `checkout.completed` once per order.
//   Commission     20% of a referred person's FIRST subscription payment (never renewals, never top-ups), on the product
//                  price in dollars, held 14 days. Recorded against the Creem transaction id so a refund can reverse it.
// Credits are decided here from Creem's PRODUCT ID, never from anything a browser or the app sends.
//
// Every event is stored in billing_events with its outcome. Anything this code cannot safely decide is marked
// "needs_review" (with a note saying what to do) instead of being guessed.

const crypto = require('crypto');
const { getServiceClient } = require('./supabase');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RAW_CHARS = 30000;

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Keep in step with site/fluency-data.js (PLANS and TOPUPS); tests/billing.test.js fails if they drift apart.
function plusCredits() { return envInt('PLUS_MONTHLY_CREDITS', 3000); }
const TOPUP_PACKS = [
  { id: 'topup5', env: 'CREEM_PRODUCT_TOPUP_5', credits: 500, usd: 5 },
  { id: 'topup10', env: 'CREEM_PRODUCT_TOPUP_10', credits: 1100, usd: 10 },
  { id: 'topup20', env: 'CREEM_PRODUCT_TOPUP_20', credits: 2400, usd: 20 },
];

/** The checkout plans the site and app may request, and the env var holding each Creem product id. */
const CHECKOUT_PLANS = {
  plus: { env: 'CREEM_PRODUCT_PLUS', kind: 'plus' },
  topup5: { env: 'CREEM_PRODUCT_TOPUP_5', kind: 'topup' },
  topup10: { env: 'CREEM_PRODUCT_TOPUP_10', kind: 'topup' },
  topup20: { env: 'CREEM_PRODUCT_TOPUP_20', kind: 'topup' },
  // Legacy products from before credits. Still accepted so nothing existing breaks; remove with the Flutter step.
  founding: { env: 'CREEM_PRODUCT_FOUNDING', kind: 'legacy' },
  weekly: { env: 'CREEM_PRODUCT_WEEKLY', kind: 'legacy' },
  yearly: { env: 'CREEM_PRODUCT_YEARLY', kind: 'legacy' },
};

/** What a Creem product id is: { kind: 'plus' | 'topup' | 'founding' | 'legacy_sub' | 'unknown', pack? } */
function classifyProduct(productId) {
  if (!productId) return { kind: 'unknown' };
  if (process.env.CREEM_PRODUCT_PLUS && productId === process.env.CREEM_PRODUCT_PLUS) return { kind: 'plus' };
  for (const pack of TOPUP_PACKS) if (process.env[pack.env] && productId === process.env[pack.env]) return { kind: 'topup', pack };
  if (process.env.CREEM_PRODUCT_FOUNDING && productId === process.env.CREEM_PRODUCT_FOUNDING) return { kind: 'founding' };
  if ((process.env.CREEM_PRODUCT_WEEKLY && productId === process.env.CREEM_PRODUCT_WEEKLY) || (process.env.CREEM_PRODUCT_YEARLY && productId === process.env.CREEM_PRODUCT_YEARLY)) return { kind: 'legacy_sub' };
  return { kind: 'unknown' };
}

const idOf = (x) => (typeof x === 'string' ? x : x && x.id) || null;
const iso = (v) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null; };

async function setProfile(supabase, userId, fields) {
  const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));
  const { error } = await supabase.from('profiles').update(clean).eq('id', userId);
  if (error) throw new Error(`could not update the profile: ${error.message}`);
}

async function rpc(supabase, name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return Array.isArray(data) ? data[0] : data;
}

/** Finds our user: the id we put in the checkout metadata, else the subscription or customer id saved earlier. */
async function resolveUser(supabase, obj) {
  const meta = (obj.metadata && obj.metadata.supabase_user_id) || (obj.subscription && obj.subscription.metadata && obj.subscription.metadata.supabase_user_id);
  if (meta && UUID_RE.test(String(meta))) return String(meta);
  const subId = obj.object === 'subscription' ? obj.id : idOf(obj.subscription);
  if (subId) {
    const { data } = await supabase.from('profiles').select('id').eq('creem_subscription_id', subId).maybeSingle();
    if (data && data.id) return data.id;
  }
  const customerId = idOf(obj.customer);
  if (customerId) {
    const { data } = await supabase.from('profiles').select('id').eq('creem_customer_id', customerId).maybeSingle();
    if (data && data.id) return data.id;
  }
  return null;
}

// ----- partner commission --------------------------------------------------------------------------------------

/** Records the 20% commission for a referred person's first subscription payment. Never throws. Returns a note or ''. */
async function recordCommission(supabase, userId, sub, eventId) {
  try {
    const price = Number(sub.product && sub.product.price);
    if (!(price > 0)) return '';
    const { data: profile } = await supabase.from('profiles').select('referred_by_code').eq('id', userId).maybeSingle();
    const code = profile && profile.referred_by_code;
    if (!code) return '';
    const currency = String((sub.product && sub.product.currency) || '').toUpperCase();
    if (currency !== 'USD') return `Commission NOT recorded: the product is priced in ${currency || 'an unknown currency'}, not US dollars. Record it by hand.`;

    const result = await rpc(supabase, 'fl_record_partner_commission', {
      p_code: code, p_kind: 'app_subscription', p_user: userId, p_gross_cents: Math.round(price), p_currency: 'usd',
      p_source_ref: sub.last_transaction_id || eventId, p_product: (sub.product && sub.product.name) || 'Fluency AI app',
    });
    if (result && result.created) {
      // The admin dashboard's Creators tab still reads the older referral_events log, so keep feeding it.
      const { data: creator } = await supabase.from('creators').select('id').eq('code', code).maybeSingle();
      if (creator) {
        const { error } = await supabase.from('referral_events').insert({
          creator_id: creator.id, code, event_type: 'conversion', user_id: userId, amount_cents: result.commission_cents, creem_event_id: eventId,
          meta: { gross_amount_cents: Math.round(price), currency: 'usd' },
        });
        if (error && !String(error.message || '').includes('duplicate key')) console.error('billing: referral_events insert failed:', error.message);
      }
      return `Partner commission recorded for code ${code}.`;
    }
    return result && result.reason === 'self_referral' ? 'No commission: the buyer is the partner.' : '';
  } catch (err) {
    console.error('billing: partner commission failed:', err.message);
    return `Commission could not be recorded (${err.message}). Retry the event from the Creem dashboard.`;
  }
}

// ----- the events ----------------------------------------------------------------------------------------------

async function onCheckoutCompleted(supabase, event) {
  const obj = event.object || {};
  const userId = await resolveUser(supabase, obj);
  if (!userId) return { outcome: 'needs_review', note: 'This checkout has no Fluency AI user id (was it created outside the site or app?). Nothing was granted.' };
  const productId = (obj.product && obj.product.id) || (obj.order && obj.order.product) || null;
  const product = classifyProduct(productId);
  const customerId = idOf(obj.customer);

  if (obj.subscription) {
    const subStatus = obj.subscription.status === 'trialing' ? 'trialing' : 'active';
    await setProfile(supabase, userId, { subscription_status: subStatus, creem_customer_id: customerId || undefined, creem_subscription_id: obj.subscription.id, plan_product_id: productId || undefined });
    return { outcome: 'processed', userId, note: 'Subscription started. Credits are granted when the first payment event arrives.' };
  }

  if (product.kind === 'topup') {
    if (!obj.order || obj.order.status !== 'paid') return { outcome: 'needs_review', userId, note: 'A top-up checkout completed but the order is not marked paid. No credits were added.' };
    const orderId = obj.order.id || obj.id;
    const r = await rpc(supabase, 'fl_credit_grant', { p_user: userId, p_amount: product.pack.credits, p_kind: 'topup', p_note: `Top-up ${product.pack.id}, Creem order ${orderId}`, p_by: null, p_key: `creem:order:${orderId}` });
    if (customerId) await setProfile(supabase, userId, { creem_customer_id: customerId });
    return { outcome: 'processed', userId, note: r && r.duplicate ? 'Credits for this order were already added.' : `Added ${product.pack.credits} top-up credits.` };
  }

  if (product.kind === 'founding') {
    await setProfile(supabase, userId, { subscription_status: 'active', subscription_period_end: null, creem_customer_id: customerId || undefined });
    return { outcome: 'processed', userId, note: 'Legacy lifetime purchase: marked active. (No credits, no commission.)' };
  }
  return { outcome: 'needs_review', userId, note: `A one-time purchase of product ${productId || '(unknown)'} is not a known top-up. Nothing was granted.` };
}

async function onSubscriptionPaid(supabase, event) {
  const sub = event.object || {};
  const userId = await resolveUser(supabase, sub);
  if (!userId) return { outcome: 'error', note: 'Could not tell whose subscription this is yet. Creem will retry; if it keeps failing, find the person and re-send the event.' };
  const productId = (sub.product && sub.product.id) || null;
  const product = classifyProduct(productId);
  const periodEnd = iso(sub.current_period_end_date);
  const periodStart = sub.current_period_start_date || sub.last_transaction_id || event.id;

  await setProfile(supabase, userId, { subscription_status: 'active', subscription_period_end: periodEnd, creem_customer_id: idOf(sub.customer) || undefined, creem_subscription_id: sub.id, plan_product_id: productId || undefined });

  const notes = [];
  let outcome = 'processed';
  if (product.kind === 'plus') {
    if (!periodEnd) throw new Error('subscription.paid has no current_period_end_date, so the monthly credits cannot be given an end date');
    const amount = plusCredits();
    const r = await rpc(supabase, 'fl_credit_set_monthly', { p_user: userId, p_amount: amount, p_period_end: periodEnd, p_note: `Creem payment ${sub.last_transaction_id || event.id}`, p_key: `creem:sub:${sub.id}:${periodStart}` });
    notes.push(r && r.duplicate ? 'Monthly credits for this period were already given.' : `Monthly credits set to ${amount} until ${periodEnd}.`);
  } else if (product.kind === 'unknown') {
    outcome = 'needs_review';
    notes.push(`Product ${productId || '(none)'} is not one of our products (check the CREEM_PRODUCT_* variables). No credits were given.`);
  }
  const commission = await recordCommission(supabase, userId, sub, event.id);
  if (commission) { notes.push(commission); if (/NOT recorded|could not be recorded/.test(commission)) outcome = 'needs_review'; }
  return { outcome, userId, note: notes.join(' ') };
}

async function onSubscriptionStatus(supabase, event, status, extra = {}) {
  const sub = event.object || {};
  const userId = await resolveUser(supabase, sub);
  if (!userId) return { outcome: 'error', note: 'Could not tell whose subscription this is yet.' };
  const fields = { subscription_status: status, creem_customer_id: idOf(sub.customer) || undefined, creem_subscription_id: sub.id || undefined };
  const periodEnd = iso(sub.current_period_end_date);
  if (periodEnd && !extra.clearPeriod) fields.subscription_period_end = periodEnd;
  if (extra.clearPeriod) fields.subscription_period_end = null;
  await setProfile(supabase, userId, fields);
  const notes = [`Status is now "${status}".`];
  if (extra.endCredits) {
    const r = await rpc(supabase, 'fl_credit_set_monthly', { p_user: userId, p_amount: 0, p_period_end: null, p_note: `Subscription ${status}`, p_key: `creem:end:${event.id}` });
    notes.push(r && r.duplicate ? 'Monthly credits were already ended.' : 'Monthly credits ended (top-up credits are kept).');
  }
  if (extra.note) notes.push(extra.note);
  return { outcome: 'processed', userId, note: notes.join(' ') };
}

async function onRefundOrDispute(supabase, event, isDispute) {
  const obj = event.object || {};
  if (!isDispute && obj.status && obj.status !== 'succeeded') return { outcome: 'ignored', note: `Refund status "${obj.status}": nothing to do.` };
  const txId = obj.transaction && obj.transaction.id;
  const subId = obj.subscription && obj.subscription.id;
  const userId = await resolveUser(supabase, obj);
  const what = isDispute ? 'chargeback' : 'refund';

  if (!subId) {
    return { outcome: 'needs_review', userId, note: `A ${what} on a one-time purchase (transaction ${txId || 'unknown'}). If it was a credit top-up, take the credits back in the admin: Users, Credits, enter a negative number.` };
  }
  const paid = Number(obj.transaction && (obj.transaction.amount_paid ?? obj.transaction.amount));
  const full = isDispute || (Number(obj.refund_amount) > 0 && paid > 0 && Number(obj.refund_amount) >= paid);
  if (!full) return { outcome: 'needs_review', userId, note: `Partial refund of ${obj.refund_amount} (paid ${paid}). Nothing was changed automatically.` };

  const notes = [];
  let outcome = isDispute ? 'needs_review' : 'processed';
  if (txId) {
    const reversed = await rpc(supabase, 'fl_partner_reverse_commission', { p_kind: 'app_subscription', p_source_ref: txId });
    if (reversed === 'reversed') notes.push('Partner commission reversed.');
    else if (reversed === 'already_paid') { notes.push('The partner commission was ALREADY PAID OUT. Recover it or take it off their next payout.'); outcome = 'needs_review'; }
  }
  if (userId) {
    await setProfile(supabase, userId, { subscription_status: 'free', subscription_period_end: null });
    await rpc(supabase, 'fl_credit_set_monthly', { p_user: userId, p_amount: 0, p_period_end: null, p_note: `Full ${what}`, p_key: `creem:end:${event.id}` });
    notes.push('Subscription ended and monthly credits removed (top-up credits are kept).');
  } else {
    outcome = 'needs_review';
    notes.push('Could not tell whose subscription this was: end their access by hand.');
  }
  if (isDispute) notes.push('A chargeback needs a person to look at it (respond to the dispute in Creem).');
  return { outcome, userId, note: notes.join(' ') };
}

async function dispatch(supabase, event) {
  switch (event.eventType) {
    case 'checkout.completed': return onCheckoutCompleted(supabase, event);
    case 'subscription.paid': return onSubscriptionPaid(supabase, event);
    case 'subscription.active': return onSubscriptionStatus(supabase, event, 'active');
    case 'subscription.trialing': return onSubscriptionStatus(supabase, event, 'trialing');
    case 'subscription.update': {
      const s = (event.object && event.object.status) || 'active';
      return onSubscriptionStatus(supabase, event, ['trialing', 'active', 'past_due', 'paused', 'canceled', 'unpaid'].includes(s) ? s : 'active');
    }
    case 'subscription.past_due': return onSubscriptionStatus(supabase, event, 'past_due');
    case 'subscription.paused': return onSubscriptionStatus(supabase, event, 'paused');
    case 'subscription.canceled': return onSubscriptionStatus(supabase, event, 'canceled', { note: 'Monthly credits keep working until the paid period ends.' });
    case 'subscription.expired': return onSubscriptionStatus(supabase, event, 'free', { clearPeriod: true, endCredits: true });
    case 'subscription.unpaid': return onSubscriptionStatus(supabase, event, 'unpaid', { clearPeriod: true, endCredits: true });
    case 'refund.created': return onRefundOrDispute(supabase, event, false);
    case 'dispute.created': return onRefundOrDispute(supabase, event, true);
    default: return { outcome: 'ignored', note: `Event type "${event.eventType}" is not used.` };
  }
}

/**
 * Stores the event, handles it once, and records what happened. Safe to call twice for the same event.
 * Returns { outcome, note, duplicate? }. outcome 'error' means: reply 500 so Creem retries.
 */
async function processEvent(event, supabase = getServiceClient()) {
  const eventId = event.id || 'hash:' + crypto.createHash('sha256').update(JSON.stringify(event)).digest('hex').slice(0, 32);
  const text = JSON.stringify(event);
  const row = { event_id: eventId, event_type: String(event.eventType || 'unknown'), object_id: (event.object && event.object.id) || null,
                raw: text.length > MAX_RAW_CHARS ? { truncated: true, preview: text.slice(0, MAX_RAW_CHARS) } : event };

  const ins = await supabase.from('billing_events').insert(row).select('event_id').single();
  if (ins.error) {
    if (ins.error.code !== '23505') throw new Error(`could not store the event: ${ins.error.message}`);
    const { data: existing, error } = await supabase.from('billing_events').select('outcome, note').eq('event_id', eventId).single();
    if (error) throw new Error(`could not read the stored event: ${error.message}`);
    if (!['received', 'error'].includes(existing.outcome)) return { outcome: existing.outcome, note: existing.note, duplicate: true };
  }

  let result;
  try { result = await dispatch(supabase, { ...event, id: eventId }); }
  catch (err) { console.error('billing: event failed:', event.eventType, err); result = { outcome: 'error', note: err.message }; }

  const up = await supabase.from('billing_events').update({ outcome: result.outcome, note: result.note || null, user_id: result.userId || null, processed_at: new Date().toISOString() }).eq('event_id', eventId);
  if (up.error) console.error('billing: could not save the outcome:', up.error.message);
  return result;
}

module.exports = { processEvent, classifyProduct, CHECKOUT_PLANS, TOPUP_PACKS, plusCredits, UUID_RE };
