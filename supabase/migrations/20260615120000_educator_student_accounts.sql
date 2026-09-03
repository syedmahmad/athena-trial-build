-- Educator surface, phase 6: student accounts + the homework/learning paywall
-- boundary.
--  * educator_students.user_id / educator_submissions.user_id: link roster
--    entries and submissions to real Athena accounts (set when a student
--    signs in to do homework).
--  * users.learning_access: the boundary. Homework is always free; the rich
--    learning experience (micro-lessons, tutor, full SAT, custom topics) is
--    gated. Semantics: TRUE or NULL = full access; FALSE = homework-only.
--    Existing users are backfilled TRUE (zero disruption); accounts created
--    through the homework funnel are set FALSE at link time.
--
-- NOTE: apply via Supabase Studio SQL editor (db push is blocked by the
-- April 2026 migration drift). Studio reloads PostgREST automatically.

ALTER TABLE public.educator_students
  ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.educator_submissions
  ADD COLUMN user_id uuid REFERENCES public.users(id) ON DELETE SET NULL;
CREATE INDEX educator_students_user_idx ON public.educator_students (user_id);

ALTER TABLE public.users ADD COLUMN learning_access boolean;
-- Grandfather everyone who exists today: they keep full access. New accounts
-- come in as NULL (still full access) until the homework funnel sets FALSE.
UPDATE public.users SET learning_access = true WHERE learning_access IS NULL;
