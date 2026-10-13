// api/_lib/supabase.js
//
// One place to build the service-role Supabase client for the newer API code
// (the older endpoints each carry their own copy of this; they keep working as they are).
// The service-role key bypasses Row Level Security, so it must only ever be used on the server.

const { createClient } = require('@supabase/supabase-js');

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

module.exports = { getServiceClient };
