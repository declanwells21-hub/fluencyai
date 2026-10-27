// api/_lib/adminBot.js
//
// Admin view of the website chat assistant, mounted in api/admin/router.js (one function for all admin routes):
//   GET  /api/admin/bot-overview                     numbers, hand-off requests, "questions it could not answer", recent chats
//   GET  /api/admin/bot-conversation?id=<uuid>       one chat with every message
//   POST /api/admin/bot-handoff-update { id, status }  status: open | answered | closed
//
// "Questions it could not answer" are the visitor messages whose answer carried the human flag: each one is a gap in the
// site's own text, so fixing the page (and the knowledge file regenerates from it) makes the bot better.

'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['open', 'answered', 'closed'];
const DAY_MS = 24 * 60 * 60 * 1000;

const clip = (text, n) => String(text == null ? '' : text).slice(0, n);

async function count(query) {
  const { count: n, error } = await query;
  if (error) throw new Error(error.message);
  return n || 0;
}

async function handleBotOverview(auth, req, res) {
  const db = auth.supabase;
  try {
    const since = new Date(Date.now() - 7 * DAY_MS).toISOString();

    const [conversations7d, messages7d, flagged7d, handoffsOpen] = await Promise.all([
      count(db.from('bot_conversations').select('id', { count: 'exact', head: true }).gte('created_at', since)),
      count(db.from('bot_messages').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', since)),
      count(db.from('bot_messages').select('id', { count: 'exact', head: true }).eq('human_flag', true).gte('created_at', since)),
      count(db.from('bot_handoffs').select('id', { count: 'exact', head: true }).eq('status', 'open')),
    ]);

    const { data: handoffs, error: hErr } = await db.from('bot_handoffs')
      .select('id, conversation_id, contact_email, note, status, created_at, emailed_at')
      .order('created_at', { ascending: false }).limit(40);
    if (hErr) throw new Error(hErr.message);

    const { data: recent, error: rErr } = await db.from('bot_conversations')
      .select('id, created_at, updated_at, user_turns, provider, page, lang')
      .order('updated_at', { ascending: false }).limit(30);
    if (rErr) throw new Error(rErr.message);

    // first visitor message of each recent chat (a preview), and the unanswered questions with the answer that followed
    const { data: flaggedRows, error: fErr } = await db.from('bot_messages')
      .select('id, conversation_id, content, created_at')
      .eq('human_flag', true).order('id', { ascending: false }).limit(25);
    if (fErr) throw new Error(fErr.message);

    const ids = Array.from(new Set((recent || []).map((c) => c.id).concat((flaggedRows || []).map((m) => m.conversation_id))));
    let userRows = [];
    if (ids.length) {
      const { data, error } = await db.from('bot_messages').select('id, conversation_id, content').eq('role', 'user').in('conversation_id', ids).order('id', { ascending: true }).limit(600);
      if (error) throw new Error(error.message);
      userRows = data || [];
    }
    const firstQuestion = {};
    for (const m of userRows) if (!(m.conversation_id in firstQuestion)) firstQuestion[m.conversation_id] = m.content;

    const unanswered = (flaggedRows || []).map((a) => {
      const before = userRows.filter((m) => m.conversation_id === a.conversation_id && m.id < a.id).pop();
      return { conversationId: a.conversation_id, at: a.created_at, question: clip(before && before.content, 300), answer: clip(a.content, 300) };
    });

    return res.status(200).json({
      stats: { conversations7d, messages7d, unanswered7d: flagged7d, handoffsOpen },
      handoffs: (handoffs || []).map((h) => ({ ...h, note: clip(h.note, 1000) })),
      unanswered,
      recent: (recent || []).map((c) => ({ ...c, firstQuestion: clip(firstQuestion[c.id], 160) })),
    });
  } catch (err) {
    console.error('admin/bot-overview failed:', err.message);
    return res.status(500).json({ error: 'Could not load the chat assistant data' });
  }
}

async function handleBotConversation(auth, req, res) {
  const id = String((req.query && req.query.id) || '');
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'id must be a chat id (uuid)' });
  const db = auth.supabase;
  const { data: conv, error } = await db.from('bot_conversations').select('id, created_at, updated_at, user_turns, provider, page, lang, status').eq('id', id).maybeSingle();
  if (error) { console.error('admin/bot-conversation failed:', error.message); return res.status(500).json({ error: 'Could not load the chat' }); }
  if (!conv) return res.status(404).json({ error: 'Chat not found (it may have been deleted after the retention period)' });
  const { data: messages, error: mErr } = await db.from('bot_messages').select('id, role, content, human_flag, created_at').eq('conversation_id', id).order('id', { ascending: true }).limit(200);
  if (mErr) { console.error('admin/bot-conversation messages failed:', mErr.message); return res.status(500).json({ error: 'Could not load the chat' }); }
  return res.status(200).json({ conversation: conv, messages: messages || [] });
}

async function handleBotHandoffUpdate(auth, req, res) {
  const body = req.body || {};
  const id = Number(body.id);
  const status = String(body.status || '');
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'id must be a hand-off number' });
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'status must be open, answered or closed' });
  const { data, error } = await auth.supabase.from('bot_handoffs').update({ status }).eq('id', id).select('id');
  if (error) { console.error('admin/bot-handoff-update failed:', error.message); return res.status(500).json({ error: 'Could not update the request' }); }
  if (!data || !data.length) return res.status(404).json({ error: 'Request not found' });
  return res.status(200).json({ ok: true, id, status });
}

module.exports = { handleBotOverview, handleBotConversation, handleBotHandoffUpdate };
