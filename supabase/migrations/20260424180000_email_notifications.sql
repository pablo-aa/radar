-- Add notified_at to anamnesis_runs and strategist_runs so we don't
-- send the same completion email twice (e.g., on admin re-runs that
-- replay the after() block).
alter table public.anamnesis_runs add column if not exists notified_at timestamptz;
alter table public.strategist_runs add column if not exists notified_at timestamptz;
