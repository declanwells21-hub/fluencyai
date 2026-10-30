#!/usr/bin/env python3
"""Builds site/blog/index.html, one site/blog/<slug>.html per post and the social images in site/assets/blog/.
Run from the repo root:  python3 tools/build_blog.py
To add a post: copy a file in tools/blog_posts/, edit it, add its name to POST_FILES below, run this, commit site/blog/, site/assets/blog/ and site/sitemap.xml
(the sitemap entry is added by hand, see the end of tools/blog_posts/README in docs/blog.md)."""
import html, json, re, runpy, pathlib
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
POST_FILES = ["express-entry-language.py", "stop-freezing.py"]   # order does not matter; the index sorts newest first
ORIGIN = "https://fluencyai.app"
esc = html.escape

posts = [runpy.run_path(str(ROOT / "tools" / "blog_posts" / f))["POST"] for f in POST_FILES]
posts.sort(key=lambda p: (p["published"], p["slug"]), reverse=True)
by_slug = {p["slug"]: p for p in posts}

def words(htmltext): return len(re.findall(r"\w+", re.sub(r"<[^>]+>", " ", htmltext)))
def minutes(p): return max(1, round(words(p["body"] + "".join(a for _, a in p["faq"])) / 220))
def nice(d): y, m, dd = map(int, d.split("-")); return date(y, m, dd).strftime("%B %-d, %Y")
def cite(t): return re.sub(r"\[\[(\d+)\]\]", r'<sup class="cite"><a href="#src-\1" aria-label="Source \1">[\1]</a></sup>', t)

# ------------------------------------------------------------------ SHELL (same head, nav and scripts as site/about.html)
WORDMARK = ('<span style="display:inline-flex;align-items:baseline;gap:4.84px;font:var(--fw-black) 22px/1 var(--font-display);letter-spacing:-.035em;color:var(--white);">'
            '<span><span style="color:var(--teal-400)">F</span>luency</span>'
            '<span style="font:var(--fw-bold) 9.24px/1 var(--font-display);letter-spacing:.08em;color:var(--teal-300);transform:translateY(-4.84px)">AI</span></span>')
LINKS = [("/", "Home"), ("/store", "Exam guides"), ("/pricing", "Pricing"), ("/partners", "Partners"), ("/about", "About"), ("/faq", "FAQ"), ("/blog", "Blog")]

def nav(active):
    a = "".join(f'<a href="{h}" style="color:{"#fff" if h == active else "var(--ink-200)"};text-decoration:none;padding:8px 0;"'
                f'{" aria-current=\"page\"" if h == active else ""}>{t}</a>' for h, t in LINKS)
    return f'''<header style="position:sticky;top:0;z-index:30;padding:12px 16px;">
    <nav data-fl-nav aria-label="Primary" style="max-width:1200px;margin:0 auto;display:flex;align-items:center;gap:20px;padding:10px 10px 10px 20px;border-radius:999px;background:rgba(11,34,51,.72);border:1px solid rgba(255,255,255,.12);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);">
      <a href="/" aria-label="Fluency AI home" style="text-decoration:none;display:flex;">{WORDMARK}</a>
      <div data-fl-links style="flex:1;display:flex;flex-wrap:wrap;gap:4px 18px;justify-content:center;font:600 14px/1 var(--font-body);">{a}</div>
      <button type="button" class="js-login-trigger" data-fl-signin data-logged-out="Sign in" data-logged-in="My account" style="background:none;border:0;cursor:pointer;color:var(--ink-200);padding:8px 4px;font:600 14px/1 var(--font-body);white-space:nowrap;">Sign in</button>
    </nav>
  </header>'''

CSS = '''
html,body{overflow-x:clip}
body{margin:0;background:#04121B;color:#D8E4EA;-webkit-font-smoothing:antialiased}
a{color:var(--teal-300);text-underline-offset:3px}a:hover{color:var(--teal-200)}
:focus-visible{outline:2px solid var(--teal-400);outline-offset:2px}
.pg{min-height:100vh;background:radial-gradient(90% 40% at 50% 0%,#123A4C 0%,#04121B 60%);font-family:var(--font-body)}
.wrap{max-width:860px;margin:0 auto;padding:32px 24px 96px;display:grid;grid-template-columns:minmax(0,1fr);gap:22px}
.wrap>*,article>*{min-width:0}
.eyebrow{font:700 11px/1 var(--font-body);letter-spacing:.12em;text-transform:uppercase;color:var(--teal-300)}
h1{margin:0;font:800 clamp(34px,5vw,54px)/1.05 var(--font-display);letter-spacing:-.035em;color:#fff;text-wrap:balance}
h2{margin:18px 0 0;font:800 clamp(25px,3.2vw,32px)/1.12 var(--font-display);letter-spacing:-.03em;color:#fff;scroll-margin-top:96px}
h3{margin:10px 0 0;font:700 20px/1.3 var(--font-display);color:#fff}
.lead{font:400 20px/1.6 var(--font-body);color:var(--ink-100);margin:0}
article p,article li{font:400 17px/1.75 var(--font-body);color:var(--ink-200)}
article p{margin:0}
article ul,article ol{margin:0;padding-left:22px;display:grid;gap:8px}
article strong{color:#fff}
p.small{font:500 14px/1.5 var(--font-body);color:var(--ink-400)}
.btn{display:inline-flex;align-items:center;justify-content:center;height:46px;padding:0 22px;border-radius:999px;font:700 15px/1 var(--font-body);text-decoration:none}
.btn.p{background:var(--teal-500);color:#04121B;box-shadow:inset 0 -3px 0 var(--teal-700)}
.btn.s{border:1px solid rgba(255,255,255,.22);color:#fff}
.row{display:flex;flex-wrap:wrap;gap:12px}
.crumbs{font:500 13px/1.4 var(--font-body);color:var(--ink-400)}.crumbs ol{display:flex;flex-wrap:wrap;gap:6px;list-style:none;margin:0;padding:0}
.crumbs li+li::before{content:"/";margin-right:6px;color:var(--ink-500)}.crumbs a{color:var(--ink-300)}
.byline{display:flex;flex-wrap:wrap;gap:6px 16px;font:500 14px/1.5 var(--font-body);color:var(--ink-300)}
.hero{display:block;width:100%;height:auto;border-radius:20px;border:1px solid rgba(255,255,255,.1)}
.takeaways,.note,.toc,.cta,.about-art{border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:18px 20px}
.takeaways{border-left:4px solid var(--teal-400)}.takeaways h2,.toc h2,.cta h2{margin:0 0 10px;font-size:20px}
.note{background:rgba(16,184,184,.08);border-color:rgba(16,184,184,.3);font:400 16px/1.65 var(--font-body);color:var(--ink-100)}
.toc ol{columns:2;column-gap:28px}.toc li{font-size:16px;line-height:1.6;break-inside:avoid}
.tablewrap{overflow-x:auto;border-radius:16px;border:1px solid rgba(255,255,255,.12)}
table{border-collapse:collapse;width:100%;min-width:560px;font:400 15px/1.5 var(--font-body)}
th,td{padding:10px 14px;text-align:left;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top;color:var(--ink-200)}
thead th{background:rgba(255,255,255,.08);color:#fff;font-weight:700}tbody th{color:#fff;font-weight:600}tbody tr:last-child>*{border-bottom:0}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cite{font-size:.75em;line-height:0}.cite a{text-decoration:none}
details{border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);overflow:hidden}
details[open]{background:rgba(255,255,255,.07)}
summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 18px;font:700 17px/1.35 var(--font-display);color:#fff;min-height:44px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";flex:0 0 auto;font:600 24px/1 var(--font-body);color:var(--teal-300)}
details[open] summary::after{content:"\\2212"}
details p{padding:0 18px 18px}
.faqs{display:grid;gap:12px}
.sources li{font:400 15px/1.6 var(--font-body)}.sources li:target{outline:2px solid var(--teal-400);outline-offset:4px;border-radius:6px}
.posts{display:grid;gap:16px}
.post{display:grid;gap:8px;padding:20px;border-radius:20px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}
.post h2,.post h3{margin:0;font:800 24px/1.2 var(--font-display);letter-spacing:-.02em}.post h2 a,.post h3 a{color:#fff;text-decoration:none}.post h2 a:hover,.post h3 a:hover{text-decoration:underline}
.post p{margin:0;font:400 16px/1.6 var(--font-body);color:var(--ink-300)}.post .meta{font:500 13px/1.4 var(--font-body);color:var(--ink-400)}
.foot{font:500 13px/1.6 var(--font-body);color:var(--ink-400)}
@media (max-width:760px){
 [data-fl-nav]{flex-wrap:wrap!important;border-radius:24px!important;padding:10px 12px!important;gap:10px!important}
 [data-fl-links]{order:3;flex:1 1 100%!important;justify-content:flex-start!important;flex-wrap:nowrap!important;overflow-x:auto;gap:20px!important;padding:2px 4px!important;scrollbar-width:none;-webkit-mask-image:linear-gradient(90deg,#000 85%,transparent)}
 [data-fl-links]::-webkit-scrollbar{display:none}[data-fl-links]>*{white-space:nowrap;flex:0 0 auto}
 .wrap{padding:16px 16px 72px}.toc ol{columns:1}.lead{font-size:18px}
}
'''

def page(path, title, desc, body, jsonld, active="/blog", og_image="/assets/og-share.png", og_type="website", extra_meta="", alt=""):
    url = ORIGIN + path
    t, d = esc(title, quote=True), esc(desc, quote=True)
    ld = "".join(f'<script type="application/ld+json">{json.dumps(j, ensure_ascii=False)}</script>\n' for j in jsonld)
    img = ORIGIN + og_image
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{t}</title>
<meta name="description" content="{d}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="{url}">
<meta property="og:type" content="{og_type}">
<meta property="og:site_name" content="Fluency AI">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="{t}">
<meta property="og:description" content="{d}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc(alt or title, quote=True)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{t}">
<meta name="twitter:description" content="{d}">
<meta name="twitter:image" content="{img}">
{extra_meta}<meta name="theme-color" content="#04121B">
<link rel="icon" href="/assets/logo-appicon.png">
<link rel="manifest" href="/manifest.json">
<link rel="stylesheet" href="/ds/styles.css">
<link rel="stylesheet" href="/ds/components.css">
<link rel="stylesheet" href="/assets/css/fl-account.css">
<style>{CSS}</style>
{ld}<link rel="stylesheet" href="/assets/css/fl-mobile.css">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<meta name="apple-mobile-web-app-title" content="Fluency AI">
<link rel="apple-touch-icon" href="/assets/logo-appicon.png">
</head>
<body>
<div class="pg" data-fl-page>
  {nav(active)}
  <main class="wrap" id="main">
{body}
  </main>
</div>
<script src="/fluency-config.js"></script>
<script src="/fluency-data.js"></script>
<script src="/assets/js/fluency-coach.js"></script>
<script src="/assets/js/fl-ref.js"></script>
<script src="/config.js"></script>
<script src="/assets/js/fl-partner-route.js"></script>
<script src="/assets/js/fl-account.js"></script>
<script src="/auth.js"></script>
<script src="/assets/js/fl-mobile.js"></script>
</body>
</html>
'''

ORG = {"@type": "Organization", "name": "Fluency AI", "url": ORIGIN + "/",
       "logo": {"@type": "ImageObject", "url": ORIGIN + "/assets/icon-512.png", "width": 512, "height": 512}}

# ------------------------------------------------------------------ POST PAGE
def post_page(p):
    path = f"/blog/{p['slug']}"
    img = f"/assets/blog/{p['slug']}.png"
    toc = "".join(f'<li><a href="#{i}">{esc(t)}</a></li>' for i, t in p["toc"])
    faq = "".join(f'<details><summary>{esc(q)}</summary><p>{cite(a)}</p></details>' for q, a in p["faq"])
    def src_line(i, s):
        text, url = s[0], s[1]
        extra = "".join(f' <a href="{u}" rel="noopener">{esc(l)}</a>' for l, u in (s[2] if len(s) > 2 else []))
        return f'<li id="src-{i}">{esc(text)} <a href="{url}" rel="noopener">{esc(url)}</a>{(" Also: " + extra.strip()) if extra else ""}</li>'
    srcs = "".join(src_line(i, s) for i, s in enumerate(p["sources"], 1))
    rel = "".join(f'<article class="post"><span class="meta">{esc(by_slug[r]["category"])} · {minutes(by_slug[r])} min read</span><h3><a href="/blog/{r}">{esc(by_slug[r]["h1"])}</a></h3><p>{esc(by_slug[r]["description"])}</p></article>'
                  for r in p["related"] if r in by_slug)
    body = f'''    <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><a href="/blog">Blog</a></li><li aria-current="page">{esc(p["category"])}</li></ol></nav>
    <article itemscope itemtype="https://schema.org/BlogPosting" style="display:grid;grid-template-columns:minmax(0,1fr);gap:22px;">
      <header style="display:grid;gap:14px;">
        <span class="eyebrow">{esc(p["category"])}</span>
        <h1 itemprop="headline">{esc(p["h1"])}</h1>
        <p class="byline"><span>By the <a href="/about">Fluency AI</a> team</span><span>Published <time datetime="{p["published"]}">{nice(p["published"])}</time></span><span>Updated <time datetime="{p["modified"]}">{nice(p["modified"])}</time></span><span>{minutes(p)} min read</span></p>
        <img class="hero" src="{img}" width="1200" height="630" alt="{esc(p["image_alt"], quote=True)}" fetchpriority="high" decoding="async">
      </header>
      <nav class="toc" aria-labelledby="toc-h"><h2 id="toc-h">In this article</h2><ol>{toc}</ol></nav>
{cite(p["body"])}
      <h2 id="faq">Questions people ask</h2>
      <div class="faqs">{faq}</div>
      <h2 id="sources">Sources</h2>
      <ol class="sources">{srcs}</ol>
      <aside class="about-art" aria-labelledby="about-h">
        <h2 id="about-h" style="margin:0 0 8px;font-size:20px;">About this article</h2>
        <p class="small" style="margin:0">Written by the Fluency AI team and published {nice(p["published"])}. Factual claims are limited to what the cited sources say, and where a source is a single or early study we say so. Fluency AI sells exam guides and a speaking-practice app; that is why we disclose it wherever we mention them. Spotted an error or an out-of-date figure? Email <a href="mailto:info@fluencyai.app">info@fluencyai.app</a> and we will correct it. See <a href="/about">About Fluency AI</a>, our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>.</p>
      </aside>
    </article>
    <section aria-labelledby="more-h" style="display:grid;gap:14px;"><h2 id="more-h" style="margin:0;">Keep reading</h2><div class="posts">{rel}</div></section>
    <section class="cta" aria-labelledby="cta-h"><h2 id="cta-h">Practise speaking out loud, privately</h2>
      <p style="margin:0 0 14px;">Fluency AI is a speaking coach you talk to out loud, in French, German and English. Join the waitlist to lock the launch price, or browse the 20-minute exam guides.</p>
      <div class="row"><a class="btn p" href="/#join">Join the waitlist</a><a class="btn s" href="/store">Browse exam guides</a><a class="btn s" href="/blog">More articles</a></div></section>
    <p class="foot">Questions about your account: <a href="mailto:support@fluencyai.app">support@fluencyai.app</a>. Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.</p>'''
    text_len = words(p["body"])
    ld = [{"@context": "https://schema.org", "@type": "BlogPosting", "@id": ORIGIN + path + "#article",
           "headline": p["h1"][:110], "name": p["title"], "description": p["description"],
           "image": [ORIGIN + img], "datePublished": p["published"], "dateModified": p["modified"],
           "author": {"@type": "Organization", "name": "Fluency AI team", "url": ORIGIN + "/about"}, "publisher": ORG,
           "mainEntityOfPage": {"@type": "WebPage", "@id": ORIGIN + path}, "inLanguage": "en", "articleSection": p["category"],
           "keywords": ", ".join(p["keywords"]), "wordCount": text_len,
           "isPartOf": {"@type": "Blog", "@id": ORIGIN + "/blog", "name": "Fluency AI Blog"}},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
           {"@type": "ListItem", "position": 1, "name": "Home", "item": ORIGIN + "/"},
           {"@type": "ListItem", "position": 2, "name": "Blog", "item": ORIGIN + "/blog"},
           {"@type": "ListItem", "position": 3, "name": p["h1"], "item": ORIGIN + path}]}]
    meta = (f'<meta property="article:published_time" content="{p["published"]}">\n<meta property="article:modified_time" content="{p["modified"]}">\n'
            f'<meta property="article:section" content="{esc(p["category"], quote=True)}">\n<meta property="article:author" content="{ORIGIN}/about">\n'
            f'<meta name="author" content="Fluency AI team">\n')
    return page(path, p["title"] + " | Fluency AI", p["description"], body, ld, og_image=img, og_type="article", extra_meta=meta, alt=p["image_alt"])

# ------------------------------------------------------------------ INDEX
def index_page():
    cards = "".join(f'''<article class="post"><span class="meta">{esc(p["category"])} · <time datetime="{p["published"]}">{nice(p["published"])}</time> · {minutes(p)} min read</span>
      <h2><a href="/blog/{p["slug"]}">{esc(p["h1"])}</a></h2><p>{esc(p["description"])}</p><p><a href="/blog/{p["slug"]}" aria-label="Read: {esc(p["h1"], quote=True)}">Read the article →</a></p></article>''' for p in posts)
    body = f'''    <nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li aria-current="page">Blog</li></ol></nav>
    <header style="display:grid;gap:14px;"><span class="eyebrow">The Fluency AI blog</span><h1>Speaking practice, exam prep and language-learning tips</h1>
    <p class="lead">Practical, sourced guides for people who learn French, German and English to move, study, work and stay. Every article cites its sources and says where the evidence is thin.</p></header>
    <div class="posts">{cards}</div>
    <section class="cta" aria-labelledby="cta-h"><h2 id="cta-h">Ready to speak?</h2>
      <p style="margin:0 0 14px;">Join the waitlist for the speaking coach, or pick a 20-minute exam guide for the test you are sitting.</p>
      <div class="row"><a class="btn p" href="/#join">Join the waitlist</a><a class="btn s" href="/store">Browse exam guides</a><a class="btn s" href="/faq">Read the FAQ</a></div></section>
    <p class="foot">Questions or feedback: <a href="mailto:info@fluencyai.app">info@fluencyai.app</a>. Read our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.</p>'''
    ld = [{"@context": "https://schema.org", "@type": "Blog", "@id": ORIGIN + "/blog", "name": "Fluency AI Blog", "url": ORIGIN + "/blog",
           "description": "Practical, sourced guides on speaking practice, exam preparation and language learning.", "inLanguage": "en", "publisher": ORG,
           "blogPost": [{"@type": "BlogPosting", "headline": p["h1"][:110], "url": f"{ORIGIN}/blog/{p['slug']}", "datePublished": p["published"], "dateModified": p["modified"]} for p in posts]},
          {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
           {"@type": "ListItem", "position": 1, "name": "Home", "item": ORIGIN + "/"}, {"@type": "ListItem", "position": 2, "name": "Blog", "item": ORIGIN + "/blog"}]}]
    return page("/blog", "Blog: speaking practice, exam prep and language tips | Fluency AI",
                "Sourced guides on speaking confidence, Express Entry language scores and exam preparation for French, German and English learners.", body, ld)

# ------------------------------------------------------------------ SOCIAL IMAGES (1200x630)
def og_image(p, out):
    from PIL import Image, ImageDraw, ImageFont
    W, H = 1200, 630
    img = Image.new("RGB", (W, H), "#04121B"); px = img.load()
    for y in range(H):                                    # soft teal glow at the top, like the site background
        for x in range(0, W):
            d = ((x - W / 2) / (W * .9)) ** 2 + (y / (H * .75)) ** 2
            k = max(0.0, 1 - d)
            px[x, y] = (int(4 + (0x12 - 4) * k), int(0x12 + (0x3A - 0x12) * k), int(0x1B + (0x4C - 0x1B) * k))
    dr = ImageDraw.Draw(img)
    B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"; R = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    f_logo, f_tag, f_t = ImageFont.truetype(B, 44), ImageFont.truetype(B, 22), ImageFont.truetype(B, 62)
    dr.text((72, 64), "F", font=f_logo, fill="#22CFCB"); dr.text((72 + dr.textlength("F", font=f_logo), 64), "luency", font=f_logo, fill="white")
    dr.text((72 + dr.textlength("Fluency", font=f_logo) + 8, 58), "AI", font=ImageFont.truetype(B, 20), fill="#54DFDB")
    dr.text((72, 160), p["category"].upper() + "  ·  BLOG", font=f_tag, fill="#54DFDB")
    lines, cur = [], ""
    for w in p["h1"].split():
        t = (cur + " " + w).strip()
        if dr.textlength(t, font=f_t) > W - 144 and cur: lines.append(cur); cur = w
        else: cur = t
    lines.append(cur)
    y = 210
    for ln in lines[:4]: dr.text((72, y), ln, font=f_t, fill="white"); y += 80
    dr.rounded_rectangle((72, H - 92, 72 + 6, H - 52), 3, fill="#10B8B8")
    dr.text((96, H - 90), "fluencyai.app/blog", font=ImageFont.truetype(R, 26), fill="#B7CCD6")
    img.save(out, optimize=True)

if __name__ == "__main__":
    (SITE / "blog").mkdir(exist_ok=True); (SITE / "assets" / "blog").mkdir(parents=True, exist_ok=True)
    (SITE / "blog" / "index.html").write_text(index_page(), encoding="utf-8")
    for p in posts:
        (SITE / "blog" / f"{p['slug']}.html").write_text(post_page(p), encoding="utf-8")
        og_image(p, SITE / "assets" / "blog" / f"{p['slug']}.png")
    print("built", len(posts), "posts")
