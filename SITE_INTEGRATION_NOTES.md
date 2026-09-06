# Wiring the marketing site into your Vercel project

## What's in this zip
- `site/` — the marketing landing page (index.html, data.js, app.js, assets/).
  Drop this whole folder into the root of your Flutter project, next to `lib/`,
  `api/`, and the existing `web/` folder. (`web/` is Flutter's own platform
  scaffold — don't touch it. `site/` is new and separate.)
- `vercel.json` — replaces your existing one. This is the only config change.

## What changed in vercel.json
1. Flutter now builds with `--base-href=/app/` instead of the default `/`,
   so every asset and route the Flutter app generates is prefixed with
   `/app/` (e.g. `/app/main.dart.js`, `/app/auth`, `/app/dashboard`).
2. After building, the script copies `site/` (your marketing pages) into the
   root of the deploy output, and the Flutter web build into `dist/app/`.
3. A rewrite sends any unmatched `/app/*` request to `/app/index.html`, so
   Flutter's client-side router (go_router) can still handle deep links like
   `/app/dashboard` on a hard refresh — standard single-page-app fallback.
   Static files (`/app/main.dart.js`, `/app/assets/...`) are still served
   directly; the rewrite only kicks in when nothing matches on disk.
4. `/api/*` is untouched — Vercel auto-detects it as serverless functions
   regardless of this config, so `api/chat.js`, `api/stt.js` etc. keep
   working exactly as before, for both the marketing site (if you ever need
   it) and the Flutter app.

## Result once deployed
- `yourdomain.com/` → the marketing site (this design)
- `yourdomain.com/app` → your Flutter app (splash → intro → auth → onboarding → dashboard)
- `yourdomain.com/api/...` → your existing serverless functions, unchanged

## What I changed in the marketing site's copy
- Every "Start speaking free" / "Create your account" button now links to
  `/app/auth?mode=signup` instead of doing nothing.
- "Hear a conversation" and "See how it works" scroll to sections on the
  same page instead of linking anywhere.
- The App Store / Play Store buttons in the final CTA were replaced with a
  single "Open the web app" link, since the app isn't published to either
  store yet — swap in real badges + links once it is.
- **Pricing section and FAQ updated** to match what's actually wired into
  Stripe in your app (`paywall_screen.dart`): a 3-day free trial, then
  $39.99/year or $5.99/week — not the "$40 once" copy from the original
  design file, which doesn't match any Price ID that exists in your Stripe
  setup. If you'd genuinely rather charge once instead of a subscription,
  that's a separate change (new Stripe Price + a tweak to
  `checkout_repository.dart` and `create-checkout-session.js`) — say the
  word and I'll do that instead.

## One thing to know before this is fully "real"
Your README flags that Supabase is currently on hold — login accepts
anything, no real accounts exist yet (Part E). Until that's turned back on,
"Create your account" on the marketing site will take people to a working
UI that doesn't actually persist an account. Reactivating Part E (Supabase
auth + profiles) is what makes "same database" literally true — there's
only one Supabase project either way, so once it's on, both the app and
anyone who signs up from the marketing site are already in the same place.
Nothing about this site integration depends on doing that first, but it's
the next real step.

## Deploying
```
cd your-flutter-project
# copy in site/ and vercel.json from this zip, overwriting vercel.json
git add .
git commit -m "Add marketing site at root, move Flutter app to /app"
git push
```
Vercel redeploys automatically on push. First build will take the usual
~3-5 minutes (still cloning the Flutter SDK fresh each time, per your
existing setup).
