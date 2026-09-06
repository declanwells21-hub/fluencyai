-- Run this once in your Supabase project's SQL Editor (Supabase dashboard ->
-- SQL Editor -> New Query -> paste this -> Run).
--
-- Creates "plan_items": the personalized phrases/scenarios/grammar topics
-- Claude generates right after onboarding (see api/chat.js mode "plan"),
-- one row per item, each with its own completed/completed_at so real
-- progress ("14 of 20 done") can be measured against what was actually
-- generated for this specific user - not a generic global total.

create table if not exists plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('phrase', 'scenario', 'grammar')),
  title text not null,          -- phrase text / scenario title / grammar topic title
  payload jsonb not null,       -- the rest of the item (translation, lines, explanation+examples...)
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
