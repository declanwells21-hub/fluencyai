-- Credits: run once in the Supabase SQL editor, AFTER supabase_migration_backend_foundation.sql.
-- Safe to run more than once (IF NOT EXISTS / CREATE OR REPLACE).
--
-- What this adds
--   fl_credit_balances   one row per person: monthly credits (expire at the end of the billing period)
--                        and top-up credits (never expire).
--   fl_credit_ledger     every grant / expiry, so a balance can always be explained. Idempotency keys stop a
--                        repeated webhook or a double click from granting twice.
--   fl_ai_usage          one row per AI call (chat / stt / tts): what it cost in credits and the raw numbers
--                        behind it (tokens, audio seconds, characters), so prices can be tuned from real data.
--   functions            fl_credit_get, fl_credit_charge, fl_credit_grant, fl_credit_set_monthly,
--                        fl_my_credits (the signed-in person reads their own balance), fl_admin_credit_usage,
--                        fl_ai_usage_cleanup.
--
-- Rules the functions enforce
--   * Spending uses monthly credits first, then top-up credits. A balance can never go below zero.
--   * Monthly credits that are past their expiry count as zero immediately and are cleaned up the next time
--     that person's balance is written.
--   * There are no free credits. Waitlist / early-access members get an admin grant (top-up credits).
--
-- Every table has Row Level Security on. Only fl_credit_balances has a policy (a person may read their own row);
-- the API reaches everything else with the service-role key.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.fl_credit_balances (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  monthly_credits    integer not null default 0 check (monthly_credits >= 0),
  monthly_expires_at timestamptz,
  topup_credits      integer not null default 0 check (topup_credits >= 0),
  updated_at         timestamptz not null default now()
);
alter table public.fl_credit_balances enable row level security;

drop policy if exists "fl_credit_balances read own" on public.fl_credit_balances;
create policy "fl_credit_balances read own" on public.fl_credit_balances
  for select to authenticated using (user_id = auth.uid());

create table if not exists public.fl_credit_ledger (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('monthly_grant', 'monthly_expired', 'topup', 'admin_grant')),
  delta_monthly   integer not null default 0,
  delta_topup     integer not null default 0,
  monthly_after   integer not null,
  topup_after     integer not null,
  note            text,
  granted_by      text,            -- admin email for an admin grant
  idempotency_key text,
  created_at      timestamptz not null default now()
);
alter table public.fl_credit_ledger enable row level security;
create unique index if not exists fl_credit_ledger_key_uidx on public.fl_credit_ledger (idempotency_key) where idempotency_key is not null;
create index if not exists fl_credit_ledger_user_idx on public.fl_credit_ledger (user_id, created_at desc);

create table if not exists public.fl_ai_usage (
  id               bigint generated always as identity primary key,
  user_id          uuid references auth.users (id) on delete set null,
  route            text not null,            -- chat | stt | tts
  mode             text,                     -- chat mode (converse, plan, analyze ...), null for stt / tts
  credits          integer not null,         -- what the call costs (also in shadow mode, when nothing is taken)
  charged_monthly  integer not null default 0,
  charged_topup    integer not null default 0,
  unpaid_credits   integer not null default 0, -- cost that could not be covered (balance ran out mid-call)
  input_tokens     integer,
  output_tokens    integer,
  audio_seconds    integer,
  chars            integer,
  created_at       timestamptz not null default now()
);
alter table public.fl_ai_usage enable row level security;
create index if not exists fl_ai_usage_created_idx on public.fl_ai_usage (created_at desc);
create index if not exists fl_ai_usage_user_idx on public.fl_ai_usage (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.fl_credit_effective_monthly(p_credits integer, p_expires timestamptz)
returns integer
language sql
stable
as $$
  select case when p_expires is not null and p_expires <= now() then 0 else p_credits end;
$$;

-- Read-only balance. Unknown people simply have zero.
create or replace function public.fl_credit_get(p_user uuid)
returns table (total integer, monthly integer, topup integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.fl_credit_balances;
  m integer;
begin
  select * into b from public.fl_credit_balances x where x.user_id = p_user;
  if not found then
    total := 0; monthly := 0; topup := 0; expires_at := null;
    return next;
    return;
  end if;
  m := public.fl_credit_effective_monthly(b.monthly_credits, b.monthly_expires_at);
  total := m + b.topup_credits;
  monthly := m;
  topup := b.topup_credits;
  expires_at := case when m > 0 then b.monthly_expires_at else null end;
  return next;
end;
$$;

-- Locks the person's balance row (creating it if needed) and clears expired monthly credits.
-- Used by every function that writes a balance.
create or replace function public.fl_credit_touch(p_user uuid)
returns public.fl_credit_balances
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.fl_credit_balances;
  v_old integer;
begin
  insert into public.fl_credit_balances (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into b from public.fl_credit_balances x where x.user_id = p_user for update;

  if b.monthly_credits > 0 and b.monthly_expires_at is not null and b.monthly_expires_at <= now() then
    v_old := b.monthly_credits;
    update public.fl_credit_balances x
       set monthly_credits = 0, updated_at = now()
     where x.user_id = p_user
    returning * into b;
    insert into public.fl_credit_ledger (user_id, kind, delta_monthly, delta_topup, monthly_after, topup_after, note)
    values (p_user, 'monthly_expired', -v_old, 0, 0, b.topup_credits, 'monthly credits expired');
  end if;
  return b;
end;
$$;

-- ---------------------------------------------------------------------------
-- Charging for an AI call
--   p_shadow = true   only records the usage (nothing is taken, nobody is blocked)
--   p_shadow = false  takes monthly credits first, then top-up credits, never below zero.
-- The API checks the balance BEFORE the call and charges AFTER it succeeds, so a failed call costs nothing.
-- If two calls race, the second one may find less than it needs: it takes what is left and records the rest as
-- unpaid_credits, so the balance never goes negative.
-- ---------------------------------------------------------------------------
create or replace function public.fl_credit_charge(
  p_user          uuid,
  p_cost          integer,
  p_route         text,
  p_mode          text    default null,
  p_input_tokens  integer default null,
  p_output_tokens integer default null,
  p_audio_seconds integer default null,
  p_chars         integer default null,
  p_shadow        boolean default false
)
returns table (usage_id bigint, charged integer, shortfall integer, total integer, monthly integer, topup integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.fl_credit_balances;
  take_m integer := 0;
  take_t integer := 0;
  v_short integer := 0;
  v_id bigint;
  g record;
begin
  if p_cost is null or p_cost < 0 then
    raise exception 'cost must be zero or more';
  end if;

  if p_shadow then
    insert into public.fl_ai_usage (user_id, route, mode, credits, input_tokens, output_tokens, audio_seconds, chars)
    values (p_user, p_route, p_mode, p_cost, p_input_tokens, p_output_tokens, p_audio_seconds, p_chars)
    returning id into v_id;
  else
    b := public.fl_credit_touch(p_user);
    take_m := least(b.monthly_credits, p_cost);
    take_t := least(b.topup_credits, p_cost - take_m);
    v_short := p_cost - take_m - take_t;

    update public.fl_credit_balances x
       set monthly_credits = x.monthly_credits - take_m,
           topup_credits   = x.topup_credits - take_t,
           updated_at      = now()
     where x.user_id = p_user;

    insert into public.fl_ai_usage (user_id, route, mode, credits, charged_monthly, charged_topup, unpaid_credits,
                                    input_tokens, output_tokens, audio_seconds, chars)
    values (p_user, p_route, p_mode, p_cost, take_m, take_t, v_short,
            p_input_tokens, p_output_tokens, p_audio_seconds, p_chars)
    returning id into v_id;
  end if;

  select * into g from public.fl_credit_get(p_user);
  usage_id := v_id;
  charged := take_m + take_t;
  shortfall := v_short;
  total := g.total;
  monthly := g.monthly;
  topup := g.topup;
  expires_at := g.expires_at;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Adding credits
-- ---------------------------------------------------------------------------

-- Top-up credits (a purchased pack, or an admin grant). They never expire.
-- p_key makes it safe to repeat: the same key never grants twice (duplicate = true on the repeat).
create or replace function public.fl_credit_grant(
  p_user   uuid,
  p_amount integer,
  p_kind   text default 'admin_grant',
  p_note   text default null,
  p_by     text default null,
  p_key    text default null
)
returns table (duplicate boolean, total integer, monthly integer, topup integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.fl_credit_balances;
  g record;
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then
    raise exception 'amount must be between 1 and 1000000';
  end if;
  if p_kind not in ('topup', 'admin_grant') then
    raise exception 'unknown grant kind: %', p_kind;
  end if;

  duplicate := false;
  if p_key is not null and exists (select 1 from public.fl_credit_ledger l where l.idempotency_key = p_key) then
    duplicate := true;
  else
    b := public.fl_credit_touch(p_user);
    begin
      insert into public.fl_credit_ledger (user_id, kind, delta_monthly, delta_topup, monthly_after, topup_after, note, granted_by, idempotency_key)
      values (p_user, p_kind, 0, p_amount, b.monthly_credits, b.topup_credits + p_amount, p_note, p_by, p_key);
      update public.fl_credit_balances x
         set topup_credits = x.topup_credits + p_amount, updated_at = now()
       where x.user_id = p_user;
    exception when unique_violation then
      duplicate := true; -- a parallel request with the same key got there first; its changes stand, ours are undone
    end;
  end if;

  select * into g from public.fl_credit_get(p_user);
  total := g.total; monthly := g.monthly; topup := g.topup; expires_at := g.expires_at;
  return next;
end;
$$;

-- The monthly allowance of a subscription. It REPLACES the previous monthly amount (it does not add to it) and
-- expires at p_period_end. The billing webhook calls this on each paid period; use p_amount = 0 to end it.
create or replace function public.fl_credit_set_monthly(
  p_user       uuid,
  p_amount     integer,
  p_period_end timestamptz,
  p_note       text default null,
  p_key        text default null
)
returns table (duplicate boolean, total integer, monthly integer, topup integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.fl_credit_balances;
  g record;
begin
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then
    raise exception 'amount must be between 0 and 1000000';
  end if;
  if p_amount > 0 and p_period_end is null then
    raise exception 'a monthly allowance needs an end date';
  end if;

  duplicate := false;
  if p_key is not null and exists (select 1 from public.fl_credit_ledger l where l.idempotency_key = p_key) then
    duplicate := true;
  else
    b := public.fl_credit_touch(p_user);
    begin
      insert into public.fl_credit_ledger (user_id, kind, delta_monthly, delta_topup, monthly_after, topup_after, note, idempotency_key)
      values (p_user, 'monthly_grant', p_amount - b.monthly_credits, 0, p_amount, b.topup_credits, p_note, p_key);
      update public.fl_credit_balances x
         set monthly_credits = p_amount,
             monthly_expires_at = case when p_amount > 0 then p_period_end else null end,
             updated_at = now()
       where x.user_id = p_user;
    exception when unique_violation then
      duplicate := true;
    end;
  end if;

  select * into g from public.fl_credit_get(p_user);
  total := g.total; monthly := g.monthly; topup := g.topup; expires_at := g.expires_at;
  return next;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------

-- The signed-in person's own balance. The site and the app call this with their normal login:
--   supabase.rpc('fl_my_credits')
create or replace function public.fl_my_credits()
returns table (total integer, monthly integer, topup integer, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select * from public.fl_credit_get(auth.uid());
$$;

-- Admin dashboard: usage per endpoint and the heaviest users over the last p_days days.
create or replace function public.fl_admin_credit_usage(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with win as (
    select * from public.fl_ai_usage
     where created_at >= now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365)))
  ),
  routes as (
    select w.route || coalesce(':' || w.mode, '')           as route,
           count(*)::integer                                 as calls,
           coalesce(sum(w.credits), 0)::integer              as credits,
           count(distinct w.user_id)::integer                as users,
           coalesce(sum(w.input_tokens), 0)::integer         as input_tokens,
           coalesce(sum(w.output_tokens), 0)::integer        as output_tokens,
           coalesce(sum(w.audio_seconds), 0)::integer        as audio_seconds,
           coalesce(sum(w.chars), 0)::integer                as chars
      from win w
     group by 1
  ),
  people as (
    select w.user_id,
           u.email::text                                     as email,
           coalesce(sum(w.credits), 0)::integer              as credits,
           count(*)::integer                                 as calls
      from win w
      left join auth.users u on u.id = w.user_id
     group by w.user_id, u.email
     order by 3 desc
     limit 10
  )
  select jsonb_build_object(
    'by_route',  coalesce((select jsonb_agg(to_jsonb(r) order by r.credits desc) from routes r), '[]'::jsonb),
    'top_users', coalesce((select jsonb_agg(to_jsonb(p) order by p.credits desc) from people p), '[]'::jsonb)
  );
$$;

-- Usage rows older than p_keep_days days are not needed once prices are tuned. Call now and then.
create or replace function public.fl_ai_usage_cleanup(p_keep_days integer default 180)
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.fl_ai_usage where created_at < now() - make_interval(days => greatest(30, p_keep_days)) returning 1
  )
  select count(*)::integer from gone;
$$;

-- ---------------------------------------------------------------------------
-- Permissions: only the API (service role) may call these, except the person reading their own balance.
-- ---------------------------------------------------------------------------
revoke all on function public.fl_credit_effective_monthly(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.fl_credit_get(uuid) from public, anon, authenticated;
revoke all on function public.fl_credit_touch(uuid) from public, anon, authenticated;
revoke all on function public.fl_credit_charge(uuid, integer, text, text, integer, integer, integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.fl_credit_grant(uuid, integer, text, text, text, text) from public, anon, authenticated;
revoke all on function public.fl_credit_set_monthly(uuid, integer, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.fl_admin_credit_usage(integer) from public, anon, authenticated;
revoke all on function public.fl_ai_usage_cleanup(integer) from public, anon, authenticated;
revoke all on function public.fl_my_credits() from public, anon;

grant execute on function public.fl_credit_effective_monthly(integer, timestamptz) to service_role;
grant execute on function public.fl_credit_get(uuid) to service_role;
grant execute on function public.fl_credit_touch(uuid) to service_role;
grant execute on function public.fl_credit_charge(uuid, integer, text, text, integer, integer, integer, integer, boolean) to service_role;
grant execute on function public.fl_credit_grant(uuid, integer, text, text, text, text) to service_role;
grant execute on function public.fl_credit_set_monthly(uuid, integer, timestamptz, text, text) to service_role;
grant execute on function public.fl_admin_credit_usage(integer) to service_role;
grant execute on function public.fl_ai_usage_cleanup(integer) to service_role;
grant execute on function public.fl_my_credits() to authenticated, service_role;
