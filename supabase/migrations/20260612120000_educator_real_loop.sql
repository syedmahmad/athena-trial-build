-- Educator surface, phase 2: close the real loop.
--  * educator_classes + nullable class_id FKs (schema lands before real data;
--    UI stays single-class for now)
--  * answer_key split out of student-visible instructions (share link must
--    never see it)
--  * questions jsonb: structured practice-set assignments pulled from the
--    Athena problem bank, auto-graded objectively on submit
--  * simulated flag: AI-invented demo submissions are marked and badged,
--    never silently mixed with real student work
--  * answers jsonb: per-question choices for practice-set submissions
--
-- NOTE: apply via Supabase Studio SQL editor (db push is blocked by the
-- April 2026 migration drift).

CREATE TABLE public.educator_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX educator_classes_teacher_idx ON public.educator_classes (teacher_id);
-- Default-deny RLS, same posture as the other educator_* tables.
ALTER TABLE public.educator_classes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.educator_students
  ADD COLUMN class_id uuid REFERENCES public.educator_classes(id) ON DELETE SET NULL;
ALTER TABLE public.educator_assignments
  ADD COLUMN class_id uuid REFERENCES public.educator_classes(id) ON DELETE SET NULL;
CREATE INDEX educator_students_class_idx ON public.educator_students (class_id);
CREATE INDEX educator_assignments_class_idx ON public.educator_assignments (class_id);

ALTER TABLE public.educator_assignments ADD COLUMN answer_key text;
ALTER TABLE public.educator_assignments ADD COLUMN questions jsonb;

ALTER TABLE public.educator_submissions
  ADD COLUMN simulated boolean NOT NULL DEFAULT false;
ALTER TABLE public.educator_submissions ADD COLUMN answers jsonb;

-- Every pre-existing response was produced by the demo simulate loop;
-- mark them so they are badged (and excluded from real stats) immediately.
UPDATE public.educator_submissions SET simulated = true WHERE response IS NOT NULL;
