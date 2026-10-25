# Website chatbot ("Fluency AI assistant")

A chat assistant that answers questions about Fluency AI from the site's own content. Phase 1 is the backend;
the chat widget on the pages is Phase 2. Telegram, email and WhatsApp can be added later as small adapters.

## How it works

1. The widget sends the visitor's message to `POST /api/bot/chat`. The server starts (or continues) a Manus task
   and answers at once with `{ cid, status: "pending" }`.
2. The widget asks `GET /api/bot/poll?cid=...` every 2 to 4 seconds until the answer is `done`.
3. The answer is cleaned (plain text, only our own links, no provider name) before the visitor sees it.
   If the assistant could not answer, the reply carries `human: true` and the widget offers "talk to a person".

Code map: `api/bot.js` (the one function), `api/_lib/bot/brain.js` (what it says: rules, prompts, cleaning),
`manus.js` (the Manus API v2 client and key pool), `web.js` (the website channel), `knowledge.md` (generated).

## Setup (once)

1. Run `scripts/supabase_migration_bot.sql` in the Supabase SQL editor.
2. Add these environment variables in Vercel (Production, and Preview if you test there):

| Variable | Needed | What it is |
|---|---|---|
| `MANUS_API_KEYS` | yes | The Manus API keys, comma-separated. Keys from different Manus accounts share the load. |
| `BOT_DAILY_CAP` | no (1500) | Most visitor messages answered per day, across the whole site. |
| `BOT_IP_PER_10MIN` | no (20) | Most messages per visitor IP in 10 minutes. |
| `MANUS_AGENT_PROFILE` | no | e.g. `manus-1.6-lite` for faster answers. Only set it if `tools/manus_speedtest.js` shows it works. |
| `BOT_LINK_HOSTS` | no | Extra website hosts the bot may link to (comma-separated). fluencyai.app and Selar are built in. |
| `BOT_ENABLED` | no | Set to `false` to switch the bot off immediately. |

3. Deploy. Then try `POST /api/bot/chat` from the widget (Phase 2) or with curl.

## Keeping the knowledge current

`api/_lib/bot/knowledge.md` is generated from `site/` (prices and guides from `site/fluency-data.js`, wording from the
pages). The GitHub Action `.github/workflows/bot-knowledge.yml` rebuilds and commits it whenever `site/` changes on `main`.
By hand: `node tools/build_bot_knowledge.js` (add `--check` to only test whether it is current).

## Phase 0 speed test

`MANUS_API_KEY=xxxx node tools/manus_speedtest.js` (Node 18 or newer, one key). Prints how long Manus takes and
the answers to four test questions, including one it cannot answer and one prompt-injection attempt.

## Housekeeping

- Old chats: run `select public.fl_bot_cleanup(90);` now and then to delete chats older than 90 days.
- Vercel function count: `api/` holds 11 functions after this change (limit 12 on Hobby). `tests/bot.test.js` fails if it ever exceeds 12.
- `/api/tatoeba-lists` and `/api/tatoeba-audio` still work: `vercel.json` routes them into `api/tatoeba.js`.

## Adding a channel later

Write `api/_lib/bot/telegram.js` (or `email.js`, `whatsapp.js`): verify the incoming request, call `brain.cleanQuestion`,
use `channel` + `external_id` on `bot_conversations`, call `manus.createTask` / `sendMessage`, and send the cleaned
`brain.processReply(...)` back. Route it with one more rewrite (`/api/bot/telegram`). Nothing else changes.
