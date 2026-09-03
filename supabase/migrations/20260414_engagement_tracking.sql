-- =============================================================
-- Engagement Tracking: quiz question events + micro-lesson sessions
-- =============================================================

-- 1. Quiz question events — records every significant phase transition
--    during a quiz (wrong answers, hints, tutor entries, practice)
CREATE TABLE quiz_question_events (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
  problem_id          uuid NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type          text NOT NULL CHECK (event_type IN (
    'answer_correct',
    'answer_wrong',
    'hint_shown',
    'tutor_entered',
    'tutor_correct',
    'practice_started',
    'practice_correct',
    'practice_exhausted'
  )),
  response_time_ms    integer,
  selected_option     integer,
  wrong_count         integer,
  practice_problem_id uuid REFERENCES problems(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_qqe_session ON quiz_question_events(session_id);
CREATE INDEX idx_qqe_user ON quiz_question_events(user_id);
CREATE INDEX idx_qqe_user_problem ON quiz_question_events(user_id, problem_id);

-- 2. Micro-lesson sessions — tracks engagement with micro-lessons
CREATE TABLE micro_lesson_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  micro_lesson_id   uuid NOT NULL REFERENCES micro_lessons(id) ON DELETE CASCADE,
  subtopic_id       uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ended_at          timestamptz,
  duration_seconds  integer DEFAULT 0,
  steps_viewed      integer DEFAULT 0,
  total_steps       integer DEFAULT 0,
  checkins_correct  integer DEFAULT 0,
  checkins_total    integer DEFAULT 0,
  chat_messages     integer DEFAULT 0,
  completed         boolean DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mls_user ON micro_lesson_sessions(user_id);
CREATE INDEX idx_mls_user_subtopic ON micro_lesson_sessions(user_id, subtopic_id);

-- 3. Denormalized columns on quiz_answers for fast queries
ALTER TABLE quiz_answers ADD COLUMN IF NOT EXISTS wrong_count integer DEFAULT 0;
ALTER TABLE quiz_answers ADD COLUMN IF NOT EXISTS hint_used boolean DEFAULT false;
ALTER TABLE quiz_answers ADD COLUMN IF NOT EXISTS tutor_used boolean DEFAULT false;
ALTER TABLE quiz_answers ADD COLUMN IF NOT EXISTS practice_completed boolean DEFAULT false;
