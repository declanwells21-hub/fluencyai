-- Run this once in your Supabase project's SQL Editor (Supabase dashboard ->
-- SQL Editor -> New Query -> paste this -> Run) IF you already created the
-- "profiles" table using an earlier version of scripts/supabase_setup.sql
-- (the version without motivation/goals/frequency/topics/native_language).
--
-- Safe to run more than once - every ADD COLUMN uses IF NOT EXISTS.
-- If your table already has these columns (fresh install), this is a no-op.

alter table profiles add column if not exists motivation text;
alter table profiles add column if not exists goals text[] not null default '{}';
alter table profiles add column if not exists frequency text;
alter table profiles add column if not exists topics text[] not null default '{}';
alter table profiles add column if not exists native_language text;
