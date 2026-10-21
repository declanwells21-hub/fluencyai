-- Compliance: run once in the Supabase SQL editor, AFTER the credits, partner hub, selar and billing migrations.
-- Safe to run more than once.
--
-- It makes the promises in the Privacy Policy and Terms true on the server side:
--   consent records       who agreed to which version of the Terms and Privacy Policy, and confirmed they are 16 or older
--   "download your data"  fl_export_user_data(): everything the servers hold about one person, as JSON
--   "delete your account" fl_delete_user_data(): removes or de-identifies it (the API then deletes the login itself)
--   retention             fl_retention_cleanup(): removes data that has outlived the periods the policy states
--   waitlist unsubscribe  waitlist_signups.unsubscribed_at, so launch emails can honour "unsubscribe at any time"
--   an audit trail        account_requests: that an export or deletion happened, WITHOUT keeping who it was
--
-- What lives on the person's DEVICE and is not here: conversations, transcripts, the word bank and the coach's memory.
-- The app exports and clears those itself (Settings, Privacy and memory).
--
-- Every table has Row Level Security on. A signed-in person may only read their own consent record; everything else is
-- reached by the API with the service-role key.

-- ---------------------------------------------------------------------------
-- Consent
-- ---------------------------------------------------------------------------
create table if not exists public.user_consents (
  id               bigint generated always as identity primary key,
  user_id          uuid not null references auth.users (id) on delete cascade,
  terms_version    text not null,               -- the "Last updated" date of the Terms, e.g. 2026-09-09
  privacy_version  text not null,               -- same for the Privacy Policy
  age_16_confirmed boolean not null check (age_16_confirmed),
  source           text not null default 'web', -- signup_form | consent_gate | app | admin
  accepted_at      timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version)
);
alter table public.user_consents enable row level security;
drop policy if exists "user_consents read own" on public.user_consents;
create policy "user_consents read own" on public.user_consents for select to authenticated using (user_id = auth.uid());

-- Records that the signed-in person is 16 or older and agrees to these versions. Safe to call twice.
create or replace function public.fl_record_consent(
  p_terms         text,
  p_privacy       text,
  p_age_confirmed boolean,
  p_source        text default 'web'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'You need to be signed in'; end if;
  if not coalesce(p_age_confirmed, false) then raise exception 'You must be 16 or older to use Fluency AI'; end if;
  if p_terms !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or p_privacy !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Unrecognised version'; end if;
  insert into public.user_consents (user_id, terms_version, privacy_version, age_16_confirmed, source)
  values (auth.uid(), p_terms, p_privacy, true, left(coalesce(nullif(trim(p_source), ''), 'web'), 30))
  on conflict (user_id, terms_version, privacy_version) do nothing;
end;
$$;

-- The signed-in person's latest consent (no row = they have not agreed yet).
create or replace function public.fl_my_consent()
returns table (terms_version text, privacy_version text, age_16_confirmed boolean, accepted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.terms_version, c.privacy_version, c.age_16_confirmed, c.accepted_at
    from public.user_consents c
   where c.user_id = auth.uid()
   order by c.accepted_at desc
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist: honour "unsubscribe at any time"
-- ---------------------------------------------------------------------------
alter table public.waitlist_signups add column if not exists unsubscribed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Audit trail: THAT a request happened, never who made it
-- ---------------------------------------------------------------------------
create table if not exists public.account_requests (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in ('export', 'delete')),
  user_id    uuid references auth.users (id) on delete set null,  -- cleared by the deletion itself
  actor      text not null default 'self',                         -- self | admin
  created_at timestamptz not null default now()
);
alter table public.account_requests enable row level security;
create index if not exists account_requests_user_idx on public.account_requests (user_id, kind, created_at desc);

-- ---------------------------------------------------------------------------
-- Export: everything the servers hold about one person
-- ---------------------------------------------------------------------------
create or replace function public.fl_export_user_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email     text;
  v_created   timestamptz;
  v_last      timestamptz;
  v_providers jsonb;
begin
  select lower(u.email::text), u.created_at, u.last_sign_in_at, coalesce(u.raw_app_meta_data -> 'providers', '[]'::jsonb)
    into v_email, v_created, v_last, v_providers
    from auth.users u where u.id = p_user;
  if not found then return null; end if;

  return jsonb_build_object(
    'exported_at', now(),
    'about', 'Your Fluency AI data held on our servers. Conversations, transcripts, your word bank and your coach''s memory are stored on your device: export them in the app under Settings, Privacy and memory.',
    'account', jsonb_build_object('id', p_user, 'email', v_email, 'created_at', v_created, 'last_sign_in_at', v_last, 'sign_in_methods', v_providers),
    'profile', (select to_jsonb(p) from public.profiles p where p.id = p_user),
    'plan_items', coalesce((select jsonb_agg(to_jsonb(i) - 'id' order by i.created_at) from public.plan_items i where i.user_id = p_user), '[]'::jsonb),
    'consents', coalesce((select jsonb_agg(to_jsonb(c) - 'id' order by c.accepted_at) from public.user_consents c where c.user_id = p_user), '[]'::jsonb),
    'credits', jsonb_build_object(
      'balance', (select to_jsonb(b) from public.fl_credit_balances b where b.user_id = p_user),
      'history', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'monthly_change', l.delta_monthly, 'topup_change', l.delta_topup, 'note', l.note, 'at', l.created_at) order by l.created_at)
                             from public.fl_credit_ledger l where l.user_id = p_user), '[]'::jsonb)),
    'ai_usage_last_5000', coalesce((select jsonb_agg(x order by x ->> 'at') from (
                             select jsonb_build_object('route', a.route, 'mode', a.mode, 'credits', a.credits, 'at', a.created_at) as x
                               from public.fl_ai_usage a where a.user_id = p_user order by a.created_at desc limit 5000) q), '[]'::jsonb),
    'billing_events', coalesce((select jsonb_agg(jsonb_build_object('type', e.event_type, 'outcome', e.outcome, 'at', e.received_at) order by e.received_at)
                                  from public.billing_events e where e.user_id = p_user), '[]'::jsonb),
    'exam_guide_orders', coalesce((select jsonb_agg(to_jsonb(o) - 'id' - 'raw' order by o.received_at)
                                     from public.selar_orders o where lower(o.buyer_email) = v_email), '[]'::jsonb),
    'waitlist', coalesce((select jsonb_agg(to_jsonb(w) - 'id' order by w.created_at) from public.waitlist_signups w where lower(w.email) = v_email), '[]'::jsonb),
    'partner_interest', coalesce((select jsonb_agg(to_jsonb(i) - 'id' order by i.created_at) from public.partner_interest i where lower(i.email) = v_email), '[]'::jsonb),
    'partner_applications', coalesce((select jsonb_agg(to_jsonb(a) - 'id' order by a.created_at) from public.creator_applications a where lower(a.email) = v_email), '[]'::jsonb),
    'partner', (select jsonb_build_object(
                  'record', to_jsonb(c) - 'id',
                  'commissions', coalesce((select jsonb_agg(jsonb_build_object('kind', pc.kind, 'product', pc.product, 'gross_cents', pc.gross_cents, 'commission_cents', pc.commission_cents, 'status', pc.status, 'at', pc.created_at) order by pc.created_at)
                                             from public.partner_commissions pc where pc.creator_id = c.id), '[]'::jsonb),
                  'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount_cents', po.amount_cents, 'reference', po.reference, 'paid_at', po.paid_at) order by po.paid_at)
                                         from public.partner_payouts po where po.creator_id = c.id), '[]'::jsonb))
                from public.creators c where c.user_id = p_user)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Delete: removes or de-identifies what the servers hold. The API then deletes the login itself, which also removes
-- the profile, plan items, credits, ledger and consent records (they are tied to the login and cascade).
--   removed:       waitlist signups, partner interest and partner applications under the person's email
--   de-identified: the partner record keeps its code, commissions and payouts (needed for accounting) but loses the
--                  name, email and notes, and is closed so it can earn nothing more; referral events lose the person's id
--   kept:          exam guide orders and payment events (tax and accounting law, typically 7 years); they are not linked
--                  to a login once it is gone
-- ---------------------------------------------------------------------------
create or replace function public.fl_delete_user_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  n_wait integer := 0; n_pi integer := 0; n_app integer := 0; n_ref integer := 0; n_partner integer := 0;
begin
  select lower(u.email::text) into v_email from auth.users u where u.id = p_user;

  if v_email is not null then
    delete from public.waitlist_signups where lower(email) = v_email;        get diagnostics n_wait = row_count;
    delete from public.partner_interest where lower(email) = v_email;        get diagnostics n_pi = row_count;
    delete from public.creator_applications where lower(email) = v_email;    get diagnostics n_app = row_count;
  end if;

  update public.referral_events set user_id = null where user_id = p_user;   get diagnostics n_ref = row_count;

  update public.creators
     set name = 'Deleted partner', contact_email = null, niche = null, notes = null, status = 'closed', user_id = null
   where user_id = p_user;
  get diagnostics n_partner = row_count;

  return jsonb_build_object('waitlist_removed', n_wait, 'partner_interest_removed', n_pi, 'applications_removed', n_app,
                            'referral_events_unlinked', n_ref, 'partner_records_deidentified', n_partner);
end;
$$;

-- ---------------------------------------------------------------------------
-- Retention: remove data that has outlived the periods the policy states.
-- Schedule it (see docs/compliance.md): select cron.schedule('fluency-retention', '17 3 * * *', $$select public.fl_retention_cleanup('2026-12-01')$$);
--   AI usage rows            180 days (only used to tune prices)
--   billing events           handled and older than 365 days
--   waitlist emails          once p_launch_date + 12 months has passed (pass the real launch date; null = leave the waitlist alone)
-- ---------------------------------------------------------------------------
create or replace function public.fl_retention_cleanup(p_launch_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  n_usage integer := 0; n_bill integer := 0; n_wait integer := 0;
begin
  delete from public.fl_ai_usage where created_at < now() - interval '180 days';
  get diagnostics n_usage = row_count;

  delete from public.billing_events where received_at < now() - interval '365 days' and outcome in ('processed', 'ignored');
  get diagnostics n_bill = row_count;

  if p_launch_date is not null and current_date > (p_launch_date + interval '12 months')::date then
    delete from public.waitlist_signups;
    get diagnostics n_wait = row_count;
  end if;

  return jsonb_build_object('ai_usage_removed', n_usage, 'billing_events_removed', n_bill, 'waitlist_removed', n_wait);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
revoke all on function public.fl_record_consent(text, text, boolean, text) from public, anon;
revoke all on function public.fl_my_consent() from public, anon;
revoke all on function public.fl_export_user_data(uuid) from public, anon, authenticated;
revoke all on function public.fl_delete_user_data(uuid) from public, anon, authenticated;
revoke all on function public.fl_retention_cleanup(date) from public, anon, authenticated;

grant execute on function public.fl_record_consent(text, text, boolean, text) to authenticated, service_role;
grant execute on function public.fl_my_consent() to authenticated, service_role;
grant execute on function public.fl_export_user_data(uuid) to service_role;
grant execute on function public.fl_delete_user_data(uuid) to service_role;
grant execute on function public.fl_retention_cleanup(date) to service_role;
