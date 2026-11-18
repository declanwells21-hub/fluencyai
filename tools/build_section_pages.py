#!/usr/bin/env python3
"""Builds the standalone pages /how, /features and /join (site/how.html, features.html, join.html).
They replace the old copies of the Home page. Template = site/about.html (head, nav, scripts); every page has its own copy.
Run from the repo root:  python3 tools/build_section_pages.py
Source of facts: the Home page sections, /pricing, /faq and /privacy. Change copy here, then re-run."""
import json, re, html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / "site"
BASE = "https://fluencyai.app"
E = lambda s: html.escape(s, quote=False)
EA = lambda s: html.escape(s, quote=True)
TODAY = "2026-11-18"

tpl = (ROOT / "about.html").read_text(encoding="utf-8")
head, rest = tpl.split('<main class="wrap">', 1)
tail = rest.split("</main>", 1)[1]               # "\n</div>\n<script ...>...</html>"
head = re.sub(r'<script type="application/ld\+json">.*?</script>\s*', "", head, flags=re.S)
# About is the template, so un-highlight its nav item (these pages are not in the nav)
head = head.replace('<a href="/about" style="color:#fff;text-decoration:none;padding:8px 0;" aria-current="page">', '<a href="/about" style="color:var(--ink-200);text-decoration:none;padding:8px 0;">')

def ul(items): return "<ul>" + "".join(f"<li>{i}</li>" for i in items) + "</ul>"
def ol(items): return "<ol>" + "".join(f"<li><b>{E(a)}.</b> {E(b)}</li>" for a, b in items) + "</ol>"
def table(hd, rows):
    h = "".join(f"<th>{E(c)}</th>" for c in hd)
    r = "".join("<tr>" + "".join(f"<td>{E(c)}</td>" for c in row) + "</tr>" for row in rows)
    return f'<div class="tw"><table><thead><tr>{h}</tr></thead><tbody>{r}</tbody></table></div>'
def faq_html(faqs):
    return '<div class="cat">' + "".join(f"<details><summary>{E(q)}</summary><p>{E(a)}</p></details>" for q, a in faqs) + "</div>"
def faq_ld(faqs):
    return {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}
def crumbs(name, path):
    return {"@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Fluency AI", "item": BASE + "/"},
        {"@type": "ListItem", "position": 2, "name": name, "item": BASE + path}]}
def webpage(path, name, desc):
    return {"@type": "WebPage", "@id": f"{BASE}{path}#webpage", "url": f"{BASE}{path}", "name": name, "description": desc,
            "isPartOf": {"@id": f"{BASE}/#website"}, "publisher": {"@id": f"{BASE}/#organization"},
            "about": {"@id": f"{BASE}/#app"}, "inLanguage": "en", "dateModified": TODAY}

CTA = '''<div class="row"><a class="btn p" href="/join">Join the waitlist</a><a class="btn s" href="/pricing">See pricing</a><a class="btn s" href="/faq">Read the FAQ</a></div>'''
FOOT = '''<p class="foot">Questions or feedback: <a href="mailto:info@fluencyai.app">info@fluencyai.app</a>. Help with your account: <a href="mailto:support@fluencyai.app">support@fluencyai.app</a>. Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.</p>'''
def hero(eyebrow, h1): return f'<div style="display:grid;gap:14px;"><span class="eyebrow">{E(eyebrow)}</span><h1>{E(h1)}</h1></div>'

# ------------------------------------------------------------------ /how
HOW_FAQ = [
 ("Do I need to be at a certain level?", "No. Say one sentence, badly is fine, and Fluency AI works out where you are. You can also set your level yourself, from A1 to C2."),
 ("What can I say when I get stuck?", "Four things: say that again, slower please, explain differently, and give me a phrase. Every conversation carries these repair moves, so you never have to give up."),
 ("Is there a streak?", "A gentle one. A day counts when you speak for 2 minutes. Rest days are earned by practising, never bought."),
 ("Does Fluency AI keep my voice recordings?", "Recordings are turned into text and deleted within 24 hours unless you choose to save them. You can delete any conversation at any time."),
 ("Which languages can I practise?", "French, German and English are live. More are on the way; tell us which one you want when you join."),
]
HOW_STEPS = [("Listen", "It hears the sentence you actually said, including accent, speed and hesitation, not the one a textbook expected."),
             ("Speak", "There is no script to read. You say what you would really say."),
             ("Get feedback", "It answers like a person first, then shows the fix in three beats: what you said, what to say, and why."),
             ("Improve", "A sound-by-sound pronunciation breakdown is coming soon."),
             ("Remember", "Tomorrow's conversation builds on what you got wrong today, and you control what it keeps.")]
START = [("Join the waitlist", "Pick the language you want to speak. Waitlist members lock the launch price."),
         ("Wait for early access", "We email you when early access opens. Fluency AI is launching on iOS and Android."),
         ("Say one sentence", "Start a conversation out loud, even a bad one, and let the coach take it from there.")]
HOW_BODY = f"""{hero("How it works", "How Fluency AI works")}
<p class="lead">Fluency AI is a speaking coach you talk to out loud. It hears how you actually speak, answers like a person, and shows the fix in three beats: what you said, what to say, and why.</p>
<h2>What happens between your sentence and the reply?</h2>
{ol(HOW_STEPS)}
<h2>How does Fluency AI know what I said?</h2>
<p>There is no black box. You can see what it heard.</p>
{ul(["<b>Uncertain words are marked.</b> If it is only 61% sure of a word, it underlines it instead of guessing silently, so you can see exactly what was misheard.", "<b>Meaning comes before grammar.</b> It works out what you were reaching for, then decides whether the slip was worth stopping for.", "<b>Your mistakes carry over.</b> Tomorrow's conversation is built around what you got wrong today, and you decide what it keeps."])}
<h2>What can I say when I get stuck?</h2>
<p>Every conversation carries four repair moves, so a blank mind never ends the conversation:</p>
{ul(["<b>Say that again</b>, which repeats the line once, same words, no penalty", "<b>Slower, please</b>", "<b>Explain differently</b>", "<b>Give me a phrase</b>"])}
<h2>What do I get after each conversation?</h2>
<p>Ability, not points. After every conversation you see the minutes you spoke, how often you were understood first time, and the few things worth fixing, quoted from your own words. A talk streak counts a day when you speak for 2 minutes. The debrief figures on the home page are an example; your numbers come from your own sessions.</p>
<h2>Why does the conversation come first?</h2>
{table(["", "Traditional study", "Fluency AI"], [
 ["The loop", "Study, test, forget, repeat", "Speak, be understood, be corrected, speak again"],
 ["What you are rewarded for", "Points for finishing units", "Being understood"],
 ["Where corrections come from", "A generic answer key", "A sentence you actually said"]])}
<h2>How do I start with Fluency AI?</h2>
{ol(START)}
<h2>How it works: common questions</h2>
{faq_html(HOW_FAQ)}
<p>Next, see every option in <a href="/features">Fluency AI features</a>, compare plans on <a href="/pricing">pricing</a>, or read <a href="/about">about Fluency AI</a>. Back to the <a href="/">homepage</a>.</p>
{CTA}
{FOOT}"""
HOW = dict(path="/how", title="How Fluency AI Works: Speak, Get Feedback, Improve",
  desc="See how Fluency AI works: it hears the sentence you actually said, answers like a person, then shows what you said, what to say and why.",
  body=HOW_BODY, ld=[webpage("/how", "How Fluency AI Works", "How the Fluency AI speaking coach listens, answers and corrects you."), crumbs("How it works", "/how"), faq_ld(HOW_FAQ),
    {"@type": "HowTo", "name": "How to start speaking with Fluency AI", "step": [{"@type": "HowToStep", "position": i + 1, "name": a, "text": b} for i, (a, b) in enumerate(START)]}])

# ------------------------------------------------------------------ /features
FEAT_FAQ = [
 ("Can I control how Fluency AI corrects me?", "Yes: off, immediate, after its reply, important only, detailed or teaching. You can change it mid-conversation."),
 ("Can I role-play situations?", "Yes. Pick a scene or describe your own, like a job interview or complaining about a bill, and the coach stays in character."),
 ("Can explanations be in my own language?", "Yes. Choose your language, English, or both, and explanations follow your choice."),
 ("Does Fluency AI give pronunciation feedback?", "The coach listens for accent, speed and hesitation and marks words it is unsure of. A separate pronunciation breakdown is marked as coming soon."),
 ("Do voice and text cost the same?", "Yes. Voice or text uses the same conversation time from your Fluency Plus allowance."),
]
FEAT_BODY = f"""{hero("Features", "Fluency AI features")}
<p class="lead">Fluency AI lets you talk the way you want to learn. Mode, correction, level and voice speed sit one tap away inside every conversation.</p>
<h2>Which conversation modes does Fluency AI have?</h2>
<p>Fluency Plus includes all six modes. These four are the ones to start with:</p>
{table(["Mode", "What it does"], [
 ["Conversation", "Talk about anything. It follows your lead and keeps you speaking."],
 ["Tutor", "It explains, gives examples and checks you have got it before moving on."],
 ["Role-play", "Order, complain, interview. It plays the other person and stays in character."],
 ["Conversation + Correction", "Free talk, with fixes arriving between turns so the story keeps going."]])}
<h2>Casual or professional?</h2>
{ul(["<b>Casual:</b> relaxed, everyday speech, the way friends talk", "<b>Professional:</b> meetings, calls and interviews, in a work register"])}
<h2>How can I control corrections?</h2>
<p>It answers first, then shows the fix, so nothing stalls. Choose how much correction you want:</p>
{ul(["<b>Off:</b> just talk", "<b>Immediate:</b> fixes as you go", "<b>After:</b> fixes after its reply", "<b>Important only:</b> only the mistakes worth stopping for", "<b>Detailed:</b> a fuller breakdown", "<b>Teaching:</b> explanations built into the conversation"])}
<h2>Can Fluency AI explain things in my language?</h2>
<p>Yes. Pick your language, English, or both. Ask what a word means and the explanation arrives in the language you chose.</p>
<h2>Which levels, voice speeds and languages are supported?</h2>
{table(["Setting", "Options"], [
 ["Level", "A1, A2, B1, B2, C1, C2"],
 ["Voice speed", "Slow, Normal, Fast"],
 ["Input", "Voice or text, same time"],
 ["Languages", "French, German and English are live; more are on the way"]])}
<h2>What else is inside Fluency AI?</h2>
{table(["Feature", "Status"], [["Word bank", "Available"], ["Your path", "Available"], ["Talk streak", "Available"], ["Pronunciation breakdown", "Soon"]])}
<h2>Features: common questions</h2>
{faq_html(FEAT_FAQ)}
<p>See <a href="/how">how Fluency AI works</a>, check <a href="/pricing">pricing</a>, or browse <a href="/store">exam guides</a>. Back to the <a href="/">homepage</a>.</p>
{CTA}
{FOOT}"""
FEATURES = dict(path="/features", title="Fluency AI Features: Modes, Corrections, Levels",
  desc="Conversation, tutor and role-play modes, casual or professional register, and correction your way: off, immediate, after, or important only.",
  body=FEAT_BODY, ld=[webpage("/features", "Fluency AI Features", "Modes, correction styles, levels and voice speeds in the Fluency AI speaking coach."), crumbs("Features", "/features"), faq_ld(FEAT_FAQ)])

# ------------------------------------------------------------------ /join
JOIN_FAQ = [
 ("What happens after I join the waitlist?", "We email you when early access opens. Waitlist members lock the launch price."),
 ("Which languages can I choose?", "French, German or English, or tell us another language you want to speak."),
 ("Will you email me about anything else?", "No. We only email you about Fluency."),
]
JOIN_BODY = f"""{hero("Waitlist", "Join the Fluency AI waitlist")}
<p class="lead">Get early access to Fluency AI, the speaking coach you talk to out loud, in French, German and English. Join the waitlist and your launch price is locked.</p>
<form id="wl" novalidate style="display:grid;gap:14px;padding:28px;border-radius:28px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);">
  <label style="display:grid;gap:6px;font:600 13px/1 var(--font-body);color:var(--ink-200);">Email
    <input id="wl-email" type="email" required autocomplete="email" placeholder="you@example.com" style="height:48px;padding:0 16px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(4,18,27,.6);color:#fff;font:400 16px/1 var(--font-body);">
  </label>
  <label style="display:grid;gap:6px;font:600 13px/1 var(--font-body);color:var(--ink-200);">Language you want to speak
    <select id="wl-lang" style="height:48px;padding:0 14px;border-radius:14px;border:1px solid rgba(255,255,255,.16);background:rgba(4,18,27,.6);color:#fff;font:400 16px/1 var(--font-body);">
      <option value="French">French</option><option value="German">German</option><option value="English">English</option><option value="Another language">Another language</option>
    </select>
  </label>
  <button id="wl-btn" type="submit" class="btn p" style="width:100%;border:0;cursor:pointer;">Join the waitlist</button>
  <p id="wl-msg" role="status" aria-live="polite" style="margin:0;font:500 14px/1.45 var(--font-body);color:var(--ink-200);min-height:20px;"></p>
  <span class="foot">We'll only email you about Fluency. <a href="/privacy">Privacy</a></span>
</form>
<h2>What do I get for joining?</h2>
{ul(["An email when early access opens", "Your launch price locked: Fluency Plus is $12 a month, with about 7 hours of conversation", "First access to Fluency AI on iOS and Android"])}
<h2>Waitlist questions</h2>
{faq_html(JOIN_FAQ)}
<p>Want to know more first? See <a href="/how">how it works</a>, <a href="/features">features</a> and <a href="/pricing">pricing</a>.</p>
{FOOT}"""
JOIN_JS = """<script src="/fl-forms.js"></script>
<script>
(function(){
  var f=document.getElementById('wl'),em=document.getElementById('wl-email'),lg=document.getElementById('wl-lang'),btn=document.getElementById('wl-btn'),msg=document.getElementById('wl-msg');
  if(!f)return;
  f.addEventListener('submit',function(e){
    e.preventDefault();
    var v=(em.value||'').trim();
    if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(v)){msg.style.color='#ff9a9a';msg.textContent='Add a complete email so we can reach you.';em.focus();return;}
    btn.disabled=true;msg.style.color='';msg.textContent='Joining...';
    var p=window.flSubmit?window.flSubmit('waitlist',{email:v,language:lg.value,state:(window.FL_CONFIG&&window.FL_CONFIG.launchState)||'waitlist',source:'join_page'}):Promise.resolve({ok:true});
    p.then(function(){msg.style.color='#54DFDB';msg.textContent="You're on the list. We'll email you when early access opens.";f.reset();})
     .catch(function(){btn.disabled=false;msg.style.color='#ff9a9a';msg.textContent='Something went wrong. Please try again.';});
  });
})();
</script>
"""
JOIN = dict(path="/join", title="Join the Fluency AI Waitlist", extra_js=JOIN_JS,
  desc="Get early access to Fluency AI, the speaking coach you talk to out loud, in French, German and English. Join the waitlist and your launch price is locked.",
  body=JOIN_BODY, ld=[webpage("/join", "Join the Fluency AI waitlist", "Join the waitlist for early access to Fluency AI and lock your launch price."), crumbs("Waitlist", "/join"), faq_ld(JOIN_FAQ)])

# ------------------------------------------------------------------ assemble
def build(fname, spec):
    h = head
    url = BASE + spec["path"]
    h = re.sub(r"<title>[^<]*</title>", f"<title>{E(spec['title'])}</title>", h, count=1)
    h = re.sub(r'(<meta name="description" content=")[^"]*(")', lambda m: m.group(1) + EA(spec["desc"]) + m.group(2), h, count=1)
    h = re.sub(r'(<link rel="canonical" href=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), h, count=1)
    h = re.sub(r'(<meta property="og:url" content=")[^"]*(")', lambda m: m.group(1) + url + m.group(2), h, count=1)
    for k in ("og:title", "twitter:title"):
        h = re.sub(rf'(<meta (?:property|name)="{k}" content=")[^"]*(")', lambda m: m.group(1) + EA(spec["title"]) + m.group(2), h, count=1)
    for k in ("og:description", "twitter:description"):
        h = re.sub(rf'(<meta (?:property|name)="{k}" content=")[^"]*(")', lambda m: m.group(1) + EA(spec["desc"]) + m.group(2), h, count=1)
    ld = '<script type="application/ld+json">' + json.dumps({"@context": "https://schema.org", "@graph": spec["ld"]}, ensure_ascii=False).replace("</", "<\\/") + "</script>\n"
    h = h.replace("</head>", ld + "</head>", 1)
    # page-body styles: lists/tables/links reuse the shared .fl-seo rules, so wrap the content in that class
    body = f'<main class="wrap fl-seo fl-in" style="gap:22px"><div class="in" style="display:grid;gap:22px">{spec["body"]}</div></main>'
    t = tail
    if spec.get("extra_js"):
        t = t.replace('<script src="/fluency-data.js"></script>', '<script src="/fluency-data.js"></script>\n' + spec["extra_js"].split("\n", 1)[0], 1)
        t = t.replace("</body>", spec["extra_js"].split("\n", 1)[1] + "</body>", 1)
    (ROOT / fname).write_text(h + body + t, encoding="utf-8")
    print("wrote site/" + fname)

build("how.html", HOW); build("features.html", FEATURES); build("join.html", JOIN)
