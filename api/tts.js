// POST /api/tts  body: JSON { text, targetLanguage, accent, gender } -> audio/mpeg bytes
//
// TTS_PROVIDER env var picks the backend: "elevenlabs" (default, good for
// testing), "deepgram" (uses your existing Deepgram account - only covers
// en/es confidently right now, auto-falls-back to ElevenLabs for other
// languages), or "azure" (better accent matching, needs a real bank-issued
// card). Same request/response shape either way - the app never knows which
// one is behind it.

const AZURE_VOICE_MAP = {
  de: { default: 'de-DE-KatjaNeural', bavarian: 'de-DE-KatjaNeural' },
  en: { default: 'en-US-JennyNeural', british: 'en-GB-SoniaNeural' },
  es: { default: 'es-ES-ElviraNeural', mexican: 'es-MX-DaliaNeural' },
  fr: { default: 'fr-FR-DeniseNeural' },
  it: { default: 'it-IT-ElsaNeural' },
  pt: { default: 'pt-PT-RaquelNeural', brazilian: 'pt-BR-FranciscaNeural' },
  ja: { default: 'ja-JP-NanamiNeural' },
  zh: { default: 'zh-CN-XiaoxiaoNeural' },
  ko: { default: 'ko-KR-SunHiNeural' },
  ar: { default: 'ar-SA-ZariyahNeural' },
  ru: { default: 'ru-RU-SvetlanaNeural' },
  hi: { default: 'hi-IN-SwaraNeural' },
  nl: { default: 'nl-NL-ColetteNeural' },
  sv: { default: 'sv-SE-SofieNeural' },
  pl: { default: 'pl-PL-AgnieszkaNeural' },
  tr: { default: 'tr-TR-EmelNeural' },
  vi: { default: 'vi-VN-HoaiMyNeural' },
  th: { default: 'th-TH-PremwadeeNeural' },
  id: { default: 'id-ID-GadisNeural' },
  el: { default: 'el-GR-AthinaNeural' },
  he: { default: 'he-IL-HilaNeural' },
  cs: { default: 'cs-CZ-VlastaNeural' },
  ro: { default: 'ro-RO-AlinaNeural' },
  uk: { default: 'uk-UA-PolinaNeural' },
  sw: { default: 'sw-KE-ZuriNeural' },
};

function pickAzureVoice(targetLanguage, accent) {
  const langMap = AZURE_VOICE_MAP[targetLanguage] || AZURE_VOICE_MAP.en;
  const key = (accent || '').toLowerCase().split(' ')[0];
  return langMap[key] || langMap.default;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function speakWithAzure({ text, targetLanguage, accent }, res) {
  const voice = pickAzureVoice(targetLanguage, accent);
  const ssml = `<speak version='1.0' xml:lang='en-US'><voice name='${voice}'>${escapeXml(text)}</voice></speak>`;

  const azureRes = await fetch(
    `https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-64kbitrate-mono-mp3',
      },
      body: ssml,
    }
  );
  if (!azureRes.ok) {
    const errText = await azureRes.text();
    return res.status(502).json({ error: errText });
  }
  const arrayBuffer = await azureRes.arrayBuffer();
  res.setHeader('Content-Type', 'audio/mpeg');
  return res.status(200).send(Buffer.from(arrayBuffer));
}

// ElevenLabs premade voices support ~29 languages via the multilingual model,
// but voice *identity* isn't split by accent the way Azure's is - so gender
// is respected, accent picks the closest available voice, not an exact match.
// Override with ELEVENLABS_VOICE_ID_FEMALE / ELEVENLABS_VOICE_ID_MALE env vars
// if you want to pick specific voices from your own ElevenLabs library.
const ELEVENLABS_DEFAULT_VOICES = {
  female: process.env.ELEVENLABS_VOICE_ID_FEMALE || '21m00Tcm4TlvDq8ikWAM', // "Rachel"
  male: process.env.ELEVENLABS_VOICE_ID_MALE || 'pNInz6obpgDQGcFmaJgB', // "Adam"
};

async function speakWithElevenLabs({ text, gender }, res) {
  const voiceId =
    (gender || '').toLowerCase() === 'male'
      ? ELEVENLABS_DEFAULT_VOICES.male
      : ELEVENLABS_DEFAULT_VOICES.female;

  const elRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.4, similarity_boost: 0.8 },
    }),
  });
  if (!elRes.ok) {
    const errText = await elRes.text();
    return res.status(502).json({ error: errText });
  }
  const arrayBuffer = await elRes.arrayBuffer();
  res.setHeader('Content-Type', 'audio/mpeg');
  return res.status(200).send(Buffer.from(arrayBuffer));
}

// Deepgram's Aura-2 only covers a handful of languages so far (Deepgram's
// own docs list English, Spanish, Dutch, French, German, Italian, Japanese)
// - and of those, I could only confidently verify exact voice model names
// for English and Spanish from Deepgram's public docs/changelog. Rather than
// guess at unverified model slugs for the other 5 and risk silent 400s, this
// map only includes what's confirmed; any other language automatically
// falls through to ElevenLabs instead (see the dispatcher below). Check
// https://developers.deepgram.com/docs/tts-models if you want to extend
// this map yourself once you can verify the exact names in their dashboard.
const DEEPGRAM_VOICE_MAP = {
  en: 'aura-2-thalia-en',
  es: 'aura-2-celeste-es',
};

async function speakWithDeepgram({ text, targetLanguage }, res) {
  const model = DEEPGRAM_VOICE_MAP[targetLanguage];
  const dgRes = await fetch(`https://api.deepgram.com/v1/speak?model=${model}`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });
  if (!dgRes.ok) {
    const errText = await dgRes.text();
    return res.status(502).json({ error: errText });
  }
  const arrayBuffer = await dgRes.arrayBuffer();
  res.setHeader('Content-Type', 'audio/mpeg');
  return res.status(200).send(Buffer.from(arrayBuffer));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { text, targetLanguage, accent, gender } = req.body;
    const provider = (process.env.TTS_PROVIDER || 'elevenlabs').toLowerCase();

    if (provider === 'azure') {
      return await speakWithAzure({ text, targetLanguage, accent }, res);
    }
    if (provider === 'deepgram') {
      if (DEEPGRAM_VOICE_MAP[targetLanguage]) {
        return await speakWithDeepgram({ text, targetLanguage }, res);
      }
      // Not one of Deepgram's covered languages - fall back automatically
      // instead of erroring, so every language still gets a voice.
      return await speakWithElevenLabs({ text, gender }, res);
    }
    return await speakWithElevenLabs({ text, gender }, res);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
