# Credits: how they work and how to roll them out

Credits are what the AI endpoints (`/api/chat`, `/api/stt`, `/api/tts`) cost a signed-in person. The Pricing page sells them:
Plus is $12 a month with 3,000 credits (about 7 hours of conversation); top-ups are $5 / 500, $10 / 1,100 and $20 / 2,400.

## The rules

- **Two kinds of credit.** *Monthly* credits come with a subscription and expire at the end of the billing period.
  *Top-up* credits (bought packs and admin grants) never expire. Spending uses monthly credits first, then top-up.
- **No free credits.** Waitlist and early-access members get an admin grant (admin dashboard, Users, "Credits").
- **A balance never goes below zero.**
- **A failed call costs nothing.** The balance is checked before the paid provider is called and charged only after it answers.
- **Credits belong to an account.** With `CREDITS_MODE=enforce`, a call without a sign-in is refused (401).

## What a call costs (defaults, all changeable)

Target: about 7 credits per minute of conversation. A spoken turn (listen, think, speak) is about 25 seconds, so about 3 credits.

| Call | Default cost | Change with |
|---|---|---|
| Chat: `converse`, `hint`, `pronunciation`, `translate` | 1 | `CREDIT_COST_CHAT_<MODE>` e.g. `CREDIT_COST_CHAT_CONVERSE` |
| Chat: `grammar` | 2 | same |
| Chat: `scenario` | 3 | same |
| Chat: `analyze` (session report) | 4 | same |
| Chat: `plan` (study plan) | 10 | same |
| Speech to text | 1 per started 10 seconds of audio (min 1) | `CREDIT_STT_SECONDS_PER_CREDIT` |
| Text to speech | 1 per started 250 characters (min 1) | `CREDIT_TTS_CHARS_PER_CREDIT` |

These are starting points, not measured costs. Tune them from the admin "Credit usage" panel after a shadow period.

**Decision for the client:** a text-only turn costs 1 credit but a spoken turn about 3, so text stretches further. The Pricing page says
"Voice or text, same time". Either soften that line, or make all turns cost the same (for example, charge chat 3 and speech 0).

## Switching it on, in this order

1. Supabase SQL editor: run `scripts/supabase_migration_credits.sql` (after the backend foundation file, before the partner hub file).
2. Then run `scripts/credits_self_test.sql`. It exercises every function on one existing account and ends with an error on purpose so that
   nothing is kept. **`ERROR: ALL 15 CHECKS PASSED. Everything was rolled back.` means success.** Any `CHECK FAILED: ...` means stop and tell me which.
3. Deploy the code. With `CREDITS_MODE` unset nothing changes.
4. Set `CREDITS_MODE=shadow` in Vercel. Every signed-in AI call is now recorded with its cost and real token / audio / character numbers.
   Nobody is charged or blocked. Watch the admin dashboard, "Credit usage".
5. Compare the usage with your real bills from Claude, Deepgram and ElevenLabs, and adjust the prices.
6. **Only set `CREDITS_MODE=enforce` when both of these are true:**
   - the Flutter app sends the login token (`Authorization: Bearer ...`) with every AI request, and
   - the billing webhook gives subscribers their monthly credits by calling `fl_credit_set_monthly` (billing rework, the next backend step).
   Until then subscribers have 0 credits and everyone would be stopped. Waitlist and early-access members need an admin grant first.

## What the app should do (for the Flutter step)

- Read the balance: `supabase.rpc('fl_my_credits')` with the person's normal login. Returns `total`, `monthly`, `topup`, `expires_at`.
- Handle a `402` with `code: "insufficient_credits"` from any AI call: show the top-up screen. The body has `credits` (what they have) and `needed`.
- `401` with `code: "auth_required"` means the login token is missing or expired.

## Admin tools (already in the dashboard)

- Users, "Credits": see a balance and add top-up credits with a note. Safe against a double click (idempotency key).
- "Credit usage": per endpoint and per chat mode, calls, credits, people, tokens, audio seconds and characters, plus the 10 heaviest users.

## For the billing step (next)

- Monthly allowance: `fl_credit_set_monthly(user, 3000, period_end, note, key)`. It replaces the previous monthly amount; use the billing event id as `key`.
- Top-up purchase: `fl_credit_grant(user, 500 | 1100 | 2400, 'topup', note, null, key)`; again use the billing event id as `key`.
- Both are safe to repeat: the same key never grants twice.

## Housekeeping

- `fl_ai_usage_cleanup(180)` deletes usage rows older than 180 days. Run it now and then, like `fl_rate_limit_cleanup()`.
- Vercel's free plan allows 12 serverless functions and the project uses all 12. The Selar receiver (next steps) must be added inside an
  existing function rather than as a new file.
