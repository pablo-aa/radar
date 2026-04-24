-- scout_runs: one row per Scout cycle (typically weekly). Tracks crawl
-- volume, found vs updated vs discarded counts, and lifecycle status.
-- After creation we wire the FK from opportunities.scout_run_id back to
-- this table with on delete set null so deleting a run does not orphan
-- the catalog.

create table public.scout_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  cycle_label text,
  sources_count int not null default 0,
  pages_fetched int not null default 0,
  found_count int not null default 0,
  updated_count int not null default 0,
  discarded_count int not null default 0,
  agent_session_id text,
  status text not null default 'pending' check (status in ('pending','running','done','error')),
  created_at timestamptz not null default now()
);

alter table public.scout_runs enable row level security;

create policy "scout_runs: read all"
  on public.scout_runs
  for select
  to authenticated
  using (true);

alter table public.opportunities
  add constraint opportunities_scout_run_id_fkey
  foreign key (scout_run_id) references public.scout_runs(id) on delete set null;
