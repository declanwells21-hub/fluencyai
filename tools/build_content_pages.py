#!/usr/bin/env python3
"""Builds site/about.html and site/faq.html (client content, new design).
Run from the repo root:  python3 tools/build_content_pages.py
Edit the CONTENT below, run again, commit the two html files. No other build step."""
import json, html, re, pathlib
SITE = pathlib.Path(__file__).resolve().parent.parent / "site"
esc = html.escape

# ------------------------------------------------------------------ CONTENT (client wording)
BRAND = ("Fluency AI is an adaptive language acquisition platform engineered to eliminate speaking anxiety and mental "
 "hesitation through real-time vocal conversation practice. Unlike traditional language applications that rely on "
 "multiple-choice quizzes and memorization, Fluency AI acts as a 24/7 private, judgment-free speaking partner that "
 "helps learners transition from passive grammar study to active, confident conversation.")

DIFFERENT = [
 ("mic", "Real-Time AI Vocal Conversation", "Our core engine allows you to engage in dynamic, unscripted spoken dialogues anytime, anywhere, completely removing the fear of social judgment or embarrassment."),
 ("drama", "Interactive Role-Play Scenarios", "We provide targeted situational practice modules, ranging from everyday travel and social interactions to professional job interviews and official visa appointments, to build real-world conversational confidence."),
 ("message-square-quote", "In-Session Smart Phrase Bank", "When your mind goes blank mid-conversation, our smart phrase bank instantly supplies situational, native-level phrases so you never freeze up."),
 ("chart-no-axes-column", "Visual Grammar Chart Explanations", "After your speaking sessions, clean visual breakdowns explain the why behind your grammar patterns without bogging you down in heavy academic jargon."),
 ("book-open-check", "Official Digital Exam Blueprints", "Standalone and app-paired tactical guides designed to help learners pass official certifications (such as the Goethe-Zertifikat) using high-scoring templates and zero-fluff study roadmaps."),
]

FAQ = [
 ("The Fluency AI platform and method", [
  ("What is Fluency AI?",
   "Fluency AI is an adaptive language learning platform engineered to eliminate speaking anxiety and mental hesitation through real-time vocal conversation practice. Instead of relying on multiple-choice quizzes or flashcards, Fluency AI provides a 24/7 private, judgment-free AI partner that helps learners transition from passive grammar study to active, confident speech."),
  ("How does Fluency AI help me overcome speaking anxiety?",
   "Speaking anxiety stems from the fear of social judgment and making mistakes in front of others. Fluency AI removes this pressure entirely by giving you a patient, private space to practice speaking aloud. You can converse freely, make mistakes, and receive gentle, real-time voice corrections to build your conversational muscle memory without embarrassment."),
  ("How is Fluency AI different from traditional apps like Duolingo or Babbel?",
   "Traditional apps focus primarily on vocabulary memorization and text-based drills. Fluency AI focuses entirely on active spoken output. You engage in dynamic, unscripted spoken dialogues backed by role-play scenarios, smart phrase banks, and visual grammar charts designed to get you speaking fluently in real life."),
 ]),
 ("Features and learning tools", [
  ("What are Role-Play Scenarios, and how do they work?",
   "Role-Play Scenarios are targeted, real-world conversational modules inside Fluency AI. Whether you need to practice ordering coffee, navigating a job interview, or handling a visa appointment, these scenarios place you in realistic situations so you never freeze up during actual interactions."),
  ("What is the Smart Phrase Bank?",
   "The Smart Phrase Bank is your personal repository where you store new words, phrases, and sentences you encounter over the course of your conversations with the AI. It acts as your centralized hub to review, learn, and make references for later study."),
  ("What are Visual Chart Explanations?",
   "Visual Chart Explanations untangle complex grammar and vocabulary clearly in a structured chart format. Whenever you need clarity on a specific meaning, rule, or correction, the platform breaks it down visually, tailored and related to the exact language you are learning."),
 ]),
 ("Digital Exam Blueprints", [
  ("What are the Digital Exam Blueprints?",
   "Our Digital Exam Blueprints are standalone, step-by-step tactical guides engineered to help you pass official language certification exams (such as the Goethe-Zertifikat). They strip away unnecessary theory and give you exact structural cheat sheets, high-scoring speaking templates, and targeted study roadmaps."),
  ("Do I need the Fluency AI app to use the Digital Exam Blueprints?",
   "No. The Exam Blueprints are complete, standalone digital products designed for immediate use. However, when paired with the Fluency AI app, you get the ultimate advantage: you can take the exact speaking prompts and templates from your blueprint and practice them directly with your AI voice partner."),
 ]),
 ("The 20% Partnership Program", [
  ("How does the Fluency AI Partnership Program work?",
   "The Partnership Program is a universal revenue-share model built for creators, language educators, tutors, and dedicated users. You can earn through two clear streams. App subscriptions: earn a direct 20% cash commission whenever someone downloads the Fluency AI app and purchases their first subscription using your unique referral code. Digital Exam Blueprints: earn a direct 20% cash commission on every sale whenever someone follows your personalized link to our digital product sales page and purchases an exam blueprint."),
  ("Do my friends or followers get anything when I share my code?",
   "Yes! Anyone who uses your official referral code or link automatically receives an exclusive discount at checkout, making it a great incentive for your audience."),
  ("How do I become part of the Partnership Program?",
   "Joining is simple. Apply on the Partners page of the Fluency AI website. Once you are accepted, we email you, and you can sign in to your Partner Hub to generate your unique referral codes and custom sales links, then start sharing them across your content, social platforms, study groups, or classrooms."),
 ]),
]

# ------------------------------------------------------------------ SHARED SHELL
WORDMARK = ('<span style="display:inline-flex;align-items:baseline;gap:4.84px;font:var(--fw-black) 22px/1 var(--font-display);letter-spacing:-.035em;color:var(--white);">'
            '<span><span style="color:var(--teal-400)">F</span>luency</span>'
            '<span style="font:var(--fw-bold) 9.24px/1 var(--font-display);letter-spacing:.08em;color:var(--teal-300);transform:translateY(-4.84px)">AI</span></span>')
LINKS = [("/", "Home"), ("/store", "Exam guides"), ("/pricing", "Pricing"), ("/partners", "Partners"), ("/about", "About"), ("/faq", "FAQ"), ("/blog", "Blog")]

def nav(active):
    a = "".join(
        f'<a href="{h}" style="color:{"#fff" if h == active else "var(--ink-200)"};text-decoration:none;padding:8px 0;"'
        f'{" aria-current=\"page\"" if h == active else ""}>{t}</a>' for h, t in LINKS)
    return f'''<header style="position:sticky;top:0;z-index:30;padding:12px 16px;">
    <nav data-fl-nav style="max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:20px;padding:10px 10px 10px 20px;border-radius:999px;background:rgba(11,34,51,.72);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);">
      <a href="/" aria-label="Fluency AI home" style="text-decoration:none;display:flex;">{WORDMARK}</a>
      <div data-fl-links style="flex:1;display:flex;flex-wrap:wrap;gap:4px 18px;justify-content:center;font:600 14px/1 var(--font-body);">{a}</div>
      <button type="button" class="js-login-trigger" data-fl-signin data-logged-out="Sign in" data-logged-in="My account" style="background:none;border:0;cursor:pointer;color:var(--ink-200);padding:8px 4px;font:600 14px/1 var(--font-body);white-space:nowrap;">Sign in</button>
    </nav>
  </header>'''

def coach():
    # same Mia badge the other pages use
    return ('<div style="width:min(180px,46vw);aspect-ratio:1/1;position:relative;"><div style="position:absolute;inset:0;border-radius:50%;overflow:hidden;'
            'background:radial-gradient(120% 95% at 50% 8%,#18A99A 0%,#0F5462 38%,#0D3346 68%,#0B2233 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 18px 36px -18px rgba(4,18,27,.65);display:flex;align-items:flex-end;justify-content:center;">'
            '<div style="position:relative;width:76%;aspect-ratio:300/330;margin-bottom:-6%;"><fl-coach character="mia" skin="2" hair="bob" hair-color="ink" outfit="casual" glasses="round" age="teen" beard="none" state="happy" crop="bust" style="position:absolute;inset:0;width:100%;height:100%"></fl-coach></div></div></div>')

CSS = '''
html,body{overflow-x:clip}
body{margin:0;background:#04121B;color:#D8E4EA;-webkit-font-smoothing:antialiased}
a{color:var(--teal-300);text-underline-offset:3px}a:hover{color:var(--teal-200)}
:focus-visible{outline:2px solid var(--teal-400);outline-offset:2px}
.pg{min-height:100vh;background:radial-gradient(90% 40% at 50% 0%,#123A4C 0%,#04121B 60%);font-family:var(--font-body)}
.wrap{max-width:860px;margin:0 auto;padding:32px 24px 96px;display:grid;gap:28px}
.eyebrow{font:700 11px/1 var(--font-body);letter-spacing:.12em;text-transform:uppercase;color:var(--teal-300)}
h1{margin:0;font:800 clamp(38px,5vw,60px)/1.02 var(--font-display);letter-spacing:-.035em;color:#fff;text-wrap:balance}
h2{margin:0;font:800 clamp(26px,3.4vw,34px)/1.1 var(--font-display);letter-spacing:-.03em;color:#fff}
.lead{font:400 19px/1.6 var(--font-body);color:var(--ink-100);margin:0}
.card{display:grid;grid-template-columns:44px minmax(0,1fr);gap:14px;align-items:start;padding:18px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.card .ic{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:rgba(16,184,184,.14);color:var(--teal-300)}
.card b{display:block;font:700 18px/1.3 var(--font-display);color:#fff;margin-bottom:4px}
.card span.t{font:400 16px/1.55 var(--font-body);color:var(--ink-300)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:46px;padding:0 22px;border-radius:999px;font:700 15px/1 var(--font-body);text-decoration:none}
.btn.p{background:var(--teal-500);color:#04121B;box-shadow:inset 0 -3px 0 var(--teal-700)}
.btn.s{border:1px solid rgba(255,255,255,.22);color:#fff}
.row{display:flex;flex-wrap:wrap;gap:12px}
.cat{display:grid;gap:12px}
details{border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);overflow:hidden}
details[open]{background:rgba(255,255,255,.07)}
summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 18px;font:700 17px/1.35 var(--font-display);color:#fff;min-height:44px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";flex:0 0 auto;font:600 24px/1 var(--font-body);color:var(--teal-300)}
details[open] summary::after{content:"\\2212"}
details p{margin:0;padding:0 18px 18px;font:400 16px/1.65 var(--font-body);color:var(--ink-200)}
.foot{font:500 13px/1.6 var(--font-body);color:var(--ink-400)}
@media (max-width:760px){
 [data-fl-nav]{flex-wrap:wrap!important;border-radius:24px!important;padding:10px 12px!important;gap:10px!important}
 [data-fl-links]{order:3;flex:1 1 100%!important;justify-content:flex-start!important;flex-wrap:nowrap!important;overflow-x:auto;gap:20px!important;padding:2px 4px!important;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 85%,transparent)}
 [data-fl-links]::-webkit-scrollbar{display:none}[data-fl-links]>*{white-space:nowrap;flex:0 0 auto}
 .wrap{padding:16px 16px 72px}
}
'''

ICONS = {  # Lucide paths (ISC licence), inlined so the pages need no icon script
 "mic": '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
 "drama": '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
 "message-square-quote": '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
 "chart-no-axes-column": '<line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/>',
 "book-open-check": '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
}
def icon(name):
    return f'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{ICONS[name]}</svg>'

def page(path, title, desc, active, body, jsonld):
    ld = "".join(f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>\n' for j in jsonld)
    url = "https://fluencyai.app" + path
    t, d = esc(title, quote=True), esc(desc, quote=True)
    out = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{t}</title>
<meta name="description" content="{d}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{url}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Fluency AI">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="https://fluencyai.app/assets/og-share.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="https://fluencyai.app/assets/og-share.png">
<meta name="theme-color" content="#04121B">
<link rel="icon" href="/assets/logo-appicon.png">
<link rel="manifest" href="/manifest.json">
<link rel="stylesheet" href="/ds/styles.css">
<link rel="stylesheet" href="/ds/components.css">
<link rel="stylesheet" href="/assets/css/fl-account.css">
<style>{CSS}</style>
{ld}</head>
<body>
<div class="pg" data-fl-page>
  {nav(active)}
  <main class="wrap">
{body}
  </main>
</div>
<script src="/fluency-config.js"></script>
<script src="/fluency-data.js"></script>
<script src="/assets/js/fluency-coach.js"></script>
<script src="/assets/js/fl-ref.js"></script>
<script src="/config.js"></script>
<script src="/assets/js/fl-account.js"></script>
<script src="/auth.js"></script>
</body>
</html>
'''
    # fl-ref.js / fl-account.js load order copied from partner-hub.html
    return out

# ------------------------------------------------------------------ ABOUT
cards = "\n".join(
  f'    <div class="card"><span class="ic" aria-hidden="true">{icon(i)}</span><div><b>{esc(t)}</b><span class="t">{esc(d)}</span></div></div>'
  for i, t, d in DIFFERENT)
about_body = f'''    <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center;">
      <div style="display:grid;gap:14px;"><span class="eyebrow">About Fluency AI</span><h1>Speak out loud. Without the fear.</h1></div>
      <div aria-hidden="true">{coach()}</div>
    </div>
    <p class="lead">{esc(BRAND)}</p>
    <h2>What makes Fluency AI different</h2>
    <div style="display:grid;gap:12px;">
{cards}
    </div>
    <div class="row">
      <a class="btn p" href="/#join">Join the waitlist</a>
      <a class="btn s" href="/faq">Read the FAQ</a>
      <a class="btn s" href="/partners">Become a partner</a>
    </div>
    <p class="foot">Questions or feedback: <a href="mailto:info@fluencyai.app">info@fluencyai.app</a>. Help with your account: <a href="mailto:support@fluencyai.app">support@fluencyai.app</a>.
      Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.</p>'''
about_ld = [{
  "@context": "https://schema.org", "@type": "AboutPage", "name": "About Fluency AI", "url": "https://fluencyai.app/about",
  "about": {"@type": "Organization", "name": "Fluency AI", "url": "https://fluencyai.app/", "email": "info@fluencyai.app",
            "description": BRAND,
            "contactPoint": {"@type": "ContactPoint", "contactType": "customer support", "email": "support@fluencyai.app"}}}]
(SITE / "about.html").write_text(page("/about", "About Fluency AI: speak out loud, without the fear",
  "Fluency AI is an adaptive language platform that removes speaking anxiety through real-time vocal conversation practice. See what makes it different.",
  "/about", about_body, about_ld), encoding="utf-8")

# ------------------------------------------------------------------ FAQ
parts, n = [], 0
for cat, qs in FAQ:
    items = []
    for q, a in qs:
        n += 1
        items.append(f'      <details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>')
    parts.append(f'    <section class="cat" aria-labelledby="c{len(parts)}"><span class="eyebrow" id="c{len(parts)}">{esc(cat)}</span>\n' + "\n".join(items) + '\n    </section>')
assert n == 11, n
faq_body = f'''    <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center;">
      <div style="display:grid;gap:14px;"><span class="eyebrow">FAQ</span><h1>Questions, answered.</h1></div>
      <div aria-hidden="true">{coach()}</div>
    </div>
{chr(10).join(parts)}
    <div class="row">
      <a class="btn p" href="/#join">Join the waitlist</a>
      <a class="btn s" href="/partners">Partnership Program</a>
      <a class="btn s" href="/store">Exam guides</a>
    </div>
    <p class="foot">Still stuck? Write to <a href="mailto:support@fluencyai.app">support@fluencyai.app</a>.</p>'''
faq_ld = [{"@context": "https://schema.org", "@type": "FAQPage",
  "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for _, qs in FAQ for q, a in qs]}]
(SITE / "faq.html").write_text(page("/faq", "FAQ | Fluency AI",
  "Answers about Fluency AI: the speaking method, role-play scenarios, the phrase bank, digital exam blueprints and the 20% partnership program.",
  "/faq", faq_body, faq_ld), encoding="utf-8")
print("ok", n, "questions")
