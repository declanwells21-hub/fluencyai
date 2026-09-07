// api/_lib/adminAuth.js
//
// Shared by every api/admin/*.js endpoint. Files starting with "_" are not
// turned into their own Vercel Functions, so this is safe to import without
// creating a stray /api/_lib/adminAuth route.
//
// Never trust a client's claim that it's an admin - always re-derive the
// user from their access token server-side, then look up their role with
// the service-role key (which bypasses RLS) before allowing anything.

const { createClient } = require('@supabase/supabase-js');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Verifies the request's Authorization: Bearer <token> belongs to a
 * signed-in user whose profiles.role is 'admin'.
 *
 * Returns { ok: true, user, supabase } on success, or
 * { ok: false, status, error } on failure - callers should respond with
 * that status/error directly and stop.
 */
async function requireAdmin(req) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return { ok: false, status: 401, error: 'Missing Authorization header' };
    }

    const supabase = getServiceClient();

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData || !userData.user) {
      return { ok: false, status: 401, error: 'Invalid or expired session' };
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (profileErr) {
      return { ok: false, status: 500, error: profileErr.message };
    }
    if (!profile || profile.role !== 'admin') {
      return { ok: false, status: 403, error: 'Not an admin' };
    }

    return { ok: true, user: userData.user, supabase };
  } catch (err) {
    // Catch-all: whatever this was (missing env var, network error,
    // unexpected shape), the caller gets a readable JSON error instead of
    // Vercel's opaque FUNCTION_INVOCATION_FAILED page.
    console.error('requireAdmin: unexpected error:', err.message);
    return { ok: false, status: 500, error: err.message };
  }
}

module.exports = { requireAdmin, getServiceClient };
