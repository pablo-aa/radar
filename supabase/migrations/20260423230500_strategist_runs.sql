-- strategist_runs: per-user weekly radar produced by the Strategist agent.
-- profile_snapshot freezes the profile at run time, opportunity_ids tracks
-- the slice of the shared catalog this run reasoned over, output holds
-- the 4-section plan plus the 90-day plan shape consumed by the dashboard.

create table public.strategist_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  profile_snapshot jsonb,
  opportunity_ids uuid[],
  output jsonb,
  agent_session_id text,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  cycle_label text,
  created_at timestamptz not null default now()
);

create index strategist_runs_user_id_created_at_idx on public.strategist_runs (user_id, created_at desc);

alter table public.strategist_runs enable row level security;

create policy "strategist_runs: read own"
  on public.strategist_runs
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "strategist_runs: insert own"
  on public.strategist_runs
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "strategist_runs: update own"
  on public.strategist_runs
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
