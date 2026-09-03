-- Skills enabled per agent with per-agent config
CREATE TABLE IF NOT EXISTS studio_agent_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES studio_agents(id) ON DELETE CASCADE,
    skill_slug TEXT NOT NULL,           -- "whiteboard_teaching", "quiz"
    enabled BOOLEAN DEFAULT true,
    config JSONB DEFAULT '{}',          -- skill-specific config per agent
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_id, skill_slug)
);

CREATE INDEX IF NOT EXISTS idx_studio_agent_skills ON studio_agent_skills(agent_id);

-- Pre-validated quiz questions generated during sessions
CREATE TABLE IF NOT EXISTS studio_quiz_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES studio_live_sessions(id),
    agent_id TEXT REFERENCES studio_agents(id),
    topic TEXT NOT NULL,
    difficulty TEXT NOT NULL DEFAULT 'medium',   -- easy, medium, hard
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,                       -- ["option A", "option B", "option C", "option D"]
    correct_option INT NOT NULL,                  -- 0-based index
    explanation TEXT NOT NULL,                     -- full solution explanation
    solution_steps JSONB DEFAULT '[]',            -- step-by-step solution
    hint TEXT,                                    -- first hint
    detailed_hint TEXT,                           -- second hint
    verified BOOLEAN DEFAULT false,               -- has the answer been independently verified?
    verification_method TEXT,                     -- "self_check" | "deterministic" | "dual_solve"
    student_answer INT,                           -- what the student picked (null if not answered)
    student_correct BOOLEAN,                      -- was the student correct?
    attempts INT DEFAULT 0,                       -- number of attempts
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_quiz_session ON studio_quiz_questions(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_quiz_agent ON studio_quiz_questions(agent_id);
CREATE INDEX IF NOT EXISTS idx_studio_quiz_topic ON studio_quiz_questions(topic);
