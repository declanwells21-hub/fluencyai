// api/referral.js
//
// Public, unauthenticated endpoint used by two things on the marketing
// site (site/app.js and site/creators.html):
//
//   POST /api/referral  { type: "click", code }
//     Fired once, quietly, when someone lands on the site with a ?ref=CODE
//     in the URL - see spawnReferralCapture() in app.js. Silently no-ops
//     on an unknown/paused code instead of erroring, so this can never be
//     used to enumerate which codes are valid.
//
//   POST /api/referral  { type: "apply", name, email, platform, handle, ... }
//     The "Apply to join" form on site/creators.html. Writes to
//     creator_applications for an admin to review - see api/admin/router.js
//     (routes "applications" and "application-decide").
//
// Kept in its own file (not folded into api/admin/router.js) because that
// router requires an admin-authenticated caller for every route - this one
// is deliberately the opposite, open to any visitor, so it needs its own
// separate auth story (none, by design - just input validation).
//
// Uses the service-role key, same as api/admin/router.js: creators,
// creator_applications, and referral_events all have RLS enabled with zero
// public policies, so an anonymous visitor has no other way to reach them.

const { createClient } = require('@supabase/supabase-js');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// Codes are chosen by admins (or auto-generated on approval) and only ever
// need to be URL- and eye-friendly - reject anything else up front.
const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body || {};

  try {
    if (body.type === 'click') {
      return handleClick(req, res, body);
    }
    if (body.type === 'apply') {
      return handleApply(req, res, body);
    }
    return res.status(400).json({ error: 'body.type must be "click" or "apply"' });
  } catch (err) {
    console.error('api/referral: unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
};

async function handleClick(req, res, body) {
  const code = String(body.code || '').trim();
  // Always 200 here, even on a garbage/unknown code - the caller is a
  // background beacon from public JS, not something a visitor should ever
  // see fail, and a distinct error response would let someone probe for
  // which codes exist.
  if (!CODE_RE.test(code)) {
    return res.status(200).json({ ok: true });
  }

  const supabase = getServiceClient();
  const { data: creator } = await supabase
    .from('creators')
    .select('id, status')
    .eq('code', code)
    .maybeSingle();

  if (!creator || creator.status !== 'active') {
    return res.status(200).json({ ok: true });
  }

  const { error } = await supabase.from('referral_events').insert({
    creator_id: creator.id,
    code,
    event_type: 'click',
    meta: {
      referrer: req.headers.referer || null,
      country: req.headers['x-vercel-ip-country'] || null,
      user_agent: req.headers['user-agent'] || null,
    },
  });
  if (error) console.error('api/referral (click): insert failed:', error.message);

  return res.status(200).json({ ok: true });
}

async function handleApply(req, res, body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const platform = String(body.platform || '').trim();
  const handle = String(body.handle || '').trim();
  const niche = String(body.niche || '').trim() || null;
  const followerCount = String(body.followerCount || '').trim() || null;
  const portfolioUrl = String(body.portfolioUrl || '').trim() || null;
  const message = String(body.message || '').trim() || null;

  if (!name || !email || !platform || !handle) {
    return res.status(400).json({ error: 'name, email, platform, and handle are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'That email address doesn\'t look right' });
  }

  const supabase = getServiceClient();
  const { error } = await supabase.from('creator_applications').insert({
    name,
    email,
    platform,
    handle,
    niche,
    follower_count: followerCount,
    portfolio_url: portfolioUrl,
    message,
  });

  if (error) {
    console.error('api/referral (apply): insert failed:', error.message);
    return res.status(500).json({ error: 'Could not submit your application right now - please try again shortly.' });
  }

  return res.status(200).json({ ok: true });
}
