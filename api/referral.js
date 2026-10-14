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
const { hit, getClientIp } = require('./_lib/rateLimit');

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
    if (body.type === 'partner_interest') {
      return handlePartnerInterest(req, res, body);
    }
    return res.status(400).json({ error: 'body.type must be "click", "apply" or "partner_interest"' });
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

  // Beacons are public, so cap them per connection. Over the cap is still answered 200 (same reason as above).
  const limited = await hit(`referral_click:ip:${getClientIp(req)}`, { windowSeconds: 3600, max: 120 });
  if (!limited.allowed) return res.status(200).json({ ok: true });

  const supabase = getServiceClient();
  // Codes are matched ignoring case (the site sends them upper-case). "_" is a wildcard in ILIKE, so escape it.
  const { data: creator } = await supabase
    .from('creators')
    .select('id, code, status')
    .ilike('code', code.replace(/_/g, '\\_'))
    .maybeSingle();

  if (!creator || creator.status !== 'active') {
    return res.status(200).json({ ok: true });
  }

  const { error } = await supabase.from('referral_events').insert({
    creator_id: creator.id,
    code: creator.code,
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

// Public forms are limited per connection so they cannot be used to flood the database.
async function tooManyRequests(req, res, name, max) {
  const limited = await hit(`${name}:ip:${getClientIp(req)}`, { windowSeconds: 3600, max });
  if (limited.allowed) return false;
  res.setHeader('Retry-After', String(limited.retryAfter || 3600));
  res.status(429).json({ error: 'Too many requests from this connection. Please try again later.' });
  return true;
}

// The partner pop-up on the Home page: just an email from someone who wants to hear about the programme.
async function handlePartnerInterest(req, res, body) {
  const email = String(body.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'That email address doesn\'t look right' });
  }
  if (await tooManyRequests(req, res, 'partner_interest', 10)) return;

  let refCode = String(body.ref || '').trim();
  if (refCode.startsWith('{')) { try { refCode = String(JSON.parse(refCode).code || ''); } catch (e) { refCode = ''; } }
  refCode = CODE_RE.test(refCode) ? refCode.toUpperCase() : null;

  const supabase = getServiceClient();
  const { error } = await supabase.from('partner_interest').upsert(
    {
      email,
      source: String(body.source || 'home_partner_popup').trim().slice(0, 64),
      ref_code: refCode,
      referrer: req.headers.referer || null,
      country: req.headers['x-vercel-ip-country'] || null,
    },
    { onConflict: 'email', ignoreDuplicates: true }
  );
  if (error) {
    console.error('api/referral (partner_interest): insert failed:', error.message);
    return res.status(500).json({ error: 'Could not save that right now - please try again shortly.' });
  }
  return res.status(200).json({ ok: true });
}

async function handleApply(req, res, body) {
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const platform = String(body.platform || '').trim();
  const handle = String(body.handle || '').trim();
  const country = String(body.country || '').trim();
  const niche = String(body.niche || '').trim() || null;
  const followerCount = String(body.followerCount || '').trim() || null;
  const portfolioUrl = String(body.portfolioUrl || '').trim() || null;
  const message = String(body.message || '').trim() || null;

  if (!name || !email || !platform || !handle || !country) {
    return res.status(400).json({ error: 'name, email, platform, handle, and country are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'That email address doesn\'t look right' });
  }
  if (await tooManyRequests(req, res, 'partner_apply', 10)) return;

  const supabase = getServiceClient();
  const { error } = await supabase.from('creator_applications').insert({
    name,
    email,
    platform,
    handle,
    country,
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
