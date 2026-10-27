-- Website chatbot ("Fluency AI assistant"): run once in the Supabase SQL editor.
-- Safe to run more than once (everything is IF NOT EXISTS / CREATE OR REPLACE).
--
-- What this does
--   1. bot_conversations: one row per chat. Holds the Manus task id and the id (not the secret) of the
--      API key that task belongs to, because a Manus task can only be continued with the same account.
--      `channel` is 'web' today; 'telegram', 'email' and 'whatsapp' can be added later without a migration
--      (put the chat id / sender address in `external_id`).
--   2. bot_messages: the visible transcript (visitor question, assistant answer).
--   3. bot_handoffs: "talk to a person" requests: the visitor's email and note, linked to the chat.
--   4. fl_bot_cleanup(days): deletes old chats and old hand-off requests so chat data is not kept forever.
--
-- Every table has Row Level Security switched on with no public policies. The API reaches them with the
-- service-role key, which bypasses RLS, so visitors and signed-in users cannot read them directly.
-- Rate limiting reuses the existing rate_limits table and fl_rate_limit_hit() function.

-- ---------------------------------------------------------------------------
-- 1. Conversations
-- ---------------------------------------------------------------------------
create table if not exists public.bot_conversations (
  id                 uuid primary key default gen_random_uuid(),   -- also the visitor's secret chat id (unguessable)
  channel            text not null default 'web',
  external_id        text,                                          -- telegram chat id, sender email, ... (null for web)
  manus_key_id       text,                                          -- first 8 hex chars of sha256(api key); never the key
  manus_task_id      text,
  provider           text,                                          -- which AI served the last turn: 'tokenharbor' or 'manus'
  status             text not null default 'idle' check (status in ('idle', 'pending', 'handoff')),
  pending_since      timestamptz,
  last_user_event_id text,                                          -- Manus event id of the last visitor message already answered
  user_turns         integer not null default 0,
  lang               text,
  page               text,                                          -- path the chat was started from, e.g. /pricing
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- (for databases that already ran the first version of this file)
alter table public.bot_conversations add column if not exists provider text;

alter table public.bot_conversations enable row level security;
revoke all on public.bot_conversations from anon, authenticated;

create unique index if not exists bot_conversations_channel_external_idx
  on public.bot_conversations (channel, external_id) where external_id is not null;
create index if not exists bot_conversations_updated_idx on public.bot_conversations (updated_at);

-- ---------------------------------------------------------------------------
-- 2. Messages
-- ---------------------------------------------------------------------------
create table if not exists public.bot_messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.bot_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  human_flag      boolean not null default false,                   -- the assistant asked for a person to take over
  created_at      timestamptz not null default now()
);
alter table public.bot_messages enable row level security;
revoke all on public.bot_messages from anon, authenticated;

create index if not exists bot_messages_conversation_idx on public.bot_messages (conversation_id, id);

-- ---------------------------------------------------------------------------
-- 3. Human handoffs
-- ---------------------------------------------------------------------------
create table if not exists public.bot_handoffs (
  id              bigint generated always as identity primary key,
  conversation_id uuid references public.bot_conversations (id) on delete set null,
  contact_email   text,
  note            text,
  status          text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at      timestamptz not null default now(),
  emailed_at      timestamptz
);
alter table public.bot_handoffs enable row level security;
revoke all on public.bot_handoffs from anon, authenticated;

create index if not exists bot_handoffs_status_idx on public.bot_handoffs (status, created_at);

-- ---------------------------------------------------------------------------
-- 4. Retention. Called every day by the Vercel cron job (api/bot/cleanup), or by hand: select public.fl_bot_cleanup(90);
--    - chats older than p_days (days since the last message) are deleted, EXCEPT chats tied to a hand-off request that
--      is still open (support may still need the transcript);
--    - hand-off requests older than 24 months are deleted (the Privacy Policy keeps support emails for 24 months).
--    Returns how many chats were deleted.
-- ---------------------------------------------------------------------------
create or replace function public.fl_bot_cleanup(p_days integer default 90)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.bot_conversations c
   where c.updated_at < now() - make_interval(days => greatest(p_days, 1))
     and not exists (
       select 1 from public.bot_handoffs h
        where h.conversation_id = c.id and h.status = 'open'
     );
  get diagnostics v_deleted = row_count;

  delete from public.bot_handoffs where created_at < now() - interval '24 months';
  return v_deleted;
end;
$$;

revoke all on function public.fl_bot_cleanup(integer) from public, anon, authenticated;
grant execute on function public.fl_bot_cleanup(integer) to service_role;
