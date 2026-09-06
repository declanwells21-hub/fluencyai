// POST /api/chat  body: JSON { mode, ...mode-specific fields }
//
// mode is optional and defaults to "converse" (the original tutor-reply
// behavior, unchanged). Other modes reuse the same Claude connection/config
// for new features instead of needing separate proxy files:
//   "converse"      (default) -> { reply, correction, explanation }
//   "plan"          personalized study plan     -> { phrases: [...], scenarios: [...], grammar: [...] }
//   "scenario"      generate a custom roleplay -> { title, lines: [...] }
//   "grammar"       answer a grammar question  -> { title, explanation, examples: [...] }
//   "pronunciation" text-based pronunciation tips -> { feedback }
//   "hint"          fill-in-the-blank prompt   -> { hint }
//   "translate"     one phrase into several languages -> { translations: {code: text} }
//   "analyze"       end-of-conversation report -> { understoodPercent, repairMoves, repairNotes,
//                    summaryHeadline, fixes: [...], skills: [...] }
//
// LLM provider is env-configurable so you can point this at a test gateway
// (e.g. ClaudeStore) now and swap to the real Anthropic API later with zero
// code changes:
//   CLAUDE_BASE_URL     default: https://api.anthropic.com
//   CLAUDE_API_KEY      your key for whichever provider CLAUDE_BASE_URL points at
//   CLAUDE_AUTH_SCHEME  "x-api-key" (default, what api.anthropic.com expects)
//                       or "bearer" (what most third-party gateways expect)
//   CLAUDE_MODEL        default: claude-sonnet-4-6

// A handful of modes need more output room than a single chat reply -
// keeping this per-mode instead of one global max_tokens avoids paying for
// a big budget on every short converse turn.
const MAX_TOKENS_BY_MODE = { plan: 3000, analyze: 1400 };
const DEFAULT_MAX_TOKENS = 600;

function buildPrompt(body) {
  const mode = body.mode || 'converse';

  if (mode === 'plan') {
    const { targetLanguage, level, motivation, goals = [], frequency, topics = [], nativeLanguage } = body;
    const focusList = goals.length ? goals.join(', ') : 'general fluency';
    const topicList = topics.length ? topics.join(', ') : 'everyday life';
    return {
      system: `You are building a personalized ${targetLanguage} study plan for a ${level || 'beginner'}-level learner.
Their motivation for learning: ${motivation || 'general interest'}.
What they specifically want to focus on: ${focusList}.
Topics they enjoy talking about: ${topicList}.
How often they plan to practice: ${frequency || 'unspecified'}.
${nativeLanguage ? `Their native language is ${nativeLanguage} - keep English notes and translations simple and clear for them.` : ''}

Generate a study plan tailored EXACTLY to the above. Every item should clearly connect to their stated topics and focus areas - not generic beginner content that could apply to anyone. Spread the items across their different topics/focus areas rather than repeating one theme.

Respond with ONLY valid JSON, no markdown fences, in this EXACT shape:
{
  "phrases": [ {"text": "phrase in ${targetLanguage}", "translation": "English translation"} ... exactly 12 items ],
  "scenarios": [ {"title": "short scenario title", "lines": [{"speaker": "You" or a short role name relevant to the situation, "text": "line in ${targetLanguage}", "translation": "English translation"}, ... 5 to 7 lines total]} ... exactly 4 scenarios ],
  "grammar": [ {"title": "short grammar topic title", "explanation": "clear explanation appropriate for their level", "examples": [{"text": "example in ${targetLanguage}", "note": "brief English note"}, ... 2 to 3 examples]} ... exactly 4 topics ]
}`,
      messages: [{ role: 'user', content: 'Generate my personalized study plan.' }],
    };
  }

  if (mode === 'scenario') {
    const { targetLanguage, description } = body;
    return {
      system: `You create short roleplay dialogues for language learners. Write a 5-7 line back-and-forth dialogue in ${targetLanguage} for this situation: "${description}".
One side is always "You" (the learner). Give the other speaker a short role name relevant to the situation (e.g. "Waiter", "Landlord").
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"title": "short title for this scenario", "lines": [{"speaker": "You" or the role name, "text": "line in ${targetLanguage}", "translation": "English translation"}]}`,
      messages: [{ role: 'user', content: description }],
    };
  }

  if (mode === 'grammar') {
    const { targetLanguage, question } = body;
    return {
      system: `You are a precise ${targetLanguage} grammar teacher. Answer this question clearly and correctly, with 2-3 short real examples.
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"title": "short topic title", "explanation": "clear explanation answering the question", "examples": [{"text": "example in ${targetLanguage}", "note": "brief English note"}]}
If you are not fully confident the answer is correct, say so plainly in the explanation rather than guessing.`,
      messages: [{ role: 'user', content: question }],
    };
  }

  if (mode === 'pronunciation') {
    const { targetLanguage, spokenText } = body;
    return {
      system: `You are a ${targetLanguage} pronunciation coach. You do NOT have access to the student's actual audio, only the text a speech-to-text system produced from what they said. Give brief, encouraging, text-based tips: common sounds in this phrase that English speakers often mispronounce, and one concrete tip to improve. Be clear this is general guidance, not an analysis of their actual recording.
Respond with ONLY valid JSON, no markdown fences: {"feedback": "2-3 sentences of tips"}`,
      messages: [{ role: 'user', content: spokenText }],
    };
  }

  if (mode === 'hint') {
    const { targetLanguage, level, context } = body;
    return {
      system: `You help a ${level || 'beginner'}-level ${targetLanguage} learner respond in a conversation. Given the tutor's last message, give ONE short fill-in-the-blank sentence template in ${targetLanguage} they could complete and say next.
Respond with ONLY valid JSON, no markdown fences: {"hint": "template with a ___ blank, plus a short English note on what goes in the blank"}`,
      messages: [{ role: 'user', content: context || '' }],
    };
  }

  if (mode === 'translate') {
    const { text, sourceLanguage, targetLanguages = [] } = body;
    const langList = targetLanguages.join(', ');
    return {
      system: `You are a precise translator. You will be given one short phrase in ${sourceLanguage || 'an unspecified language'}. Translate it into EACH of these language codes: ${langList}. Keep translations natural and idiomatic, not word-for-word, matching how a native speaker would actually express the same meaning.
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"translations": {${targetLanguages.map((c) => `"${c}": "translation in ${c}"`).join(', ')}}}`,
      messages: [{ role: 'user', content: text }],
    };
  }

  if (mode === 'analyze') {
    const { targetLanguage, level, tutorName, history = [], corrections = [], durationSeconds } = body;
    const minutes = Math.floor((durationSeconds || 0) / 60);
    const seconds = (durationSeconds || 0) % 60;
    const transcriptText = history.map((m) => `${m.role === 'user' ? 'Student' : 'Tutor'}: ${m.text}`).join('\n');
    const correctionsText = corrections.length
      ? corrections.map((c, i) => `${i + 1}. Student said: "${c.original}" -> Better: "${c.corrected}" (${c.explanation || 'no note'})`).join('\n')
      : 'None recorded during this session.';

    return {
      system: `You are an encouraging but honest ${targetLanguage} speaking coach, reviewing a practice conversation a ${level || 'unknown'}-level student just finished with their tutor ${tutorName || 'the AI tutor'}. The conversation lasted ${minutes}m ${seconds}s.

Full transcript:
${transcriptText || '(no messages)'}

Grammar/vocabulary corrections that were already flagged live during the conversation:
${correctionsText}

Write a short, honest end-of-session report based ONLY on what actually happened in this transcript - never invent mistakes, phrases, or events that aren't grounded in it.

Respond with ONLY valid JSON, no markdown fences, in this EXACT shape:
{
  "understoodPercent": 0-100 integer, your honest estimate of how much of the tutor's ${targetLanguage} the student handled without needing English or repetition,
  "repairMoves": integer count of times the student had to ask for clarification, repetition, or slower speech, or switched to English mid-conversation (0 if none happened),
  "repairNotes": [ short phrases describing each repair move, e.g. "asked him to slow down" - one per repairMoves, empty array if none ],
  "summaryHeadline": "one encouraging sentence summarizing how the session went, referencing something specific and true from the transcript",
  "fixes": [
    { "category": "GRAMMAR" or "WORD CHOICE" or "MORE NATURAL" or "PRONUNCIATION", "original": "what the student actually said, in ${targetLanguage}", "better": "the improved version, in ${targetLanguage}", "note": "one short sentence in English explaining why", "localTip": "short English note starting with 'A local would say:' style guidance, or null" }
    ... up to 4 of the most useful fixes grounded in the transcript/corrections above, fewer if the transcript doesn't support more. Prefer the flagged corrections above, and add at most 1-2 more only if clearly grounded in the transcript.
  ],
  "skills": [
    { "name": "Grammar", "percent": 0-100 },
    { "name": "Vocabulary", "percent": 0-100 },
    { "name": "Fluency", "percent": 0-100 },
    { "name": "Listening", "percent": 0-100 }
  ]
}
If the transcript is too short or empty to honestly assess something, use a mid-range estimate (around 50) rather than an extreme number, and keep "fixes" and "repairNotes" empty rather than inventing content.`,
      messages: [{ role: 'user', content: 'Generate my session report.' }],
    };
  }

  // Default: "converse" - the original tutor-reply behavior
  const { targetLanguage, level, tutorName, accent, tone, history = [], userText, topic, situation, yourRole, aiRole } = body;
  const toneInstruction = {
    nice: 'Be warm, encouraging, and patient - celebrate small wins.',
    strict: 'Be direct and rigorous - point out every mistake precisely, no sugar-coating.',
    funny: 'Be playful and humorous while still teaching - light jokes are welcome.',
  }[tone] || 'Be warm, encouraging, and patient.';

  // Scopes the conversation to a chosen practice topic (from the topic
  // picker's bundled/plan-generated list) or a fully custom roleplay (from
  // the "Create a custom topic" form: situation + the two roles). Both are
  // optional - plain free-chat sends none of these and behavior is
  // unchanged from before.
  let scopeInstruction = '';
  if (situation) {
    scopeInstruction = `\nThis conversation is a roleplay for the situation: "${situation}". You play the role of ${aiRole || 'the other person in this situation'}. The student plays the role of ${yourRole || 'themselves'}. Stay in character for this scenario and steer the conversation naturally within it.`;
  } else if (topic) {
    scopeInstruction = `\nKeep this conversation focused on the topic: "${topic}". Guide the student to practice vocabulary and phrases relevant to that topic.`;
  }

  return {
    system: `You are ${tutorName || 'a friendly AI tutor'}, an AI language tutor helping a student practice ${targetLanguage} (accent/dialect: ${accent || 'standard'}). Student's level: ${level || 'unknown'}.
Tutoring style: ${toneInstruction}${scopeInstruction}
Reply naturally in ${targetLanguage} to keep the conversation going, matching the student's level.
Then check the student's LAST message for grammar/vocabulary mistakes.
Also provide a simple, clear English translation of your own reply.
Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"reply": "your natural in-character reply in the target language", "translation": "English translation of your reply", "correction": "corrected version of the student's message, or null if no mistakes", "explanation": "one short sentence explaining the correction, or null"}`,
    messages: [
      ...history.map((m) => ({ role: m.role, content: m.text })),
      { role: 'user', content: userText },
    ],
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const mode = req.body?.mode || 'converse';
    const { system: systemPrompt, messages } = buildPrompt(req.body);

    const baseUrl = process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com';
    const authScheme = (process.env.CLAUDE_AUTH_SCHEME || 'x-api-key').toLowerCase();
    const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';

    const authHeaders =
      authScheme === 'bearer'
        ? { Authorization: `Bearer ${process.env.CLAUDE_API_KEY}` }
        : { 'x-api-key': process.env.CLAUDE_API_KEY };

    const claudeRes = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS_BY_MODE[mode] || DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages,
      }),
    });

    if (!claudeRes.ok) {
      const text = await claudeRes.text();
      return res.status(502).json({ error: text });
    }

    const data = await claudeRes.json();
    const raw = data?.content?.[0]?.text ?? '{}';
    const cleaned = raw.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = mode === 'converse'
        ? { reply: cleaned, correction: null, explanation: null }
        : { error: 'Could not parse AI response', raw: cleaned };
    }
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
};
