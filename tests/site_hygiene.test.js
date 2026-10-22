// Run with:  node tests/site_hygiene.test.js
// Guards against the things the cleanup removed coming back, and against broken file references and dead internal links on any page.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const site = path.join(root, 'site');

let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e && e.message || e)); } }
function walk(dir, out = []) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); } else out.push(p); } return out; }
const rel = (p) => path.relative(root, p);

const siteFiles = walk(site);
const pages = siteFiles.filter((f) => f.endsWith('.html'));
const code = [...siteFiles.filter((f) => /\.(html|js|json|css|xml|txt)$/.test(f)), ...walk(path.join(root, 'api')).filter((f) => f.endsWith('.js'))];
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

test('the old site is gone: no leftover files from before the rebuild', () => {
  for (const f of ['app.js', 'data.js', 'creators.html', 'assets/js/home-states.js']) assert.ok(!fs.existsSync(path.join(site, f)), f + ' is still there');
});

test('no page, script, email or manifest still makes the old claims (40 languages, $40 once, founding price, parrot)', () => {
  const bad = [];
  for (const f of code) {
    const text = fs.readFileSync(f, 'utf8');
    for (const re of [/40 languages/i, /\$40\b/, /founding user/i, /parrot/i]) if (re.test(text)) bad.push(rel(f) + ' matches ' + re);
  }
  assert.deepStrictEqual(bad, []);
});

test('the web app manifest describes the product as it is now, and its icons exist and are square', () => {
  const m = JSON.parse(fs.readFileSync(path.join(site, 'manifest.json'), 'utf8'));
  assert.ok(/French, German and English/.test(m.description), m.description);
  assert.ok(m.icons.length >= 2);
  for (const icon of m.icons) {
    const file = path.join(site, icon.src);
    assert.ok(fs.existsSync(file), icon.src + ' is missing');
    const buf = fs.readFileSync(file); const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    assert.strictEqual(w, h, `${icon.src} is ${w}x${h}, not square`);
    assert.strictEqual(icon.sizes, `${w}x${h}`, `${icon.src} says ${icon.sizes} but is ${w}x${h}`);
  }
});

test('every local script, stylesheet, image and icon a page links to exists', () => {
  const missing = [];
  for (const page of pages) {
    const html = fs.readFileSync(page, 'utf8');
    for (const m of html.matchAll(/(?:src|href)=["'](\/[^"'#?]+\.(?:js|css|png|jpg|jpeg|svg|webp|ico|json|webmanifest))(?:\?[^"']*)?["']/g)) {
      if (/[${}]/.test(m[1])) continue; // built at runtime, e.g. icons/${name}.svg
      const target = path.join(site, m[1]);
      if (!fs.existsSync(target) && !m[1].startsWith('/app/')) missing.push(`${rel(page)} -> ${m[1]}`);
    }
  }
  assert.deepStrictEqual(missing, []);
});

test('every internal link on every page goes to a real page', () => {
  const routes = new Set(['/', ...vercel.rewrites.map((r) => r.source), ...vercel.redirects.map((r) => r.source)]);
  const files = new Set(siteFiles.map((f) => '/' + path.relative(site, f).split(path.sep).join('/')));
  const bad = [];
  for (const page of pages.filter((p) => !p.includes(path.sep + 'admin' + path.sep))) {
    const html = fs.readFileSync(page, 'utf8');
    for (const m of html.matchAll(/<a\s[^>]*href=["'](\/[^"'#?]*)(?:[?#][^"']*)?["']/g)) {
      const href = m[1].replace(/\/$/, '') || '/';
      if (routes.has(href) || files.has(href) || /^\/(r|api|app)\b/.test(href) || href.startsWith('/guides')) continue;
      bad.push(`${rel(page)} -> ${m[1]}`);
    }
  }
  assert.deepStrictEqual([...new Set(bad)], []);
});

test('/creators still redirects to /partners (old links keep working) and /faq and /about are real pages', () => {
  assert.ok(vercel.redirects.some((r) => r.source === '/creators' && r.destination === '/partners'));
  for (const r of ['/faq', '/about']) assert.ok(vercel.rewrites.some((x) => x.source === r), r);
});

test('build.sh: previews skip the Flutter build; production and BUILD_FLUTTER=true still run it', () => {
  const sh = fs.readFileSync(path.join(root, 'build.sh'), 'utf8');
  assert.ok(/VERCEL_ENV:-production/.test(sh) && /BUILD_FLUTTER/.test(sh));
  const flutterAt = sh.indexOf('flutter build web'), elseAt = sh.indexOf('\nelse');
  assert.ok(flutterAt > 0 && elseAt > flutterAt, 'the flutter build must sit in the production branch');
  assert.ok(!sh.slice(elseAt).includes('flutter build'), 'the preview branch must not build Flutter');
  assert.ok(sh.slice(elseAt).includes('dist/app/index.html'), 'previews get a placeholder /app page');
  assert.ok(/dist\/config\.js/.test(sh), 'config.js is written in both cases');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
