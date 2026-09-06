// GET /api/tatoeba-audio?id=4321  -> audio/mpeg bytes (or whatever Tatoeba serves)
// Streams a real human recording for a live-search result. Returns 403/404
// passthrough if the author didn't allow reuse or the audio doesn't exist.

const TATOEBA_BASE = 'https://api.tatoeba.org';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const audioRes = await fetch(`${TATOEBA_BASE}/v1/audios/${encodeURIComponent(id)}/file`);
    if (!audioRes.ok) {
      return res.status(audioRes.status).json({ error: `Tatoeba returned ${audioRes.status}` });
    }
    const buffer = Buffer.from(await audioRes.arrayBuffer());
    res.setHeader('Content-Type', audioRes.headers.get('content-type') || 'audio/mpeg');
    return res.status(200).send(buffer);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
