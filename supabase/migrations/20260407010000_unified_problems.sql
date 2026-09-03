-- Unified problems schema: merges questions, sat_problems, practice_problems, custom_topic_questions
-- into a single problems table, and merges quiz session/answer tables.

-- Cleanup from any partial prior run
DROP TABLE IF EXISTS quiz_answers;
DROP TABLE IF EXISTS quiz_sessions;
DROP TABLE IF EXISTS problems;
DROP TYPE IF EXISTS session_source;
DROP TYPE IF EXISTS problem_source;

-- ============================================================
-- A. Create unified problems table
-- ============================================================

CREATE TYPE problem_source AS ENUM ('onboarding', 'sat', 'practice', 'custom');

CREATE TABLE problems (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source                      problem_source NOT NULL,

  -- Linking (nullable per source type)
  subtopic_id                 uuid REFERENCES subtopics(id) ON DELETE CASCADE,
  custom_topic_id             uuid REFERENCES custom_topics(id) ON DELETE CASCADE,
  topic_slug                  text,
  subtopic_slug               text,

  -- Classification
  order_index                 integer NOT NULL,
  difficulty                  text NOT NULL,
  difficulty_level            integer NOT NULL DEFAULT 5
    CHECK (difficulty_level >= 1 AND difficulty_level <= 10),
  category                    text,

  -- Content
  question_text               text NOT NULL,
  options                     jsonb NOT NULL,
  correct_option              integer NOT NULL,
  explanation                 text NOT NULL,
  solution_steps              jsonb NOT NULL DEFAULT '[]'::jsonb,
  concept_tags                jsonb NOT NULL DEFAULT '[]'::jsonb,
  common_errors               jsonb NOT NULL DEFAULT '[]'::jsonb,
  hint                        text NOT NULL DEFAULT '',
  detailed_hint               text,
  time_recommendation_seconds integer NOT NULL DEFAULT 60,
  sat_frequency               text,

  created_at                  timestamptz NOT NULL DEFAULT now(),

  -- Integrity constraints
  CONSTRAINT problems_source_linking CHECK (
    CASE source
      WHEN 'sat'        THEN subtopic_id IS NOT NULL
      WHEN 'practice'   THEN subtopic_id IS NOT NULL OR (topic_slug IS NOT NULL AND subtopic_slug IS NOT NULL)
      WHEN 'custom'     THEN custom_topic_id IS NOT NULL
      WHEN 'onboarding' THEN true
    END
  )
);

CREATE INDEX idx_problems_source ON problems(source);
CREATE INDEX idx_problems_subtopic ON problems(subtopic_id) WHERE subtopic_id IS NOT NULL;
CREATE INDEX idx_problems_subtopic_difficulty ON problems(subtopic_id, difficulty_level) WHERE subtopic_id IS NOT NULL;
CREATE INDEX idx_problems_custom_topic ON problems(custom_topic_id) WHERE custom_topic_id IS NOT NULL;
CREATE INDEX idx_problems_slug_pair ON problems(topic_slug, subtopic_slug) WHERE topic_slug IS NOT NULL;
CREATE UNIQUE INDEX idx_problems_onboarding_order ON problems(order_index) WHERE source = 'onboarding';
CREATE UNIQUE INDEX idx_problems_sat_subtopic_order ON problems(subtopic_id, order_index) WHERE source = 'sat';
CREATE UNIQUE INDEX idx_problems_custom_topic_order ON problems(custom_topic_id, order_index) WHERE custom_topic_id IS NOT NULL;

-- ============================================================
-- B. Create unified quiz_sessions table
-- ============================================================

CREATE TYPE session_source AS ENUM ('onboarding', 'sat', 'custom');

CREATE TABLE quiz_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source               session_source NOT NULL,
  subtopic_id          uuid REFERENCES subtopics(id) ON DELETE CASCADE,
  custom_topic_id      uuid REFERENCES custom_topics(id) ON DELETE CASCADE,
  score                integer NOT NULL DEFAULT 0,
  total_questions      integer NOT NULL DEFAULT 1,
  time_elapsed_seconds integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_sessions_user ON quiz_sessions(user_id);
CREATE INDEX idx_quiz_sessions_user_source ON quiz_sessions(user_id, source);
CREATE INDEX idx_quiz_sessions_user_subtopic ON quiz_sessions(user_id, subtopic_id) WHERE subtopic_id IS NOT NULL;

-- ============================================================
-- C. Create unified quiz_answers table
-- ============================================================

CREATE TABLE quiz_answers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  problem_id       uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  selected_option  integer NOT NULL,
  is_correct       boolean NOT NULL,
  difficulty_level integer,
  response_time_ms integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_answers_session ON quiz_answers(session_id);
CREATE INDEX idx_quiz_answers_session_correct ON quiz_answers(session_id, is_correct);
CREATE INDEX idx_quiz_answers_problem ON quiz_answers(problem_id);

-- ============================================================
-- D. Migrate data
-- ============================================================

-- D1: Onboarding questions → problems
INSERT INTO problems (id, source, order_index, difficulty, difficulty_level, category, question_text, options, correct_option, explanation, created_at)
SELECT id, 'onboarding'::problem_source, order_index, difficulty, 5, category, question_text, options, correct_option, explanation, created_at
FROM questions;

-- D2: SAT problems → problems
INSERT INTO problems (id, source, subtopic_id, order_index, difficulty, difficulty_level, question_text, options, correct_option, explanation, solution_steps, concept_tags, common_errors, hint, detailed_hint, time_recommendation_seconds, sat_frequency, created_at)
SELECT id, 'sat'::problem_source, subtopic_id, order_index, difficulty, difficulty_level, question_text, options, correct_option, explanation, solution_steps, concept_tags, common_errors, hint, detailed_hint, time_recommendation_seconds, sat_frequency, created_at
FROM sat_problems;

-- D3: Practice problems → problems
INSERT INTO problems (id, source, subtopic_id, topic_slug, subtopic_slug, order_index, difficulty, difficulty_level, question_text, options, correct_option, explanation, solution_steps, concept_tags, common_errors, hint, detailed_hint, time_recommendation_seconds, sat_frequency, created_at)
SELECT id, 'practice'::problem_source, subtopic_id, topic_slug, subtopic_slug, order_index, difficulty,
  CASE difficulty WHEN 'easy' THEN 2 WHEN 'medium' THEN 5 WHEN 'hard' THEN 8 ELSE 5 END,
  question_text, options, correct_option, explanation, solution_steps, concept_tags, common_errors, hint, detailed_hint, time_recommendation_seconds, sat_frequency, COALESCE(created_at, now())
FROM practice_problems;

-- D4: Custom topic questions → problems
INSERT INTO problems (id, source, custom_topic_id, order_index, difficulty, difficulty_level, question_text, options, correct_option, explanation, solution_steps, hint, time_recommendation_seconds, created_at)
SELECT id, 'custom'::problem_source, topic_id, order_index, difficulty, 5, question_text, options, correct_option, explanation, solution_steps, hint, time_recommendation_seconds, created_at
FROM custom_topic_questions;

-- D5: SAT quiz sessions → quiz_sessions
INSERT INTO quiz_sessions (id, user_id, source, subtopic_id, score, total_questions, time_elapsed_seconds, created_at)
SELECT id, user_id, 'sat'::session_source, subtopic_id, score, total_questions, time_elapsed_seconds, created_at
FROM sat_quiz_sessions;

-- D6: SAT quiz answers → quiz_answers
INSERT INTO quiz_answers (id, session_id, problem_id, selected_option, is_correct, difficulty_level, response_time_ms, created_at)
SELECT id, session_id, problem_id, selected_option, is_correct, difficulty_level, response_time_ms, created_at
FROM sat_quiz_answers;

-- D7: Custom quiz sessions → quiz_sessions
INSERT INTO quiz_sessions (id, user_id, source, custom_topic_id, score, total_questions, time_elapsed_seconds, created_at)
SELECT id, user_id, 'custom'::session_source, topic_id, score, total_questions, time_elapsed_seconds, created_at
FROM custom_quiz_sessions;

-- D8: Custom quiz answers → quiz_answers
INSERT INTO quiz_answers (id, session_id, problem_id, selected_option, is_correct, created_at)
SELECT id, session_id, question_id, selected_option, is_correct, created_at
FROM custom_quiz_answers;

-- D9: Onboarding quiz_attempts → quiz_sessions + quiz_answers
INSERT INTO quiz_sessions (id, user_id, source, score, total_questions, time_elapsed_seconds, created_at)
SELECT id, user_id, 'onboarding'::session_source,
  CASE WHEN is_correct THEN 1 ELSE 0 END,
  1,
  COALESCE(time_spent_seconds, 0),
  created_at
FROM quiz_attempts;

INSERT INTO quiz_answers (session_id, problem_id, selected_option, is_correct, created_at)
SELECT id, question_id, selected_option, is_correct, created_at
FROM quiz_attempts;

-- ============================================================
-- E. Re-point foreign keys
-- ============================================================

-- E1: daily_quest_problems.problem_id → problems
ALTER TABLE daily_quest_problems
  DROP CONSTRAINT IF EXISTS daily_quest_problems_problem_id_fkey,
  DROP CONSTRAINT IF EXISTS daily_quest_problems_problem_id_sat_problems_id_fk;

ALTER TABLE daily_quest_problems
  ADD CONSTRAINT daily_quest_problems_problem_id_problems_fk
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE;

-- E2: lessons.question_id → rename to problem_id, FK to problems
ALTER TABLE lessons
  DROP CONSTRAINT IF EXISTS lessons_question_id_questions_id_fk;

ALTER TABLE lessons RENAME COLUMN question_id TO problem_id;

ALTER TABLE lessons
  RENAME CONSTRAINT lessons_question_id_unique TO lessons_problem_id_unique;

ALTER TABLE lessons
  ADD CONSTRAINT lessons_problem_id_problems_fk
  FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE;

-- ============================================================
-- F. Drop old functions that depend on old table types
-- ============================================================

DROP FUNCTION IF EXISTS save_sat_quiz_session(uuid, uuid, integer, integer, integer, jsonb);
DROP FUNCTION IF EXISTS save_custom_topic(uuid, text, text, jsonb, jsonb, jsonb, jsonb);
DROP FUNCTION IF EXISTS save_custom_quiz_session(uuid, uuid, integer, integer, integer, jsonb);

-- ============================================================
-- G. Drop old tables (order matters for FK deps)
-- ============================================================

DROP TABLE IF EXISTS quiz_attempts;
DROP TABLE IF EXISTS sat_quiz_answers;
DROP TABLE IF EXISTS sat_quiz_sessions;
DROP TABLE IF EXISTS custom_quiz_answers;
DROP TABLE IF EXISTS custom_quiz_sessions;
DROP TABLE IF EXISTS custom_topic_questions;
DROP TABLE IF EXISTS practice_problems;
DROP TABLE IF EXISTS sat_problems;
DROP TABLE IF EXISTS questions;
