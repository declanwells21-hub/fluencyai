// api/waitlist.js
//
// Public, unauthenticated endpoint for the "Join the waitlist" section on
// the marketing site (site/index.html #waitlist, site/app.js
// spawnWaitlistForm()).
//
//   POST /api/waitlist  { email, source, language?, state?, ref? }
//     language = the language picked on the Home page, state = the launch state at the time,
//     ref = the partner code the visitor arrived with (a plain code or the stored { code, at } JSON).
//     Saves the email to waitlist_signups (service-role key bypasses RLS -
//     see scripts/supabase_migration_waitlist.sql, same pattern as
//     api/referral.js) and sends the "you're on the list" confirmation
//     email right away via Brevo. If the email is already on the list,
//     this quietly succeeds without sending a second confirmation email.
//
// The later "Fluency AI is live" email is NOT sent from here - it's sent
// in one batch, on purpose, from the admin dashboard when the app
// actually launches. See api/admin/router.js: handleWaitlistNotifyLaunch.

const { createClient } = require('@supabase/supabase-js');
const { sendWaitlistWelcome } = require('./_lib/welcomeEmails');
const { hit, getClientIp } = require('./_lib/rateLimit');
const { verify: verifyUnsub, unsubscribeUrl } = require('./_lib/waitlistUnsub');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

// The Home page sends whatever the browser stored for a partner link: either a plain code or JSON like
// {"code":"ANNA","at":1700000000000}. Returns a clean upper-case code, or null.
function parseRefCode(raw) {
  let value = raw;
  if (typeof value === 'string' && value.trim().startsWith('{')) {
    try { value = JSON.parse(value).code; } catch (e) { value = null; }
  } else if (value && typeof value === 'object') {
    value = value.code;
  }
  value = String(value || '').trim();
  return CODE_RE.test(value) ? value.toUpperCase() : null;
}

function cleanText(value, max) {
  const text = String(value || '').trim().slice(0, max);
  return text || null;
}

// Postgres 42703 / PostgREST PGRST204: a column does not exist yet (the foundation SQL has not been run).
function isMissingColumn(error) {
  return !!error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|could not find the .* column/i.test(error.message || ''));
}

// The "you're on the list" email itself lives in api/_lib/welcomeEmails.js (waitlistWelcome).

// GET /api/waitlist?unsubscribe=<email>&t=<token>  - the link at the bottom of every waitlist email.
async function handleUnsubscribe(req, res) {
  const email = String((req.query && req.query.unsubscribe) || '').trim().toLowerCase();
  const page = (title, text, status = 200) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="margin:0;background:#04121B;color:#D8E4EA;font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;padding:24px"><main style="max-width:420px;text-align:center"><h1 style="color:#fff;font-size:26px;margin:0 0 12px">${title}</h1><p style="line-height:1.6;margin:0 0 20px">${text}</p><a href="https://fluencyai.app/" style="color:#5EE2E6">Back to fluencyai.app</a></main></body></html>`);
  };
  if (!email || !verifyUnsub(email, req.query && req.query.t)) {
    return page('This link did not work', 'The unsubscribe link is incomplete or has expired. Write to support@fluencyai.app and we will remove you.', 400);
  }
  try {
    const supabase = getServiceClient();
    let { error } = await supabase.from('waitlist_signups').update({ unsubscribed_at: new Date().toISOString() }).eq('email', email);
    if (error) {
      // The column is missing (compliance migration not run yet): remove the address instead, which also stops the emails.
      console.error('api/waitlist: unsubscribe column missing, deleting the row instead:', error.message);
      ({ error } = await supabase.from('waitlist_signups').delete().eq('email', email));
      if (error) throw new Error(error.message);
    }
  } catch (err) {
    console.error('api/waitlist: unsubscribe failed:', err.message);
    return page('Something went wrong', 'We could not process that just now. Please try the link again in a few minutes, or write to support@fluencyai.app.', 500);
  }
  return page('You are unsubscribed', 'We will not email this address about the Fluency AI launch any more. If you change your mind, you can join the waitlist again at any time.');
}

module.exports = async (req, res) => {
  if (req.method === 'GET' && req.query && req.query.unsubscribe) return handleUnsubscribe(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};
  const email = String(body.email || '').trim().toLowerCase();
  const source = String(body.source || 'landing_page').trim().slice(0, 64) || 'landing_page';

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "That email address doesn't look right." });
  }

  // Each new address triggers an email, so cap how fast one connection can add addresses.
  const limited = await hit(`waitlist:ip:${getClientIp(req)}`, { windowSeconds: 3600, max: 10 });
  if (!limited.allowed) {
    res.setHeader('Retry-After', String(limited.retryAfter || 3600));
    return res.status(429).json({ error: 'Too many sign-ups from this connection. Please try again later.' });
  }

  let supabase;
  try {
    supabase = getServiceClient();
  } catch (err) {
    console.error('api/waitlist: config error:', err.message);
    return res.status(500).json({ error: 'Server is misconfigured. Please try again later.' });
  }

  const { data: existing, error: lookupErr } = await supabase
    .from('waitlist_signups')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (lookupErr) {
    console.error('api/waitlist: lookup failed:', lookupErr.message);
    return res.status(500).json({ error: 'Could not join the waitlist right now - please try again shortly.' });
  }

  if (existing) {
    // Joining again is a fresh request for launch news: lift an earlier unsubscribe (ignored if the column is not there yet).
    await supabase.from('waitlist_signups').update({ unsubscribed_at: null }).eq('email', email);
    return res.status(200).json({ ok: true, alreadyJoined: true });
  }

  const row = {
    email,
    source,
    referrer: req.headers.referer || null,
    country: req.headers['x-vercel-ip-country'] || null,
  };
  const extras = {
    language: cleanText(body.language, 40),
    launch_state: cleanText(body.state, 32),
    ref_code: parseRefCode(body.ref),
  };

  let { error: insertErr } = await supabase.from('waitlist_signups').insert({ ...row, ...extras });
  if (isMissingColumn(insertErr)) {
    // The new columns are not in the database yet: still save the sign-up, without them.
    console.error('api/waitlist: new columns missing, saving without them. Run scripts/supabase_migration_backend_foundation.sql');
    ({ error: insertErr } = await supabase.from('waitlist_signups').insert(row));
  }

  if (insertErr) {
    if (insertErr.code === '23505') {
      // Someone else's request won a race between our lookup and our
      // insert - treat it exactly like "already on the list".
      return res.status(200).json({ ok: true, alreadyJoined: true });
    }
    console.error('api/waitlist: insert failed:', insertErr.message);
    return res.status(500).json({ error: 'Could not join the waitlist right now - please try again shortly.' });
  }

  try {
    await sendWaitlistWelcome({ to: email, unsubscribeUrl: unsubscribeUrl(email) });
    await supabase
      .from('waitlist_signups')
      .update({ confirmation_sent_at: new Date().toISOString() })
      .eq('email', email);
  } catch (err) {
    // The signup itself already succeeded - a failed confirmation email
    // shouldn't fail the whole request. Logged so it can be investigated
    // (most likely cause: BREVO_API_KEY / EMAIL_FROM_ADDRESS not set yet).
    console.error('api/waitlist: confirmation email failed:', err.message);
  }

  return res.status(200).json({ ok: true, alreadyJoined: false });
};
