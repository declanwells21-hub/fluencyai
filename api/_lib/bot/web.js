// api/_lib/bot/web.js
//
// The website channel. Three handlers, reached through api/bot.js:
//   POST /api/bot/chat     { message, cid?, page?, lang?, hp? }  -> { cid, status: 'done', reply, human }      (instant provider)
//                                                              or { cid, status: 'pending', retryMs }        (Manus: poll for the answer)
//   GET  /api/bot/poll     ?cid=...                              -> { status: 'pending'|'done'|'idle'|'error'|'timeout', reply?, human? }
//   GET  /api/bot/history  ?cid=...                              -> { messages: [{ role, content }] }
//   POST /api/bot/handoff  { email, note?, cid?, hp? }           -> { ok: true }   ("talk to a person": emails support)
//
// Providers, in the order of BOT_PROVIDERS (default "tokenharbor,manus"): Token Harbor answers within the same
// request; if it is down, rate limited or out of balance, Manus takes over. Manus works in the background, so the
// browser does the waiting: chat starts the task and returns at once, then the widget polls.
// No AI key ever reaches the browser, and the transcript lives in our database, so a chat can move between providers.
// A later channel (Telegram, email, WhatsApp) writes its own small adapter like this one and reuses
// brain.js, manus.js and the same tables.

'use strict';

const { getServiceClient } = require('../supabase');
const { hit, getClientIp } = require('../rateLimit');
const manus = require('./manus');
const llm = require('./llm');
const { buildHandoffEmail } = require('./handoff');
const { sendBrandedEmail } = require('../emailTemplate');
const brain = require('./brain');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TURNS = 30;               // visitor messages per conversation
const PENDING_TIMEOUT_MS = 90 * 1000;
const FIRST_RETRY_MS = 2500;
const SLOW_RETRY_MS = 4000;

const num = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

function send(res, status, body) {
  return res.status(status).json(body);
}

function readBody(req) {
  const b = req.body;
  if (b && typeof b === 'object') return b;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch (_) { return {}; } }
  return {};
}

/** Browsers send an Origin header on POST. Only accept the site's own origin (blocks other sites' scripts). */
function originOk(req) {
  const origin = req.headers && req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch (_) { return false; }
}

function disabled() {
  return String(process.env.BOT_ENABLED || '').toLowerCase() === 'false';
}

/** Providers to try, in order: BOT_PROVIDERS (default "tokenharbor,manus"), only those that have keys. */
function providerOrder() {
  const wanted = String(process.env.BOT_PROVIDERS || 'tokenharbor,manus').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const ready = { tokenharbor: llm.isConfigured(), manus: manus.loadKeys().length > 0 };
  return Array.from(new Set(wanted)).filter((p) => ready[p]);
}

// ---- database helpers (kept tiny so they are easy to read and to fake in tests) ----
async function loadConv(db, cid) {
  const { data, error } = await db.from('bot_conversations').select('*').eq('id', cid).maybeSingle();
  if (error) throw new Error('bot: load conversation failed: ' + error.message);
  return data && data.channel === 'web' ? data : null;
}

async function updateConv(db, id, patch, onlyIfStatus) {
  let q = db.from('bot_conversations').update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq('id', id);
  if (onlyIfStatus) q = q.eq('status', onlyIfStatus);
  const { data, error } = await q.select('id');
  if (error) throw new Error('bot: update conversation failed: ' + error.message);
  return Array.isArray(data) ? data.length : 0;
}

async function addMessage(db, conversationId, role, content, human = false) {
  const { error } = await db.from('bot_messages').insert({ conversation_id: conversationId, role, content: String(content).slice(0, 4000), human_flag: !!human });
  if (error) console.error('bot: could not save message:', error.message);
}

async function recentMessages(db, conversationId, n) {
  const { data, error } = await db.from('bot_messages').select('role,content').eq('conversation_id', conversationId).order('id', { ascending: false }).limit(n);
  if (error) return [];
  return (data || []).slice().reverse();
}

async function allowed(key, windowSeconds, max) {
  return (await hit(key, { windowSeconds, max })).allowed;
}

/**
 * One visitor turn on Manus. A conversation that Manus has been serving continues in its own task; otherwise
 * (new chat, or a chat that Token Harbor served until now) a fresh task starts with the transcript as context.
 */
async function startManusTurn(conv, { question, recent, page, context }) {
  if (conv.provider === 'manus' && conv.manus_task_id && conv.manus_key_id && manus.hasKey(conv.manus_key_id)) {
    try {
      await manus.sendMessage(conv.manus_task_id, conv.manus_key_id, brain.buildFollowUp(question, context));
      return { kind: 'pending', taskId: conv.manus_task_id, keyId: conv.manus_key_id, continued: true };
    } catch (err) {
      // The task is gone or its key was removed: carry on in a fresh task, with the transcript as context.
      console.error('bot: follow-up failed, starting a new task:', err.message);
    }
  }
  const created = await manus.createTask(brain.buildFirstMessage({ question, history: recent, page, context }));
  return { kind: 'pending', taskId: created.taskId, keyId: created.keyId, continued: false };
}

// ---------------------------------------------------------------------------
async function handleChat(req, res) {
  if (disabled()) return send(res, 503, { error: 'disabled', reply: brain.FALLBACKS.unavailable, human: true });
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!originOk(req)) return send(res, 403, { error: 'forbidden' });

  const body = readBody(req);
  if (body.hp) return send(res, 200, { cid: '00000000-0000-4000-8000-000000000000', status: 'idle' }); // honeypot filled: pretend, do nothing

  const question = brain.cleanQuestion(body.message);
  if (!question) return send(res, 400, { error: 'empty_message' });

  const ip = getClientIp(req);
  if (!(await allowed('bot:chat:ip:' + ip, 600, num('BOT_IP_PER_10MIN', 20)))) {
    return send(res, 429, { error: 'rate_limited', reply: brain.FALLBACKS.busy, human: true });
  }
  if (!(await allowed('bot:chat:day', 86400, num('BOT_DAILY_CAP', 1500)))) {
    return send(res, 429, { error: 'daily_cap', reply: brain.FALLBACKS.busy, human: true });
  }

  const db = getServiceClient();
  const cid = typeof body.cid === 'string' && UUID.test(body.cid) ? body.cid : null;
  let conv = cid ? await loadConv(db, cid) : null;

  if (conv) {
    if (!(await allowed('bot:chat:conv:' + conv.id, 60, 6))) return send(res, 429, { error: 'rate_limited', reply: brain.FALLBACKS.busy });
    if (conv.user_turns >= MAX_TURNS) return send(res, 200, { cid: conv.id, status: 'limit', reply: brain.FALLBACKS.limit, human: true });
    const pendingFor = conv.pending_since ? Date.now() - new Date(conv.pending_since).getTime() : Infinity;
    if (conv.status === 'pending' && pendingFor < PENDING_TIMEOUT_MS) return send(res, 409, { error: 'busy', cid: conv.id, status: 'pending', retryMs: FIRST_RETRY_MS });
  }

  const page = String(body.page || '').slice(0, 80);
  const lang = String(body.lang || '').slice(0, 12);

  let isNew = false;
  try {
    if (!conv) {
      isNew = true;
      const { data, error } = await db.from('bot_conversations')
        .insert({ channel: 'web', status: 'pending', pending_since: new Date().toISOString(), user_turns: 0, lang: lang || null, page: page || null })
        .select('*').single();
      if (error || !data) throw new Error('bot: could not create conversation: ' + (error && error.message));
      conv = data;
    }

    const recent = isNew ? [] : await recentMessages(db, conv.id, 8);
    const context = recent.filter((m) => m.role === 'user').map((m) => m.content).join(' '); // lets "and B2?" find the right guide

    let outcome = null;
    for (const provider of providerOrder()) {
      try {
        if (provider === 'tokenharbor') {
          const { text } = await llm.complete(llm.buildChatMessages(recent, question));
          outcome = Object.assign({ kind: 'done', provider }, brain.processReply(text));
        } else {
          outcome = await startManusTurn(conv, { question, recent, page, context });
        }
        break;
      } catch (err) {
        console.error('bot: provider ' + provider + ' failed:', err.message);
      }
    }
    if (!outcome) throw new Error('bot: every provider failed');

    await addMessage(db, conv.id, 'user', question);
    if (outcome.kind === 'done') {
      const reply = outcome.reply || brain.FALLBACKS.unavailable;
      await addMessage(db, conv.id, 'assistant', reply, outcome.human);
      await updateConv(db, conv.id, { status: 'idle', pending_since: null, provider: outcome.provider, user_turns: (conv.user_turns || 0) + 1 });
      return send(res, 200, { cid: conv.id, status: 'done', reply, human: !!outcome.human });
    }
    await updateConv(db, conv.id, {
      manus_task_id: outcome.taskId, manus_key_id: outcome.keyId, status: 'pending', pending_since: new Date().toISOString(),
      provider: 'manus', user_turns: (conv.user_turns || 0) + 1, last_user_event_id: outcome.continued ? conv.last_user_event_id : null,
    });
    return send(res, 200, { cid: conv.id, status: 'pending', retryMs: FIRST_RETRY_MS });
  } catch (err) {
    console.error('bot: chat failed:', err.message);
    if (conv && conv.id) { try { await updateConv(db, conv.id, { status: 'idle', pending_since: null }); } catch (_) { /* ignore */ } }
    return send(res, 502, { error: 'unavailable', cid: conv ? conv.id : undefined, reply: brain.FALLBACKS.unavailable, human: true });
  }
}

// ---------------------------------------------------------------------------
async function handlePoll(req, res) {
  if (disabled()) return send(res, 503, { error: 'disabled', status: 'error', reply: brain.FALLBACKS.unavailable, human: true });
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!originOk(req)) return send(res, 403, { error: 'forbidden' });

  const cid = String((req.query && req.query.cid) || '');
  if (!UUID.test(cid)) return send(res, 400, { error: 'bad_cid' });

  const ip = getClientIp(req);
  if (!(await allowed('bot:poll:ip:' + ip, 60, num('BOT_POLL_PER_MIN_IP', 120)))) return send(res, 429, { error: 'rate_limited', status: 'pending', retryMs: 8000 });
  if (!(await allowed('bot:poll:conv:' + cid, 60, 40))) return send(res, 429, { error: 'rate_limited', status: 'pending', retryMs: 8000 });

  const db = getServiceClient();
  const conv = await loadConv(db, cid);
  if (!conv) return send(res, 404, { error: 'not_found', status: 'error' });
  if (conv.status !== 'pending') return send(res, 200, { status: 'idle' });

  const elapsed = conv.pending_since ? Date.now() - new Date(conv.pending_since).getTime() : 0;
  if (elapsed > PENDING_TIMEOUT_MS) {
    await updateConv(db, conv.id, { status: 'idle', pending_since: null }, 'pending');
    return send(res, 200, { status: 'timeout', reply: brain.FALLBACKS.timeout, human: true });
  }
  const retryMs = elapsed > 20000 ? SLOW_RETRY_MS : FIRST_RETRY_MS;

  let result;
  try {
    const events = await manus.listMessages(conv.manus_task_id, conv.manus_key_id);
    result = manus.evaluateTurn(events, conv.last_user_event_id);
  } catch (err) {
    console.error('bot: poll could not read the task:', err.message);
    return send(res, 200, { status: 'pending', retryMs: SLOW_RETRY_MS }); // keep trying until the timeout
  }

  if (result.state === 'pending') return send(res, 200, { status: 'pending', retryMs });

  if (result.state === 'error') {
    await updateConv(db, conv.id, { status: 'idle', pending_since: null, last_user_event_id: result.userEventId }, 'pending');
    return send(res, 200, { status: 'error', reply: brain.FALLBACKS.unavailable, human: true });
  }

  const { reply, human } = brain.processReply(result.reply);
  // Only the poll that flips pending -> idle delivers the answer; a parallel poll gets the stored copy.
  const won = await updateConv(db, conv.id, { status: 'idle', pending_since: null, last_user_event_id: result.userEventId }, 'pending');
  if (!won) {
    const last = (await recentMessages(db, conv.id, 1))[0];
    return send(res, 200, last && last.role === 'assistant' ? { status: 'done', reply: last.content } : { status: 'idle' });
  }
  const finalReply = reply || brain.FALLBACKS.unavailable;
  await addMessage(db, conv.id, 'assistant', finalReply, human);
  return send(res, 200, { status: 'done', reply: finalReply, human });
}

// ---------------------------------------------------------------------------
async function handleHistory(req, res) {
  if (disabled()) return send(res, 503, { error: 'disabled' });
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' });
  if (!originOk(req)) return send(res, 403, { error: 'forbidden' });
  const cid = String((req.query && req.query.cid) || '');
  if (!UUID.test(cid)) return send(res, 400, { error: 'bad_cid' });
  if (!(await allowed('bot:hist:ip:' + getClientIp(req), 60, 30))) return send(res, 429, { error: 'rate_limited' });

  const db = getServiceClient();
  const conv = await loadConv(db, cid);
  if (!conv) return send(res, 404, { error: 'not_found' });
  const messages = await recentMessages(db, conv.id, 50);
  return send(res, 200, { cid: conv.id, pending: conv.status === 'pending', messages });
}

// ---------------------------------------------------------------------------
// "Talk to a person". Saves the request, then emails support (Reply-To = the visitor). Never emails the visitor.
const EMAIL_RE = /^[^\s@<>"',;:()[\]\\]+@[^\s@<>"',;:()[\]\\]+\.[^\s@<>"',;:()[\]\\]{2,}$/;

async function handleHandoff(req, res) {
  if (disabled()) return send(res, 503, { error: 'disabled' });
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  if (!originOk(req)) return send(res, 403, { error: 'forbidden' });

  const body = readBody(req);
  if (body.hp) return send(res, 200, { ok: true });                         // honeypot filled: pretend, do nothing

  const email = String(body.email || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return send(res, 400, { error: 'bad_email' });
  const note = brain.cleanNote(body.note);

  const ip = getClientIp(req);
  if (!(await allowed('bot:handoff:ip:' + ip, 3600, num('BOT_HANDOFF_PER_HOUR_IP', 5)))) return send(res, 429, { error: 'rate_limited' });
  if (!(await allowed('bot:handoff:day', 86400, num('BOT_HANDOFF_DAILY_CAP', 100)))) return send(res, 429, { error: 'rate_limited' });

  const db = getServiceClient();
  const cid = typeof body.cid === 'string' && UUID.test(body.cid) ? body.cid : null;
  const conv = cid ? await loadConv(db, cid) : null;
  if (conv && !(await allowed('bot:handoff:conv:' + conv.id, 3600, 3))) return send(res, 429, { error: 'rate_limited' });

  try {
    const transcript = conv ? await recentMessages(db, conv.id, 30) : [];
    const { data: row, error } = await db.from('bot_handoffs')
      .insert({ conversation_id: conv ? conv.id : null, contact_email: email, note: note || null, status: 'open' })
      .select('id').single();
    if (error || !row) throw new Error('could not save the request: ' + (error && error.message));

    // The request is saved; the email is the notification. If it fails, the admin page still shows the request.
    try {
      const mail = buildHandoffEmail({ id: row.id, email, note, conversation: conv, transcript });
      await sendBrandedEmail({ to: process.env.BOT_HANDOFF_TO || 'support@fluencyai.app', subject: mail.subject, htmlContent: mail.htmlContent, textContent: mail.textContent, replyTo: email });
      await db.from('bot_handoffs').update({ emailed_at: new Date().toISOString() }).eq('id', row.id);
    } catch (err) {
      console.error('bot: hand-off email failed (request #' + row.id + ' is saved):', err.message);
    }
    return send(res, 200, { ok: true });
  } catch (err) {
    console.error('bot: hand-off failed:', err.message);
    return send(res, 500, { error: 'handoff_failed' });
  }
}

module.exports = { handleChat, handlePoll, handleHistory, handleHandoff, MAX_TURNS, PENDING_TIMEOUT_MS };
