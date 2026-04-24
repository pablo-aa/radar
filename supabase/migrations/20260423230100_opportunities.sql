-- opportunities: shared catalog populated by Scout. Readable by all
-- authenticated users. Writes happen server-side via the service role,
-- so no insert/update RLS policies are exposed to end users.
-- scout_run_id is added as a plain uuid here; the FK is wired up in
-- 20260423230200_scout_runs.sql once scout_runs exists.

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  source_url text not null,
  title text not null,
  org text,
  loc text,
  category text not null check (category in ('dated_one_shot','recurrent_annual','rolling','arena')),
  deadline text,
  funding_brl text,
  commitment text,
  badge text,
  status text,
  fit smallint,
  id_display text,
  found_at timestamptz,
  deep_data jsonb,
  scout_run_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.opportunities.scout_run_id is 'FK to scout_runs(id) added in 20260423230200_scout_runs.sql.';

create index opportunities_category_idx on public.opportunities (category);
create index opportunities_found_at_idx on public.opportunities (found_at desc);

alter table public.opportunities enable row level security;

create policy "opportunities: read all"
  on public.opportunities
  for select
  to authenticated
  using (true);

create trigger tg_opportunities_touch_updated_at
  before update on public.opportunities
  for each row
  execute function public.touch_updated_at();
