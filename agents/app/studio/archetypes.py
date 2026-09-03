"""
CRUD operations for Studio Archetypes.

An archetype defines a reusable recipe for agent creation:
- prompt_sections: which prompt sections exist with defaults
- skills: which skills are available with default configs
- config_schema: tunable parameters with types, defaults, and descriptions
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.utils.db import client


# ─── Pydantic Models ─────────────────────────────────────────────────────────


class PromptSectionDef(BaseModel):
    slug: str
    display_name: str
    description: str = ""
    default_content: str = ""
    variables: list[dict[str, Any]] = Field(default_factory=list)


class SkillDef(BaseModel):
    slug: str
    enabled_by_default: bool = True
    default_config: dict[str, Any] = Field(default_factory=dict)


class ConfigParamDef(BaseModel):
    key: str
    display_name: str
    description: str = ""
    type: str = "string"  # "string" | "number" | "boolean" | "select"
    default: Any = None
    options: list[str] | None = None
    min: float | None = None
    max: float | None = None


class ArchetypeCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    display_name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    domain: str = "general"
    prompt_sections: list[PromptSectionDef] = Field(default_factory=list)
    skills: list[SkillDef] = Field(default_factory=list)
    config_schema: list[ConfigParamDef] = Field(default_factory=list)


class ArchetypeUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    domain: str | None = None
    prompt_sections: list[PromptSectionDef] | None = None
    skills: list[SkillDef] | None = None
    config_schema: list[ConfigParamDef] | None = None


class ArchetypeSummary(BaseModel):
    id: str
    display_name: str
    description: str | None
    domain: str
    prompt_sections_count: int
    skills_count: int
    config_params_count: int
    created_at: str | None = None
    updated_at: str | None = None


class ArchetypeDetail(BaseModel):
    id: str
    display_name: str
    description: str | None
    domain: str
    prompt_sections: list[dict[str, Any]]
    skills: list[dict[str, Any]]
    config_schema: list[dict[str, Any]]
    created_at: str | None = None
    updated_at: str | None = None


# ─── CRUD Functions ───────────────────────────────────────────────────────────


def list_archetypes() -> list[dict]:
    """List all archetypes with summary counts."""
    resp = client().table("studio_archetypes").select("*").order("display_name").execute()
    results = []
    for row in resp.data or []:
        results.append({
            "id": row["id"],
            "display_name": row["display_name"],
            "description": row.get("description"),
            "domain": row["domain"],
            "prompt_sections_count": len(row.get("prompt_sections") or []),
            "skills_count": len(row.get("skills") or []),
            "config_params_count": len(row.get("config_schema") or []),
            "created_at": row.get("created_at"),
            "updated_at": row.get("updated_at"),
        })
    return results


def get_archetype(archetype_id: str) -> dict | None:
    """Get full archetype detail."""
    resp = (
        client()
        .table("studio_archetypes")
        .select("*")
        .eq("id", archetype_id)
        .execute()
    )
    if not resp.data:
        return None
    return resp.data[0]


def create_archetype(data: ArchetypeCreate) -> dict:
    """Create a new archetype."""
    row = {
        "id": data.id,
        "display_name": data.display_name,
        "description": data.description or None,
        "domain": data.domain,
        "prompt_sections": [s.model_dump() for s in data.prompt_sections],
        "skills": [s.model_dump() for s in data.skills],
        "config_schema": [p.model_dump() for p in data.config_schema],
    }
    resp = client().table("studio_archetypes").insert(row).execute()
    return resp.data[0]


def update_archetype(archetype_id: str, data: ArchetypeUpdate) -> dict | None:
    """Update an existing archetype."""
    update_data: dict[str, Any] = {}
    if data.display_name is not None:
        update_data["display_name"] = data.display_name
    if data.description is not None:
        update_data["description"] = data.description
    if data.domain is not None:
        update_data["domain"] = data.domain
    if data.prompt_sections is not None:
        update_data["prompt_sections"] = [s.model_dump() for s in data.prompt_sections]
    if data.skills is not None:
        update_data["skills"] = [s.model_dump() for s in data.skills]
    if data.config_schema is not None:
        update_data["config_schema"] = [p.model_dump() for p in data.config_schema]

    if not update_data:
        return get_archetype(archetype_id)

    resp = (
        client()
        .table("studio_archetypes")
        .update(update_data)
        .eq("id", archetype_id)
        .execute()
    )
    return resp.data[0] if resp.data else None


def delete_archetype(archetype_id: str) -> bool:
    """Delete an archetype. Returns True if deleted."""
    resp = (
        client()
        .table("studio_archetypes")
        .delete()
        .eq("id", archetype_id)
        .execute()
    )
    return bool(resp.data)


def create_agent_from_archetype(
    archetype_id: str,
    agent_id: str,
    display_name: str,
    tagline: str = "",
    description: str = "",
    avatar_color: str = "#58a6ff",
    agent_config: dict | None = None,
) -> dict:
    """Create a new agent from an archetype, scaffolding all prompt slots,
    skills, and config with defaults from the archetype."""
    from datetime import datetime, timezone

    archetype = get_archetype(archetype_id)
    if not archetype:
        raise ValueError(f"Archetype '{archetype_id}' not found")

    db = client()
    now = datetime.now(timezone.utc).isoformat()

    # Build default agent_config from archetype's config_schema
    default_config = {}
    for param in archetype.get("config_schema") or []:
        if param.get("default") is not None:
            default_config[param["key"]] = param["default"]
    # Merge any overrides
    if agent_config:
        default_config.update(agent_config)

    # 1. Create agent row
    agent_row = {
        "id": agent_id,
        "display_name": display_name,
        "tagline": tagline,
        "description": description or archetype.get("description", ""),
        "avatar_color": avatar_color,
        "domain": archetype["domain"],
        "status": "draft",
        "sort_order": 0,
        "archetype_id": archetype_id,
        "agent_config": default_config,
        "created_at": now,
        "updated_at": now,
    }
    resp = db.table("studio_agents").insert(agent_row).execute()
    agent = resp.data[0]

    # 2. Create prompt slots with initial published versions
    for idx, section in enumerate(archetype.get("prompt_sections") or []):
        slot_resp = db.table("studio_agent_prompts").insert({
            "agent_id": agent_id,
            "slug": section["slug"],
            "display_name": section["display_name"],
            "description": section.get("description", ""),
            "sort_order": idx,
        }).execute()
        slot_id = slot_resp.data[0]["id"]

        if section.get("default_content"):
            db.table("studio_agent_prompt_versions").insert({
                "prompt_id": slot_id,
                "content": section["default_content"],
                "variables": section.get("variables", []),
                "status": "published",
                "author": "archetype",
                "change_note": f"Default from archetype '{archetype_id}'",
            }).execute()

    # 3. Create skill assignments
    for skill in archetype.get("skills") or []:
        db.table("studio_agent_skills").upsert({
            "agent_id": agent_id,
            "skill_slug": skill["slug"],
            "enabled": skill.get("enabled_by_default", True),
            "config": skill.get("default_config", {}),
        }, on_conflict="agent_id,skill_slug").execute()

    # 4. Create default config sections (model, ui, interaction_rules)
    from app.studio.models import CONFIG_SECTION_MODELS
    for section_key, model_cls in CONFIG_SECTION_MODELS.items():
        db.table("studio_agent_config_sections").upsert({
            "agent_id": agent_id,
            "section": section_key,
            "data": model_cls().model_dump(),
        }, on_conflict="agent_id,section").execute()

    return agent


def clone_agent(
    source_agent_id: str,
    new_agent_id: str,
    display_name: str,
    tagline: str | None = None,
) -> dict:
    """Clone an existing agent, copying all prompts, config, and skills."""
    from datetime import datetime, timezone

    db = client()
    now = datetime.now(timezone.utc).isoformat()

    # Fetch source
    source_resp = db.table("studio_agents").select("*").eq("id", source_agent_id).execute()
    if not source_resp.data:
        raise ValueError(f"Source agent '{source_agent_id}' not found")
    source = source_resp.data[0]

    # Check no collision
    existing = db.table("studio_agents").select("id").eq("id", new_agent_id).execute()
    if existing.data:
        raise ValueError(f"Agent '{new_agent_id}' already exists")

    # 1. Create new agent row
    new_agent = {
        "id": new_agent_id,
        "display_name": display_name,
        "tagline": tagline if tagline is not None else source.get("tagline", ""),
        "description": source.get("description", ""),
        "icon_url": source.get("icon_url"),
        "avatar_color": source.get("avatar_color", "#58a6ff"),
        "domain": source.get("domain", "general"),
        "status": "draft",
        "sort_order": 0,
        "archetype_id": source.get("archetype_id"),
        "agent_config": source.get("agent_config", {}),
        "cloned_from": source_agent_id,
        "created_at": now,
        "updated_at": now,
    }
    resp = db.table("studio_agents").insert(new_agent).execute()
    agent = resp.data[0]

    # 2. Copy prompt slots and their latest published versions
    prompts = (
        db.table("studio_agent_prompts")
        .select("*")
        .eq("agent_id", source_agent_id)
        .order("sort_order")
        .execute()
        .data or []
    )
    for prompt in prompts:
        slot_resp = db.table("studio_agent_prompts").insert({
            "agent_id": new_agent_id,
            "slug": prompt["slug"],
            "display_name": prompt["display_name"],
            "description": prompt.get("description", ""),
            "sort_order": prompt["sort_order"],
        }).execute()
        new_slot_id = slot_resp.data[0]["id"]

        # Copy latest published version
        latest = (
            db.table("studio_agent_prompt_versions")
            .select("*")
            .eq("prompt_id", prompt["id"])
            .eq("status", "published")
            .order("version", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if latest:
            v = latest[0]
            db.table("studio_agent_prompt_versions").insert({
                "prompt_id": new_slot_id,
                "content": v["content"],
                "variables": v.get("variables", []),
                "status": "published",
                "author": "clone",
                "change_note": f"Cloned from {source_agent_id}",
            }).execute()

    # 3. Copy config sections
    configs = (
        db.table("studio_agent_config_sections")
        .select("*")
        .eq("agent_id", source_agent_id)
        .execute()
        .data or []
    )
    for cfg in configs:
        db.table("studio_agent_config_sections").upsert({
            "agent_id": new_agent_id,
            "section": cfg["section"],
            "data": cfg["data"],
        }, on_conflict="agent_id,section").execute()

    # 4. Copy skill assignments
    skills = (
        db.table("studio_agent_skills")
        .select("*")
        .eq("agent_id", source_agent_id)
        .execute()
        .data or []
    )
    for skill in skills:
        db.table("studio_agent_skills").upsert({
            "agent_id": new_agent_id,
            "skill_slug": skill["skill_slug"],
            "enabled": skill["enabled"],
            "config": skill.get("config", {}),
        }, on_conflict="agent_id,skill_slug").execute()

    return agent
