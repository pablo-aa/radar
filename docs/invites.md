# Invite-gated access

Radar is invite-only during beta. The gate sits in the auth callback: a signed-in
GitHub account is matched against the `invites` table by `github_handle`. Anyone
not on the list is redirected to `/waitlist` and never reaches the app.

The invite list and waitlist live in two Supabase tables:

- `invites(github_handle text primary key, note text, created_at timestamptz)`
- `waitlist(id uuid, name, email, github_handle, why, requested_at, status)`

## How to invite someone

Run as the Supabase project owner via the SQL editor. The first statement
gates access at the next sign-in. The second is optional bookkeeping if the
person is already on the public waitlist.

```sql
insert into invites (github_handle, note) values ('someuser', 'dm radar-discord');
update waitlist set status = 'invited' where github_handle = 'someuser';
```

The user signs in at `/login` and lands on `/welcome` or `/intake` depending
on their onboard state.

## How to revoke an invite

```sql
delete from invites where github_handle = 'someuser';
-- The user's existing session continues until expiry, but next sign-in fails.
```

There is no "kick them out now" button by design. Sessions naturally expire
within a day; if a hard cut is needed, also delete the user from
`auth.users`.

## Reading the waitlist

```sql
select id, name, email, github_handle, why, requested_at, status
from waitlist
order by requested_at desc;
```

Statuses are `pending` (default), `invited` (manually set after the invite is
inserted above), and `archived` (graveyard for clearly off-platform signups).

## Beta limit

One report per account during beta. Enforced by `profiles.onboard_state.runs_used`,
which the intake form increments on submit and the UI reads to disable the
re-run button. Not enforced in API routes yet, the limit is editorial. Lift the
cap in code by changing the `runsMax` constant in the intake page when the beta
ends.

## Notes

- This doc lives in the public repo. No real personal data goes here.
- The waitlist form is unauthenticated and rate-limited only by Vercel's
  default per-IP throttle. If we get spammed, add a Turnstile.
