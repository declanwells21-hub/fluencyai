# Website chatbot ("Fluency AI assistant")

A chat assistant that answers questions about Fluency AI from the site's own content. Phase 1 is the backend;
the chat widget on the pages is Phase 2. Telegram, email and WhatsApp can be added later as small adapters.

## How it works

1. The widget sends the visitor's message to `POST /api/bot/chat`.
2. Providers are tried in the order of `BOT_PROVIDERS` (default `tokenharbor,manus`):
   - **Token Harbor** answers in the same request (about 5 to 8 seconds). The reply comes back as
     `{ cid, status: "done", reply, human }`. The whole knowledge file is the system prompt, plus the last 8 messages.
   - **Manus** is the backup. It works in the background: chat returns `{ cid, status: "pending" }` and the widget asks
     `GET /api/bot/poll?cid=...` every 2 to 4 seconds until the answer is `done`. Every message sent to Manus carries only
     the rules (first message), a small core of facts and the best-matching excerpts, because Manus rejects any message over
     5000 estimated tokens and the whole knowledge file is about 12,000.
3. The widget must handle both replies to `chat` (`done` straight away, or `pending` then poll).
4. The answer is cleaned (plain text, only our own links, no provider name) before the visitor sees it.
   If the assistant could not answer, the reply carries `human: true` and the widget offers "talk to a person".
5. The transcript lives in our database, so a chat can move between providers from one message to the next.

Code map: `api/bot.js` (the one function), `api/_lib/bot/brain.js` (what it says: rules, prompts, cleaning),
`llm.js` (Token Harbor, OpenAI-style), `manus.js` (Manus API v2 client and key pool), `web.js` (the website channel and the
provider switch), `knowledge.md` (generated).

## Setup (once)

1. Run `scripts/supabase_migration_bot.sql` in the Supabase SQL editor (it is safe to run again; it adds the `provider` column if you ran an earlier version).
2. Add these environment variables in Vercel (Production, and Preview if you test there):

| Variable | Needed | What it is |
|---|---|---|
| `TOKENHARBOR_API_KEYS` | yes (or Manus) | Token Harbor key(s), comma-separated. |
| `TOKENHARBOR_MODEL` | no (`deepseek-v4.1-flash:free`) | The model id. **Use a paid model for real visitors**: free models may keep prompts and responses and have unpublished limits. |
| `TOKENHARBOR_BASE_URL` | no | Defaults to `https://tokenharbor.ai/v1`; any OpenAI-compatible endpoint works. |
| `BOT_PROVIDERS` | no (`tokenharbor,manus`) | Order to try the providers in. A provider without keys is skipped. |
| `MANUS_API_KEYS` | yes (or Token Harbor) | The Manus API keys, comma-separated. Keys from different Manus accounts share the load. |
| `BOT_DAILY_CAP` | no (1500) | Most visitor messages answered per day, across the whole site. |
| `BOT_IP_PER_10MIN` | no (20) | Most messages per visitor IP in 10 minutes. |
| `MANUS_AGENT_PROFILE` | no | e.g. `manus-1.6-lite` for faster answers. Only set it if `tools/manus_speedtest.js` shows it works. |
| `BOT_LINK_HOSTS` | no | Extra website hosts the bot may link to (comma-separated). fluencyai.app and Selar are built in. |
| `BOT_FIRST_MSG_CHARS` / `BOT_FOLLOW_MSG_CHARS` | no (13000 / 7000) | Size limits, in characters, for the first and later messages sent to Manus. Manus rejects messages over 5000 estimated tokens (about 20,000 characters), so keep well below that. |
| `BOT_ENABLED` | no | Set to `false` to switch the bot off immediately. |

3. Deploy. Then try `POST /api/bot/chat` from the widget (Phase 2) or with curl.

## Keeping the knowledge current

`api/_lib/bot/knowledge.md` is generated from `site/` (prices and guides from `site/fluency-data.js`, wording from the
pages). The GitHub Action `.github/workflows/bot-knowledge.yml` rebuilds and commits it whenever `site/` changes on `main`.
By hand: `node tools/build_bot_knowledge.js` (add `--check` to only test whether it is current).

## Phase 0 speed test

`MANUS_API_KEY=xxxx node tools/manus_speedtest.js` (Node 18 or newer, one key). Prints how long Manus takes and
the answers to four test questions, including one it cannot answer and one prompt-injection attempt.

## Testing other AI providers

`tools/llm_speedtest.js` (Token Harbor) and `tools/manus_speedtest.js` run the same questions against any OpenAI-compatible chat API (for example Token Harbor's
free models) using the whole knowledge file as the system prompt. Free tiers may keep prompts and have unpublished limits:
use them for testing, and a paid (no-retention) plan for real visitors.

## Housekeeping

- Old chats: run `select public.fl_bot_cleanup(90);` now and then to delete chats older than 90 days.
- Vercel function count: `api/` holds 11 functions after this change (limit 12 on Hobby). `tests/bot.test.js` fails if it ever exceeds 12.
- `/api/tatoeba-lists` and `/api/tatoeba-audio` still work: `vercel.json` routes them into `api/tatoeba.js`.

## Adding a channel later

Write `api/_lib/bot/telegram.js` (or `email.js`, `whatsapp.js`): verify the incoming request, call `brain.cleanQuestion`,
use `channel` + `external_id` on `bot_conversations`, call `manus.createTask` / `sendMessage`, and send the cleaned
`brain.processReply(...)` back. Route it with one more rewrite (`/api/bot/telegram`). Nothing else changes.
