// api/_lib/selarOrders.js
//
// Receives the order notifications Selar sends for exam blueprint sales and turns them into partner commissions.
// It runs inside api/referral.js (the project is at Vercel's 12-function limit), reached through the rewrite
//   /api/selar-order  ->  /api/referral?hook=selar        (see vercel.json)
//
// Set in Selar (Settings > Integrations): the webhook URL
//   https://fluencyai.app/api/selar-order?key=<SELAR_WEBHOOK_SECRET>
//
// What is certain about Selar and what is not (checked against Selar's help centre):
//   - Selar can send each completed order to a URL: buyer name and email, product, amount paid, order id.
//   - Nothing public says Selar hands back a "?ref=CODE" from the buyer's link, a coupon code, or signs the request.
// So this receiver does NOT depend on guessed field names:
//   1. Every order is stored exactly as it arrived (selar_orders.raw) BEFORE anything is interpreted.
//   2. Field names are looked up leniently, and a partner code is searched for in a ref-type field, in a
//      coupon-type field and in any URL carrying ?ref=. The first code that belongs to an active partner wins.
//   3. An order with no recognisable code is kept as "unattributed" for you to assign by hand in the admin.
//      No commission is ever paid on a guess.
// The secret in the URL is the only authentication, so keep it private and rotate it if it leaks.
//
// Money: commission is 20% of the US-dollar amount paid. If Selar reports another currency, the amount is
// converted with SELAR_USD_RATES (a JSON object like {"NGN":0.00065,"GHS":0.065}); with no rate for that
// currency the order waits as "needs_review" until you give its dollar amount in the admin.

const crypto = require('crypto');
const { getServiceClient } = require('./supabase');
const { hit, getClientIp } = require('./rateLimit');
const PRODUCTS = require('./selarProducts');

const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;
const MAX_RAW_CHARS = 30000;
const MAX_PLAUSIBLE_CENTS = Math.max(...PRODUCTS.map((p) => p.usd)) * 5 * 100; // no single guide sells for more than 5x the dearest one

// ----- reading the payload -------------------------------------------------------------------------------------

function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

/** Flattens any JSON into [{ path, pathNorm, keyNorm, value }] for primitive values (depth-limited). */
function flatten(value, path = '', out = [], depth = 0) {
  if (value === null || value === undefined || depth > 6) return out;
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) flatten(v, path ? `${path}.${k}` : k, out, depth + 1);
    return out;
  }
  const segs = path.split('.');
  out.push({ path, pathNorm: norm(path), keyNorm: norm(segs[segs.length - 1]), value });
  return out;
}

/** First non-empty value whose whole path matches `exact`, else whose last segment matches `suffix`. */
function pick(entries, { exact = [], suffix = [] }) {
  const usable = (e) => ['string', 'number', 'boolean'].includes(typeof e.value) && String(e.value).trim() !== '';
  for (const name of exact) { const hitE = entries.find((e) => usable(e) && e.pathNorm === name); if (hitE) return String(hitE.value).trim(); }
  for (const name of suffix) { const hitE = entries.find((e) => usable(e) && e.keyNorm === name); if (hitE) return String(hitE.value).trim(); }
  return null;
}

const KEYS = {
  orderId: { exact: ['orderid', 'ordernumber', 'orderno', 'orderreference', 'orderref', 'transactionreference', 'transactionid', 'paymentreference', 'reference', 'saleid', 'purchaseid'],
             suffix: ['orderid', 'ordernumber', 'orderreference', 'transactionreference', 'transactionid', 'paymentreference'] },
  email:   { exact: ['customeremail', 'buyeremail', 'email', 'customeremailaddress', 'payeremail'], suffix: ['customeremail', 'buyeremail', 'email'] },
  name:    { exact: ['customername', 'buyername', 'fullname', 'customerfullname', 'name'], suffix: ['customername', 'buyername'] },
  product: { exact: ['productname', 'producttitle', 'product', 'itemname', 'item', 'title'], suffix: ['productname', 'producttitle'] },
  amount:  { exact: ['amountpaid', 'amount', 'totalamount', 'total', 'paidamount', 'price', 'grandtotal'], suffix: ['amountpaid', 'totalamount', 'paidamount'] },
  currency:{ exact: ['currency', 'currencycode', 'paidcurrency', 'amountcurrency'], suffix: ['currency', 'currencycode'] },
  status:  { exact: ['status', 'paymentstatus', 'orderstatus', 'event', 'eventtype', 'type'], suffix: ['paymentstatus', 'orderstatus'] },
  coupon:  { exact: ['couponcode', 'coupon', 'discountcode', 'promocode', 'vouchercode', 'voucher', 'discountcoupon', 'discount'], suffix: ['couponcode', 'discountcode', 'promocode', 'coupon'] },
  ref:     { exact: ['ref', 'refcode', 'referrer', 'referral', 'referralcode', 'partner', 'partnercode', 'affiliate', 'affiliatecode'], suffix: ['ref', 'refcode', 'referralcode', 'partnercode'] },
};

const CURRENCY_SYMBOLS = [['GH₵', 'GHS'], ['₵', 'GHS'], ['₦', 'NGN'], ['KSh', 'KES'], ['£', 'GBP'], ['€', 'EUR'], ['$', 'USD']];

function parseAmount(raw) {
  if (raw === null || raw === undefined) return { amount: null, currency: null };
  const text = String(raw);
  const num = Number(text.replace(/[^0-9.\-]/g, ''));
  let currency = null;
  const iso = text.match(/\b([A-Z]{3})\b/);
  if (iso) currency = iso[1];
  else for (const [sym, cur] of CURRENCY_SYMBOLS) if (text.includes(sym)) { currency = cur; break; }
  return { amount: Number.isFinite(num) ? num : null, currency };
}

function classifyStatus(entries) {
  const words = [];
  for (const group of [KEYS.status.exact, KEYS.status.suffix]) {
    for (const name of group) for (const e of entries) {
      if ((e.pathNorm === name || e.keyNorm === name) && typeof e.value === 'string') words.push(e.value.toLowerCase());
    }
  }
  const text = words.join(' ');
  if (/refund|chargeback|revers|cancel/.test(text)) return 'refund';
  if (/pending|fail|abandon|declin|expir|unpaid|incomplete/.test(text)) return 'ignored';
  return 'paid'; // Selar reports completed purchases; an unknown or missing status is treated as paid
}

function findProduct(rawText, productName) {
  for (const p of PRODUCTS) {
    if (new RegExp(`(?<![A-Za-z0-9])${p.code}(?![A-Za-z0-9])`, 'i').test(rawText)) return p;
  }
  const n = norm(productName || '');
  if (n) {
    const found = PRODUCTS.filter((p) => n.includes(norm(p.name)) || (p.full && n.includes(norm(p.full)))).sort((a, b) => norm(b.name).length - norm(a.name).length);
    if (found.length) return found[0];
  }
  return null;
}

function cleanCode(v) {
  const s = String(v || '').trim();
  return CODE_RE.test(s) && !/^\d+(\.\d+)?$/.test(s) ? s : null;
}

/** Partner-code candidates in priority order: ref field, coupon field, ?ref= inside any URL. */
function findCodeCandidates(entries) {
  const out = [];
  const add = (code, source) => { const c = cleanCode(code); if (c && !out.some((o) => o.code.toLowerCase() === c.toLowerCase())) out.push({ code: c, source }); };
  add(pick(entries, KEYS.ref), 'ref');
  add(pick(entries, KEYS.coupon), 'coupon');
  for (const e of entries) {
    if (typeof e.value !== 'string') continue;
    const m = e.value.match(/[?&]ref=([A-Za-z0-9_-]{3,32})(?![A-Za-z0-9_-])/i);
    if (m) add(m[1], 'url');
  }
  return out;
}

function parseUsdRates() {
  try {
    const obj = JSON.parse(process.env.SELAR_USD_RATES || '{}');
    return obj && typeof obj === 'object' ? obj : {};
  } catch { console.error('selar: SELAR_USD_RATES is not valid JSON'); return {}; }
}

/** -> { cents, rate } or { problem } ; zero amounts -> { zero: true } */
function toUsdCents(amount, currency, listUsd) {
  if (amount === null || !Number.isFinite(amount)) return { problem: 'The order has no readable amount.' };
  if (amount <= 0) return { zero: true };
  if (!currency) return { problem: 'The order does not say which currency was paid.' };
  const cur = currency.toUpperCase();
  let rate = 1;
  if (cur !== 'USD') {
    rate = Number(parseUsdRates()[cur]);
    if (!(rate > 0)) return { problem: `Paid in ${cur} and there is no exchange rate for it. Add it to SELAR_USD_RATES, or enter the dollar amount by hand.` };
  }
  const cents = Math.round(amount * rate * 100);
  if (listUsd && cents > listUsd * 150) return { problem: `The amount (about $${(cents / 100).toFixed(2)}) is far above the list price ($${listUsd}). Check the currency or rate.` };
  if (!listUsd && cents > MAX_PLAUSIBLE_CENTS) return { problem: `The amount (about $${(cents / 100).toFixed(2)}) is far above any guide's price and the product was not recognised. Check the currency or rate.` };
  return { cents, rate };
}

function parseOrder(payload) {
  const entries = flatten(payload);
  const rawText = JSON.stringify(payload);
  const productName = pick(entries, KEYS.product);
  const product = findProduct(rawText, productName);
  const amountRaw = pick(entries, KEYS.amount);
  const parsedAmount = parseAmount(amountRaw);
  const currency = (pick(entries, KEYS.currency) || '').toUpperCase().match(/^[A-Z]{3}$/)?.[0] || parsedAmount.currency;
  const orderId = pick(entries, KEYS.orderId);
  return {
    orderRef: orderId ? String(orderId).slice(0, 120) : 'hash:' + crypto.createHash('sha256').update(rawText).digest('hex').slice(0, 32),
    hasOrderId: !!orderId,
    email: (pick(entries, KEYS.email) || '').toLowerCase() || null,
    name: pick(entries, KEYS.name),
    productName: product ? product.full || product.name : productName,
    productCode: product ? product.code : null,
    listUsd: product ? product.usd : null,
    amount: parsedAmount.amount,
    currency,
    kind: classifyStatus(entries),
    candidates: findCodeCandidates(entries),
  };
}

// ----- commissions ---------------------------------------------------------------------------------------------

/** Tries each candidate code until one belongs to an active partner. Never throws. */
async function recordCommission(supabase, { orderRef, email, product, cents, candidates }) {
  for (const cand of candidates) {
    const { data, error } = await supabase.rpc('fl_selar_commission', {
      p_code: cand.code, p_buyer_email: email || null, p_gross_cents: cents, p_currency: 'usd', p_order_ref: orderRef, p_product: product || null,
    });
    if (error) return { status: 'error', note: `Could not record the commission: ${error.message}` };
    const r = Array.isArray(data) ? data[0] : data;
    if (r && r.creator_id) {
      const base = { partner_code: cand.code.toUpperCase(), code_source: cand.source, creator_id: r.creator_id, processed_at: new Date().toISOString() };
      if (r.reason === 'self_referral') return { ...base, status: 'self_referral', note: 'The buyer is the partner, so there is no commission.', commission_cents: 0 };
      if (r.created) return { ...base, status: 'commission_recorded', note: null, commission_cents: r.commission_cents };
      if (r.reason === 'already_recorded') return { ...base, status: 'commission_recorded', note: 'The commission was already recorded.' };
      return { ...base, status: 'error', note: `Unexpected result from the commission function: ${r.reason}` };
    }
  }
  return { status: 'unattributed', note: candidates.length ? `No active partner has the code ${candidates.map((c) => c.code).join(' or ')}.` : 'No partner code was found in this order.', processed_at: new Date().toISOString() };
}

/** Works out the dollar amount, then records the commission. Returns the columns to store on the order row. */
async function processPaid(supabase, o) {
  const money = toUsdCents(o.amount, o.currency, o.listUsd);
  if (money.zero) return { status: 'ignored', note: 'Zero amount: nothing was paid.', processed_at: new Date().toISOString() };
  if (money.problem) {
    return { status: o.candidates.length ? 'needs_review' : 'unattributed', note: money.problem + (o.candidates.length ? '' : ' (and no partner code was found)'),
             partner_code: o.candidates[0] ? o.candidates[0].code.toUpperCase() : null, code_source: o.candidates[0] ? o.candidates[0].source : null, processed_at: new Date().toISOString() };
  }
  const result = await recordCommission(supabase, { orderRef: o.orderRef, email: o.email, product: o.productName, cents: money.cents, candidates: o.candidates });
  return { gross_cents_usd: money.cents, fx_rate: money.rate === 1 ? null : money.rate, ...result };
}

async function processRefund(supabase, orderRef) {
  const { data, error } = await supabase.rpc('fl_partner_reverse_commission', { p_kind: 'exam_blueprint', p_source_ref: orderRef });
  if (error) return { status: 'error', note: `Refund received but the commission could not be reversed: ${error.message}` };
  const note = data === 'already_paid' ? 'Refunded after the commission was already paid out. Recover it from the partner or take it off their next payout.'
    : data === 'not_found' ? 'Refunded. There was no commission to reverse.' : 'Refunded: the commission was reversed.';
  return { status: 'refunded', note, processed_at: new Date().toISOString() };
}

// ----- the HTTP entry point ------------------------------------------------------------------------------------

function readPayload(req) {
  let body = req.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    const text = body.trim();
    if (!text) body = {};
    else { try { body = JSON.parse(text); } catch { body = Object.fromEntries(new URLSearchParams(text)); } }
  }
  body = body && typeof body === 'object' ? body : {};
  if (Object.keys(body).length === 0 && req.method === 'GET') {
    const { key, hook, ...rest } = req.query || {};
    body = rest;
  }
  return body;
}

function keyMatches(given, secret) {
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(String(secret)).digest();
  return crypto.timingSafeEqual(a, b);
}

function rawForStorage(payload) {
  const text = JSON.stringify(payload);
  return text.length > MAX_RAW_CHARS ? { truncated: true, preview: text.slice(0, MAX_RAW_CHARS) } : payload;
}

async function handleSelarOrder(req, res) {
  if (!['POST', 'PUT', 'GET'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.SELAR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('selar-order: SELAR_WEBHOOK_SECRET is not set, refusing every request');
    return res.status(503).json({ error: 'Not configured' });
  }
  const ip = getClientIp(req);
  const given = (req.query && req.query.key) || req.headers['x-selar-key'];
  if (!keyMatches(given, secret)) {
    const limited = await hit(`selar_bad_key:ip:${ip}`, { windowSeconds: 3600, max: 20 });
    if (!limited.allowed) { res.setHeader('Retry-After', String(limited.retryAfter)); return res.status(429).json({ error: 'Too many attempts' }); }
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const rate = await hit(`selar_order:ip:${ip}`, { windowSeconds: 60, max: 300 });
  if (!rate.allowed) { res.setHeader('Retry-After', String(rate.retryAfter)); return res.status(429).json({ error: 'Too many requests' }); }

  const payload = readPayload(req);
  if (Object.keys(payload).length === 0) return res.status(400).json({ error: 'Empty order' });

  const supabase = getServiceClient();
  const o = parseOrder(payload);

  try {
    // --- a refund: reverse the commission of the order we already hold
    if (o.kind === 'refund') {
      const { data: existing, error: findErr } = await supabase.from('selar_orders').select('id').eq('order_ref', o.orderRef).maybeSingle();
      if (findErr) throw new Error(findErr.message);
      const outcome = await processRefund(supabase, o.orderRef);
      if (existing) {
        await supabase.from('selar_orders').update(outcome).eq('id', existing.id);
      } else {
        await supabase.from('selar_orders').insert({ order_ref: o.orderRef, raw: rawForStorage(payload), buyer_email: o.email, buyer_name: o.name, product_name: o.productName, product_code: o.productCode, amount: o.amount, currency: o.currency, ...outcome, note: 'A refund for an order we never received. ' + (outcome.note || '') });
      }
      return res.status(200).json({ ok: true, status: outcome.status });
    }

    // --- a paid (or ignorable) order: store it first, then interpret it
    const row = { order_ref: o.orderRef, raw: rawForStorage(payload), buyer_email: o.email, buyer_name: o.name, product_name: o.productName, product_code: o.productCode, amount: o.amount, currency: o.currency };
    let orderId;
    const ins = await supabase.from('selar_orders').insert(row).select('id').single();
    if (ins.error) {
      if (ins.error.code !== '23505') throw new Error(ins.error.message);
      // the same order again (Selar retries)
      const { data: existing, error: exErr } = await supabase.from('selar_orders').select('id, status').eq('order_ref', o.orderRef).single();
      if (exErr) throw new Error(exErr.message);
      if (!['received', 'error'].includes(existing.status)) return res.status(200).json({ ok: true, duplicate: true, status: existing.status });
      orderId = existing.id;
    } else {
      orderId = ins.data.id;
    }

    let outcome;
    if (o.kind === 'ignored') outcome = { status: 'ignored', note: 'The order is not a completed payment.', processed_at: new Date().toISOString() };
    else {
      try { outcome = await processPaid(supabase, o); }
      catch (err) { console.error('selar-order: processing failed:', err); outcome = { status: 'error', note: `Processing failed: ${err.message}` }; }
    }
    const up = await supabase.from('selar_orders').update(outcome).eq('id', orderId);
    if (up.error) console.error('selar-order: could not save the result:', up.error.message);
    return res.status(200).json({ ok: true, status: outcome.status });
  } catch (err) {
    // Not stored: ask Selar to retry later.
    console.error('selar-order: could not store the order:', err);
    return res.status(500).json({ error: 'Could not store the order' });
  }
}

module.exports = { handleSelarOrder, parseOrder, recordCommission, processRefund, toUsdCents, CODE_RE };
