-- waitlist: public form submissions from the landing page. Pablo reads
-- this manually in the dashboard, picks people to invite, then inserts
-- into invites and updates this row's status.

create table public.waitlist (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  email         text not null,
  github_handle text not null unique,
  why           text,
  requested_at  timestamptz not null default now(),
  status        text not null default 'pending'
                check (status in ('pending','invited','rejected'))
);

alter table public.waitlist enable row level security;

-- Anonymous insert is OK (the landing form posts without auth).
create policy "waitlist: anon insert"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

-- No SELECT/UPDATE policies; only service_role (admin client + Pablo's
-- dashboard) can read or change rows.

create index waitlist_requested_at_idx on public.waitlist (requested_at desc);
