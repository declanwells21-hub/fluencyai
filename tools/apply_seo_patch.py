#!/usr/bin/env python3
"""One-off SEO / AEO / GEO patch (Nov 18, 2026). Idempotent: markers prevent double insertion.
Adds crawlable answer sections + JSON-LD to Pricing, Store, Guides, Partners, About, FAQ,
SoftwareApplication schema on Home (+ /how /features /join copies), WebPage schema on Terms/Privacy."""
import json, re, html, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / "site"
BASE = "https://fluencyai.app"
E = lambda s: html.escape(s, quote=False)

CSS = """<style id="fl-seo-css">
.fl-seo{position:relative;z-index:50;background:#04121B;border-top:1px solid rgba(255,255,255,.08);color:#D8E4EA;font:400 16px/1.65 var(--font-body,"Figtree",system-ui,sans-serif)}
.fl-seo .in{max-width:860px;margin:0 auto;padding:56px 24px 120px;display:grid;gap:22px}
.fl-seo.fl-in{background:none;border:0;z-index:auto}.fl-seo.fl-in .in{padding:0;max-width:none}
.fl-seo h2{margin:12px 0 0;font:800 clamp(24px,3vw,30px)/1.15 var(--font-display,"Manrope",system-ui,sans-serif);letter-spacing:-.025em;color:#fff}
.fl-seo p{margin:0}.fl-seo .answer{font-size:18px;color:#EDF3F6}
.fl-seo ul,.fl-seo ol{margin:0;padding-left:22px;display:grid;gap:8px}
.fl-seo a{color:#54DFDB;text-underline-offset:3px}
.fl-seo .tw{overflow-x:auto;border:1px solid rgba(255,255,255,.12);border-radius:14px}
.fl-seo table{width:100%;border-collapse:collapse;min-width:520px;font-size:15px}
.fl-seo th,.fl-seo td{padding:11px 14px;text-align:left;vertical-align:top;border-bottom:1px solid rgba(255,255,255,.08)}
.fl-seo th{color:#fff;font-weight:700;background:rgba(255,255,255,.05)}.fl-seo tr:last-child td{border-bottom:0}
.fl-seo dl{margin:0;display:grid;gap:14px}.fl-seo dt{font-weight:700;color:#fff}.fl-seo dd{margin:4px 0 0;color:#B7CCD6}
@media (max-width:760px){.fl-seo .in{padding:40px 18px 140px}}
</style>"""

def table(head, rows):
    h = "".join(f"<th>{E(c)}</th>" for c in head)
    r = "".join("<tr>" + "".join(f"<td>{E(c)}</td>" for c in row) + "</tr>" for row in rows)
    return f'<div class="tw"><table><thead><tr>{h}</tr></thead><tbody>{r}</tbody></table></div>'
ul = lambda items: "<ul>" + "".join(f"<li>{E(i)}</li>" for i in items) + "</ul>"
ol = lambda items: "<ol>" + "".join(f"<li><b>{E(a)}.</b> {E(b)}</li>" for a, b in items) + "</ol>"
def faq_html(faqs):
    return "<dl>" + "".join(f"<div><dt>{E(q)}</dt><dd>{E(a)}</dd></div>" for q, a in faqs) + "</dl>"
def faq_ld(faqs):
    return {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}
def ld_script(objs):
    graph = {"@context": "https://schema.org", "@graph": objs}
    return '<script type="application/ld+json">' + json.dumps(graph, ensure_ascii=False).replace("</", "<\\/") + "</script>"
def webpage(path, name, desc, kind="WebPage", extra=None):
    d = {"@type": kind, "@id": f"{BASE}{path}#webpage", "url": f"{BASE}{path}", "name": name, "description": desc,
         "isPartOf": {"@id": f"{BASE}/#website"}, "publisher": {"@id": f"{BASE}/#organization"}, "inLanguage": "en", "dateModified": "2026-11-18"}
    if extra: d.update(extra)
    return d

CUR = ("Prices are shown in US dollars, Nigerian naira, Ghanaian cedi, Kenyan shillings, South African rand, euros and British pounds "
       "as approximations. Guides are paid on Selar, which charges the real amount at checkout.")
EXAM_TABLE = table(["Country", "Exams covered", "Guides", "Price"], [
    ["Germany", "Goethe-Zertifikat A1 to C2, telc B1, B2 and C1 Hochschule, DTZ", "10", "$7 to $12"],
    ["France", "DELF B1 and B2, DALF C1 and C2, TCF IRN A2, B1 and B2", "7", "$7 to $12"],
    ["Canada", "CELPIP General, IELTS General Training, TCF Canada and TEF Canada at CLB or NCLC 7 and 9", "8", "$9 to $12"]])
NOT_OFFICIAL = ("No. They are independent study material, and Fluency AI is not affiliated with or endorsed by the exam bodies. "
                "Buying a guide does not guarantee a result.")

# ---------------------------------------------------------------- page definitions
PAGES = {}

PRICING_FAQ = [
 ("Do voice and text cost the same?", "Yes. Voice and text use the same conversation time from your monthly allowance."),
 ("Can I cancel Fluency Plus?", "Yes, you can cancel any time and keep access until the end of the period you paid for. Purchases made through the App Store or Google Play follow their rules for cancelling and refunds."),
 ("Do unused minutes roll over?", "Unused monthly credits do not roll over. Top-up credits are used after your monthly time and do not expire while your account is open."),
 ("What happens when my monthly time runs out?", "You can use top-up credits, buy a top-up, or wait for your plan to reset. Nothing is charged automatically."),
 ("Which currencies are shown?", CUR),
 ("Are the prices final?", "Prices are provisional and may change before launch, and we will tell you before your next billing date. Joining the waitlist locks your launch price."),
]
PAGES["pricing.html"] = dict(
  path="/pricing", before="<script src=\"/fluency-config.js\">",
  body=f"""<p class="answer">Fluency AI costs $12 a month for Fluency Plus, which includes about 7 hours (3,000 credits) of voice or text conversation. One-time top-ups start at $5 and one-time exam guides start at $7. Nothing is charged automatically when your time runs out.</p>
<h2>How much does Fluency AI cost?</h2>
{table(["What", "Price", "What you get"], [
 ["Fluency Plus", "$12 a month", "About 7 hours of conversation a month (3,000 credits), voice or text, all six modes, correction your way"],
 ["Top-up, about 1 hour", "$5", "500 credits, one-time, never expires"],
 ["Top-up, about 2½ hours", "$10", "1,100 credits, bonus included"],
 ["Top-up, about 5½ hours", "$20", "2,400 credits, bonus included"],
 ["Exam guide, Starter", "$7", "A1, A2 and TCF IRN A2 guides"],
 ["Exam guide, Core", "$9", "B1 and B2 guides, plus the Canada guides at CLB or NCLC 7 and the CELPIP and IELTS CLB 9 guides"],
 ["Exam guide, Advanced", "$12", "C1 and C2 guides, plus the TCF Canada and TEF Canada NCLC 9 guides"]])}
<h2>What is included in Fluency Plus?</h2>
{ul(["About 7 hours of conversation a month (3,000 credits)", "Voice or text, same time", "All six modes: Conversation, Tutor, Role-play and more", "Correction your way, from off to teaching", "Explanations in your language, English, or both"])}
<h2>Pricing questions, answered</h2>
{faq_html(PRICING_FAQ)}
<p>Looking for exam guides? See the <a href="/store">exam guide store</a>, or <a href="/join">join the waitlist</a> to lock your launch price. Back to the <a href="/">Fluency AI homepage</a>.</p>""",
  ld=[webpage("/pricing", "Pricing | Fluency AI", "One plan, optional top-ups, and one-time exam guides. Nothing charged automatically when your talk time runs out."),
      faq_ld(PRICING_FAQ),
      {"@type": "Product", "@id": f"{BASE}/pricing#fluency-plus", "name": "Fluency Plus", "brand": {"@id": f"{BASE}/#organization"},
       "description": "Monthly Fluency AI plan with about 7 hours (3,000 credits) of voice or text conversation practice in French, German and English.",
       "offers": {"@type": "Offer", "price": "12", "priceCurrency": "USD", "availability": "https://schema.org/PreOrder", "url": f"{BASE}/pricing",
                  "priceSpecification": {"@type": "UnitPriceSpecification", "price": "12", "priceCurrency": "USD", "billingDuration": 1, "unitCode": "MON"}}}])

STORE_FAQ = [
 ("How are the exam guides delivered?", "Each guide is a 14-page PDF. When payment succeeds on Selar your download link appears straight away, and Selar also emails it to you."),
 ("How much do the exam guides cost?", "Guides cost $7, $9 or $12 depending on the exam level. " + CUR),
 ("Are the exam guides official?", NOT_OFFICIAL),
 ("What if my download fails?", "Check your spam folder, then use Selar's buyer support. You can also email support@fluencyai.app with the email you used to pay and we will help."),
 ("Can I get a refund on an exam guide?", "Because a guide is a digital file delivered on purchase, refunds follow Selar's terms. If a file is faulty, missing or not what we described, contact us and we will fix it or put it right."),
 ("Do I need the Fluency AI app to use a guide?", "No. Each guide is a complete, standalone PDF. If you also use Fluency AI, you can practise your guide's speaking prompts out loud with the coach."),
]
PAGES["store.html"] = dict(
  path="/store", before="<script src=\"/fluency-config.js\">",
  body=f"""<p class="answer">Fluency AI exam guides are independent, unofficial 14-page PDF study guides for the language exams behind visas, residence, citizenship, university and work. There are 25 guides for Germany, France and Canada, priced at $7, $9 or $12, each a one-time purchase on Selar with an instant download.</p>
<h2>Which exam guides are available?</h2>
{EXAM_TABLE}
<h2>How do the exam guides work?</h2>
{ul(["Each guide is a 14-page PDF you can read in about 20 minutes", "Pay once on Selar and your download link appears straight away; Selar also emails it", "Keep it forever and print it for your own study; sharing or reselling is not allowed", "Every guide states its edition, and exam rules change, so always check with the exam body"])}
<h2>Exam guide questions, answered</h2>
{faq_html(STORE_FAQ)}
<p>Want a guide plus speaking practice? See <a href="/pricing">Fluency AI pricing</a> or read the <a href="/guides">Exam Blueprints overview</a>. Back to the <a href="/">Fluency AI homepage</a>.</p>""",
  ld=[webpage("/store", "Language Exam Guides: Goethe, DELF, TCF, IELTS | Fluency AI", "20-minute PDF study guides for the language exams behind visas, residence, citizenship and university.", "CollectionPage"),
      faq_ld(STORE_FAQ),
      {"@type": "Product", "@id": f"{BASE}/store#guides", "name": "Fluency AI Exam Guides", "brand": {"@id": f"{BASE}/#organization"},
       "description": "Independent 14-page PDF study guides for Goethe, telc, DTZ, DELF, DALF, TCF, TEF, CELPIP and IELTS exams.",
       "offers": {"@type": "AggregateOffer", "lowPrice": "7", "highPrice": "12", "priceCurrency": "USD", "offerCount": 25, "url": f"{BASE}/store"}}])

GUIDES_FAQ = [
 ("What are Fluency AI Exam Blueprints?", "They are independent, unofficial 14-page guides to the language exams people sit to move, study, work and stay. Each one decodes the exam in about 20 minutes."),
 ("Which exams do the Exam Blueprints cover?", "There are 25 guides: Goethe, telc and DTZ for Germany, DELF, DALF and TCF IRN for France, and CELPIP, IELTS General Training, TCF Canada and TEF Canada for Canada."),
 ("How much do Exam Blueprints cost?", "Guides cost $7 for Starter levels, $9 for Core levels and $12 for Advanced levels, plus the TCF Canada and TEF Canada NCLC 9 guides."),
 ("Are Exam Blueprints official?", NOT_OFFICIAL),
 ("Do I need the Fluency AI app?", "No. Each blueprint is complete on its own. With the app you can practise its speaking prompts and templates out loud with the coach."),
]
PAGES["guides/index.html"] = dict(
  path="/guides", before="<footer>", css=True,
  body=f"""<p class="answer">Fluency AI Exam Blueprints are independent, unofficial 14-page guides to the French, German and English exams people sit for visas, residence, citizenship, study and work. Each takes about 20 minutes to read, and there are 25 in the 2026/2027 edition.</p>
<h2>Which exams do the Exam Blueprints cover?</h2>
{EXAM_TABLE}
<h2>Who are Exam Blueprints for?</h2>
{ul(["Family and partner visas", "Work and training", "Residence permits", "Settlement and citizenship", "Immigration (Canada CLB and NCLC scores)", "University admission", "Top-level mastery (C1 and C2)"])}
<h2>Exam Blueprint questions, answered</h2>
{faq_html(GUIDES_FAQ)}
<p>Browse prices and buy on the <a href="/store">exam guide store</a>, compare plans on <a href="/pricing">pricing</a>, or return to the <a href="/">Fluency AI homepage</a>.</p>""",
  ld=[webpage("/guides", "Exam Blueprints | Fluency AI", "Short, straight-talking guides to the French, German and English exams people sit to move, study, work and stay.", "CollectionPage"),
      faq_ld(GUIDES_FAQ)])

PARTNER_FAQ = [
 ("How much commission do Fluency Partners earn?", "Partners earn 20% on confirmed exam blueprint sales and on a referred person's first app subscription payment."),
 ("How long are partner links remembered?", "Your code is remembered for 30 days and passed to Selar at checkout."),
 ("What is the minimum payout and when are partners paid?", "The minimum payout is $20. Confirmed orders are held for 14 days in case of a refund, then credited, and paid on the 15th each month by Paystack or bank transfer."),
 ("Do clicks earn commission?", "No. Only confirmed orders count. Clicks never do."),
 ("Do the people I refer get anything?", "Yes. Anyone who uses your official referral code or link receives an exclusive discount at checkout."),
 ("How do I become a Fluency Partner?", "Apply on the Partners page and we reply within 3 working days. Once accepted, we email you and you sign in to the Partner hub to generate your referral codes and links."),
]
PARTNER_STEPS = [("Get your link", "Your link looks like fluencyai.app/r/YOURCODE and works for the store, the app or any single guide."),
                 ("Someone buys", "Your code is remembered for 30 days and passed to Selar at checkout."),
                 ("Selar confirms", "The order is held for 14 days in case of a refund, then credited to you."),
                 ("Monthly payout", "You are paid on the 15th by Paystack or bank transfer once you are over $20.")]
PAGES["partners.html"] = dict(
  path="/partners", before="<script src=\"/fluency-config.js\">",
  body=f"""<p class="answer">Fluency Partners is the Fluency AI affiliate programme: creators, teachers and affiliates earn 20% commission on confirmed exam blueprint sales and on a referred person's first app subscription payment. Links are remembered for 30 days, orders are held 14 days for refunds, and payouts are monthly once you pass $20.</p>
<h2>How does the Fluency Partner programme work?</h2>
{table(["Stream", "Commission", "When it is earned"], [
 ["Exam blueprints", "20%", "Someone buys a guide through your link and the order is confirmed"],
 ["App subscriptions", "20%", "A referred person's first subscription payment is confirmed (first payment only)"],
 ["Audience benefit", "Discount", "People who use your code or link get an exclusive discount at checkout"]])}
<h2>How do I get paid as a partner?</h2>
{ol(PARTNER_STEPS)}
<h2>Partner programme questions, answered</h2>
{faq_html(PARTNER_FAQ)}
<p>Read the full <a href="/faq">Fluency AI FAQ</a>, see what you would promote in the <a href="/store">exam guide store</a>, or go back to the <a href="/">homepage</a>.</p>""",
  ld=[webpage("/partners", "Fluency Partners: earn 20% on confirmed sales", "Creators, teachers and affiliates share Fluency with a personal link and earn on every confirmed order."),
      faq_ld(PARTNER_FAQ),
      {"@type": "HowTo", "name": "How to earn commission as a Fluency Partner", "step": [{"@type": "HowToStep", "position": i + 1, "name": a, "text": b} for i, (a, b) in enumerate(PARTNER_STEPS)]}])

ABOUT_FAQ = [
 ("What is Fluency AI?", "Fluency AI is a speaking coach you talk to out loud. It answers like a person, then shows what you said, what to say instead, and why."),
 ("Which languages can I practise with Fluency AI?", "French, German and English are live, and more are on the way."),
 ("Does Fluency AI keep my voice recordings?", "Recordings are turned into text and deleted within 24 hours unless you choose to save them. Fluency does not create a voiceprint."),
 ("How much does Fluency AI cost?", "Fluency Plus is $12 a month and includes about 7 hours of conversation. Top-ups start at $5 and exam guides start at $7."),
]
ABOUT_BODY = f"""<h2>Who is Fluency AI for?</h2>
{ul(["Learners who understand more than they can say out loud", "People preparing for Goethe, telc, DELF, TCF, TEF, CELPIP or IELTS speaking tests", "Anyone who needs a language for a visa, residence, citizenship, study or work"])}
<h2>How does Fluency AI work?</h2>
{ol([("Speak out loud", "Say one sentence, badly is fine, and it works out where you are."), ("Get an answer like a person's", "The coach replies and keeps the conversation going."), ("See what to improve", "It shows what you said, what to say instead, and why.")])}
<h2>How is Fluency AI different from other ways to practise?</h2>
{table(["", "Practising alone", "Quiz-based apps", "Fluency AI"], [
 ["Someone answers back", "No", "Rarely", "Yes, out loud"],
 ["Mistakes explained", "No", "Mostly in written drills", "Yes, with the why"],
 ["Available any time", "Yes", "Yes", "Yes, 24/7"],
 ["Private and judgment-free", "Yes", "Yes", "Yes"],
 ["Main focus", "Whatever you choose", "Vocabulary and grammar", "Spoken output"]])}
<h2>Common questions about Fluency AI</h2>
{faq_html(ABOUT_FAQ)}
<p>More answers are in the <a href="/faq">full FAQ</a>, or see <a href="/how">how it works</a>, <a href="/features">features</a>, <a href="/pricing">pricing</a> and the <a href="/blog">Fluency AI blog</a>.</p>"""

# ---------------------------------------------------------------- helpers
def read(p): return (ROOT / p).read_text(encoding="utf-8")
def write(p, s): (ROOT / p).write_text(s, encoding="utf-8"); print("patched", p)

def patch_block(rel, spec):
    s = read(rel)
    if 'id="fl-seo-block"' in s: print("skip (already patched)", rel); return
    block = f'<section class="fl-seo" id="fl-seo-block" aria-label="Summary and questions"><div class="in">{spec["body"]}</div></section>\n'
    idx = s.find(spec["before"], s.find("</header>") if rel.startswith("guides") else s.find('id="app"'))
    assert idx > 0, rel
    s = s[:idx] + block + s[idx:]
    s = s.replace("</head>", CSS + "\n" + ld_script(spec["ld"]) + "\n</head>", 1)
    write(rel, s)

for rel, spec in PAGES.items(): patch_block(rel, spec)

# about.html: sections go inside .wrap before the CTA row; schema in head
s = read("about.html")
if 'id="fl-seo-block"' not in s:
    marker = '    <div class="row">\n      <a class="btn p" href="/join">Join the waitlist</a>'
    assert marker in s
    s = s.replace(marker, f'    <div class="fl-seo fl-in" id="fl-seo-block"><div class="in">{ABOUT_BODY}</div></div>\n' + marker, 1)
    ld = [webpage("/about", "About Fluency AI: speak out loud, without the fear", "Fluency AI is an adaptive language platform that removes speaking anxiety through real-time vocal conversation practice.", "AboutPage"), faq_ld(ABOUT_FAQ)]
    s = s.replace("</head>", CSS + "\n" + ld_script(ld) + "\n</head>", 1)
    write("about.html", s)

# faq.html: new category + schema entries
FAQ_NEW = [
 ("How does Fluency AI handle my voice recordings?", "Your audio is sent to our speech providers to turn it into text, then deleted within 24 hours unless you choose to save it. Transcripts stay in your conversation history until you delete them, and Fluency does not create a voiceprint."),
 ("Can I delete my data and my account?", "Yes. In the app you can delete any conversation, clear your coach's memory, download your data and delete your account under Settings, Privacy and memory."),
 ("How much does Fluency AI cost?", "Fluency Plus is $12 a month and includes about 7 hours of conversation, voice or text. Top-ups start at $5, exam guides start at $7, and nothing is charged automatically."),
 ("Can I cancel Fluency Plus at any time?", "Yes. You keep access until the end of the period you paid for. Unused monthly credits do not roll over."),
]
s = read("faq.html")
if "Privacy, pricing and your account" not in s:
    cat = ('    <section class="cat" aria-labelledby="c9"><span class="eyebrow" id="c9">Privacy, pricing and your account</span>\n' +
           "".join(f"      <details><summary>{E(q)}</summary><p>{E(a)}</p></details>\n" for q, a in FAQ_NEW) + "    </section>\n")
    m = re.search(r'(    <section class="cat"(?:(?!</section>)[\s\S])*Partnership Program(?:(?!</section>)[\s\S])*</section>\n)', s)
    assert m, "partnership section"
    s = s[:m.end()] + cat + s[m.end():]
    def add_ld(mo):
        d = json.loads(mo.group(1))
        d["mainEntity"] += faq_ld(FAQ_NEW)["mainEntity"]
        return '<script type="application/ld+json">' + json.dumps(d, ensure_ascii=False).replace("</", "<\\/") + "</script>"
    s, n = re.subn(r'<script type="application/ld\+json">(\{[^<]*"FAQPage"[^<]*\})</script>', add_ld, s, count=1)
    assert n == 1
    write("faq.html", s)

# Terms / Privacy: WebPage + dateModified
for rel, name, path, desc in [("terms.html", "Terms of use", "/terms", "The terms that govern your use of Fluency AI."), ("privacy.html", "Privacy Policy", "/privacy", "How Fluency AI collects, uses, and protects your data.")]:
    s = read(rel)
    if "application/ld+json" in s: print("skip", rel); continue
    d = webpage(path, f"{name} | Fluency AI", desc)
    d["dateModified"] = "2026-09-09"
    s = s.replace("</head>", ld_script([d]) + "\n</head>", 1)
    write(rel, s)

# Home (+ copies): SoftwareApplication schema + brand aliases on Organization
APP = {"@context": "https://schema.org", "@type": "SoftwareApplication", "@id": f"{BASE}/#app", "name": "Fluency AI",
       "alternateName": ["FluencyAI", "Fluency"], "applicationCategory": "EducationalApplication", "operatingSystem": "iOS, Android",
       "description": "A speaking coach you talk to out loud, in French, German and English. It answers like a person, then shows what you said, what to say, and why.",
       "url": f"{BASE}/", "inLanguage": ["en", "fr", "de"], "publisher": {"@id": f"{BASE}/#organization"},
       "offers": {"@type": "Offer", "price": "12", "priceCurrency": "USD", "availability": "https://schema.org/PreOrder", "url": f"{BASE}/pricing"}}
for rel in ["index.html", "how.html", "features.html", "join.html"]:
    s = read(rel)
    if '"SoftwareApplication"' in s: print("skip", rel); continue
    s = s.replace('"@id": "https://fluencyai.app/#organization",\n  "name": "Fluency AI",', '"@id": "https://fluencyai.app/#organization",\n  "name": "Fluency AI",\n  "alternateName": ["FluencyAI", "Fluency"],', 1)
    s = s.replace("</head>", '<script type="application/ld+json">' + json.dumps(APP, ensure_ascii=False) + "</script>\n</head>", 1)
    write(rel, s)

# Sitemap lastmod
sm = read("sitemap.xml")
for p in ["", "/how", "/features", "/join", "/about", "/faq", "/privacy", "/terms", "/guides", "/store", "/pricing", "/partners", "/blog",
          "/blog/french-language-levels-residence-citizenship-france-2026", "/blog/how-to-practise-speaking-french-alone",
          "/blog/french-speaking-practice-delf-b1-b2-oral", "/blog/stop-translating-in-your-head-when-speaking-french",
          "/blog/ielts-general-training-speaking-test-practice", "/blog/german-a1-start-deutsch-1-spouse-visa", "/blog/stop-freezing-when-you-speak-a-new-language"]:
    sm = re.sub(rf"(<loc>{re.escape(BASE + (p or '/'))}</loc>\s*<lastmod>)[^<]*", r"\g<1>2026-11-18", sm)
write("sitemap.xml", sm)
