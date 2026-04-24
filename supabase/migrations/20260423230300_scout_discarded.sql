-- scout_discarded: transparency ledger. Every URL Scout decides not to
-- promote into opportunities lands here with a structured reason. The
-- enum keeps reasons constrained so the UI can render them as badges.

create type scout_discard_reason as enum (
  'out-of-scope',
  'duplicate',
  'unchanged',
  'throttled',
  'error',
  'low-fit',
  'unverifiable'
);

create table public.scout_discarded (
  id uuid primary key default gen_random_uuid(),
  scout_run_id uuid not null references public.scout_runs(id) on delete cascade,
  host text not null,
  path text,
  reason scout_discard_reason not null,
  detail text,
  decided_at timestamptz not null default now()
);

create index scout_discarded_scout_run_id_idx on public.scout_discarded (scout_run_id);

alter table public.scout_discarded enable row level security;

create policy "scout_discarded: read all"
  on public.scout_discarded
  for select
  to authenticated
  using (true);
