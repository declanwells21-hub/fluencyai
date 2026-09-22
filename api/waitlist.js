// api/waitlist.js
//
// Public, unauthenticated endpoint for the "Join the waitlist" section on
// the marketing site (site/index.html #waitlist, site/app.js
// spawnWaitlistForm()).
//
//   POST /api/waitlist  { email, source }
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

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  const { error: insertErr } = await supabase.from('waitlist_signups').insert({
    email,
    source,
    referrer: req.headers.referer || null,
    country: req.headers['x-vercel-ip-country'] || null,
  });

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
