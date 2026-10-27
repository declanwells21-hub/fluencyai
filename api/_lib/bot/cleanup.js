// api/_lib/bot/cleanup.js
//
// Daily housekeeping, called by the Vercel cron job in vercel.json (GET /api/bot/cleanup). Deletes website chats
// older than BOT_RETENTION_DAYS (default 90) unless they belong to a hand-off request that is still open, and
// hand-off requests older than 24 months, which is what the Privacy Policy promises.
// Vercel sends "Authorization: Bearer <CRON_SECRET>"; with no CRON_SECRET set the endpoint refuses to run.

'use strict';

const crypto = require('crypto');
const { getServiceClient } = require('../supabase');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

async function handleCleanup(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'not_configured' });
  const header = String((req.headers && req.headers.authorization) || '');
  if (!safeEqual(header, 'Bearer ' + secret)) return res.status(401).json({ error: 'unauthorized' });

  const days = Math.max(7, Math.min(365, Number(process.env.BOT_RETENTION_DAYS) || 90));
  const db = getServiceClient();
  const { data, error } = await db.rpc('fl_bot_cleanup', { p_days: days });
  if (error) { console.error('bot: cleanup failed:', error.message); return res.status(500).json({ error: 'cleanup_failed' }); }
  return res.status(200).json({ ok: true, days, deleted: data });
}

module.exports = { handleCleanup };
