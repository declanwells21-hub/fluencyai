-- Run this once in the Supabase SQL editor to add subscription tracking to
-- the `profiles` table, needed by the Stripe paywall (see
-- api/create-checkout-session.js and api/stripe-webhook.js, and
-- lib/features/paywall/data/subscription_provider.dart on the app side).
--
-- Safe to run even if some of these columns already exist (IF NOT EXISTS).

alter table public.profiles
  add column if not exists subscription_status text not null default 'free',
  add column if not exists subscription_period_end timestamptz,
  add column if not exists stripe_customer_id text;

comment on column public.profiles.subscription_status is
  'One of: free, trialing, active, past_due, canceled, unpaid, incomplete, '
  'incomplete_expired, paused. Kept in sync by api/stripe-webhook.js - the '
  'app treats anything other than trialing/active as free-tier.';

-- The webhook writes to this table using the Supabase service-role key,
-- which bypasses Row Level Security entirely - no RLS policy changes are
-- needed for the webhook to work. The existing policy that lets a signed-in
-- user read their own profile row already covers the app reading this new
-- column back out.
