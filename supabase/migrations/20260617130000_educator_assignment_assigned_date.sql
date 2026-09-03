-- Homework "assigned date": the day a teacher hands work out, distinct from
-- when it's due. Backfilled from created_at for existing rows so the calendar
-- can place each assignment on both its assigned and due dates.

ALTER TABLE public.educator_assignments
  ADD COLUMN IF NOT EXISTS assigned_date date;

UPDATE public.educator_assignments
  SET assigned_date = created_at::date
  WHERE assigned_date IS NULL;

ALTER TABLE public.educator_assignments
  ALTER COLUMN assigned_date SET DEFAULT (now() AT TIME ZONE 'utc')::date,
  ALTER COLUMN assigned_date SET NOT NULL;
