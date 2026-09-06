# FLUENCY — Flutter Project (Phase 1 + 2 demo)

This is a real, working Flutter codebase for FLUENCY: sign up (fake for now) →
pick your target language → pick an AI tutor/accent → have a real spoken
conversation with an AI tutor that corrects your mistakes.

Everything except the conversation's AI pipeline runs on mock data — that's
intentional (see the plan). The conversation feature is real: your voice →
transcribed → sent to Claude → corrected & replied to → spoken back to you.

---

## Part A — One-time setup on your Windows PC

You only do this once, ever.

1. **Install Flutter SDK**
   - Go to https://docs.flutter.dev/get-started/install/windows
   - Download the Flutter SDK zip, extract it to e.g. `C:\src\flutter` (avoid
     paths with spaces, like `C:\Program Files`)
   - Add `C:\src\flutter\bin` to your Windows PATH (search "Edit environment
     variables" in the Start menu → Environment Variables → Path → New)

2. **Install Android Studio** (gives you an Android emulator + required SDK tools)
   - https://developer.android.com/studio
   - During setup, let it install the Android SDK and an emulator (Android Studio
     will prompt you — accept the defaults)
   - Open Android Studio once, go to **More Actions → Virtual Device Manager**,
     create one emulator (e.g. Pixel 7, latest Android version)

3. **Install VS Code** (or use Android Studio itself — either works)
   - https://code.visualstudio.com
   - Install the **Flutter** extension (search "Flutter" in Extensions panel) —
     this also installs the Dart extension automatically

4. **Verify everything is wired up correctly**
   Open a terminal (PowerShell) and run:
   ```
   flutter doctor
   ```
   Fix anything it flags with a ✗. It's normal to ignore anything about
   Visual Studio/C++ desktop or iOS — you don't need those for Android/web.

5. **Install Node.js** (only needed for the proxy server, Part C)
   - https://nodejs.org — install the LTS version

---

## Part B — Run the app itself

1. Unzip this project anywhere, e.g. `C:\dev\fluency_flutter`
2. Open a terminal in that folder and run this **once** — it generates the
   native platform folders (`android/`, `ios/`, `windows/`, `web/`) that this
   project needs but doesn't ship with. This is safe: it only adds the missing
   platform folders, it won't touch your `lib/` code or `pubspec.yaml`:
   ```
   flutter create . --platforms=android,web,windows
   ```
3. Then run:
   ```
   flutter pub get
   ```
   This downloads all the packages listed in `pubspec.yaml`.
4. Start your Android emulator from Android Studio's Virtual Device Manager
   (or plug in a real Android phone with USB debugging enabled)
5. Run:
   ```
   flutter run
   ```
   Pick the emulator/device if prompted. First run takes a few minutes.

You'll see the login screen with the theme toggle, then onboarding, then the
dashboard. The conversation screen will show errors until Part C is done —
that's expected, it's calling a proxy server that doesn't exist yet.

---

## Part C — Get the AI features working (hosted on Vercel)

The app never calls Anthropic/Deepgram/Azure directly — it calls small serverless
functions in `/api` that hold the real keys. Vercel hosts both those functions
*and* a web build of the Flutter app itself, in one project.

### 1. Get your three API keys
- **Anthropic (Claude):** https://console.anthropic.com → Settings → API Keys
- **Deepgram:** https://console.deepgram.com → sign up (free credit included) → API Keys
- **Azure Speech:** https://portal.azure.com → create a "Speech" resource (free
  tier: F0) → Keys and Endpoint page gives you a key + region (e.g. `eastus`)

### 2. Push this project to GitHub
Vercel deploys from a Git repo. If you don't have one yet:
```
cd fluency_flutter
git init
git add .
git commit -m "Initial FLUENCY project"
```
Then create an empty repo on https://github.com/new and follow the push
instructions it shows you.

### 3. Import into Vercel
- Go to https://vercel.com → sign up (free) → **Add New → Project**
- Import your GitHub repo
- Vercel will auto-detect `vercel.json` — leave settings as-is and click **Deploy**
- First deploy takes a few minutes (it downloads the Flutter SDK during the
  build — this is expected, see the note at the bottom)

### 4. Add your API keys as environment variables
In your Vercel project → **Settings → Environment Variables**, add:

**For testing (what you have right now):**
```
CLAUDE_BASE_URL       = <your ClaudeStore API base URL>
CLAUDE_API_KEY        = <your ClaudeStore API key>
CLAUDE_AUTH_SCHEME    = bearer          (change to x-api-key if ClaudeStore's docs say otherwise)
TTS_PROVIDER          = elevenlabs
ELEVENLABS_API_KEY    = <your ElevenLabs key>
DEEPGRAM_API_KEY      = <your Deepgram key>
```

**When you switch to production (real Anthropic + Azure), change only these — nothing else in the code changes:**
```
CLAUDE_BASE_URL       = https://api.anthropic.com
CLAUDE_API_KEY        = <your real Anthropic key>
CLAUDE_AUTH_SCHEME    = x-api-key
TTS_PROVIDER          = azure
AZURE_SPEECH_KEY      = <your Azure key>
AZURE_SPEECH_REGION   = <your Azure region>
```

Then go to **Deployments** → click the ⋯ menu on the latest deploy → **Redeploy**
(env vars only apply to new deploys).

> **On ClaudeStore specifically:** this is a third-party reseller, not
> Anthropic — I'd treat it as throwaway-test-only, never point real user
> traffic at it, and budget time to fully cut over before you have real users.
> Anthropic's `/v1/messages` request/response shape is what `api/chat.js`
> sends either way, so cutover is just the env vars above — no code changes.

### 5. You now have one URL for everything
Vercel gives you something like `https://fluency-yourname.vercel.app`:
- Opening it in a browser runs the actual Flutter **web app**, already pointed
  at `/api` (same domain, so no extra config needed)
- The same URL's `/api/stt`, `/api/chat`, `/api/tts` also work for your
  **Android emulator/phone build** — just run:
  ```
  flutter run --dart-define=PROXY_BASE_URL=https://fluency-yourname.vercel.app/api
  ```

Now the conversation screen is fully real: hold the mic button, speak in your
target language, release — you'll get a transcribed reply, a correction if you
made a mistake, and the tutor's spoken voice reply.

> **Note on the build:** `vercel.json`'s build command clones the Flutter SDK
> fresh each deploy since Vercel's build image doesn't include it — this makes
> builds slower (~3-5 min) but requires zero manual setup. If that ever
> becomes annoying, a GitHub Action that pre-builds `build/web` and commits it
> is the standard fix — ask me when you're ready for that.

> **Alternative:** `server/worker.js` is the same proxy logic written for
> Cloudflare Workers instead, if you ever prefer that over Vercel — it's not
> needed if you're using `/api` on Vercel.

---

## Part D — Build a real Android APK

Everything tested so far has been the *web* build running inside your
phone's browser (`vfluency.vercel.app`). This builds an actual installable
Android app instead — a real `.apk` file, no browser involved.

### 1. Make sure the Android platform folder exists
If you haven't already run this (Part B, step 2), do it now from the
project's root folder:
```
flutter create . --platforms=android,web,windows
```
Safe to re-run even if you did this before — it only fills in anything
missing, it won't touch your `lib/` code.

### 2. Generate real app icons
This turns `assets/branding/app_icon.png` into the actual icon files Android
needs:
```
flutter pub get
dart run flutter_launcher_icons
```

### 3. (Optional) Give it a real package name
By default Android apps scaffold with a placeholder ID like
`com.example.fluency`. Fine for personal testing, but if you ever want to
publish this, you'd want something like `com.yourname.fluency` instead.
This lives in `android/app/build.gradle` (`applicationId` field) — skip this
for now if you're just testing on your own phone.

### 4. Build it
From the project root, pointing at your deployed backend:
```
flutter build apk --release --dart-define=PROXY_BASE_URL=https://vfluency.vercel.app/api
```
This takes a few minutes the first time. When it finishes, the file is at:
```
build\app\outputs\flutter-apk\app-release.apk
```

> **On signing**: Flutter automatically signs this release build with a
> debug key if you haven't set up a real signing key, which is completely
> fine for installing on your own phone or sharing with testers directly —
> it's *not* fine for submitting to the Play Store later, which requires a
> proper upload key. That's a separate step for whenever you're ready to
> publish, not needed now.

### 5. Get it onto your phone
Two ways:
- **USB cable**: enable Developer Options + USB debugging on your phone
  (Settings → About Phone → tap "Build number" 7 times → go back → enable
  USB debugging under the new Developer Options menu), plug in via USB, then
  run `flutter install` from the project folder.
- **No cable**: copy `app-release.apk` to your phone any way you like
  (email it to yourself, Google Drive, USB file transfer), open it from your
  Files app, and tap to install. Android will ask you to allow installs from
  that source the first time — that's expected, since it's not from the
  Play Store.

Once installed, open it like any other app — no browser, no URL bar, the
real thing.

---

## Part E — Real accounts & persistence (Supabase) — ON HOLD

This phase (real Supabase accounts + saved profiles) was built and then
**rolled back** for now to keep things simple while other things get
sorted out. The app is back to Phase 1-3 behavior: login accepts anything
(no real accounts), and onboarding choices live only in memory for the
current session - sign out and they're gone, same as before Supabase was
ever introduced.

Nothing was deleted from history - the working Supabase integration
(SupabaseAuthRepository, ProfileRepository, the splash-screen session
bootstrap, the SQL schema in `scripts/supabase_setup.sql`) is fully
documented in this project's chat history and can be reinstated later
without starting over. When ready to resume: re-add the `supabase_flutter`
dependency, bring back the three files, restore the router's splash-screen
entry point, and follow the setup steps that were here before - all of it
is a known, working recipe, just paused.
---

## Part F — Stripe Paywall (Pro subscription)

The paywall screen/sheet (`lib/features/paywall/`) is fully built and wired
into navigation, but actually charging a card needs your own Stripe
account and a couple of proxy endpoints deployed alongside the existing
`/api/chat.js` etc. Until you do this, "Start Free Trial" will show a
friendly "checkout isn't available yet" message instead of crashing.

### 1. Create the Stripe Prices

In the Stripe Dashboard, create two recurring Prices under one Product
("Fluency Builder Pro"):
- Weekly: $5.99 / week
- Yearly: $39.99 / year

Copy each Price ID (`price_...`).

### 2. Add the new environment variables

Alongside the existing `CLAUDE_API_KEY` etc. in Vercel (see Part C):

```
STRIPE_SECRET_KEY          = sk_test_...   (sk_live_... when you go live)
STRIPE_PRICE_WEEKLY        = price_...
STRIPE_PRICE_YEARLY        = price_...
APP_SUCCESS_URL            = wherever you want people sent after paying
APP_CANCEL_URL             = wherever you want people sent if they back out
STRIPE_WEBHOOK_SECRET      = whsec_...     (from step 4 below)
SUPABASE_URL               = your Supabase project URL
SUPABASE_SERVICE_ROLE_KEY  = your Supabase service-role key (Project
                              Settings -> API - keep this secret, it
                              bypasses Row Level Security)
```

### 3. Run the SQL migration

In the Supabase SQL editor, run `scripts/supabase_migration_subscription.sql`
once - it adds `subscription_status`, `subscription_period_end`, and
`stripe_customer_id` to the `profiles` table.

### 4. Add the Stripe webhook

In the Stripe Dashboard -> Developers -> Webhooks, add an endpoint at
`https://<your-vercel-app>/api/stripe-webhook` listening for:
`checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`. Stripe
shows you a signing secret the moment you save it - that's your
`STRIPE_WEBHOOK_SECRET`.

### 5. Redeploy

Push these changes and redeploy on Vercel so the new env vars and the two
new `/api` files go live. That's it - "Start Free Trial — Requires Card"
now creates a real Stripe Checkout Session, and the webhook keeps
`profiles.subscription_status` (and therefore the in-app paywall) in sync
automatically from then on.

---

## Live online search (not part of the offline data)

Beyond the offline bundled content, Phrase Bank (and the empty states in
Grammar/Scenarios) has a 🌐 button that searches an online sentence database
live — this needs internet, and results aren't reviewed the way the bundled
files are. Two ways to search, both fully in-app, no scripts or terminal:

- **By word**: type any word/phrase, get real matching sentences + English
  translations back instantly, with playback (a real human recording if one
  exists, device TTS otherwise).
- **By theme**: tap "Browse a themed collection instead," type a topic like
  "restaurant" or "travel," and the app shows real named collections
  matching that word (e.g. "Restaurant Vocabulary") — tap one to load every
  sentence in it. No ID numbers involved; that's handled server-side by
  `api/tatoeba-lists.js`, which downloads and searches the underlying data
  on the app's behalf.

  `scripts/discover_tatoeba_lists.py` still exists as a manual fallback if
  the in-app version ever has trouble, but it shouldn't be needed day to day.

This is served through three small Vercel functions — `api/tatoeba.js`,
`api/tatoeba-audio.js`, and `api/tatoeba-lists.js` — not because the source
needs an API key (it doesn't), but to avoid a likely CORS block calling it
directly from the Flutter *web* build's browser context, and to keep one
code path for both mobile and web.

> **One honest caveat on `api/tatoeba-lists.js` specifically**: I verified
> its bz2-decompression and archive-parsing logic locally against a
> hand-made file in the exact same format, so that part is solid. What I
> could *not* test is the live download itself, since the source domain is
> blocked from the sandbox I build in. If theme browsing 500s after you
> deploy, that's the first thing to check — send me the error and we'll
> debug it together.

## Branding — logo & app icon

The FLUENCY wordmark (teal "F" + white "luency" on navy) is now used
throughout the app via `AppLogo` (auth screen, dashboard) - it's a real
Flutter widget, not an image, so it stays crisp at any size and adapts to
light/dark theme automatically.

For the actual home-screen app icon, `assets/branding/app_icon.png` is a
1024x1024 polished version of the same mark, wired up with
`flutter_launcher_icons`. After running `flutter create . --platforms=...`
(Part B, step 2) and `flutter pub get`, generate real icons for every
platform with:
```
flutter pub run flutter_launcher_icons
```
This writes the actual `android/app/src/main/res/mipmap-*/`,
`ios/Runner/Assets.xcassets/`, and `web/icons/` files from that one PNG - no
manual per-platform icon work needed.

## Onboarding steps

1. **Target Language** — 25 languages
2. **Your Current Level** — CEFR A1 through C2
3. **Daily Goal** — 5/15/30/45/60 minutes
4. **AI Tutor** — voice + regional accent, bundled together
5. **Microphone Test** — real permission check, not simulated

## What's mock vs. real right now

| Feature | Status |
|---|---|
| Login / signup | **Mock** — accepts anything, no real accounts (Supabase on hold, see Part E) |
| Onboarding (language + tutor picker + level + mic test) | **Real UI**, saved only in-memory for the session |
| Conversation (STT → Claude → TTS) | **Real**, once Part C is done |
| Phrase Bank | **Real, offline, with audio** — no network call, no AI call. See below. |
| Grammar | **Real for English/Spanish/French/German**, empty state for the other 21 |
| Scenarios | **Real for English/Spanish/French/German**, empty state for the other 21 |
| Analytics / Admin | **Not built yet** — Phase 3 |
| Payments | **Not built yet** — Phase 5 |

## Phrase Bank, Grammar, Scenarios — offline, no AI, with audio

All three tabs read data bundled directly into the app (`assets/phrases/`,
`assets/grammar/`, `assets/scenarios/`, one JSON file per language) — zero
network calls, zero AI cost, works with the phone in airplane mode.

**Audio**: tap the speaker icon on any phrase, grammar example, or scenario
line to hear it — played back through the device's own built-in
text-to-speech engine (Android TextToSpeech / iOS AVSpeechSynthesizer /
Chrome Web Speech API), not Azure/ElevenLabs. That's a deliberate choice:
it's free, needs no API key, and works fully offline once the phone's
language voice pack is installed. It won't sound as natural as the neural
voices used in live conversation — that's the tradeoff for zero cost. In
Phrase Bank, tapping the speaker plays the phrase in the target language,
then automatically plays the English translation right after.

**Content coverage is uneven on purpose, not by accident:**

- **Phrase Bank**: Japanese (`ja.json`) has 400 real phrase pairs pulled from
  the [Tatoeba](https://tatoeba.org) corpus (CC BY 2.0 FR). Every other
  language has a small ~14-phrase hand-written starter set — enough that the
  tab isn't empty, but not verified by native speakers.
- **Grammar and Scenarios**: only seeded for English, Spanish, French, and
  German — the languages I could write genuinely correct content for with
  confidence. Grammar rules being *wrong* is worse than a topic being
  *missing*, so the other 21 languages show an honest empty state instead of
  invented rules. Same reasoning for Scenarios' example dialogues.

**Growing this for real:**
- `scripts/pull_tatoeba.py` now uses **Tatoeba's actual public REST API**
  (`api.tatoeba.org`) instead of bulk CSV file parsing — much simpler, and
  it can pull **real human pronunciation recordings**, not just text:
  ```
  cd fluency_flutter/scripts
  pip install requests
  python pull_tatoeba.py spa --max 400              # text only
  python pull_tatoeba.py fra --with-audio           # + real audio clips
  ```
  With `--with-audio`, phrases that have a Tatoeba recording (and whose
  contributor allows reuse) download as real .mp3 files. Copy `<code>.json`
  into `assets/phrases/<code>.json` and the `audio/` folder into
  `assets/phrases/audio/`. In the app, any phrase with a bundled recording
  plays that real audio (shown with a 🗣️ icon in Phrase Bank); everything
  else falls back to the device's own offline TTS.

  I tested `api.tatoeba.org` myself and confirmed it's blocked from the
  sandboxed environment I build in (same as the bulk-download domain), so
  this still has to run on your machine — but it's a much better script now
  than the CSV-parsing version, thanks to that API you found.
- Grammar and Scenarios have no equivalent pull script, because there isn't
  a Tatoeba-style open sentence corpus for grammar *rules* — extending those
  means either writing content yourself/with a native speaker, or adapting
  from a public-domain source like the **FSI (Foreign Service Institute)
  language courses**, which cover 40+ languages and are U.S. government work
  (public domain, no license needed). Same JSON schema either way:
  ```json
  // assets/grammar/<code>.json
  [{"title": "...", "explanation": "...", "examples": [{"text": "...", "note": "..."}]}]
  // assets/scenarios/<code>.json
  [{"title": "...", "lines": [{"speaker": "...", "text": "...", "translation": "..."}]}]
  ```

## Project structure
```
lib/
  core/            theme, router, environment config
  shared/          data shared across features (languages, tutors)
  features/
    auth/          fake login (Phase 4 swaps in Supabase)
    onboarding/     language + tutor/accent picker
    dashboard/     landing screen after onboarding
    conversation/  the real AI pipeline (STT -> Claude -> TTS)
api/               Vercel serverless functions - the proxy (recommended)
server/            Cloudflare Worker version of the same proxy (alternative)
vercel.json        builds the Flutter web app + deploys /api together
```

If you get stuck at any step, copy the exact error message back to me.
