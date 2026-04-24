-- scout_schema: richer opportunity taxonomy + profile geo fields.
-- Idempotent: all alterations use IF NOT EXISTS / DO $$ guards.

-- 1. opportunity_type enum (new type, safe to create once)
do $$ begin
  create type public.opportunity_type as enum (
    'grant',
    'fellowship',
    'scholarship',
    'accelerator',
    'arena',
    'competition',
    'event',
    'community',
    'internship'
  );
exception when duplicate_object then null;
end $$;

-- 2. New columns on opportunities
alter table public.opportunities
  add column if not exists opportunity_type public.opportunity_type,
  add column if not exists seniority text[],
  add column if not exists audience text[],
  add column if not exists location_req jsonb;

-- 3. New columns on profiles
alter table public.profiles
  add column if not exists city text,
  add column if not exists state text;

-- 4. output column on scout_runs (stores _meta from the run)
alter table public.scout_runs
  add column if not exists output jsonb;
