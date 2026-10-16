-- Billing: run once in the Supabase SQL editor, AFTER supabase_migration_credits.sql and supabase_migration_partner_hub.sql.
-- Safe to run more than once.
--
-- What this adds
--   profiles.creem_customer_id / creem_subscription_id / plan_product_id
--        so later Creem events (renewals, refunds) can find the right person even when the event does not
--        carry our user id. (creem_customer_id may already exist from the old Stripe -> Creem rename; IF NOT EXISTS.)
--   billing_events      every Creem event, stored with its outcome. This is the dedupe log (Creem retries) and the place to
--                       look when a payment did not do what you expected.
--   fl_credit_revoke    takes top-up credits back (a refunded top-up, or a mistaken grant). Floors at zero.
--   fl_billing_cleanup  deletes old billing_events rows.
-- Contains customer emails inside the raw payload: RLS is on with no policies, only the API (service role) can read it.

alter table public.profiles
  add column if not exists creem_customer_id     text,
  add column if not exists creem_subscription_id text,
  add column if not exists plan_product_id       text;
create index if not exists profiles_creem_subscription_idx on public.profiles (creem_subscription_id) where creem_subscription_id is not null;
create index if not exists profiles_creem_customer_idx on public.profiles (creem_customer_id) where creem_customer_id is not null;

create table if not exists public.billing_events (
  event_id     text primary key,                 -- Creem's event id (evt_...)
  event_type   text not null,
  user_id      uuid references auth.users (id) on delete set null,
  object_id    text,                              -- subscription / order / refund id
  outcome      text not null default 'received'
               check (outcome in ('received', 'processed', 'ignored', 'needs_review', 'error')),
  note         text,
  raw          jsonb,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.billing_events enable row level security;
create index if not exists billing_events_received_idx on public.billing_events (received_at desc);
create index if not exists billing_events_outcome_idx on public.billing_events (outcome) where outcome in ('needs_review', 'error');

-- The credit ledger gets one more kind of movement: a revoke.
alter table public.fl_credit_ledger drop constraint if exists fl_credit_ledger_kind_check;
alter table public.fl_credit_ledger
  add constraint fl_credit_ledger_kind_check
  check (kind in ('monthly_grant', 'monthly_expired', 'topup', 'admin_grant', 'revoke'));

-- Takes up to p_amount TOP-UP credits away (never monthly credits, never below zero).
-- p_key makes it safe to repeat. revoked = how many were actually taken (less than asked if the person had spent them).
create or replace function public.fl_credit_revoke(
  p_user   uuid,
  p_amount integer,
  p_note   text default null,
  p_by     text default null,
  p_key    text default null
)
returns table (duplicate boolean, revoked integer, total integer, monthly integer, topup integer, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.fl_credit_balances;
  g record;
  v_take integer := 0;
begin
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then
    raise exception 'amount must be between 1 and 1000000';
  end if;

  duplicate := false;
  if p_key is not null and exists (select 1 from public.fl_credit_ledger l where l.idempotency_key = p_key) then
    duplicate := true;
  else
    b := public.fl_credit_touch(p_user);
    v_take := least(b.topup_credits, p_amount);
    begin
      insert into public.fl_credit_ledger (user_id, kind, delta_monthly, delta_topup, monthly_after, topup_after, note, granted_by, idempotency_key)
      values (p_user, 'revoke', 0, -v_take, b.monthly_credits, b.topup_credits - v_take, p_note, p_by, p_key);
      update public.fl_credit_balances x
         set topup_credits = x.topup_credits - v_take, updated_at = now()
       where x.user_id = p_user;
    exception when unique_violation then
      duplicate := true;
      v_take := 0;
    end;
  end if;

  select * into g from public.fl_credit_get(p_user);
  revoked := v_take;
  total := g.total; monthly := g.monthly; topup := g.topup; expires_at := g.expires_at;
  return next;
end;
$$;

create or replace function public.fl_billing_cleanup(p_keep_days integer default 365)
returns integer
language sql
security definer
set search_path = public
as $$
  with gone as (
    delete from public.billing_events where received_at < now() - make_interval(days => greatest(30, p_keep_days)) and outcome in ('processed', 'ignored') returning 1
  )
  select count(*)::integer from gone;
$$;

revoke all on function public.fl_credit_revoke(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.fl_billing_cleanup(integer) from public, anon, authenticated;
grant execute on function public.fl_credit_revoke(uuid, integer, text, text, text) to service_role;
grant execute on function public.fl_billing_cleanup(integer) to service_role;
