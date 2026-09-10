// api/admin/router.js
//
// Handles /api/admin/stats, /api/admin/users, /api/admin/set-role, and
// /api/admin/grant-access - all in ONE serverless function instead of four
// separate files.
//
// Why one file: Vercel's free Hobby plan caps a deployment at 12
// serverless functions total. Between the original 8 (chat, stt, tts,
// tatoeba x3, create-checkout-session, stripe-webhook) and 4 separate admin
// files + track-activity.js, that was 13 - one over the limit.
//
// Why "router.js" and not "[...path].js": bracket-based catch-all
// filenames ([...path].js) are a Next.js-specific routing convention, not
// a general Vercel platform feature - since this project has no framework
// (plain static site + serverless functions), Vercel doesn't parse the
// brackets as a dynamic segment at all. It found this out the hard way: a
// [...path].js version deployed fine and ran without crashing, but the
// literal text "...path" leaked into the query string instead of Vercel
// populating a clean "path" key, so every request 404'd with "Unknown
// admin route: undefined" no matter what URL hit it.
//
// The fix is the rewrite rule in vercel.json:
//   { "source": "/api/admin/:path*", "destination": "/api/admin/router?path=:path*" }
// Rewrites are a core platform feature independent of framework detection,
// so this works the same way any static/"Other" project.
//
// This file replaces (delete these from your repo, if not already gone):
//   api/admin/[...path].js
//   api/admin/stats.js / users.js / set-role.js / grant-access.js (older still)
//
// site/admin/admin.js needs NO changes - it still calls the exact same
// URLs (/api/admin/stats etc.), the rewrite handles the redirection.

const { requireAdmin } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path];
    const route = segments[0];

    if (route === 'stats' && req.method === 'GET') {
      return handleStats(auth, res);
    }
    if (route === 'users' && req.method === 'GET') {
      return handleUsers(auth, req, res);
    }
    if (route === 'set-role' && req.method === 'POST') {
      return handleSetRole(auth, req, res);
    }
    if (route === 'grant-access' && req.method === 'POST') {
      return handleGrantAccess(auth, req, res);
    }
    if (route === 'suspend-user' && req.method === 'POST') {
      return handleSuspendUser(auth, req, res);
    }
    if (route === 'delete-user' && req.method === 'POST') {
      return handleDeleteUser(auth, req, res);
    }
    if (route === 'send-email' && req.method === 'POST') {
      return handleSendEmail(auth, req, res);
    }
    if (route === 'creators' && req.method === 'GET') {
      return handleCreators(auth, res);
    }
    if (route === 'creator-create' && req.method === 'POST') {
      return handleCreatorCreate(auth, req, res);
    }
    if (route === 'creator-update' && req.method === 'POST') {
      return handleCreatorUpdate(auth, req, res);
    }
    if (route === 'applications' && req.method === 'GET') {
      return handleApplications(auth, req, res);
    }
    if (route === 'application-decide' && req.method === 'POST') {
      return handleApplicationDecide(auth, req, res);
    }

    return res.status(404).json({ error: 'Unknown admin route: ' + route });
  } catch (err) {
    console.error('api/admin: unexpected error:', err);
    return res.status(500).json({ error: err.message || 'Unexpected server error' });
  }
};

async function handleStats(auth, res) {
  const { data, error } = await auth.supabase.rpc('admin_get_stats');
  if (error) {
    console.error('admin/stats: admin_get_stats failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json(data);
}

async function handleUsers(auth, req, res) {
  const search = (req.query.search || '').trim();
  const filter = req.query.filter || 'all';
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
  const offset = (page - 1) * pageSize;

  const { data, error } = await auth.supabase.rpc('admin_list_users', {
    p_search: search || null,
    p_filter: filter,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) {
    console.error('admin/users: admin_list_users failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  const totalCount = data && data.length > 0 ? Number(data[0].total_count) : 0;
  const users = (data || []).map((row) => {
    const { total_count, ...rest } = row;
    return rest;
  });

  res.status(200).json({
    users,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  });
}

async function handleSetRole(auth, req, res) {
  const { userId, role } = req.body || {};
  if (!userId || !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Body must include userId and role ("admin" or "user")' });
  }

  if (role === 'user') {
    const { count, error: countErr } = await auth.supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (countErr) return res.status(500).json({ error: countErr.message });
    if ((count || 0) <= 1) {
      return res.status(400).json({ error: "Can't demote the last remaining admin." });
    }
  }

  const { error } = await auth.supabase.from('profiles').upsert({ id: userId, role }, { onConflict: 'id' });
  if (error) {
    console.error('admin/set-role: upsert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, userId, role });
}

async function handleGrantAccess(auth, req, res) {
  const ALLOWED_STATUSES = ['active', 'free', 'canceled'];
  const { userId, status, periodEndDays } = req.body || {};
  if (!userId || !ALLOWED_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `Body must include userId and status (one of: ${ALLOWED_STATUSES.join(', ')})`,
    });
  }

  let periodEnd = null;
  if (status === 'active') {
    const days = Number.isFinite(periodEndDays) && periodEndDays > 0 ? periodEndDays : 365;
    periodEnd = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const { error } = await auth.supabase
    .from('profiles')
    .upsert({ id: userId, subscription_status: status, subscription_period_end: periodEnd }, { onConflict: 'id' });

  if (error) {
    console.error('admin/grant-access: upsert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, userId, status, periodEnd });
}

// ---------- Suspend / unsuspend ----------
//
// Uses Supabase Auth's own ban mechanism (ban_duration) - this blocks
// login/token refresh without touching any of the user's data, and is
// fully reversible. Nothing to do with the database directly.

async function handleSuspendUser(auth, req, res) {
  const { userId, suspend, durationHours } = req.body || {};
  if (!userId || typeof suspend !== 'boolean') {
    return res.status(400).json({ error: 'Body must include userId and suspend (true or false)' });
  }
  if (userId === auth.user.id) {
    return res.status(400).json({ error: "Can't suspend your own account." });
  }

  // "876000h" is 100 years - GoTrue's ban_duration has no literal
  // "forever" option, so an effectively-permanent suspension just uses a
  // very long duration. 'none' lifts a ban immediately.
  const banDuration = suspend
    ? Number.isFinite(durationHours) && durationHours > 0
      ? `${durationHours}h`
      : '876000h'
    : 'none';

  const { error } = await auth.supabase.auth.admin.updateUserById(userId, { ban_duration: banDuration });
  if (error) {
    console.error('admin/suspend-user failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, userId, suspended: suspend });
}

// ---------- Delete ----------
//
// profiles.id and plan_items.user_id both have "on delete cascade" back to
// auth.users, so deleting the auth user is genuinely all that's needed -
// their profile and plan data disappear automatically. This is permanent
// and cannot be undone.

async function handleDeleteUser(auth, req, res) {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'Body must include userId' });
  }
  if (userId === auth.user.id) {
    return res.status(400).json({ error: "Can't delete your own account from here." });
  }

  const { error } = await auth.supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error('admin/delete-user failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, userId });
}

// ---------- Communication center ----------
//
// Supabase Auth only ever sends its own fixed set of emails (confirm
// signup, reset password, etc.) - there's no built-in way to send
// arbitrary custom content to a chosen set of users, so this calls Brevo's
// transactional email API directly instead. Requires BREVO_API_KEY and
// EMAIL_FROM_ADDRESS as Vercel environment variables (the from address
// must be a verified sender in your Brevo account).
//
// Sends one API call per recipient (not one call with everyone in the "to"
// list, which would let recipients see each other's addresses), fired
// concurrently to fit inside a single serverless function's time limit.
// Fine for the user counts an early-stage app has; if this ever needs to
// scale to thousands of recipients, that's a queue/background-job
// redesign, not a tweak to this function.

async function handleSendEmail(auth, req, res) {
  const { audience, specificEmail, subject, message } = req.body || {};
  if (!subject || !message) {
    return res.status(400).json({ error: 'Body must include subject and message' });
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS;
  const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Fluency AI';

  if (!BREVO_API_KEY || !FROM_EMAIL) {
    return res.status(500).json({
      error: 'Email sending is not configured (missing BREVO_API_KEY or EMAIL_FROM_ADDRESS env vars).',
    });
  }

  let recipients = [];
  if (audience === 'specific') {
    if (!specificEmail) {
      return res.status(400).json({ error: 'specificEmail is required when audience is "specific"' });
    }
    recipients = [{ email: specificEmail }];
  } else {
    const filter = ['all', 'subscribed', 'free', 'suspended'].includes(audience) ? audience : 'all';
    const { data, error } = await auth.supabase.rpc('admin_list_users', {
      p_search: null,
      p_filter: filter,
      p_limit: 5000,
      p_offset: 0,
    });
    if (error) {
      console.error('admin/send-email: admin_list_users failed:', error.message);
      return res.status(500).json({ error: error.message });
    }
    recipients = (data || []).map((row) => ({ email: row.email }));
  }

  if (recipients.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, failed: 0, total: 0 });
  }

  const htmlContent = buildEmailHtml(subject, message);

  const results = await Promise.allSettled(
    recipients.map((r) =>
      fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: FROM_NAME, email: FROM_EMAIL },
          to: [{ email: r.email }],
          subject,
          htmlContent,
        }),
      }).then((brevoRes) => {
        if (!brevoRes.ok) throw new Error('Brevo responded with ' + brevoRes.status);
        return brevoRes.json();
      })
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - sent;

  res.status(200).json({ ok: true, sent, failed, total: recipients.length });
}

// ---------- Fluency Creator Program ----------
//
// creators / creator_applications / referral_events all live behind RLS
// with zero public policies (see scripts/supabase_migration_creators.sql)
// - auth.supabase here is the service-role client from requireAdmin(),
// same as every other handler in this file, so it bypasses that RLS same
// as everything else.

async function handleCreators(auth, res) {
  const { data, error } = await auth.supabase.rpc('admin_get_creator_stats');
  if (error) {
    console.error('admin/creators: admin_get_creator_stats failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json({ creators: data });
}

// Codes are short, URL-safe, and unique - used directly in referral links
// as https://fluencyai.app/?ref=CODE. If the caller doesn't supply one,
// one is generated from the creator's name plus a random suffix, retrying
// on the rare collision.
function slugifyCode(name) {
  const base = String(name || 'creator')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
    .slice(0, 12) || 'CREATOR';
  return base;
}

async function generateUniqueCode(supabase, name) {
  const base = slugifyCode(name);
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = Math.floor(100 + Math.random() * 900); // 3 digits
    const candidate = attempt === 0 ? base : `${base}${suffix}`;
    const { data } = await supabase.from('creators').select('id').eq('code', candidate).maybeSingle();
    if (!data) return candidate;
  }
  // Astronomically unlikely to be reached, but never loop forever.
  return `${base}${Date.now().toString().slice(-6)}`;
}

async function handleCreatorCreate(auth, req, res) {
  const { name, code, niche, contactEmail, commissionRate, notes } = req.body || {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Body must include name' });
  }

  let finalCode = code && String(code).trim().toUpperCase();
  if (finalCode) {
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(finalCode)) {
      return res.status(400).json({ error: 'code must be 3-32 letters, numbers, - or _' });
    }
    const { data: existing } = await auth.supabase.from('creators').select('id').eq('code', finalCode).maybeSingle();
    if (existing) {
      return res.status(400).json({ error: `Code "${finalCode}" is already in use` });
    }
  } else {
    finalCode = await generateUniqueCode(auth.supabase, name);
  }

  const rate = Number.isFinite(commissionRate) ? commissionRate : 0.2;
  if (rate < 0 || rate > 1) {
    return res.status(400).json({ error: 'commissionRate must be between 0 and 1 (e.g. 0.2 for 20%)' });
  }

  const { data, error } = await auth.supabase
    .from('creators')
    .insert({
      name: String(name).trim(),
      code: finalCode,
      niche: niche || null,
      contact_email: contactEmail || null,
      commission_rate: rate,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error('admin/creator-create: insert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, creator: data });
}

async function handleCreatorUpdate(auth, req, res) {
  const { creatorId, status, commissionRate, notes } = req.body || {};
  if (!creatorId) {
    return res.status(400).json({ error: 'Body must include creatorId' });
  }

  const update = {};
  if (status !== undefined) {
    if (!['active', 'paused'].includes(status)) {
      return res.status(400).json({ error: 'status must be "active" or "paused"' });
    }
    update.status = status;
  }
  if (commissionRate !== undefined) {
    const rate = Number(commissionRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      return res.status(400).json({ error: 'commissionRate must be between 0 and 1' });
    }
    update.commission_rate = rate;
  }
  if (notes !== undefined) update.notes = notes;

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Nothing to update - include status, commissionRate, and/or notes' });
  }

  const { error } = await auth.supabase.from('creators').update(update).eq('id', creatorId);
  if (error) {
    console.error('admin/creator-update: update failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, creatorId, update });
}

async function handleApplications(auth, req, res) {
  const status = req.query.status || 'pending';
  let query = auth.supabase
    .from('creator_applications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('admin/applications: select failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
  res.status(200).json({ applications: data });
}

async function handleApplicationDecide(auth, req, res) {
  const { applicationId, decision, commissionRate } = req.body || {};
  if (!applicationId || !['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Body must include applicationId and decision ("approve" or "reject")' });
  }

  const { data: application, error: fetchErr } = await auth.supabase
    .from('creator_applications')
    .select('*')
    .eq('id', applicationId)
    .maybeSingle();
  if (fetchErr) return res.status(500).json({ error: fetchErr.message });
  if (!application) return res.status(404).json({ error: 'Application not found' });
  if (application.status !== 'pending') {
    return res.status(400).json({ error: `Application was already ${application.status}` });
  }

  let createdCreator = null;
  if (decision === 'approve') {
    const code = await generateUniqueCode(auth.supabase, application.name);
    const rate = Number.isFinite(commissionRate) ? commissionRate : 0.2;
    const { data, error: createErr } = await auth.supabase
      .from('creators')
      .insert({
        name: application.name,
        code,
        niche: application.niche,
        contact_email: application.email,
        commission_rate: rate,
        notes: `Approved from application. ${application.platform} - ${application.handle}`,
      })
      .select()
      .single();
    if (createErr) {
      console.error('admin/application-decide: creator insert failed:', createErr.message);
      return res.status(500).json({ error: createErr.message });
    }
    createdCreator = data;
  }

  const { error: updateErr } = await auth.supabase
    .from('creator_applications')
    .update({ status: decision === 'approve' ? 'approved' : 'rejected', decided_at: new Date().toISOString() })
    .eq('id', applicationId);
  if (updateErr) {
    console.error('admin/application-decide: application update failed:', updateErr.message);
    return res.status(500).json({ error: updateErr.message });
  }

  res.status(200).json({ ok: true, applicationId, decision, creator: createdCreator });
}

function buildEmailHtml(subject, message) {
  const paragraphs = String(message)
    .split(/\n\s*\n/)
    .map(
      (para) =>
        `<p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#475569;">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`
    )
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#F6FAFB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6FAFB;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(11,34,51,0.08);">
<tr><td align="center" bgcolor="#0E9A9C" style="background:linear-gradient(135deg,#0E9A9C 0%,#4A459C 100%);padding:36px 24px 28px 24px;">
<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#FFFFFF;">Fluency<span style="color:#8CEECB;font-weight:800;">AI</span></div>
</td></tr>
<tr><td style="padding:36px 36px 8px 36px;">
<h1 style="margin:0 0 18px 0;font-size:19px;font-weight:800;color:#0B2233;letter-spacing:-0.3px;">${escapeHtml(subject)}</h1>
${paragraphs}
</td></tr>
<tr><td style="padding:20px 36px 0 36px;"><div style="height:1px;background-color:#E2E8F0;width:100%;"></div></td></tr>
<tr><td align="center" style="padding:20px 36px 36px 36px;">
<p style="margin:0;font-size:12px;line-height:18px;color:#94A3B8;">Sent by Fluency AI<br>You're receiving this because you have a Fluency AI account.</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
