// api/_lib/waitlistUnsub.js
//
// "Unsubscribe at any time" for waitlist emails. Each email carries a link
//   https://fluencyai.app/api/waitlist?unsubscribe=<email>&t=<token>
// where the token is a keyed hash of the address, so nobody can unsubscribe someone else by guessing.
// The key is UNSUBSCRIBE_SECRET, or (so nothing new has to be set) the Supabase service key, which never leaves the server.
// Changing the key invalidates links already sent, so set UNSUBSCRIBE_SECRET once and keep it.

const crypto = require('crypto');

function secret() { return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''; }

function token(email) {
  return crypto.createHmac('sha256', secret()).update('unsub:' + String(email).trim().toLowerCase()).digest('hex').slice(0, 40);
}

function verify(email, given) {
  if (!secret() || !email || !given) return false;
  const a = Buffer.from(token(email)), b = Buffer.from(String(given));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The personal unsubscribe link for one address, or null when there is no key to sign it with. */
function unsubscribeUrl(email) {
  if (!secret() || !email) return null;
  const base = (process.env.SITE_URL || 'https://fluencyai.app').replace(/\/$/, '');
  return `${base}/api/waitlist?unsubscribe=${encodeURIComponent(String(email).trim().toLowerCase())}&t=${token(email)}`;
}

module.exports = { token, verify, unsubscribeUrl };
