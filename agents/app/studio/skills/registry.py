"""
Skill Registry — central registry for all studio agent skills.

Skills are code-defined capabilities. The DB stores which skills an agent has
and per-agent config, but new skill types require code changes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.utils.db import client


@dataclass
class SkillDefinition:
    slug: str
    name: str
    description: str
    default_config: dict[str, Any] = field(default_factory=dict)
    prompt_template: str = ""  # Instructions appended to agent prompt when active


_registry: dict[str, SkillDefinition] = {}


def register_skill(skill: SkillDefinition) -> None:
    """Register a skill definition in the in-memory registry."""
    _registry[skill.slug] = skill


def get_skill(slug: str) -> SkillDefinition | None:
    """Look up a skill definition by slug."""
    return _registry.get(slug)


def list_skills() -> list[SkillDefinition]:
    """Return all registered skill definitions."""
    return list(_registry.values())


def get_agent_skills(agent_id: str) -> list[dict]:
    """Get all enabled skills for an agent from DB."""
    resp = (
        client()
        .table("studio_agent_skills")
        .select("*")
        .eq("agent_id", agent_id)
        .eq("enabled", True)
        .execute()
    )
    return resp.data or []


def get_agent_skill_config(agent_id: str, skill_slug: str) -> dict:
    """Get merged config (defaults + overrides) for an agent's skill."""
    skill_def = get_skill(skill_slug)
    if not skill_def:
        return {}

    # Start with defaults
    config = dict(skill_def.default_config)

    # Merge agent-specific overrides from DB
    resp = (
        client()
        .table("studio_agent_skills")
        .select("config")
        .eq("agent_id", agent_id)
        .eq("skill_slug", skill_slug)
        .execute()
    )
    if resp.data and resp.data[0].get("config"):
        config.update(resp.data[0]["config"])

    return config


# ── Built-in skill registrations ──
# Import skill modules to trigger their register_skill() calls.
# This must happen at module load time so the registry is populated.

def _register_builtins() -> None:
    """Import built-in skill modules to populate the registry."""
    register_skill(SkillDefinition(
        slug="whiteboard_teaching",
        name="Whiteboard Teaching",
        description="Deliver lessons using the interactive whiteboard with step-by-step animations",
        default_config={
            "max_steps": 30,
            "include_check_ins": True,
            "include_predictions": True,
        },
        prompt_template=(
            "You have whiteboard teaching capability. Use <<<WHITEBOARD>>> "
            "delimiter followed by JSON Lines whiteboard steps to draw on the "
            "whiteboard and teach visually."
        ),
    ))

    # Import quiz skill — this calls register_skill() internally
    import app.studio.skills.quiz  # noqa: F401


_register_builtins()
