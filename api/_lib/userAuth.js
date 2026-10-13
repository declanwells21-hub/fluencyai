// api/_lib/userAuth.js
//
// Works out who is calling an endpoint from the "Authorization: Bearer <access token>" header that a
// signed-in Fluency AI account (website or app) holds. Never trust a user id sent in a request body:
// always take it from here.
//
// The check asks Supabase to validate the token. A successful check is remembered in memory for a short
// time so a busy conversation does not pay for it on every request. The cache lives only inside one running
// function instance, so a signed-out or revoked session stops working within CACHE_MS at most.

const crypto = require('crypto');
const { getServiceClient } = require('./supabase');

const CACHE_MS = 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map(); // sha256(token) -> { user, until }

function bearerToken(req) {
  const header = (req.headers && req.headers.authorization) || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Returns { ok: true, user } for a valid session, or
 * { ok: false, status, error, reason } where reason is 'missing' | 'invalid' | 'unavailable'.
 */
async function getUserFromRequest(req) {
  const token = bearerToken(req);
  if (!token) return { ok: false, status: 401, error: 'Missing Authorization header', reason: 'missing' };

  const key = crypto.createHash('sha256').update(token).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return { ok: true, user: hit.user };

  try {
    const { data, error } = await getServiceClient().auth.getUser(token);
    if (error || !data || !data.user) {
      // 5xx or no status at all means Supabase itself had a problem, not that the token is bad.
      if (error && (error.status === undefined || error.status >= 500)) {
        return { ok: false, status: 503, error: 'Sign-in check is unavailable right now', reason: 'unavailable' };
      }
      return { ok: false, status: 401, error: 'Invalid or expired session', reason: 'invalid' };
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { user: data.user, until: Date.now() + CACHE_MS });
    return { ok: true, user: data.user };
  } catch (err) {
    console.error('userAuth: unexpected error:', err.message);
    return { ok: false, status: 503, error: 'Sign-in check is unavailable right now', reason: 'unavailable' };
  }
}

module.exports = { getUserFromRequest, bearerToken };
