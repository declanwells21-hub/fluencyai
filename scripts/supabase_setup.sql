-- Run this once in your Supabase project's SQL Editor (Supabase dashboard ->
-- SQL Editor -> New Query -> paste this -> Run).
--
-- Creates the "profiles" table that stores each user's onboarding choices
-- (target language, level, daily goal, tutor, accent, gender, motivation,
-- goals, frequency, topics of interest, native language), and locks it down
-- with Row Level Security so a user can only ever read/write their own row -
-- not anyone else's, even though they're all in the same table.
--
-- Already have this table from before the motivation/goals/frequency/
-- topics/native_language columns existed? This script won't add them to an
-- existing table (the CREATE TABLE below is skipped if the table already
-- exists) - run scripts/supabase_migration_onboarding_profile.sql instead.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  target_language text not null default 'es',
  level text,
  daily_goal_minutes integer not null default 15,
  tutor_name text,
  accent text,
  gender text not null default 'female',
  motivation text,
  goals text[] not null default '{}',
  frequency text,
  topics text[] not null default '{}',
  native_language text,
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- A user can only see their own row.
create policy "Users can view own profile"
  on profiles for select
  using (auth.uid() = id);

-- A user can only create a row for themselves.
create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- A user can only update their own row.
create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

-- ------------------------------------------------------------------
-- plan_items: the personalized phrases/scenarios/grammar topics Claude
-- generates right after onboarding (see api/chat.js mode "plan"), and the
-- per-item progress tracking against them. Already have this table? See
-- scripts/supabase_migration_plan_items.sql instead (same table, safe to
-- run standalone with "if not exists" guards).
-- ------------------------------------------------------------------

create table if not exists plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('phrase', 'scenario', 'grammar')),
  title text not null,
  payload jsonb not null,
  sort_order integer not null default 0,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists plan_items_user_id_idx on plan_items (user_id);

alter table plan_items enable row level security;

create policy "Users can view own plan items"
  on plan_items for select
  using (auth.uid() = user_id);

create policy "Users can insert own plan items"
  on plan_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own plan items"
  on plan_items for update
  using (auth.uid() = user_id);

create policy "Users can delete own plan items"
  on plan_items for delete
  using (auth.uid() = user_id);
