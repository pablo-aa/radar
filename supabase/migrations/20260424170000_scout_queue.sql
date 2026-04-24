-- scout_queue: frontier of URLs discovered by Scout runs, pending processing.
create table if not exists public.scout_queue (
  url              text primary key,
  hint             text not null,
  opportunity_type text,
  discovered_from  uuid references public.scout_runs(id) on delete set null,
  discovered_at    timestamptz not null default now(),
  visit_count      int not null default 0,
  last_visited_at  timestamptz,
  citation_count   int not null default 1,
  priority_score   real not null default 1.0,
  status           text not null default 'pending'
    check (status in ('pending', 'visited', 'skipped', 'failed'))
);

create index if not exists scout_queue_priority_idx
  on public.scout_queue (status, priority_score desc, discovered_at asc)
  where status = 'pending';

create index if not exists scout_queue_status_idx
  on public.scout_queue (status);

alter table public.scout_queue enable row level security;
-- Service-role only. No client policies.
