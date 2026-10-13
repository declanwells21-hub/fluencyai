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
const { sendBrandedEmail } = require('./_lib/emailTemplate');
const { hit, getClientIp } = require('./_lib/rateLimit');

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

const CONFIRMATION_SUBJECT = "You're on the Fluency AI waitlist";

const CONFIRMATION_BODY = `Thanks for joining the Fluency AI waitlist.

You'll be one of the first to know the moment Fluency AI is available to download on iOS and Android - before we announce it anywhere else.

What to expect next:

- One email, right when we launch, with direct links to download the app.
- No spam in between. This list is only ever used for that one announcement.
- You can start speaking right now if you don't want to wait: create a free account at fluencyai.app and try it in your browser.

Thanks for your patience while we get this right.

\u2014 The Fluency AI team`;

module.exports = async (req, res) => {
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
    await sendBrandedEmail({ to: email, subject: CONFIRMATION_SUBJECT, textBody: CONFIRMATION_BODY });
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
