# Backend foundation: rollout notes

What this covers: rate limits on the public forms and the AI endpoints, an optional "must be signed in" switch
for `/api/chat`, `/api/stt` and `/api/tts`, and saving the waitlist language and the Home page partner pop-up email.

## 1. Deploy in this order

1. **Run the SQL once.** Supabase dashboard, SQL editor, paste `scripts/supabase_migration_backend_foundation.sql`, Run.
   It is safe to run again. It creates `rate_limits`, `partner_interest` and the `fl_rate_limit_hit()` function,
   and adds `language`, `launch_state` and `ref_code` to `waitlist_signups`.
2. **Deploy the code** (upload the files, Vercel builds as usual).

If the code goes live before the SQL is run, nothing breaks: the rate limiter lets requests through (and logs why),
the waitlist saves the email without the new columns, and partner pop-up emails are not saved until the table exists.
The Vercel function logs say "Run scripts/supabase_migration_backend_foundation.sql" when that happens.

## 2. Settings (all optional, Vercel -> Settings -> Environment Variables)

| Variable | Default | What it does |
|---|---|---|
| `REQUIRE_AUTH_AI` | unset (off) | Set to `true` to refuse `/api/chat`, `/api/stt`, `/api/tts` unless the caller sends a valid sign-in token. |
| `SELAR_WEBHOOK_SECRET` | none | Required for the Selar order receiver. A long random string; it goes in the webhook URL as `?key=`. Without it every request is refused. |
| `SELAR_USD_RATES` | none | Optional JSON of exchange rates to US dollars for orders Selar reports in another currency, e.g. `{"NGN":0.00065}`. |
| `CREDITS_MODE` | `off` | `shadow` records what each call would cost (nobody charged); `enforce` charges and blocks at zero. See `docs/credits.md`. |
| `AI_RATE_LIMIT` | on | Set to `off` to switch the per-minute limits off. |
| `AI_RATE_CHAT_PER_MIN_USER` / `_IP` | 40 / 30 | Chat requests per minute for a signed-in account / for an IP address. |
| `AI_RATE_STT_PER_MIN_USER` / `_IP` | 30 / 20 | Speech-to-text. |
| `AI_RATE_TTS_PER_MIN_USER` / `_IP` | 120 / 60 | Text-to-speech (higher: word-by-word playback sends bursts). |

The defaults are a first guess. Watch for 429 responses in the logs after launch and raise them if real users hit them.
The forms are fixed at 10 submissions per hour per connection (waitlist, partner pop-up, partner application).

## 3. Before you set `REQUIRE_AUTH_AI=true`

The Flutter app does not send a login token yet, so turning this on today would stop the app (including
fluencyai.app/app) from using AI. The website itself never calls these endpoints, so it is not affected.

Do this first, in the Flutter app: add the header `Authorization: Bearer <Supabase access token>` to every call to
`/chat`, `/stt` and `/tts`. The call sites are `lib/features/conversation/data/tutor_repository.dart` (stt, tts and five chat calls),
`lib/features/plan/data/plan_repository.dart`, `lib/features/grammar/data/custom_grammar_repository.dart` and
`lib/features/scenarios/data/custom_scenario_repository.dart`. Then redeploy the app, then set the variable.
To switch it off again, delete the variable (no redeploy of code needed beyond Vercel's normal env refresh).

What callers get back:

| Situation | Status | Body |
|---|---|---|
| Not signed in, `REQUIRE_AUTH_AI=true` | 401 | `{ "code": "auth_required" }` |
| Not enough credits, `CREDITS_MODE=enforce` | 402 | `{ "code": "insufficient_credits", "credits": n, "needed": n }` |
| Too many requests | 429 + `Retry-After` header | `{ "code": "rate_limited", "retryAfterSeconds": n }` |
| Supabase could not check the sign-in | 503 | `{ "code": "auth_unavailable" }` |

## 4. Housekeeping

- Old rate-limit counters are harmless but pile up. Run `select public.fl_rate_limit_cleanup();` now and then,
  or schedule it with pg_cron.
- `api/_lib/userAuth.js` remembers a valid sign-in for 60 seconds per running function instance, so a signed-out
  session can keep working for up to a minute.
- Partner codes are stored upper-case in `waitlist_signups.ref_code` and `partner_interest.ref_code`. When commissions
  are built, compare with `upper(creators.code)`.
- The two SQL files the code mentions, `supabase_migration_waitlist.sql` and `supabase_migration_creators.sql`, are not in the
  repository. The foundation SQL rebuilds those tables from how the code uses them; on your live project they are left as they are.
  The `admin_get_creator_stats()` function used by the admin dashboard is not rebuilt: export it from Supabase if you want it in the repo.

## 5. Tests

`node tests/backend_foundation.test.js` runs 32 checks against an in-memory fake of Supabase (no keys, network or database needed).
`node tests/partner_hub.test.js` (22 checks), `node tests/credits.test.js` (31 checks) and `node tests/selar.test.js` (41 checks) work the same way.
