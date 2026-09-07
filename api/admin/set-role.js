// POST /api/admin/set-role   body: { userId, role: "admin" | "user" }
//
// Promotes or demotes a user. Refuses to demote the very last remaining
// admin, so nobody can accidentally lock everyone out of the dashboard.

const { requireAdmin } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  const { userId, role } = req.body || {};
  if (!userId || !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Body must include userId and role ("admin" or "user")' });
  }

  if (role === 'user') {
    const { count, error: countErr } = await auth.supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (countErr) {
      return res.status(500).json({ error: countErr.message });
    }
    if ((count || 0) <= 1) {
      return res.status(400).json({ error: "Can't demote the last remaining admin." });
    }
  }

  const { error } = await auth.supabase
    .from('profiles')
    .upsert({ id: userId, role }, { onConflict: 'id' });

  if (error) {
    console.error('admin/set-role: upsert failed:', error.message);
    return res.status(500).json({ error: error.message });
  }

  res.status(200).json({ ok: true, userId, role });
};
