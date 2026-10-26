// api/_lib/bot/manus.js
//
// Small client for the Manus API v2 (https://open.manus.ai/docs/v2). Manus is an agent API, not a chat
// completion API: a conversation is a "task" that runs asynchronously. The flow used here:
//   task.create        -> starts a conversation (first visitor message), returns task_id
//   task.sendMessage   -> every later visitor message
//   task.listMessages  -> polled to see whether the agent has stopped and what it answered
//
// Several API keys (from separate Manus accounts) are used as a pool, because rate limits are per account
// and shared by all keys of one account. A task belongs to the account that created it, so a conversation
// is pinned to the key it started on (we store only keyId, the first 8 hex chars of sha256(key)).
//
// Environment:
//   MANUS_API_KEYS       comma-separated list of keys (MANUS_API_KEY, a single key, also works)
//   MANUS_API_BASE       optional, defaults to https://api.manus.ai
//   MANUS_AGENT_PROFILE  optional, e.g. manus-1.6-lite for faster answers. Only sent when set, so a wrong
//                        field name can never break the bot. tools/manus_speedtest.js shows whether it works.

'use strict';

const crypto = require('crypto');

const TIMEOUT_MS = 8000;
const cooldownUntil = new Map(); // keyId -> epoch ms; lives for the life of one warm serverless instance

class ManusError extends Error {
  constructor(message, { status = 0, code = '', retryable = false, keyProblem = false } = {}) {
    super(message);
    this.name = 'ManusError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.keyProblem = keyProblem;
  }
}

function keyId(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 8);
}

function loadKeys() {
  const raw = [process.env.MANUS_API_KEYS, process.env.MANUS_API_KEY].filter(Boolean).join(',');
  const seen = new Set();
  const out = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const key = part.trim();
    if (key && !seen.has(key)) { seen.add(key); out.push({ key, id: keyId(key) }); }
  }
  return out;
}

function hasKey(id) {
  return loadKeys().some((k) => k.id === id);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Keys that are not cooling down first (random order, spreads the load), cooling keys last. */
function pickOrder() {
  const now = Date.now();
  const keys = loadKeys();
  const ready = keys.filter((k) => (cooldownUntil.get(k.id) || 0) <= now);
  const cooling = keys.filter((k) => (cooldownUntil.get(k.id) || 0) > now);
  return shuffle(ready).concat(shuffle(cooling));
}

async function call(entry, method, path, { query, body } = {}) {
  const base = (process.env.MANUS_API_BASE || 'https://api.manus.ai').replace(/\/+$/, '');
  const url = new URL(base + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  let res;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: Object.assign({ 'x-manus-api-key': entry.key }, body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new ManusError('network error: ' + (err && err.message), { retryable: true });
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* not JSON */ }
  if (res.ok && data && data.ok !== false) return data;

  const status = res.status;
  const code = (data && data.error && data.error.code) || '';
  const message = (data && data.error && data.error.message) || 'HTTP ' + status;
  if (status === 429) {
    const retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after')) || 30;
    cooldownUntil.set(entry.id, Date.now() + retryAfter * 1000);
  }
  if (status === 401 || status === 403) cooldownUntil.set(entry.id, Date.now() + 10 * 60 * 1000);
  throw new ManusError(message, {
    status, code,
    retryable: status === 429 || status >= 500,
    keyProblem: status === 401 || status === 403,
  });
}

/** Starts a conversation. Tries up to three keys when one is rate limited, broken or down. */
async function createTask(content) {
  const order = pickOrder();
  if (!order.length) throw new ManusError('no Manus API keys configured', { code: 'no_keys' });
  let lastError;
  for (const entry of order.slice(0, 3)) {
    try {
      const body = { message: { content } };
      if (process.env.MANUS_AGENT_PROFILE) body.agent_profile = process.env.MANUS_AGENT_PROFILE;
      const data = await call(entry, 'POST', '/v2/task.create', { body });
      if (!data.task_id) throw new ManusError('Manus returned no task_id', { retryable: true });
      return { taskId: data.task_id, keyId: entry.id };
    } catch (err) {
      lastError = err;
      if (!(err instanceof ManusError) || !(err.retryable || err.keyProblem)) throw err;
    }
  }
  throw lastError;
}

function entryFor(id) {
  const entry = loadKeys().find((k) => k.id === id);
  if (!entry) throw new ManusError('the key this conversation started on is no longer configured', { code: 'key_unavailable' });
  return entry;
}

/** Follow-up message on an existing conversation (must use the key that created the task). */
async function sendMessage(taskId, id, content) {
  return call(entryFor(id), 'POST', '/v2/task.sendMessage', { body: { task_id: taskId, message: { content } } });
}

/** Recent events of a task, oldest first. */
async function listMessages(taskId, id) {
  const data = await call(entryFor(id), 'GET', '/v2/task.listMessages', { query: { task_id: taskId, order: 'desc', limit: 40 } });
  const events = Array.isArray(data.messages) ? data.messages.slice() : [];
  if (events.length > 1 && (events[0].timestamp || 0) > (events[events.length - 1].timestamp || 0)) events.reverse();
  return events;
}

/**
 * Pure function: given the task's events (oldest first) and the id of the last visitor message that was
 * already answered, say what the latest turn looks like.
 *   { state: 'pending' }                               agent still working, or our message is not listed yet
 *   { state: 'done', reply, parts, userEventId }       agent stopped (or is waiting for the visitor) with text;
 *                                                      reply is the LAST assistant message, because earlier ones
 *                                                      were seen to be the agent narrating its steps ("I'll review...")
 *   { state: 'error', userEventId }                    agent failed or stopped with nothing to say
 * "Our message is not listed yet" matters: right after task.sendMessage the previous turn's "stopped" event
 * is still the newest one, and it must not be mistaken for the answer to the new question.
 */
function evaluateTurn(events, lastDeliveredUserEventId) {
  let u = -1;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'user_message') { u = i; break; }
  }
  if (u === -1) return { state: 'pending' };
  const userEventId = events[u].id;
  if (lastDeliveredUserEventId && userEventId === lastDeliveredUserEventId) return { state: 'pending' };

  const windowEvents = events.slice(u + 1);
  if (windowEvents.some((e) => e.type === 'error_message')) return { state: 'error', userEventId };

  const texts = windowEvents
    .filter((e) => e.type === 'assistant_message' && e.assistant_message && typeof e.assistant_message.content === 'string')
    .map((e) => e.assistant_message.content.trim())
    .filter(Boolean);
  const statuses = windowEvents.filter((e) => e.type === 'status_update' && e.status_update);
  const last = statuses.length ? statuses[statuses.length - 1].status_update.agent_status : null;

  if (last === 'stopped' || last === 'waiting') {
    return texts.length ? { state: 'done', reply: texts[texts.length - 1], parts: texts, userEventId } : { state: 'error', userEventId };
  }
  if (last === 'error') return { state: 'error', userEventId };
  return { state: 'pending' };
}

module.exports = { createTask, sendMessage, listMessages, evaluateTurn, hasKey, keyId, loadKeys, ManusError };
