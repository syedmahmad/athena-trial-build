-- Full SAT practice test module: test blueprints, attempts, and per-question answers.
--
-- NOTE: Enum extensions for problem_source / session_source moved to
-- 20260413000000_full_sat_enums.sql so the ADD VALUE statements commit in a
-- separate transaction before the CHECK constraint below references them.

-- ============================================================
-- B. Update CHECK constraint on problems to allow full_sat
-- ============================================================

ALTER TABLE problems DROP CONSTRAINT problems_source_linking;
ALTER TABLE problems ADD CONSTRAINT problems_source_linking CHECK (
  CASE source
    WHEN 'sat'        THEN subtopic_id IS NOT NULL
    WHEN 'full_sat'   THEN subtopic_id IS NOT NULL
    WHEN 'practice'   THEN subtopic_id IS NOT NULL OR (topic_slug IS NOT NULL AND subtopic_slug IS NOT NULL)
    WHEN 'custom'     THEN custom_topic_id IS NOT NULL
    WHEN 'onboarding' THEN true
  END
);

-- ============================================================
-- C. full_sat_tests — reusable test blueprints
-- ============================================================

CREATE TABLE full_sat_tests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_number integer NOT NULL UNIQUE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'retired')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- D. full_sat_test_problems — maps problems into test sections/modules
-- ============================================================

CREATE TABLE full_sat_test_problems (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id     uuid NOT NULL REFERENCES full_sat_tests(id) ON DELETE CASCADE,
  problem_id  uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  section     text NOT NULL CHECK (section IN ('reading_writing', 'math')),
  module      integer NOT NULL CHECK (module IN (1, 2)),
  order_index integer NOT NULL,
  CONSTRAINT full_sat_test_problems_unique UNIQUE (test_id, section, module, order_index)
);

CREATE INDEX idx_fst_problems_test ON full_sat_test_problems(test_id);
CREATE INDEX idx_fst_problems_test_section ON full_sat_test_problems(test_id, section, module);

-- ============================================================
-- E. full_sat_attempts — per-user test attempts
-- ============================================================

CREATE TABLE full_sat_attempts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id               uuid NOT NULL REFERENCES full_sat_tests(id) ON DELETE CASCADE,
  status                text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),

  -- Section scores (SAT 200-800 scale)
  rw_raw_score          integer,
  rw_scaled_score       integer,
  math_raw_score        integer,
  math_scaled_score     integer,
  total_score           integer,

  -- Module-level tracking (for future adaptive Module 2)
  rw_module1_correct    integer DEFAULT 0,
  math_module1_correct  integer DEFAULT 0,

  -- Timing
  rw_time_seconds       integer DEFAULT 0,
  math_time_seconds     integer DEFAULT 0,
  total_time_seconds    integer DEFAULT 0,

  -- Current position (for resuming)
  current_section       text DEFAULT 'reading_writing',
  current_module        integer DEFAULT 1,
  current_question      integer DEFAULT 0,

  started_at            timestamptz NOT NULL DEFAULT now(),
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_full_sat_attempts_user ON full_sat_attempts(user_id);
CREATE INDEX idx_full_sat_attempts_user_status ON full_sat_attempts(user_id, status);
CREATE INDEX idx_full_sat_attempts_user_completed ON full_sat_attempts(user_id, completed_at DESC);

-- ============================================================
-- F. full_sat_answers — per-question answers within an attempt
-- ============================================================

CREATE TABLE full_sat_answers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id      uuid NOT NULL REFERENCES full_sat_attempts(id) ON DELETE CASCADE,
  problem_id      uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  section         text NOT NULL CHECK (section IN ('reading_writing', 'math')),
  module          integer NOT NULL CHECK (module IN (1, 2)),
  order_index     integer NOT NULL,
  selected_option integer,
  is_correct      boolean,
  response_time_ms integer,
  answered_at     timestamptz,
  CONSTRAINT full_sat_answers_attempt_order UNIQUE (attempt_id, section, module, order_index)
);

CREATE INDEX idx_full_sat_answers_attempt ON full_sat_answers(attempt_id);

-- ============================================================
-- G. RLS policies (match existing patterns)
-- ============================================================

ALTER TABLE full_sat_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE full_sat_test_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE full_sat_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE full_sat_answers ENABLE ROW LEVEL SECURITY;

-- Tests and test problems are readable by all authenticated users
CREATE POLICY "Anyone can read active tests"
  ON full_sat_tests FOR SELECT
  USING (true);

CREATE POLICY "Anyone can read test problems"
  ON full_sat_test_problems FOR SELECT
  USING (true);

-- Attempts: users can only see/modify their own
CREATE POLICY "Users can read own attempts"
  ON full_sat_attempts FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert own attempts"
  ON full_sat_attempts FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update own attempts"
  ON full_sat_attempts FOR UPDATE
  USING (auth.uid()::text = user_id::text);

-- Answers: users can only see/modify answers for their own attempts
CREATE POLICY "Users can read own answers"
  ON full_sat_answers FOR SELECT
  USING (attempt_id IN (SELECT id FROM full_sat_attempts WHERE user_id::text = auth.uid()::text));

CREATE POLICY "Users can insert own answers"
  ON full_sat_answers FOR INSERT
  WITH CHECK (attempt_id IN (SELECT id FROM full_sat_attempts WHERE user_id::text = auth.uid()::text));

CREATE POLICY "Users can update own answers"
  ON full_sat_answers FOR UPDATE
  USING (attempt_id IN (SELECT id FROM full_sat_attempts WHERE user_id::text = auth.uid()::text));
