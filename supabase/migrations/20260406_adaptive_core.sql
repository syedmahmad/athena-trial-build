-- Adaptive Core: subsection skill tracking, difficulty levels, daily quests, XP

-- A. Add difficulty_level (1-10) to sat_problems
ALTER TABLE sat_problems ADD COLUMN IF NOT EXISTS difficulty_level integer;

UPDATE sat_problems SET difficulty_level =
  CASE difficulty
    WHEN 'easy' THEN 1 + floor(random() * 3)::int
    WHEN 'medium' THEN 4 + floor(random() * 3)::int
    WHEN 'hard' THEN 7 + floor(random() * 4)::int
    ELSE 5
  END
WHERE difficulty_level IS NULL;

ALTER TABLE sat_problems ALTER COLUMN difficulty_level SET NOT NULL;
ALTER TABLE sat_problems ADD CONSTRAINT sat_problems_difficulty_level_check
  CHECK (difficulty_level >= 1 AND difficulty_level <= 10);

-- B. Add difficulty_level and response_time_ms to sat_quiz_answers
ALTER TABLE sat_quiz_answers ADD COLUMN IF NOT EXISTS difficulty_level integer;
ALTER TABLE sat_quiz_answers ADD COLUMN IF NOT EXISTS response_time_ms integer;

-- C. Subsection skills — per-user per-subtopic adaptive state
CREATE TABLE IF NOT EXISTS subsection_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  section_category text NOT NULL CHECK (section_category IN ('ReadingWriting', 'Math')),
  level integer DEFAULT 1 NOT NULL CHECK (level >= 1 AND level <= 10),
  xp integer DEFAULT 0 NOT NULL,
  total_attempts integer DEFAULT 0 NOT NULL,
  correct_attempts integer DEFAULT 0 NOT NULL,
  last_10 boolean[] DEFAULT '{}' NOT NULL,
  streak_correct integer DEFAULT 0 NOT NULL,
  streak_wrong integer DEFAULT 0 NOT NULL,
  last_seen_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT subsection_skills_user_subtopic_unique UNIQUE(user_id, subtopic_id)
);

-- D. Daily quests — one per user per day
CREATE TABLE IF NOT EXISTS daily_quests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quest_date date NOT NULL,
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed')),
  score integer DEFAULT 0 NOT NULL,
  total_questions integer DEFAULT 20 NOT NULL,
  correct_count integer DEFAULT 0 NOT NULL,
  xp_earned integer DEFAULT 0 NOT NULL,
  time_elapsed_seconds integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT daily_quests_user_date_unique UNIQUE(user_id, quest_date)
);

-- E. Daily quest problems — the 20 selected problems per quest
CREATE TABLE IF NOT EXISTS daily_quest_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  quest_id uuid NOT NULL REFERENCES daily_quests(id) ON DELETE CASCADE,
  problem_id uuid NOT NULL REFERENCES sat_problems(id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  bucket text NOT NULL CHECK (bucket IN ('weak', 'mid', 'stretch')),
  difficulty_level integer NOT NULL,
  selected_option integer,
  is_correct boolean,
  response_time_ms integer,
  answered_at timestamptz,
  CONSTRAINT daily_quest_problems_quest_order_unique UNIQUE(quest_id, order_index)
);

-- F. SAT profile + XP columns on users
ALTER TABLE users ADD COLUMN IF NOT EXISTS start_composite integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_composite integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_reading_writing integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_math integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_xp integer DEFAULT 0 NOT NULL;

-- G. Indexes
CREATE INDEX IF NOT EXISTS idx_subsection_skills_user ON subsection_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_subsection_skills_user_level ON subsection_skills(user_id, level);
CREATE INDEX IF NOT EXISTS idx_daily_quests_user_date ON daily_quests(user_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_daily_quest_problems_quest ON daily_quest_problems(quest_id);
CREATE INDEX IF NOT EXISTS idx_sat_problems_subtopic_difficulty ON sat_problems(subtopic_id, difficulty_level);
