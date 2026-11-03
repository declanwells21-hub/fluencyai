#!/usr/bin/env node
/* Builds the clean section URLs /how, /features and /join from the home page.
   Each one is the home page with its own <title>, description and canonical URL, plus
   window.FL_SECTION so fl-motion.js scrolls straight to that section (no "#" needed).

   Usage:  node scripts/make-section-pages.js [folder]      (default folder: site)
   build.sh runs it on dist/ on every deploy, so these pages always match index.html. */
const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || 'site');
const src = path.join(dir, 'index.html');
const home = fs.readFileSync(src, 'utf8');

const PAGES = [
  { file: 'how.html', url: 'https://fluencyai.app/how', section: 'how',
    title: 'How Fluency AI works: speak, get feedback, improve',
    desc: 'See how Fluency AI works: it hears the sentence you actually said, answers like a person, then shows what you said, what to say and why.' },
  { file: 'features.html', url: 'https://fluencyai.app/features', section: 'features',
    title: 'Features: the Fluency AI speaking coach',
    desc: 'Conversation, tutor and role-play modes, casual or professional register, and correction your way: off, immediate, after, or important only.' },
  { file: 'join.html', url: 'https://fluencyai.app/join', section: 'join',
    title: 'Join the Fluency AI waitlist',
    desc: 'Get early access to Fluency AI, the speaking coach you talk to out loud, in French, German and English. Join the waitlist and your launch price is locked.' },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const must = (html, re, label) => { if (!re.test(html)) throw new Error('index.html is missing ' + label); };

must(home, /<title>[\s\S]*?<\/title>/, '<title>');
must(home, /<link rel="canonical" href="[^"]*">/, 'canonical link');

for (const p of PAGES) {
  let h = home;
  h = h.replace(/<title>[\s\S]*?<\/title>/, '<title>' + p.title + '</title>');
  h = h.replace(/(<meta name="description" content=")[^"]*(")/, '$1' + esc(p.desc) + '$2');
  h = h.replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + p.url + '$2');
  h = h.replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + p.url + '$2');
  h = h.replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + esc(p.title) + '$2');
  h = h.replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + esc(p.desc) + '$2');
  h = h.replace(/(<meta name="twitter:title" content=")[^"]*(")/, '$1' + esc(p.title) + '$2');
  h = h.replace(/(<meta name="twitter:description" content=")[^"]*(")/, '$1' + esc(p.desc) + '$2');
  // the FAQ structured data belongs to the home page only
  h = h.replace(/<script type="application\/ld\+json">(?:(?!<\/script>)[\s\S])*"FAQPage"(?:(?!<\/script>)[\s\S])*<\/script>\s*/, '');
  // tell fl-motion.js which section to open on
  h = h.replace('</head>', '<script>window.FL_SECTION=' + JSON.stringify(p.section) + ';</script>\n</head>');
  fs.writeFileSync(path.join(dir, p.file), h);
  console.log('wrote ' + path.join(path.basename(dir), p.file));
}
