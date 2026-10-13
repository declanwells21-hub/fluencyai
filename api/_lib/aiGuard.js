// api/_lib/aiGuard.js
//
// Gate in front of the endpoints that cost real money per call: /api/chat (Claude), /api/stt and /api/tts.
//
//   REQUIRE_AUTH_AI=true   only signed-in Fluency AI accounts may call them (401 otherwise).
//                          Leave it unset until the app sends its login token with every request.
//   AI_RATE_LIMIT=off      switch the per-minute limits off (they are on by default).
//
// Limits are per minute. A signed-in caller is counted by account, anyone else by IP address.
// Defaults can be changed without a code change, for example AI_RATE_CHAT_PER_MIN_USER=60
// (routes: CHAT, STT, TTS; kinds: USER, IP).

const { getUserFromRequest } = require('./userAuth');
const { hit, getClientIp } = require('./rateLimit');

const DEFAULTS = {
  chat: { user: 40, ip: 30 },
  stt: { user: 30, ip: 20 },
  tts: { user: 120, ip: 60 },
};

function limitFor(route, kind) {
  const raw = Number(process.env[`AI_RATE_${route.toUpperCase()}_PER_MIN_${kind.toUpperCase()}`]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULTS[route][kind];
}

/**
 * Call at the top of a handler, after the method checks:
 *     if (!(await guardAiRequest(req, res, 'chat'))) return;
 * Returns true when the request may go on. Returns false after it has already sent the 401 / 429 / 503.
 */
async function guardAiRequest(req, res, route) {
  const requireAuth = String(process.env.REQUIRE_AUTH_AI || '').toLowerCase() === 'true';
  const hasToken = /^Bearer\s+\S/.test((req.headers && req.headers.authorization) || '');

  let user = null;
  if (requireAuth || hasToken) {
    const auth = await getUserFromRequest(req);
    if (auth.ok) {
      user = auth.user;
    } else if (requireAuth) {
      if (auth.status === 503) {
        return deny(res, 503, { error: 'We cannot check your sign-in right now. Please try again in a moment.', code: 'auth_unavailable' });
      }
      return deny(res, 401, { error: 'Please sign in to use this feature.', code: 'auth_required' });
    }
    // Flag off and the token did not check out: treat the caller like any anonymous visitor.
  }

  if (String(process.env.AI_RATE_LIMIT || '').toLowerCase() === 'off') return true;

  const kind = user ? 'user' : 'ip';
  const who = user ? user.id : getClientIp(req);
  const result = await hit(`ai:${route}:${kind}:${who}`, { windowSeconds: 60, max: limitFor(route, kind) });
  if (!result.allowed) {
    const retryAfter = Math.max(1, result.retryAfter || 60);
    res.setHeader('Retry-After', String(retryAfter));
    return deny(res, 429, {
      error: `You are going a little fast. Please try again in ${retryAfter} seconds.`,
      code: 'rate_limited',
      retryAfterSeconds: retryAfter,
    });
  }

  if (user) req.flUser = user; // available to the handler (credits and usage will use this later)
  return true;
}

function deny(res, status, body) {
  res.status(status).json(body);
  return false;
}

module.exports = { guardAiRequest, DEFAULTS };
