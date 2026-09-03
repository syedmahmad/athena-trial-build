-- Studio: Archetypes — reusable agent recipes
-- An archetype defines the structure (prompt sections, skills, config params)
-- that agent instances inherit and customize.

-- ═══════════════════════════════════════════════
-- ARCHETYPES TABLE
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS studio_archetypes (
    id TEXT PRIMARY KEY,                        -- slug: "patient-math-tutor"
    display_name TEXT NOT NULL,
    description TEXT,
    domain TEXT NOT NULL DEFAULT 'general',

    -- Prompt section definitions (schema, not content)
    -- Format: [{ slug, display_name, description, default_content, variables: [{name, type, default, required, description}] }]
    prompt_sections JSONB NOT NULL DEFAULT '[]',

    -- Skill definitions
    -- Format: [{ slug, enabled_by_default, default_config: {} }]
    skills JSONB NOT NULL DEFAULT '[]',

    -- Config parameter definitions (what the admin can tune)
    -- Format: [{ key, display_name, description, type: "string"|"number"|"boolean"|"select", default, options?: [], min?, max? }]
    config_schema JSONB NOT NULL DEFAULT '[]',

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- EXTEND studio_agents WITH ARCHETYPE LINK
-- ═══════════════════════════════════════════════

ALTER TABLE studio_agents ADD COLUMN IF NOT EXISTS archetype_id TEXT REFERENCES studio_archetypes(id);
ALTER TABLE studio_agents ADD COLUMN IF NOT EXISTS agent_config JSONB DEFAULT '{}';
ALTER TABLE studio_agents ADD COLUMN IF NOT EXISTS cloned_from TEXT REFERENCES studio_agents(id);

CREATE INDEX IF NOT EXISTS idx_studio_agents_archetype ON studio_agents(archetype_id);
CREATE INDEX IF NOT EXISTS idx_studio_agents_cloned ON studio_agents(cloned_from);

-- ═══════════════════════════════════════════════
-- UPDATED_AT TRIGGER FOR ARCHETYPES
-- ═══════════════════════════════════════════════

DROP TRIGGER IF EXISTS trg_studio_archetypes_updated ON studio_archetypes;
CREATE TRIGGER trg_studio_archetypes_updated BEFORE UPDATE ON studio_archetypes
    FOR EACH ROW EXECUTE FUNCTION studio_update_timestamp();
