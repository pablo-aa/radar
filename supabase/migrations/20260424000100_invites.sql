-- invites: Pablo-curated allowlist of GitHub handles permitted to sign in.
-- The auth callback in src/app/auth/callback/route.ts checks this table
-- and signs the user out + redirects to /waitlist if no row exists or
-- used_at is already set.

create table public.invites (
  github_handle text primary key,
  invited_at   timestamptz not null default now(),
  invited_by   text,
  used_at      timestamptz,
  note         text
);

alter table public.invites enable row level security;

-- No SELECT/INSERT/UPDATE/DELETE policies for end users. Service-role
-- (used by the auth callback admin client and by Pablo's manual SQL)
-- bypasses RLS, so admin operations work without policies.
