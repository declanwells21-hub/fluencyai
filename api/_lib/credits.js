// api/_lib/credits.js
//
// Credits for the AI endpoints (/api/chat, /api/stt, /api/tts). The ledger lives in Postgres
// (scripts/supabase_migration_credits.sql); this file decides what a call costs and when to check or charge.
//
//   CREDITS_MODE=off      (default) nothing is recorded, nobody is charged or blocked.
//   CREDITS_MODE=shadow   every signed-in call is recorded with what it WOULD cost. Nobody is charged or blocked.
//                         Use this first, to measure real usage and tune the prices below.
//   CREDITS_MODE=enforce  signed-in calls are charged; a person with too few credits gets a 402.
//                         Calls without a sign-in are refused (401), because credits belong to an account.
//
// Do NOT switch to enforce until (a) the app sends the login token with every AI request and (b) the billing
// webhook grants the monthly allowance with fl_credit_set_monthly. Until then subscribers would have 0 credits.
//
// How a call is handled (see api/chat.js, stt.js, tts.js):
//   1. checkAllowance()  before the paid provider is called: enforce mode refuses with 402 when the balance is too low.
//   2. the provider call runs
//   3. recordUsage()     only if it succeeded: a failed call costs nothing. Never throws.
//
// Prices. The Pricing page promises "about 7 hours of conversation" for 3,000 credits, which is roughly 7 credits
// per minute. A spoken turn is about 25 seconds and uses all three endpoints (listen, think, speak), so the
// defaults add up to about 3 credits per spoken turn. Every number can be changed with an environment variable
// without a code change; tune them from the real numbers in the admin "Credit usage" panel.

const { getServiceClient } = require('./supabase');

const CHAT_COSTS = { converse: 1, hint: 1, pronunciation: 1, translate: 1, grammar: 2, scenario: 3, analyze: 4, plan: 10 };
const STT_SECONDS_PER_CREDIT = 10;  // 1 credit for every started 10 seconds of audio
const TTS_CHARS_PER_CREDIT = 250;   // 1 credit for every started 250 characters of speech

function envInt(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function getMode() {
  const raw = String(process.env.CREDITS_MODE || 'off').toLowerCase().trim();
  if (raw === 'shadow' || raw === 'enforce') return raw;
  if (raw !== 'off' && raw !== '') console.error(`credits: unknown CREDITS_MODE "${raw}", treating it as "off"`);
  return 'off';
}

/** Duration of a WAV recording in whole seconds. Falls back to 16 kHz mono 16-bit when the header is not readable. */
function wavSeconds(buf) {
  if (!buf || !buf.length) return 0;
  let byteRate = 32000;
  if (buf.length >= 44 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
    const rate = buf.readUInt32LE(28);
    if (rate > 0) byteRate = rate;
  }
  return Math.max(0, Math.round((buf.length - 44) / byteRate));
}

/** Cost in credits of one call. units: { mode } for chat, { audioSeconds } for stt, { chars } for tts. Always at least 1. */
function costFor(route, units = {}) {
  if (route === 'chat') {
    const mode = String(units.mode || 'converse');
    const base = CHAT_COSTS[mode] !== undefined ? CHAT_COSTS[mode] : CHAT_COSTS.converse;
    return envInt(`CREDIT_COST_CHAT_${mode.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`, base);
  }
  if (route === 'stt') {
    const per = envInt('CREDIT_STT_SECONDS_PER_CREDIT', STT_SECONDS_PER_CREDIT);
    return Math.max(1, Math.ceil((Number(units.audioSeconds) || 0) / per));
  }
  if (route === 'tts') {
    const per = envInt('CREDIT_TTS_CHARS_PER_CREDIT', TTS_CHARS_PER_CREDIT);
    return Math.max(1, Math.ceil((Number(units.chars) || 0) / per));
  }
  return 1;
}

/**
 * Before the paid call. Returns true when the call may go ahead.
 * Returns false after sending a 402 (enforce mode, not enough credits).
 * If the credits database cannot be reached the call is allowed and the problem is logged,
 * the same way the rate limiter behaves: a broken meter should not take the product down.
 */
async function checkAllowance(req, res, route, units) {
  if (getMode() !== 'enforce' || !req.flUser) return true;
  const needed = costFor(route, units);
  try {
    const { data, error } = await getServiceClient().rpc('fl_credit_get', { p_user: req.flUser.id });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    const total = row ? Number(row.total) || 0 : 0;
    if (total >= needed) return true;
    res.status(402).json({
      error: total > 0
        ? 'You do not have enough credits for this. Add a top-up to keep going.'
        : 'You have used all your credits. Add a top-up or wait for your next monthly credits.',
      code: 'insufficient_credits',
      credits: total,
      needed,
    });
    return false;
  } catch (err) {
    console.error('credits: allowing the call because the balance could not be read:', err.message);
    return true;
  }
}

/**
 * After a successful call. units: the same as costFor plus { inputTokens, outputTokens } for chat.
 * Never throws. Does nothing for anonymous calls or when CREDITS_MODE is off.
 */
async function recordUsage(req, route, units = {}) {
  const mode = getMode();
  if (mode === 'off' || !req.flUser) return null;
  try {
    const { data, error } = await getServiceClient().rpc('fl_credit_charge', {
      p_user: req.flUser.id,
      p_cost: costFor(route, units),
      p_route: route,
      p_mode: route === 'chat' ? String(units.mode || 'converse').slice(0, 40) : null,
      p_input_tokens: Number.isFinite(units.inputTokens) ? Math.floor(units.inputTokens) : null,
      p_output_tokens: Number.isFinite(units.outputTokens) ? Math.floor(units.outputTokens) : null,
      p_audio_seconds: Number.isFinite(units.audioSeconds) ? Math.floor(units.audioSeconds) : null,
      p_chars: Number.isFinite(units.chars) ? Math.floor(units.chars) : null,
      p_shadow: mode === 'shadow',
    });
    if (error) throw new Error(error.message);
    return Array.isArray(data) ? data[0] : data;
  } catch (err) {
    console.error('credits: could not record usage:', err.message);
    return null;
  }
}

module.exports = { getMode, costFor, wavSeconds, checkAllowance, recordUsage, CHAT_COSTS };
