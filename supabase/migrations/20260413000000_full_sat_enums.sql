-- Split out from 20260413_full_sat.sql to fix fresh-setup `supabase db reset`.
--
-- Postgres ≥12 refuses to use enum values added in the same transaction.
-- The full_sat migration was adding 'full_sat' to problem_source / session_source
-- and then referencing the new value in a CHECK constraint within the same file —
-- which Supabase wraps in one transaction. This split makes the ADD VALUE commit
-- first, so the subsequent CHECK constraint can reference it cleanly.
--
-- Idempotent (IF NOT EXISTS) so it's a no-op on environments where the original
-- single-file migration already ran successfully (e.g. production).

ALTER TYPE problem_source ADD VALUE IF NOT EXISTS 'full_sat';
ALTER TYPE session_source ADD VALUE IF NOT EXISTS 'full_sat';
