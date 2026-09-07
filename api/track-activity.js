// POST /api/track-activity   body: { device: "ios" | "android" | "web" }
//
// Called by the Flutter app right after a successful login (see
// supabase_auth_repository.dart). Records the user's country (from
// Vercel's automatic x-vercel-ip-country header - no external geo-IP
// service or extra API key needed) and self-reported device, and stamps
// last_active_at. This is what "active users" and the country/device
// breakdowns on the admin dashboard are built from.
//
// Deliberately uses the ANON key, not the service-role key - it only ever
// updates the calling user's own row, which ordinary Row Level Security
// already allows ("Users can update own profile"). No elevated privilege
// needed or wanted here.

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const device = (req.body && req.body.device) || 'unknown';
  const country = req.headers['x-vercel-ip-country'] || 'Unknown';

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userData.user.id,
      last_active_at: now,
      last_country: country,
      last_device: device,
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.error('track-activity: upsert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true });
};
