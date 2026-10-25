#!/usr/bin/env node
// Regenerates api/_lib/bot/knowledge.md: everything the website chatbot knows about Fluency AI.
//   - the catalogue (plans, top-ups, exam guides, bundles, partner rules) comes from site/fluency-data.js,
//     the single source of truth for prices, so the bot can never quote a different price than the site;
//   - the wording of the public pages (Home, About, FAQ, Pricing, Store, Partners, Guides, Terms, Privacy)
//     is taken from the HTML in site/.
// The output has no dates or hashes, so running it twice gives the same file (the GitHub Action only
// commits when something really changed).
//
// Run from the repo root:   node tools/build_bot_knowledge.js
// Check only (exit 1 if out of date):   node tools/build_bot_knowledge.js --check

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const OUT = path.join(root, 'api/_lib/bot/knowledge.md');

// [file, heading, URL path on the live site]
const PAGES = [
  ['index.html', 'Home page', '/'],
  ['about.html', 'About', '/about'],
  ['faq.html', 'FAQ', '/faq'],
  ['pricing.html', 'Pricing page', '/pricing'],
  ['store.html', 'Store page', '/store'],
  ['partners.html', 'Partner programme page', '/partners'],
  ['guides/index.html', 'Guides page', '/guides'],
  ['terms.html', 'Terms of use', '/terms'],
  ['privacy.html', 'Privacy policy', '/privacy'],
];

function loadSiteData() {
  const w = {};
  const ctx = { window: w, document: {}, localStorage: {}, console };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'site/fluency-config.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'site/fluency-data.js'), 'utf8'), ctx);
  return { data: w.FluencyData, config: w.FL_CONFIG || {} };
}

function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', copy: '©', euro: '€', pound: '£' };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => (named[n.toLowerCase()] !== undefined ? named[n.toLowerCase()] : m));
}

/** Visible text of an HTML page: title, description, then the body copy, one line per block. */
function htmlToText(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || [])[1] || '';
  let body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0];
  body = body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|svg|noscript|template|head)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|li|ul|ol|h[1-6]|tr|table|details|summary|blockquote|header|main|aside|figure|form|dt|dd)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const lines = decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 2);
  const out = [];
  for (const l of lines) if (out[out.length - 1] !== l) out.push(l); // drop immediate repeats
  const head = [decodeEntities(title).trim(), decodeEntities(desc).trim()].filter(Boolean);
  return head.concat(out).join('\n');
}

function money(n) { return '$' + n; }

function catalogue(data, config) {
  const L = [];
  const guides = data.GUIDES;
  const exam = (id) => data.EXAMS.find((e) => e.id === id) || {};
  L.push('# CATALOGUE (source of truth for plans, prices and products)');
  L.push('All prices are in US dollars. Visitors see an approximate local price on the site.');
  if (data.PRICING_UNDER_REVIEW) L.push('Prices are provisional and may change before launch. Fluency AI always tells customers before their next billing date.');
  L.push('');
  L.push('## Subscription');
  for (const p of data.PLANS) {
    L.push(`- ${p.name}: ${money(p.price)} per ${p.per}, ${p.credits} credits. ${p.hours}. ${p.note}`);
  }
  L.push('');
  L.push('## Top-ups (optional, one-time; nothing is charged automatically when talk time runs out)');
  for (const t of data.TOPUPS) {
    L.push(`- ${money(t.price)}: ${t.credits} credits (${t.time})${t.bonus ? ', includes bonus credits' : ''}`);
  }
  L.push('');
  L.push('## Exam guides (one-time purchase, buy once and keep; sold through Selar)');
  L.push('Price by level: ' + Object.values(data.TIERS).map((t) => `${t.label} ${money(t.price)}`).join(', ') + '.');
  for (const g of guides) {
    const e = exam(g.exam);
    const covers = (g.points || []).map((p) => `${p.k}: ${p.t}`).join('; ');
    const buy = g.selar ? `Buy: ${data.selarUrl ? data.selarUrl(g) : (config.selarBase || 'https://selar.com/') + g.selar}` : 'Not on sale yet.';
    L.push(`- ${g.name} (${g.full}). ${e.lang || ''}, level ${g.level}, ${money(g.price)}, ${g.pages || '?'} pages, edition ${g.edition || '?'}, ${String(g.type || 'pdf').toUpperCase()}. ${g.purpose}. ${g.tagline} Covers: ${covers}. ${buy}`);
  }
  L.push('');
  L.push('## Bundles');
  const name = (id) => (guides.find((g) => g.id === id) || {}).name || id;
  for (const b of data.BUNDLES) {
    L.push(`- ${b.name}: ${money(b.price)} instead of ${money(b.separately)} separately. Includes ${b.items.map(name).join(', ')}. Status: ${b.status === 'soon' ? 'coming soon' : b.status}.`);
  }
  L.push('');
  L.push('## Exams covered');
  for (const e of data.EXAMS) L.push(`- ${e.name} (${e.lang}), run by ${e.body}. ${e.note}`);
  L.push('');
  L.push('## Partner programme (commission rules)');
  const c = data.COMMISSION;
  L.push(`- Partners earn ${Math.round(c.guides * 100)}% commission on guides, ${Math.round(c.subscriptions * 100)}% on subscriptions and ${Math.round(c.bundles * 100)}% on bundles.`);
  L.push(`- A referred buyer is attributed to the partner for ${c.attributionDays} days. Minimum payout ${money(c.payoutMinimumUSD)}. Commission is held ${c.refundHoldDays} days for refunds before it becomes payable.`);
  L.push('');
  L.push('## Contact');
  L.push(`- Support email: ${config.supportEmail || 'support@fluencyai.app'}`);
  L.push(`- Website: ${config.siteUrl || 'https://fluencyai.app'}`);
  return L.join('\n');
}

function build() {
  const { data, config } = loadSiteData();
  const site = (config.siteUrl || 'https://fluencyai.app').replace(/\/+$/, '');
  const parts = [];
  parts.push('# FLUENCY AI: KNOWLEDGE FOR THE WEBSITE ASSISTANT');
  parts.push('GENERATED by tools/build_bot_knowledge.js from site/. Do not edit by hand; change the site and it updates itself.');
  parts.push('');
  parts.push(catalogue(data, config));
  for (const [file, heading, url] of PAGES) {
    const p = path.join(root, 'site', file);
    if (!fs.existsSync(p)) continue;
    parts.push('');
    parts.push(`# PAGE: ${heading} (${site}${url === '/' ? '' : url})`);
    parts.push(htmlToText(fs.readFileSync(p, 'utf8')));
  }
  return parts.join('\n') + '\n';
}

module.exports = { build, htmlToText, OUT };

if (require.main === module) {
  const text = build();
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
    if (current !== text) { console.error('api/_lib/bot/knowledge.md is out of date. Run: node tools/build_bot_knowledge.js'); process.exit(1); }
    console.log('knowledge.md is up to date');
  } else {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, text);
    console.log(`wrote api/_lib/bot/knowledge.md (${text.length} characters, about ${Math.round(text.length / 4)} tokens)`);
  }
}
