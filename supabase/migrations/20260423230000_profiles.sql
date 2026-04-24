-- profiles: per-user record keyed on auth.users.id.
-- Stores GitHub data, contact info, the structured profile JSON produced
-- by the Anamnesis agent, and the onboarding state machine the app uses
-- to gate dashboard, intake, and report screens. anamnesis_run_id is a
-- plain uuid here; the FK to anamnesis_runs is added in a later migration
-- once that table exists.

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_handle text,
  github_avatar_url text,
  display_name text,
  email text,
  cv_url text,
  site_url text,
  structured_profile jsonb,
  onboard_state jsonb not null default '{"signed_in":false,"welcomed":false,"intake_done":false,"report_seen":false,"runs_used":0}'::jsonb,
  anamnesis_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.profiles.anamnesis_run_id is 'FK to anamnesis_runs(id) added in 20260423230400_anamnesis_runs.sql.';

alter table public.profiles enable row level security;

create policy "profiles: read own"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "profiles: insert own"
  on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "profiles: update own"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tg_profiles_touch_updated_at
  before update on public.profiles
  for each row
  execute function public.touch_updated_at();
