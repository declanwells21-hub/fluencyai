// GET /api/admin/users?search=&filter=all|admins|subscribed|free&page=1&pageSize=25
//
// Paginated, searchable list of every signed-up user (joined from
// auth.users + profiles, so someone who signed up but never finished
// onboarding still shows up). Requires an admin caller - see
// api/_lib/adminAuth.js.

const { requireAdmin } = require('../_lib/adminAuth');

module.exports = async (req, res) => {
  const auth = await requireAdmin(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method === 'GET') {
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

    return res.status(200).json({
      users,
      page,
      pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
