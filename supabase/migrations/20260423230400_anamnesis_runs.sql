-- anamnesis_runs: per-user history of profile-building agent runs.
-- output holds the structured profile JSON for the run. We also wire
-- the deferred FK from profiles.anamnesis_run_id back to this table.

create table public.anamnesis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  agent_session_id text,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  output jsonb,
  created_at timestamptz not null default now()
);

create index anamnesis_runs_user_id_created_at_idx on public.anamnesis_runs (user_id, created_at desc);

alter table public.anamnesis_runs enable row level security;

create policy "anamnesis_runs: read own"
  on public.anamnesis_runs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "anamnesis_runs: insert own"
  on public.anamnesis_runs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "anamnesis_runs: update own"
  on public.anamnesis_runs
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.profiles
  add constraint profiles_anamnesis_run_id_fkey
  foreign key (anamnesis_run_id) references public.anamnesis_runs(id) on delete set null;
