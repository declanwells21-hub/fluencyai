-- Backend foundation: run once in the Supabase SQL editor.
-- Safe to run more than once (everything is IF NOT EXISTS / CREATE OR REPLACE).
--
-- What this does
--   1. Rate limiting: the rate_limits table and the fl_rate_limit_hit() function used by
--      api/_lib/rateLimit.js (AI endpoints and the public forms).
--   2. Waitlist: new columns for the language the visitor chose, the launch state they joined
--      under, and the partner code they arrived with.
--   3. partner_interest: where the Home page "partner" pop-up email is stored.
--   4. Records of tables the code already depends on (waitlist_signups, creators,
--      creator_applications, referral_events). The files that created them,
--      scripts/supabase_migration_waitlist.sql and scripts/supabase_migration_creators.sql, are not in
--      the repository. The definitions below are rebuilt from how the code uses those tables.
--      On a project where the tables already exist they change nothing (CREATE TABLE IF NOT EXISTS),
--      and they let a fresh Supabase project be set up from the repository alone.
--
-- Every table here has Row Level Security switched on with no public policies. The API reaches them
-- with the service-role key, which bypasses RLS, so visitors and signed-in users cannot read them directly.

-- ---------------------------------------------------------------------------
-- 1. Rate limiting (fixed window counter, one row per key)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        integer     not null default 0
);
alter table public.rate_limits enable row level security;

create or replace function public.fl_rate_limit_hit(p_key text, p_window_seconds integer, p_max integer)
returns table (allowed boolean, current_count integer, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits%rowtype;
begin
  -- One atomic statement: start a new window if the old one has run out, otherwise count this hit.
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set window_start = case when r.window_start <= v_now - make_interval(secs => p_window_seconds)
                            then v_now else r.window_start end,
        count        = case when r.window_start <= v_now - make_interval(secs => p_window_seconds)
                            then 1 else r.count + 1 end
  returning * into v_row;

  allowed       := v_row.count <= p_max;
  current_count := v_row.count;
  retry_after   := greatest(0, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds) - v_now)))::integer);
  return next;
end;
$$;

-- Only the API (service role) may call it.
revoke all on function public.fl_rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.fl_rate_limit_hit(text, integer, integer) to service_role;

-- Old counters are useless after a day. Call this now and then (for example from pg_cron, or by hand).
create or replace function public.fl_rate_limit_cleanup()
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (delete from public.rate_limits where window_start < now() - interval '1 day' returning 1)
  select count(*)::integer from gone;
$$;
revoke all on function public.fl_rate_limit_cleanup() from public, anon, authenticated;
grant execute on function public.fl_rate_limit_cleanup() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Waitlist (existing table, plus three new columns)
-- ---------------------------------------------------------------------------
create table if not exists public.waitlist_signups (
  id                    uuid primary key default gen_random_uuid(),
  email                 text not null unique,
  source                text,
  referrer              text,
  country               text,
  confirmation_sent_at  timestamptz,
  notified_at           timestamptz,
  created_at            timestamptz not null default now()
);
alter table public.waitlist_signups enable row level security;

alter table public.waitlist_signups
  add column if not exists language     text,   -- language the visitor picked on the Home page, e.g. "German"
  add column if not exists launch_state text,   -- waitlist | early_access | public_launch, at the time they joined
  add column if not exists ref_code     text;   -- partner code they arrived with (?ref=CODE), if any

create index if not exists waitlist_signups_ref_code_idx on public.waitlist_signups (ref_code) where ref_code is not null;

-- ---------------------------------------------------------------------------
-- 3. Home page partner pop-up emails
-- ---------------------------------------------------------------------------
create table if not exists public.partner_interest (
  id         uuid primary key default gen_random_uuid(),
  email      text not null unique,
  source     text,
  ref_code   text,
  referrer   text,
  country    text,
  created_at timestamptz not null default now()
);
alter table public.partner_interest enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Partner programme tables the code already uses
-- ---------------------------------------------------------------------------
create table if not exists public.creators (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  code            text not null unique,
  niche           text,
  contact_email   text,
  commission_rate numeric not null default 0.2,
  status          text not null default 'active',
  notes           text,
  created_at      timestamptz not null default now()
);
alter table public.creators enable row level security;

create table if not exists public.creator_applications (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  email          text not null,
  platform       text not null,
  handle         text not null,
  country        text,
  niche          text,
  follower_count text,
  portfolio_url  text,
  message        text,
  status         text not null default 'pending',
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);
alter table public.creator_applications enable row level security;

create table if not exists public.referral_events (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid references public.creators (id) on delete cascade,
  code       text,
  event_type text not null,
  meta       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.referral_events enable row level security;
create index if not exists referral_events_creator_idx on public.referral_events (creator_id, created_at desc);
