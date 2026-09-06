/**
 * FLUENCY proxy — the only thing the Flutter app talks to for AI features.
 * Keeps your Anthropic / Deepgram / Azure keys out of the compiled app.
 *
 * Endpoints:
 *   POST /stt    body: raw audio bytes           -> { transcript }
 *   POST /chat   body: JSON (see below)          -> { reply, correction, explanation }
 *   POST /tts    body: JSON { text, targetLanguage, accent, gender } -> audio/mpeg bytes
 *
 * Secrets (set with `wrangler secret put NAME`):
 *   ANTHROPIC_API_KEY, DEEPGRAM_API_KEY, AZURE_SPEECH_KEY, AZURE_SPEECH_REGION
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/stt' && request.method === 'POST') {
        return await handleStt(request, env);
      }
      if (url.pathname === '/chat' && request.method === 'POST') {
        return await handleChat(request, env);
      }
      if (url.pathname === '/tts' && request.method === 'POST') {
        return await handleTts(request, env);
      }
      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ---------- Deepgram STT ----------
async function handleStt(request, env) {
  const audioBytes = await request.arrayBuffer();
  const url = new URL(request.url);
  const language = url.searchParams.get('language') || 'en';
  const res = await fetch(
    `https://api.deepgram.com/v1/listen?smart_format=true&language=${encodeURIComponent(language)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${env.DEEPGRAM_API_KEY}`,
        'Content-Type': 'audio/wav',
      },
      body: audioBytes,
    }
  );
  if (!res.ok) return json({ error: await res.text() }, 502);
  const data = await res.json();
  const transcript =
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  return json({ transcript });
}

// ---------- Claude (Anthropic) tutor brain ----------
async function handleChat(request, env) {
  const body = await request.json();
  const { targetLanguage, level, tutorName, accent, tone, history = [], userText } = body;

  const toneInstruction = {
    nice: 'Be warm, encouraging, and patient - celebrate small wins.',
    strict: 'Be direct and rigorous - point out every mistake precisely, no sugar-coating.',
    funny: 'Be playful and humorous while still teaching - light jokes are welcome.',
  }[tone] || 'Be warm, encouraging, and patient.';

  const systemPrompt = `You are ${tutorName || 'a friendly AI tutor'}, an AI language tutor helping a student practice ${targetLanguage} (accent/dialect: ${accent || 'standard'}). Student's level: ${level || 'unknown'}.
Tutoring style: ${toneInstruction}
Reply naturally in ${targetLanguage} to keep the conversation going, matching the student's level.
Then check the student's LAST message for grammar/vocabulary mistakes.
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"reply": "your natural in-character reply in the target language", "correction": "corrected version of the student's message, or null if no mistakes", "explanation": "one short sentence explaining the correction, or null"}`;

  const messages = [
    ...history.map((m) => ({ role: m.role, content: m.text })),
    { role: 'user', content: userText },
  ];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: systemPrompt,
      messages,
    }),
  });
  if (!res.ok) return json({ error: await res.text() }, 502);
  const data = await res.json();
  const raw = data?.content?.[0]?.text ?? '{}';
  const cleaned = raw.replace(/```json|```/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { reply: cleaned, correction: null, explanation: null };
  }
  return json(parsed);
}

// ---------- Azure TTS ----------
const AZURE_VOICE_MAP = {
  // targetLanguage -> { accentKeyword: voiceName }. Extend as you add accents.
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

function pickVoice(targetLanguage, accent) {
  const langMap = AZURE_VOICE_MAP[targetLanguage] || AZURE_VOICE_MAP.en;
  const key = (accent || '').toLowerCase().split(' ')[0];
  return langMap[key] || langMap.default;
}

async function handleTts(request, env) {
  const { text, targetLanguage, accent } = await request.json();
  const voice = pickVoice(targetLanguage, accent);
  const ssml = `<speak version='1.0' xml:lang='en-US'><voice name='${voice}'>${escapeXml(text)}</voice></speak>`;

  const res = await fetch(
    `https://${env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': env.AZURE_SPEECH_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-64kbitrate-mono-mp3',
      },
      body: ssml,
    }
  );
  if (!res.ok) return json({ error: await res.text() }, 502);
  return new Response(res.body, {
    headers: { 'Content-Type': 'audio/mpeg', ...CORS_HEADERS },
  });
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
