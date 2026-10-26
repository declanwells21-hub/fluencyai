// POST /api/bot/chat, GET /api/bot/poll, GET /api/bot/history  (the website chatbot).
// One function for every bot route: vercel.json rewrites /api/bot/:op to /api/bot?op=:op, which keeps the
// number of Vercel functions down and gives later channels (Telegram, email, WhatsApp) a place to plug in.
// The logic lives in api/_lib/bot/ (brain.js = what it says, manus.js = the AI service, web.js = this channel).

const { handleChat, handlePoll, handleHistory } = require('./_lib/bot/web');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const op = String((req.query && req.query.op) || '');
  try {
    if (op === 'chat') return await handleChat(req, res);
    if (op === 'poll') return await handlePoll(req, res);
    if (op === 'history') return await handleHistory(req, res);
    return res.status(404).json({ error: 'not_found' });
  } catch (err) {
    console.error('bot: unhandled error:', err && err.message);
    return res.status(500).json({ error: 'server_error', human: true });
  }
};
