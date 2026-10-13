// api/_lib/rateLimit.js
//
// Counts hits per key inside a fixed time window, in Postgres (see fl_rate_limit_hit in
// scripts/supabase_migration_backend_foundation.sql), so the count is shared by every serverless
// instance. If the counter cannot be reached the request is allowed and the problem is logged:
// a broken limiter should never take the product down.

const { getServiceClient } = require('./supabase');

/** Best guess at the caller's IP address on Vercel. */
function getClientIp(req) {
  const h = req.headers || {};
  const forwarded = String(h['x-vercel-forwarded-for'] || h['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || h['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * hit('ai:chat:ip:1.2.3.4', { windowSeconds: 60, max: 30 })
 *   -> { allowed, count, retryAfter }   (failedOpen: true when the limiter itself was unavailable)
 */
async function hit(key, { windowSeconds, max }) {
  try {
    const { data, error } = await getServiceClient().rpc('fl_rate_limit_hit', {
      p_key: key,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('empty response from fl_rate_limit_hit');
    return { allowed: !!row.allowed, count: row.current_count, retryAfter: row.retry_after || windowSeconds };
  } catch (err) {
    console.error('rateLimit: allowing the request because the limiter failed:', err.message);
    return { allowed: true, count: 0, retryAfter: 0, failedOpen: true };
  }
}

module.exports = { hit, getClientIp };
