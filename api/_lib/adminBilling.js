// api/_lib/adminBilling.js
//
// Admin view of Creem billing events, mounted in api/admin/router.js:
//   GET  /api/admin/billing-events?status=attention|all&limit=   latest events; with &id=<event id> one event INCLUDING its raw payload
//   POST /api/admin/billing-event-resolve { eventId, note? }       mark an event that needed a person as handled
// "attention" = events the code could not safely settle by itself (needs_review) or that failed (error).

const LIST_COLUMNS = 'event_id, event_type, user_id, object_id, outcome, note, received_at, processed_at';

async function handleBillingEvents(auth, req, res) {
  const q = req.query || {};
  if (q.id) {
    const { data, error } = await auth.supabase.from('billing_events').select('*').eq('event_id', String(q.id)).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Event not found' });
    return res.status(200).json({ event: data });
  }
  const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
  let query = auth.supabase.from('billing_events').select(LIST_COLUMNS).order('received_at', { ascending: false }).limit(limit);
  if (q.status !== 'all') query = query.in('outcome', ['needs_review', 'error']);
  const { data, error } = await query;
  if (error) { console.error('admin/billing-events failed:', error.message); return res.status(500).json({ error: error.message }); }
  return res.status(200).json({ events: data || [] });
}

async function handleBillingEventResolve(auth, req, res) {
  const body = req.body || {};
  const eventId = String(body.eventId || '');
  if (!eventId) return res.status(400).json({ error: 'eventId is required' });
  const { data, error } = await auth.supabase.from('billing_events').select('event_id, outcome, note').eq('event_id', eventId).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'Event not found' });
  if (!['needs_review', 'error'].includes(data.outcome)) return res.status(409).json({ error: `This event is already "${data.outcome}"` });
  const note = [data.note, `Handled by ${auth.user.email || auth.user.id}${body.note ? ': ' + String(body.note).trim().slice(0, 200) : '.'}`].filter(Boolean).join(' ');
  const up = await auth.supabase.from('billing_events').update({ outcome: 'processed', note, processed_at: new Date().toISOString() }).eq('event_id', eventId);
  if (up.error) return res.status(500).json({ error: up.error.message });
  return res.status(200).json({ ok: true });
}

module.exports = { handleBillingEvents, handleBillingEventResolve };
