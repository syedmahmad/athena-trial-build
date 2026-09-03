-- Educator surface (/educators): teacher-managed homework, roster, AI grading, parent report log.
-- Ported from the Lovable "Athena for Teachers" prototype, with real FKs and
-- default-deny RLS (service-role access only) instead of the demo's open policies.

CREATE TABLE public.educator_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  student_email text NOT NULL,
  parent_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.educator_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text NOT NULL,
  due_date date NOT NULL,
  source text NOT NULL DEFAULT 'ai',
  prompt text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.educator_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.educator_assignments(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.educator_students(id) ON DELETE CASCADE,
  response text,
  grade integer CHECK (grade >= 0 AND grade <= 100),
  feedback text,
  submitted_at timestamptz,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE public.educator_parent_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.educator_students(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  summary text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX educator_students_teacher_idx ON public.educator_students (teacher_id);
CREATE INDEX educator_assignments_teacher_due_idx ON public.educator_assignments (teacher_id, due_date);
CREATE INDEX educator_submissions_assignment_idx ON public.educator_submissions (assignment_id);
CREATE INDEX educator_submissions_student_idx ON public.educator_submissions (student_id);
CREATE INDEX educator_parent_reports_teacher_idx ON public.educator_parent_reports (teacher_id);

-- Default-deny RLS: no policies. All access goes through the server-side
-- service-role client (src/lib/supabase/client.ts); the anon key gets nothing.
ALTER TABLE public.educator_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.educator_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.educator_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.educator_parent_reports ENABLE ROW LEVEL SECURITY;
