// ============ CONTENT DATA ============

const STAGES = [
  { icon: "ear", title: "Listen", blurb: "Accent, speed, hesitation", label: "Stage 01 · Listening",
    headline: "It hears the sentence you actually said, not the one the textbook expected.",
    words: "Ich möchte einen Tisch reservieren",
    translation: "I'd like to reserve a table", orb: "listening",
    detail: "Low-confidence words are underlined in cyan so you can see exactly what was misheard. No silent guessing." },
  { icon: "mic", title: "Speak", blurb: "No script, no prompt to read", label: "Stage 02 · Speaking",
    headline: "You talk. It waits for you the way a patient person would.",
    words: "Äh… einen Tisch für zwei",
    translation: "Uh… a table for two", orb: "listening",
    detail: "Pauses and filler don't break the turn. You can say again, slower, or ask it to explain differently at any point." },
  { icon: "scan-text", title: "Get feedback", blurb: "Said → better → why", label: "Stage 03 · Correction",
    headline: "Three beats: what you said, what to say, and why it matters.",
    words: "Ich will ein Kaffee",
    translation: "→ Ich möchte einen Kaffee.", orb: "thinking",
    detail: "Corrections arrive after the thought is finished, so the conversation never stalls mid-sentence." },
  { icon: "audio-lines", title: "Improve", blurb: "Syllable by syllable", label: "Stage 04 · Pronunciation",
    headline: "A physical instruction, not a score out of ten.",
    words: "Entschuldigung",
    translation: "/ɛntˈʃʊldɪɡʊŋ/: \u201csch\u201d is one sound, tongue back", orb: "speaking",
    detail: "It tells you where the tongue goes. Then you say it again, and it tells you whether that landed." },
  { icon: "brain", title: "Become confident", blurb: "Tomorrow builds on today", label: "Stage 05 · Memory",
    headline: "The next conversation is built from the two things you got wrong in this one.",
    words: "Einen Tisch für zwei, bitte.",
    translation: "Fourth time this week, no hesitation.", orb: "speaking",
    detail: "Progress is measured in minutes spoken and how often you were understood first time. There are no points." },
];

const FEATURES = [
  ["messages-square", "AI conversation", "Real back-and-forth with someone who reacts to what you said.", "var(--teal-400)", "rgba(16,184,184,.14)"],
  ["audio-lines", "Speech feedback", "Hear what you sound like, broken down to the syllable.", "var(--cyan-400)", "rgba(53,221,251,.14)"],
  ["scan-text", "Smart corrections", "The fix, the reason, and how a local would say it.", "var(--indigo-300)", "rgba(91,85,184,.2)"],
  ["sparkles", "Personalised practice", "Describe any situation you're dreading and practise that.", "var(--amber-400)", "rgba(247,178,59,.14)"],
  ["gauge", "Real-world confidence", "Native speed, interruptions, and people who don't slow down.", "var(--mint-400)", "rgba(37,215,155,.14)"],
];

// CSS-drawn flags
const L = (bg) => [{ inset: "0", background: bg }];
const disc = (color, size, left, top) => ({
  left: left, top: top, width: size, height: size, marginLeft: "-" + (parseInt(size) / 2) + "px",
  marginTop: "-" + (parseInt(size) / 2) + "px", borderRadius: "999px", background: color,
});
const h3 = (a, b, c) => L("linear-gradient(" + a + " 0 33.34%," + b + " 33.34% 66.67%," + c + " 66.67%)");
const v3 = (a, b, c) => L("linear-gradient(90deg," + a + " 0 33.34%," + b + " 33.34% 66.67%," + c + " 66.67%)");
const h2f = (a, b) => L("linear-gradient(" + a + " 0 50%," + b + " 50%)");
const cross = (base, arm, vx, vw, aw, inner, iw) => {
  const ls = [...L(base),
    { left: vx, top: "0", bottom: "0", width: vw, background: arm },
    { left: "0", right: "0", top: "calc(50% - " + aw + ")", height: "calc(" + aw + " * 2)", background: arm }];
  if (inner) ls.push(
    { left: "calc(" + vx + " + (" + vw + " - " + iw + ") / 2)", top: "0", bottom: "0", width: iw, background: inner },
    { left: "0", right: "0", top: "calc(50% - " + iw + " / 2)", height: iw, background: inner });
  return ls;
};

const LANGUAGES = [
  ["Spanish", "hola", L("linear-gradient(#AA151B 0 25%,#F1BF00 25% 75%,#AA151B 75%)")],
  ["French", "salut", v3("#002395", "#F5F5F5", "#ED2939")],
  ["German", "hallo", h3("#111", "#DD0000", "#FFCE00")],
  ["Mandarin", "你好", [...L("#DE2910"), disc("#FFDE00", "5px", "26%", "34%")]],
  ["Japanese", "こんにちは", [...L("#F5F5F5"), disc("#BC002D", "9px", "50%", "50%")]],
  ["Italian", "ciao", v3("#008C45", "#F4F5F0", "#CD212A")],
  ["Korean", "안녕", [...L("#F5F5F5"), disc("linear-gradient(#CD2E3A 0 50%,#0047A0 50%)", "9px", "50%", "50%")]],
  ["Portuguese", "olá", [...L("linear-gradient(90deg,#046A38 0 40%,#DA291C 40%)"), disc("#FFE800", "7px", "40%", "50%")]],
  ["Arabic", "مرحبا", [...L("#006C35"), { left: "22%", right: "22%", top: "60%", height: "2px", background: "#F5F5F5" }]],
  ["Russian", "привет", h3("#F5F5F5", "#0039A6", "#D52B1E")],
  ["Hindi", "नमस्ते", [...h3("#FF9933", "#F5F5F5", "#138808"), disc("#000088", "5px", "50%", "50%")]],
  ["Dutch", "hoi", h3("#AE1C28", "#F5F5F5", "#21468B")],
  ["Turkish", "merhaba", [...L("#E30A17"), disc("#F5F5F5", "9px", "38%", "50%"), disc("#E30A17", "7px", "44%", "50%")]],
  ["Polish", "cześć", h2f("#F5F5F5", "#DC143C")],
  ["Swedish", "hej", cross("#006AA7", "#FECC00", "33%", "5px", "2.5px")],
  ["Norwegian", "hei", cross("#BA0C2F", "#F5F5F5", "31%", "7px", "3.5px", "#00205B", "3px")],
  ["Danish", "hej", cross("#C60C30", "#F5F5F5", "31%", "5px", "2.5px")],
  ["Finnish", "hei", cross("#F5F5F5", "#003580", "31%", "6px", "3px")],
  ["Greek", "γεια", [...L("repeating-linear-gradient(#0D5EAF 0 2.1px,#F5F5F5 2.1px 4.2px)"), { left: "0", top: "0", width: "10px", height: "10px", background: "#0D5EAF" }]],
  ["Hebrew", "שלום", [...L("#F5F5F5"), { left: "0", right: "0", top: "2px", height: "2.5px", background: "#0038B8" }, { left: "0", right: "0", bottom: "2px", height: "2.5px", background: "#0038B8" }, disc("#0038B8", "6px", "50%", "50%")]],
  ["Thai", "สวัสดี", L("linear-gradient(#A51931 0 17%,#F4F5F8 17% 33%,#2D2A4A 33% 67%,#F4F5F8 67% 83%,#A51931 83%)")],
  ["Vietnamese", "xin chào", [...L("#DA251D"), disc("#FFFF00", "7px", "50%", "50%")]],
  ["Indonesian", "halo", h2f("#CE1126", "#F5F5F5")],
  ["Ukrainian", "привіт", h2f("#0057B7", "#FFD700")],
  ["Czech", "ahoj", [...h2f("#F5F5F5", "#D7141A"), { left: "0", top: "0", width: "9px", height: "100%", background: "#11457E", clipPath: "polygon(0 0,100% 50%,0 100%)" }]],
  ["Hungarian", "sziasztok", h3("#CE2939", "#F5F5F5", "#477050")],
  ["Romanian", "salut", v3("#002B7F", "#FCD116", "#CE1126")],
  ["Swahili", "jambo", [...L("linear-gradient(#111 0 30%,#F5F5F5 30% 34%,#BB0000 34% 66%,#F5F5F5 66% 70%,#006600 70%)"), disc("#BB0000", "6px", "50%", "50%")]],
  ["Filipino", "kumusta", [...h2f("#0038A8", "#CE1126"), { left: "0", top: "0", bottom: "0", width: "8px", background: "#F5F5F5", clipPath: "polygon(0 0,100% 50%,0 100%)" }]],
  ["Bengali", "নমস্কার", [...L("#006A4E"), disc("#F42A41", "8px", "44%", "50%")]],
  ["Persian", "سلام", h3("#239F40", "#F5F5F5", "#DA0000")],
  ["Urdu", "سلام", [...L("#01411C"), { left: "0", top: "0", bottom: "0", width: "6px", background: "#F5F5F5" }, disc("#F5F5F5", "6px", "62%", "50%")]],
  ["Malay", "halo", [...L("repeating-linear-gradient(#CC0001 0 1.2px,#F5F5F5 1.2px 2.4px)"), { left: "0", top: "0", width: "12px", height: "9px", background: "#010066" }]],
  ["Croatian", "zdravo", h3("#FF0000", "#F5F5F5", "#171796")],
  ["Serbian", "здраво", h3("#C6363C", "#0C4076", "#F5F5F5")],
  ["Bulgarian", "здравей", h3("#F5F5F5", "#00966E", "#D62612")],
  ["Slovak", "ahoj", h3("#F5F5F5", "#0B4EA2", "#EE1C25")],
  ["Icelandic", "halló", cross("#02529C", "#F5F5F5", "31%", "7px", "3.5px", "#DC1E35", "3px")],
  ["Irish", "dia dhuit", v3("#169B62", "#F5F5F5", "#FF883E")],
  ["Catalan", "hola", L("repeating-linear-gradient(#FCDD09 0 3px,#DA121A 3px 6px)")],
];

const FAQS = [
  ["What is Fluency AI?", "Fluency AI is an AI language learning app for speaking practice. You talk out loud in one of 40 languages, it answers like a person, and it corrects what you said while the conversation is still fresh."],
  ["How does Fluency AI work?", "Five things happen between your sentence and the reply. It listens to the sentence you actually said, waits while you speak at your own pace, shows what you said and what to say instead and why, tells you where your tongue goes for tricky sounds, and builds tomorrow's conversation around today's mistakes."],
  ["Can I talk to an AI in another language?", "Yes. Fluency AI is an AI language tutor you talk to out loud, in 40 languages. You speak, it answers in the language you're learning the way a person would, and it corrects you along the way."],
  ["Can complete beginners use Fluency AI?", "Yes. There is no placement test. Say one sentence, badly is fine, and it works out where you are. If you get stuck you can ask it to repeat, slow down, explain differently or hand you the phrase."],
  ["What if I freeze halfway through?", "Say “again” or just stop. It waits, offers the phrase you were reaching for, and picks the thread back up."],
  ["How to stop freezing when speaking a foreign language?", "Practice speaking out loud, in short sessions, with a partner that waits for you. Fluency AI gives you time when you stall, hands you the phrase you were reaching for, and lets you carry on, so freezing stops feeling like failing."],
  ["Will it correct everything I say?", "Only if you ask it to. Live, after, or off: you set it inside the conversation and change it any time."],
  ["How does the pronunciation correction work?", "It listens to how you actually say a word, tells you where your tongue and mouth should go, then hears your next attempt and tells you whether it landed. Sounds you get wrong repeatedly are counted, so you can hear the habit instead of just reading a score."],
  ["Can Fluency AI help with my accent?", "It listens to your accent as it actually is, and its pronunciation feedback tells you where your tongue and mouth should go for sounds you keep getting wrong. Recurring sounds are counted, so you can spot the habit."],
  ["Which languages can I practice?", "Forty, including Spanish, French, German, Mandarin, Japanese, Italian, Korean, Portuguese, Arabic and Hindi. The full list is on this page, and you can switch between languages without paying again."],
  ["Can I choose what to practice?", "Yes. Describe any situation you're dreading, such as reserving a table or ordering at a counter, and practice that conversation."],
  ["How much does it cost?", "You can register and speak your first sentence free, and pay only when you decide to stay. The founding user price is $40, once, not a subscription. Everyone who joins before launch keeps lifetime access at that price; afterwards Fluency AI moves to a yearly subscription for new users, and founding accounts stay on the one-time price permanently."],
  ["Where do I actually use it?", "In the Fluency AI app on iOS or Android. Register here, download it, and your account is already waiting when you open it."],
  ["Does Fluency AI work offline?", "No. Speech recognition and the AI's replies happen online, so you need an internet connection to have a conversation."],
  ["How is it different from traditional language apps?", "Traditional apps are built around studying and tests, with points for finishing units and little speaking. Fluency AI puts the conversation first and the correction second, ties every correction to a sentence you actually said, and measures progress in minutes spoken instead of points."],
  ["Can I learn a language without lessons?", "Fluency AI is language learning without lessons: no placement test, no streaks and no points for finishing units. You talk, it answers, and every correction comes from a sentence you actually said."],
  ["How long should I practice each day?", "There is no required amount and no streak to protect. Two minutes of talking is enough to get a report of what to fix, so a spare few minutes works."],
  ["Is this instead of a teacher?", "It's the practice between lessons. Most people use it for the speaking hours a teacher can't give them."],
  ["What happens to my recordings?", "They're yours. Delete a conversation and the model forgets it too, including the mistakes it learned from it."],
];

const GREETINGS = [
  ["hola", "es"], ["danke", "de"], ["すみません", "ja"], ["merci", "fr"], ["ancora", "it"],
  ["gracias", "es"], ["bitte", "de"], ["감사합니다", "ko"], ["prego", "it"], ["por favor", "pt"],
  ["guten Tag", "de"], ["bonjour", "fr"], ["obrigado", "pt"], ["你好", "zh"], ["안녕하세요", "ko"],
  ["こんにちは", "ja"], ["cześć", "pl"], ["merhaba", "tr"], ["mrekba", "ar"], ["hoi", "nl"],
  ["buongiorno", "it"], ["de nada", "es"], ["s'il vous plaît", "fr"], ["dziękuję", "pl"],
  ["asante", "sw"], ["karibu", "sw"],
];

const REPAIRS = [
  ["repeat", "Say again", "REPAIR · SAY AGAIN",
    "\u201c¿Me lo repite, por favor?\u201d",
    "It repeats the exact same sentence (same words, same speed) so you can find the part you missed rather than hear a new attempt."],
  ["gauge", "Slower", "REPAIR · SLOWER",
    "\u201cUn peu plus lentement ?\u201d",
    "Native rhythm is kept, the tempo drops. It never switches to the flat textbook voice, because that isn't what you'll hear in the street."],
  ["sparkles", "Explain differently", "REPAIR · REPHRASE",
    "\u201cCome si dice…?\u201d",
    "Same meaning, simpler words. It rebuilds the sentence out of vocabulary you've already used in this conversation."],
  ["messages-square", "Give me a phrase", "REPAIR · HAND ME THE WORDS",
    "\u201cWas heißt das auf Deutsch?\u201d",
    "It hands you the sentence you were reaching for, you say it out loud, and the conversation carries on from there."],
];

const PHRASES = [
  ["¿Me lo repite, por favor?", "say that again?"],
  ["Ich habe es nicht verstanden.", "I didn't catch that"],
  ["すみません、もう一度お願いします。", "sorry, once more"],
  ["Un peu plus lentement ?", "a little slower?"],
  ["Come si dice…?", "how do you say…?"],
  ["천천히 말해 주세요.", "please speak slowly"],
  ["Não falo muito bem, mas tento.", "I don't speak well, but I try"],
  ["我在学中文。", "I'm learning Chinese"],
  ["Wat betekent dat?", "what does that mean?"],
  ["Nasıl derim?", "how do I say it?"],
  ["Jeszcze raz, proszę.", "one more time, please"],
  ["Was heißt das auf Deutsch?", "what's that in German?"],
];
