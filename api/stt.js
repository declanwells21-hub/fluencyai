// POST /api/stt?language=xx  body: raw audio bytes  -> { transcript }
function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const audioBuffer = Buffer.isBuffer(req.body) ? req.body : await buffer(req);
    const language = (req.query?.language || 'en').toString();

    const dgRes = await fetch(
      `https://api.deepgram.com/v1/listen?smart_format=true&language=${encodeURIComponent(language)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': 'audio/wav',
        },
        body: audioBuffer,
      }
    );

    if (!dgRes.ok) {
      const text = await dgRes.text();
      return res.status(502).json({ error: text });
    }

    const data = await dgRes.json();
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    return res.status(200).json({ transcript });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};

module.exports.config = { api: { bodyParser: false } };
