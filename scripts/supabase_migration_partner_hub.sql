-- Partner Hub: partner accounts, commissions, payouts, and the functions the Partner Hub page reads.
-- Run once in the Supabase SQL editor, AFTER scripts/supabase_migration_backend_foundation.sql. Safe to run again.
--
-- Rules built in (confirmed with the client)
--   * 20% commission (each partner's own rate is kept on their creators row) on a referred person's FIRST app
--     subscription payment, and on exam blueprint sales. Renewals do not earn commission.
--   * Every commission is held for 14 days (refund window). After that it is "payable".
--   * Payouts are monthly, and only once a partner's payable total reaches $20.
--   * A partner can never earn on their own account.
--
-- How a partner gets in: their site account (verified email) must match the email they applied with. The first time
-- they open the Partner Hub the account is linked to their partner record (creators.user_id).
--
-- Everything is reached through functions. Tables have Row Level Security on and no policies.

-- ---------------------------------------------------------------------------
-- Columns the code already relies on (billing webhook) plus partner account link
-- ---------------------------------------------------------------------------
alter table public.referral_events
  add column if not exists user_id        uuid,
  add column if not exists amount_cents   integer,
  add column if not exists creem_event_id text;
create unique index if not exists referral_events_creem_event_uidx
  on public.referral_events (creem_event_id) where creem_event_id is not null;

alter table public.creators
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists welcome_email_sent_at timestamptz;
create unique index if not exists creators_user_id_uidx on public.creators (user_id) where user_id is not null;

-- ---------------------------------------------------------------------------
-- Payouts and commissions
-- ---------------------------------------------------------------------------
create table if not exists public.partner_payouts (
  id           uuid primary key default gen_random_uuid(),
  creator_id   uuid not null references public.creators (id) on delete cascade,
  amount_cents integer not null check (amount_cents > 0),
  reference    text,
  note         text,
  paid_by      text,
  paid_at      timestamptz not null default now()
);
alter table public.partner_payouts enable row level security;
create index if not exists partner_payouts_creator_idx on public.partner_payouts (creator_id, paid_at desc);

create table if not exists public.partner_commissions (
  id               uuid primary key default gen_random_uuid(),
  creator_id       uuid not null references public.creators (id) on delete cascade,
  kind             text not null check (kind in ('app_subscription', 'exam_blueprint')),
  user_id          uuid references auth.users (id) on delete set null,   -- the buyer, when known
  source_ref       text not null,                                         -- billing event id / Selar order id
  product          text,                                                  -- plan or guide name, for display
  gross_cents      integer not null check (gross_cents >= 0),
  currency         text not null default 'usd',
  rate             numeric not null,
  commission_cents integer not null check (commission_cents >= 0),
  status           text not null default 'pending' check (status in ('pending', 'paid', 'reversed')),
  eligible_at      timestamptz not null,                                  -- end of the 14-day refund hold
  payout_id        uuid references public.partner_payouts (id),
  created_at       timestamptz not null default now(),
  unique (kind, source_ref)
);
alter table public.partner_commissions enable row level security;
create index if not exists partner_commissions_creator_idx on public.partner_commissions (creator_id, created_at desc);
-- "First subscription only": one app-subscription commission per buyer, ever.
create unique index if not exists partner_commissions_first_sub_uidx
  on public.partner_commissions (user_id) where kind = 'app_subscription' and user_id is not null;

-- ---------------------------------------------------------------------------
-- Record a commission (called by the billing and Selar webhooks). Safe to call twice for the same sale.
-- ---------------------------------------------------------------------------
create or replace function public.fl_record_partner_commission(
  p_code text,
  p_kind text,
  p_user uuid,
  p_gross_cents integer,
  p_currency text,
  p_source_ref text,
  p_product text default null
)
returns table (created boolean, reason text, commission_cents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.creators%rowtype;
  v_email text;
  v_cents integer;
  v_id uuid;
begin
  if p_kind not in ('app_subscription', 'exam_blueprint') then raise exception 'unknown kind'; end if;
  if coalesce(p_source_ref, '') = '' then raise exception 'source_ref is required'; end if;

  select * into c from public.creators where upper(code) = upper(trim(p_code)) and status = 'active';
  if not found then created := false; reason := 'unknown_or_inactive_code'; commission_cents := 0; return next; return; end if;

  if p_user is not null then
    select lower(email) into v_email from auth.users where id = p_user;
    if c.user_id = p_user or (v_email is not null and v_email = lower(c.contact_email)) then
      created := false; reason := 'self_referral'; commission_cents := 0; return next; return;
    end if;
  end if;

  v_cents := round(greatest(coalesce(p_gross_cents, 0), 0) * coalesce(c.commission_rate, 0.2));

  insert into public.partner_commissions
    (creator_id, kind, user_id, source_ref, product, gross_cents, currency, rate, commission_cents, eligible_at)
  values
    (c.id, p_kind, p_user, p_source_ref, p_product, greatest(coalesce(p_gross_cents, 0), 0), lower(coalesce(p_currency, 'usd')),
     coalesce(c.commission_rate, 0.2), v_cents, now() + interval '14 days')
  on conflict do nothing
  returning id into v_id;

  if v_id is null then created := false; reason := 'already_recorded'; commission_cents := 0; return next; return; end if;
  created := true; reason := 'ok'; commission_cents := v_cents; return next;
end;
$$;

-- A refund before payout cancels the commission. If it was already paid out, it is left for a person to settle.
create or replace function public.fl_partner_reverse_commission(p_kind text, p_source_ref text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare s text;
begin
  select status into s from public.partner_commissions where kind = p_kind and source_ref = p_source_ref;
  if s is null then return 'not_found'; end if;
  if s = 'paid' then return 'already_paid'; end if;
  update public.partner_commissions set status = 'reversed' where kind = p_kind and source_ref = p_source_ref;
  return 'reversed';
end;
$$;

-- ---------------------------------------------------------------------------
-- Remember which partner brought a new account (called by the signed-in person right after signing up)
-- ---------------------------------------------------------------------------
create or replace function public.fl_claim_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_created timestamptz;
  c public.creators%rowtype;
  n integer;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{3,32}$' then return jsonb_build_object('claimed', false, 'reason', 'bad_code'); end if;

  select lower(email), created_at into v_email, v_created from auth.users where id = v_user;

  select * into c from public.creators where upper(code) = upper(p_code) and status = 'active';
  if not found then return jsonb_build_object('claimed', false, 'reason', 'unknown_code'); end if;
  if c.user_id = v_user or v_email = lower(c.contact_email) then return jsonb_build_object('claimed', false, 'reason', 'own_code'); end if;

  -- Only a brand-new account can be credited to a partner; it ties the credit to the sign-up, not to a later visit.
  if v_created < now() - interval '3 days' then return jsonb_build_object('claimed', false, 'reason', 'account_too_old'); end if;

  update public.profiles set referred_by_code = c.code where id = v_user and referred_by_code is null;
  get diagnostics n = row_count;
  return jsonb_build_object('claimed', n > 0, 'reason', case when n > 0 then 'ok' else 'already_set_or_no_profile' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- Everything the Partner Hub page shows for the signed-in person
-- ---------------------------------------------------------------------------
create or replace function public.fl_my_partner()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_confirmed boolean;
  c public.creators%rowtype;
  a public.creator_applications%rowtype;
  v_found boolean := false;
  v_clicks30 integer; v_clicks_all integer; v_signups30 integer; v_signups_all integer;
  v_held integer; v_payable integer; v_paid integer; v_reversed integer; v_customers integer;
  v_sales_count integer; v_sales jsonb; v_payouts jsonb; v_days jsonb;
begin
  if v_user is null then raise exception 'not signed in' using errcode = '28000'; end if;
  select lower(email), email_confirmed_at is not null into v_email, v_confirmed from auth.users where id = v_user;

  select * into c from public.creators where user_id = v_user limit 1;
  v_found := found;
  if not v_found and v_confirmed then
    select * into c from public.creators where lower(contact_email) = v_email order by created_at limit 1;
    v_found := found;
    if v_found and c.user_id is null then
      update public.creators set user_id = v_user where id = c.id and user_id is null;
      c.user_id := v_user;
    end if;
  end if;

  if not v_found then
    select * into a from public.creator_applications where lower(email) = v_email order by created_at desc limit 1;
    if not found then return jsonb_build_object('status', 'none', 'email', v_email, 'email_confirmed', v_confirmed); end if;
    return jsonb_build_object(
      'status', case a.status when 'rejected' then 'rejected' when 'pending' then 'pending' else 'pending' end,
      'email', v_email, 'email_confirmed', v_confirmed,
      'application', jsonb_build_object('applied_at', a.created_at, 'decided_at', a.decided_at, 'platform', a.platform, 'handle', a.handle)
    );
  end if;

  select count(*) filter (where created_at > now() - interval '30 days'), count(*)
    into v_clicks30, v_clicks_all from public.referral_events where creator_id = c.id and event_type = 'click';
  select count(*) filter (where u.created_at > now() - interval '30 days'), count(*)
    into v_signups30, v_signups_all
    from public.profiles p join auth.users u on u.id = p.id where p.referred_by_code = c.code;

  select coalesce(sum(commission_cents) filter (where status = 'pending' and eligible_at > now()), 0),
         coalesce(sum(commission_cents) filter (where status = 'pending' and eligible_at <= now()), 0),
         coalesce(sum(commission_cents) filter (where status = 'paid'), 0),
         coalesce(sum(commission_cents) filter (where status = 'reversed'), 0),
         count(distinct user_id) filter (where status <> 'reversed' and kind = 'app_subscription'),
         count(*) filter (where status <> 'reversed')
    into v_held, v_payable, v_paid, v_reversed, v_customers, v_sales_count
    from public.partner_commissions where creator_id = c.id;

  select coalesce(jsonb_agg(s order by s.at desc), '[]'::jsonb) into v_sales from (
    select upper(left(id::text, 8)) as id, created_at as at, kind, product, gross_cents, commission_cents, currency, eligible_at,
           case when status = 'pending' and eligible_at > now() then 'held'
                when status = 'pending' then 'payable' else status end as state
    from public.partner_commissions where creator_id = c.id order by created_at desc limit 50) s;

  select coalesce(jsonb_agg(p order by p.at desc), '[]'::jsonb) into v_payouts from (
    select upper(left(id::text, 8)) as id, paid_at as at, amount_cents, reference
    from public.partner_payouts where creator_id = c.id order by paid_at desc limit 12) p;

  select coalesce(jsonb_agg(d order by d.day), '[]'::jsonb) into v_days from (
    select g.day::date as day,
           (select count(*) from public.referral_events e where e.creator_id = c.id and e.event_type = 'click' and e.created_at::date = g.day::date) as clicks,
           (select count(*) from public.profiles p join auth.users u on u.id = p.id where p.referred_by_code = c.code and u.created_at::date = g.day::date) as signups
    from generate_series(current_date - 29, current_date, interval '1 day') as g(day)) d;

  return jsonb_build_object(
    'status', case when c.status = 'active' then 'approved' else 'paused' end,
    'email', v_email, 'email_confirmed', v_confirmed,
    'partner', jsonb_build_object('name', c.name, 'code', c.code, 'rate', c.commission_rate, 'since', c.created_at),
    'rules', jsonb_build_object('hold_days', 14, 'min_payout_cents', 2000),
    'totals', jsonb_build_object(
      'clicks_30d', v_clicks30, 'clicks_all', v_clicks_all, 'signups_30d', v_signups30, 'signups_all', v_signups_all,
      'customers', v_customers, 'sales', v_sales_count,
      'held_cents', v_held, 'payable_cents', v_payable, 'paid_cents', v_paid, 'reversed_cents', v_reversed),
    'sales', v_sales, 'payouts', v_payouts, 'by_day', v_days
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: what each partner is owed, and marking a monthly payout as paid
-- ---------------------------------------------------------------------------
create or replace function public.fl_admin_partner_balances()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by r.payable_cents desc, r.name), '[]'::jsonb) from (
    select c.id, c.name, c.code, c.contact_email, c.status, c.user_id is not null as account_linked, c.welcome_email_sent_at,
           coalesce(sum(m.commission_cents) filter (where m.status = 'pending' and m.eligible_at > now()), 0)  as held_cents,
           coalesce(sum(m.commission_cents) filter (where m.status = 'pending' and m.eligible_at <= now()), 0) as payable_cents,
           coalesce(sum(m.commission_cents) filter (where m.status = 'paid'), 0)                              as paid_cents,
           (select max(p.paid_at) from public.partner_payouts p where p.creator_id = c.id)                   as last_paid_at
    from public.creators c left join public.partner_commissions m on m.creator_id = c.id
    group by c.id) r;
$$;

create or replace function public.fl_partner_mark_paid(
  p_creator uuid, p_reference text default null, p_note text default null, p_by text default null, p_min_cents integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer; v_n integer; v_payout uuid;
begin
  perform pg_advisory_xact_lock(hashtext('partner-payout:' || p_creator::text));
  select coalesce(sum(commission_cents), 0), count(*) into v_total, v_n
  from public.partner_commissions where creator_id = p_creator and status = 'pending' and eligible_at <= now();
  if v_total <= 0 then raise exception 'nothing payable'; end if;
  if v_total < p_min_cents then raise exception 'below the minimum payout'; end if;

  insert into public.partner_payouts (creator_id, amount_cents, reference, note, paid_by)
  values (p_creator, v_total, p_reference, p_note, p_by) returning id into v_payout;
  update public.partner_commissions set status = 'paid', payout_id = v_payout
  where creator_id = p_creator and status = 'pending' and eligible_at <= now();
  return jsonb_build_object('payout_id', v_payout, 'amount_cents', v_total, 'commissions', v_n);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on function public.fl_record_partner_commission(text, text, uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.fl_partner_reverse_commission(text, text) from public, anon, authenticated;
revoke all on function public.fl_admin_partner_balances() from public, anon, authenticated;
revoke all on function public.fl_partner_mark_paid(uuid, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.fl_claim_referral(text) from public, anon;
revoke all on function public.fl_my_partner() from public, anon;
grant execute on function public.fl_record_partner_commission(text, text, uuid, integer, text, text, text) to service_role;
grant execute on function public.fl_partner_reverse_commission(text, text) to service_role;
grant execute on function public.fl_admin_partner_balances() to service_role;
grant execute on function public.fl_partner_mark_paid(uuid, text, text, text, integer) to service_role;
grant execute on function public.fl_claim_referral(text) to authenticated, service_role;
grant execute on function public.fl_my_partner() to authenticated, service_role;
