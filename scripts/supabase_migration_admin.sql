-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New
-- Query -> paste this -> Run).
--
-- Adds:
--   1. An admin role flag on profiles.
--   2. Lightweight analytics columns (last active time, country, device) -
--      nothing like this existed before, so these will be empty for
--      existing users until they next log in and the app reports in via
--      api/track-activity.js.
--   3. Makes declanwells21@gmail.com an admin. If that account already
--      completed onboarding (has a profiles row), this updates it in
--      place. If it hasn't, this creates a minimal profiles row for it -
--      every other column has a default, so this is safe either way.
--
-- Safe to run more than once - every change uses IF NOT EXISTS / ON CONFLICT.

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists last_active_at timestamptz,
  add column if not exists last_country text,
  add column if not exists last_device text,
  add column if not exists signup_country text,
  add column if not exists signup_device text;

-- Also added here, not just in supabase_migration_subscription.sql - so
-- this migration works standalone even if that one was never run (as of
-- writing this, payments haven't been implemented yet, so these columns
-- likely don't exist in your database yet). Harmless to run again later if
-- you do end up running that file too - IF NOT EXISTS makes both safe.
-- subscription_status defaults to 'free' and stays that way until whatever
-- payment provider you end up using actually writes to it.
alter table public.profiles
  add column if not exists subscription_status text not null default 'free',
  add column if not exists subscription_period_end timestamptz,
  add column if not exists stripe_customer_id text;

comment on column public.profiles.role is
  'One of: user, admin. Admins can access the /admin dashboard - see '
  'api/admin/*.js, which check this column (via the service-role key,'
  'bypassing RLS) before allowing any admin action.';

comment on column public.profiles.last_country is
  'Best-guess country from Vercel''s x-vercel-ip-country header at the '
  'user''s most recent app activity - not GPS, just IP geolocation, and '
  'only as accurate as that. Set by api/track-activity.js.';

comment on column public.profiles.last_device is
  'One of: ios, android, web, unknown - self-reported by the app in '
  'api/track-activity.js, not independently verified.';

-- Make declanwells21@gmail.com an admin, creating a profiles row for them
-- if they don't have one yet.
insert into public.profiles (id, role)
select id, 'admin'
from auth.users
where email = 'declanwells21@gmail.com'
on conflict (id) do update set role = 'admin';

-- ------------------------------------------------------------------
-- Aggregate stats for the admin dashboard, computed in one query rather
-- than pulling every row back to count client-side. Only ever called from
-- api/admin/stats.js using the service-role key - never exposed to
-- ordinary users.
-- ------------------------------------------------------------------
create or replace function public.admin_get_stats()
returns json
language sql
stable
as $$
  select json_build_object(
    'total_users', (select count(*) from auth.users),
    'total_admins', (select count(*) from public.profiles where role = 'admin'),
    'active_users_7d', (
      select count(*) from public.profiles
      where last_active_at > now() - interval '7 days'
    ),
    'active_users_30d', (
      select count(*) from public.profiles
      where last_active_at > now() - interval '30 days'
    ),
    'subscribed_users', (
      select count(*) from public.profiles
      where subscription_status in ('trialing', 'active')
    ),
    'by_country', (
      select coalesce(json_agg(t), '[]'::json) from (
        select coalesce(last_country, 'Unknown') as label, count(*) as count
        from public.profiles
        group by 1
        order by count(*) desc
        limit 20
      ) t
    ),
    'by_device', (
      select coalesce(json_agg(t), '[]'::json) from (
        select coalesce(last_device, 'Unknown') as label, count(*) as count
        from public.profiles
        group by 1
        order by count(*) desc
      ) t
    ),
    'by_subscription_status', (
      select coalesce(json_agg(t), '[]'::json) from (
        select subscription_status as label, count(*) as count
        from public.profiles
        group by 1
        order by count(*) desc
      ) t
    ),
    'signups_last_30_days', (
      select coalesce(json_agg(t), '[]'::json) from (
        select to_char(date_trunc('day', u.created_at), 'YYYY-MM-DD') as day, count(*) as count
        from auth.users u
        where u.created_at > now() - interval '30 days'
        group by 1
        order by 1
      ) t
    )
  );
$$;

-- ------------------------------------------------------------------
-- Paginated, searchable user list joining auth.users (for email/created_at)
-- with profiles (for everything else) - a user with no profile row yet
-- still shows up, just with default/null values. Only ever called from
-- api/admin/users.js using the service-role key.
-- ------------------------------------------------------------------
create or replace function public.admin_list_users(
  p_search text default null,
  p_filter text default 'all',
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  role text,
  subscription_status text,
  subscription_period_end timestamptz,
  last_active_at timestamptz,
  last_country text,
  last_device text,
  target_language text,
  total_count bigint
)
language sql
stable
as $$
  select
    u.id,
    u.email,
    u.created_at,
    coalesce(p.role, 'user') as role,
    coalesce(p.subscription_status, 'free') as subscription_status,
    p.subscription_period_end,
    p.last_active_at,
    p.last_country,
    p.last_device,
    p.target_language,
    count(*) over () as total_count
  from auth.users u
  left join public.profiles p on p.id = u.id
  where
    (p_search is null or p_search = '' or u.email ilike '%' || p_search || '%')
    and (
      p_filter = 'all'
      or (p_filter = 'admins' and p.role = 'admin')
      or (p_filter = 'subscribed' and p.subscription_status in ('trialing', 'active'))
      or (p_filter = 'free' and (p.subscription_status is null or p.subscription_status = 'free'))
    )
  order by u.created_at desc
  limit p_limit offset p_offset;
$$;
