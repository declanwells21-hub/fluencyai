// api/_lib/adminSelar.js
//
// Admin tools for Selar exam blueprint orders, mounted in api/admin/router.js:
//   GET  /api/admin/selar-orders?status=&limit=      latest orders (no raw payload); with &id=<uuid> one order INCLUDING its raw payload
//   POST /api/admin/selar-order-attribute { orderId, code, usdAmount? }   give an unattributed / needs-review order to a partner
//   POST /api/admin/selar-order-refund    { orderId }                      reverse the commission of a refunded order
//
// Use the raw payload of the first test purchase to see exactly what Selar sends.

const { recordCommission, processRefund, CODE_RE } = require('./selarOrders');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_COLUMNS = 'id, order_ref, received_at, status, note, buyer_email, buyer_name, product_name, amount, currency, gross_cents_usd, fx_rate, partner_code, code_source, commission_cents';
const STATUSES = ['received', 'commission_recorded', 'unattributed', 'needs_review', 'self_referral', 'ignored', 'refunded', 'error'];

async function handleSelarOrders(auth, req, res) {
  const q = req.query || {};
  if (q.id) {
    if (!UUID_RE.test(String(q.id))) return res.status(400).json({ error: 'id must be an order id (uuid)' });
    const { data, error } = await auth.supabase.from('selar_orders').select('*').eq('id', q.id).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Order not found' });
    return res.status(200).json({ order: data });
  }
  const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
  let query = auth.supabase.from('selar_orders').select(LIST_COLUMNS).order('received_at', { ascending: false }).limit(limit);
  if (q.status && STATUSES.includes(String(q.status))) query = query.eq('status', String(q.status));
  const { data, error } = await query;
  if (error) { console.error('admin/selar-orders failed:', error.message); return res.status(500).json({ error: error.message }); }
  return res.status(200).json({ orders: data || [] });
}

async function loadOrder(auth, res, orderId) {
  if (!UUID_RE.test(String(orderId || ''))) { res.status(400).json({ error: 'orderId must be an order id (uuid)' }); return null; }
  const { data, error } = await auth.supabase.from('selar_orders').select('*').eq('id', orderId).maybeSingle();
  if (error) { res.status(500).json({ error: error.message }); return null; }
  if (!data) { res.status(404).json({ error: 'Order not found' }); return null; }
  return data;
}

async function handleSelarOrderAttribute(auth, req, res) {
  const body = req.body || {};
  const code = String(body.code || '').trim();
  if (!CODE_RE.test(code)) return res.status(400).json({ error: 'Enter a partner code (letters, numbers, - or _, 3 to 32 characters)' });
  const order = await loadOrder(auth, res, body.orderId);
  if (!order) return;
  if (!['unattributed', 'needs_review', 'error', 'received'].includes(order.status)) {
    return res.status(409).json({ error: `This order is already "${order.status}" and cannot be attributed again` });
  }

  let cents = order.gross_cents_usd;
  if (body.usdAmount !== undefined && body.usdAmount !== null && body.usdAmount !== '') {
    const usd = Number(body.usdAmount);
    if (!Number.isFinite(usd) || usd <= 0 || usd > 1000) return res.status(400).json({ error: 'usdAmount must be a dollar amount between 0.01 and 1000' });
    cents = Math.round(usd * 100);
  }
  if (!cents) return res.status(400).json({ error: 'This order has no dollar amount yet. Enter it as usdAmount.' });

  const result = await recordCommission(auth.supabase, { orderRef: order.order_ref, email: order.buyer_email, product: order.product_name, cents, candidates: [{ code, source: 'admin' }] });
  if (result.status === 'unattributed') return res.status(404).json({ error: `No active partner has the code ${code.toUpperCase()}` });
  const note = [result.note, `Assigned by ${auth.user.email || auth.user.id}.`].filter(Boolean).join(' ');
  const up = await auth.supabase.from('selar_orders').update({ ...result, note, gross_cents_usd: cents }).eq('id', order.id);
  if (up.error) return res.status(500).json({ error: up.error.message });
  return res.status(200).json({ ok: true, status: result.status, commissionCents: result.commission_cents ?? null });
}

async function handleSelarOrderRefund(auth, req, res) {
  const order = await loadOrder(auth, res, (req.body || {}).orderId);
  if (!order) return;
  if (order.status === 'refunded') return res.status(409).json({ error: 'This order is already marked as refunded' });
  const outcome = await processRefund(auth.supabase, order.order_ref);
  if (outcome.status === 'error') return res.status(500).json({ error: outcome.note });
  const note = [outcome.note, `Marked by ${auth.user.email || auth.user.id}.`].join(' ');
  const up = await auth.supabase.from('selar_orders').update({ ...outcome, note }).eq('id', order.id);
  if (up.error) return res.status(500).json({ error: up.error.message });
  return res.status(200).json({ ok: true, status: outcome.status, note });
}

module.exports = { handleSelarOrders, handleSelarOrderAttribute, handleSelarOrderRefund };
