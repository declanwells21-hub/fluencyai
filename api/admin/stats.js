// GET /api/admin/stats
//
// Returns aggregate numbers for the admin dashboard overview: total users,
// active users (7d/30d), subscribed users, breakdowns by country/device/
// subscription status, and a 30-day signup trend.
//
// Requires: Authorization: Bearer <the calling user's Supabase access token>
// The token's owner must have profiles.role = 'admin' - checked server-side
// via the service-role key, never trusted from the client.

const { requireAdmin } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { data, error } = await auth.supabase.rpc('admin_get_stats');
  if (error) {
    console.error('admin/stats: admin_get_stats failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json(data);
};
