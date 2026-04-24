-- waitlist: collect more applicant info so Pablo can triage better.
alter table public.waitlist add column if not exists phone text;
alter table public.waitlist add column if not exists linkedin_url text;
alter table public.waitlist add column if not exists career_moment text;

-- existing rows have null for new fields. The column will be NOT NULL at
-- the app layer via zod-style validation in the route; we leave them
-- nullable in the DB to avoid breaking old rows. New submissions must
-- provide them.

-- Drop the old optional 'why' column to avoid confusion. If there are
-- existing rows with 'why' content, migrate them into career_moment first.
update public.waitlist set career_moment = why where career_moment is null and why is not null;
alter table public.waitlist drop column if exists why;
