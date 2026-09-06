// GET /api/tatoeba?lang=de&q=guten&limit=20&list=123
// Proxies live searches to Tatoeba's public REST API. No API key needed -
// Tatoeba's API is public/unauthenticated - this exists purely so the
// Flutter WEB build doesn't hit a CORS wall calling api.tatoeba.org
// directly from the browser, and so mobile/web share one code path.

const TATOEBA_BASE = 'https://api.tatoeba.org';

// The app's own language codes are 2-letter (ISO 639-1), but Tatoeba's API
// requires 3-letter ISO 639-3 codes - this was the bug causing "Invalid
// language code" 502s, since 'es' was being sent straight through instead
// of being converted to 'spa'.
const ISO1_TO_ISO3 = {
  en: 'eng', de: 'deu', es: 'spa', fr: 'fra', it: 'ita',
  pt: 'por', ja: 'jpn', zh: 'cmn', ko: 'kor', ar: 'ara',
  ru: 'rus', hi: 'hin', nl: 'nld', sv: 'swe', pl: 'pol',
  tr: 'tur', vi: 'vie', th: 'tha', id: 'ind', el: 'ell',
  he: 'heb', cs: 'ces', ro: 'ron', uk: 'ukr', sw: 'swh',
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { lang, q, limit, list, sort } = req.query;
    if (!lang) return res.status(400).json({ error: 'lang is required' });
    const iso3Lang = ISO1_TO_ISO3[String(lang)] || String(lang);

    const params = new URLSearchParams({
      lang: iso3Lang,
      'trans:lang': 'eng',
      'trans:is_direct': 'yes',
      sort: sort || (q ? 'relevance' : 'random'),
      limit: String(limit || 20),
      showtrans: 'matching',
    });
    // The docs suggested "license" needed repeated params (add-multiple),
    // but the live API actually rejects that with "cannot be provided
    // multiple times" - real behavior wins over docs. One comma-joined
    // value is what it actually wants.
    params.append('license', 'CC BY 2.0 FR,CC0 1.0');
    if (q) params.append('q', String(q));
    if (list) params.append('list', String(list));

    const tatoebaRes = await fetch(`${TATOEBA_BASE}/unstable/sentences?${params.toString()}`);
    if (!tatoebaRes.ok) {
      const text = await tatoebaRes.text();
      return res.status(502).json({ error: text });
    }
    const payload = await tatoebaRes.json();

    // Trim down to just what the app needs, same shape as the bundled
    // phrase JSON files (text/translation/audio) plus a source id.
    const results = (payload.data || [])
      .map((sent) => {
        const translation = sent.translations?.[0]?.text;
        if (!translation) return null;
        const audioId = sent.audios?.[0]?.id ?? null;
        return { id: sent.id, text: sent.text, translation, audioId };
      })
      .filter(Boolean);

    return res.status(200).json({ results, total: payload.paging?.total ?? results.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
