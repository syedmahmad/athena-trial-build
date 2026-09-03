-- Student POV: living markdown document per student
CREATE TABLE IF NOT EXISTS studio_student_povs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id TEXT NOT NULL,
    markdown TEXT NOT NULL DEFAULT '',
    last_session_id UUID REFERENCES studio_live_sessions(id),
    sessions_incorporated INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_pov_student ON studio_student_povs(student_id);

-- Interaction events: granular log of everything that happens in a session
CREATE TABLE IF NOT EXISTS studio_session_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES studio_live_sessions(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_events_session ON studio_session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_studio_events_type ON studio_session_events(event_type);
