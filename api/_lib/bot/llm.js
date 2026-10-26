// api/_lib/bot/llm.js
//
// Client for OpenAI-compatible chat APIs, made for Token Harbor (https://tokenharbor.ai/v1). Unlike Manus
// (an agent API that works in the background and has to be polled), this answers in ONE request, in about
// 5 to 8 seconds, and accepts a very large prompt, so the whole knowledge file travels as the system prompt.
//
// Environment:
//   TOKENHARBOR_API_KEYS   comma-separated keys (TOKENHARBOR_API_KEY, a single key, also works)
//   TOKENHARBOR_MODEL      optional, defaults to deepseek-v4.1-flash:free. For real visitors switch to a PAID model:
//                          free models may keep prompts and responses, and their limits are not published.
//   TOKENHARBOR_BASE_URL   optional, defaults to https://tokenharbor.ai/v1 (any OpenAI-compatible endpoint works)

'use strict';

const brain = require('./brain');

const TIMEOUT_MS = 20000;
const MAX_HISTORY = 8;          // earlier messages (either side) sent along with the new question
const cooldownUntil = new Map(); // key -> epoch ms, lives for one warm serverless instance

class LlmError extends Error {
  constructor(message, { status = 0, retryable = false, keyProblem = false } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.retryable = retryable;
    this.keyProblem = keyProblem;
  }
}

function loadKeys() {
  const raw = [process.env.TOKENHARBOR_API_KEYS, process.env.TOKENHARBOR_API_KEY].filter(Boolean).join(',');
  return Array.from(new Set(raw.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean)));
}

function isConfigured() {
  return loadKeys().length > 0;
}

function pickOrder() {
  const now = Date.now();
  const keys = loadKeys().sort(() => Math.random() - 0.5);
  return keys.filter((k) => (cooldownUntil.get(k) || 0) <= now).concat(keys.filter((k) => (cooldownUntil.get(k) || 0) > now));
}

/** System prompt (rules + whole knowledge), the recent transcript, then the new visitor message. */
function buildChatMessages(history, question) {
  const messages = [{ role: 'system', content: brain.buildSystemPrompt() }];
  for (const m of (history || []).slice(-MAX_HISTORY)) {
    if (m.role === 'assistant') messages.push({ role: 'assistant', content: String(m.content).slice(0, 1500) });
    else messages.push({ role: 'user', content: brain.wrapQuestion(String(m.content).slice(0, brain.MAX_QUESTION_CHARS)) });
  }
  messages.push({ role: 'user', content: brain.wrapQuestion(question) });
  return messages;
}

async function callOnce(key, messages) {
  const base = (process.env.TOKENHARBOR_BASE_URL || 'https://tokenharbor.ai/v1').replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.TOKENHARBOR_MODEL || 'deepseek-v4.1-flash:free', messages, temperature: 0.3, max_tokens: 700 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new LlmError('network error: ' + (err && err.message), { retryable: true });
  }
  let data = null;
  try { data = await res.json(); } catch (_) { /* not JSON */ }
  if (res.ok && data && Array.isArray(data.choices) && data.choices[0] && data.choices[0].message) {
    const text = String(data.choices[0].message.content || '').trim();
    if (!text) throw new LlmError('the model returned an empty answer', { retryable: true });
    return { text, usage: data.usage || null };
  }
  const status = res.status;
  if (status === 429) {
    const retryAfter = Number(res.headers && res.headers.get && res.headers.get('retry-after')) || 30;
    cooldownUntil.set(key, Date.now() + retryAfter * 1000);
  }
  if (status === 401 || status === 402 || status === 403) cooldownUntil.set(key, Date.now() + 10 * 60 * 1000);
  const detail = (data && data.error && (data.error.message || data.error)) || 'HTTP ' + status;
  throw new LlmError(String(detail).slice(0, 200), {
    status,
    retryable: status === 429 || status >= 500,
    keyProblem: status === 401 || status === 402 || status === 403,
  });
}

/** Asks the model. Tries up to two keys when one is rate limited, out of balance or down. */
async function complete(messages) {
  const keys = pickOrder();
  if (!keys.length) throw new LlmError('no Token Harbor API keys configured');
  let lastError;
  for (const key of keys.slice(0, 2)) {
    try {
      return await callOnce(key, messages);
    } catch (err) {
      lastError = err;
      if (!(err instanceof LlmError) || !(err.retryable || err.keyProblem)) throw err;
    }
  }
  throw lastError;
}

module.exports = { isConfigured, complete, buildChatMessages, LlmError };
