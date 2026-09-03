-- Studio: Agent Registry
-- Supports multiple tutor agents with versioned prompts, structured config, and deployment lifecycle.
-- This is additive — does not modify any existing tables.

-- ═══════════════════════════════════════════════
-- AGENTS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_agents (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    tagline TEXT,
    description TEXT,
    icon_url TEXT,
    avatar_color TEXT DEFAULT '#58a6ff',
    domain TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'draft',
    sort_order INT NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_studio_agents_status ON studio_agents(status);
CREATE INDEX IF NOT EXISTS idx_studio_agents_status_sort ON studio_agents(status, sort_order);

-- ═══════════════════════════════════════════════
-- PROMPT SLOTS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_agent_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES studio_agents(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_studio_prompts_agent ON studio_agent_prompts(agent_id);

-- ═══════════════════════════════════════════════
-- PROMPT VERSIONS (immutable)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_agent_prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_id UUID NOT NULL REFERENCES studio_agent_prompts(id) ON DELETE CASCADE,
    version INT NOT NULL,
    content TEXT NOT NULL,
    variables JSONB NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    author TEXT,
    change_note TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(prompt_id, version)
);

CREATE INDEX IF NOT EXISTS idx_studio_versions_prompt ON studio_agent_prompt_versions(prompt_id);
CREATE INDEX IF NOT EXISTS idx_studio_versions_status ON studio_agent_prompt_versions(status);

-- Auto-increment version per prompt
CREATE OR REPLACE FUNCTION studio_set_prompt_version() RETURNS TRIGGER AS $$
BEGIN
    NEW.version := COALESCE(
        (SELECT MAX(version) FROM studio_agent_prompt_versions WHERE prompt_id = NEW.prompt_id), 0
    ) + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studio_prompt_version ON studio_agent_prompt_versions;
CREATE TRIGGER trg_studio_prompt_version
    BEFORE INSERT ON studio_agent_prompt_versions
    FOR EACH ROW EXECUTE FUNCTION studio_set_prompt_version();

-- ═══════════════════════════════════════════════
-- CONFIG SECTIONS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_agent_config_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES studio_agents(id) ON DELETE CASCADE,
    section TEXT NOT NULL,
    data JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(agent_id, section)
);

CREATE INDEX IF NOT EXISTS idx_studio_config_agent ON studio_agent_config_sections(agent_id);

-- ═══════════════════════════════════════════════
-- DEPLOYMENTS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_agent_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL REFERENCES studio_agents(id) ON DELETE CASCADE,
    version INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'staging',
    prompt_pins JSONB NOT NULL,
    config_snapshot JSONB NOT NULL,
    change_note TEXT,
    deployed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    promoted_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    UNIQUE(agent_id, version)
);

CREATE INDEX IF NOT EXISTS idx_studio_deploy_agent ON studio_agent_deployments(agent_id);
CREATE INDEX IF NOT EXISTS idx_studio_deploy_status ON studio_agent_deployments(status);
CREATE INDEX IF NOT EXISTS idx_studio_deploy_live ON studio_agent_deployments(agent_id) WHERE status = 'live';

-- Auto-increment deployment version per agent
CREATE OR REPLACE FUNCTION studio_set_deployment_version() RETURNS TRIGGER AS $$
BEGIN
    NEW.version := COALESCE(
        (SELECT MAX(version) FROM studio_agent_deployments WHERE agent_id = NEW.agent_id), 0
    ) + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studio_deploy_version ON studio_agent_deployments;
CREATE TRIGGER trg_studio_deploy_version
    BEFORE INSERT ON studio_agent_deployments
    FOR EACH ROW EXECUTE FUNCTION studio_set_deployment_version();

-- ═══════════════════════════════════════════════
-- LIVE SESSIONS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_live_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT REFERENCES studio_agents(id),
    deployment_id UUID REFERENCES studio_agent_deployments(id),
    skill_id TEXT NOT NULL,
    skill_name TEXT,
    skill_description TEXT,
    agent_config_snapshot JSONB NOT NULL,
    resolved_prompts JSONB NOT NULL DEFAULT '{}',
    messages JSONB NOT NULL DEFAULT '[]',
    steps JSONB NOT NULL DEFAULT '[]',
    current_phase TEXT DEFAULT 'lesson',
    phases_completed TEXT[] DEFAULT '{}',
    title TEXT,
    subtitle TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    duration_secs INT,
    evaluator_run_id UUID,
    score FLOAT,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_studio_sessions_agent ON studio_live_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_deploy ON studio_live_sessions(deployment_id);
CREATE INDEX IF NOT EXISTS idx_studio_sessions_started ON studio_live_sessions(started_at DESC);

-- ═══════════════════════════════════════════════
-- UPDATED_AT TRIGGERS
-- ═══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION studio_update_timestamp() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_studio_agents_updated ON studio_agents;
CREATE TRIGGER trg_studio_agents_updated BEFORE UPDATE ON studio_agents
    FOR EACH ROW EXECUTE FUNCTION studio_update_timestamp();

DROP TRIGGER IF EXISTS trg_studio_config_updated ON studio_agent_config_sections;
CREATE TRIGGER trg_studio_config_updated BEFORE UPDATE ON studio_agent_config_sections
    FOR EACH ROW EXECUTE FUNCTION studio_update_timestamp();
