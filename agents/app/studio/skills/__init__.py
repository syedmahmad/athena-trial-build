"""
Studio Skills — composable capabilities for studio agents.

Each skill bundles a prompt template, a backend tool, and a frontend UI component.
Skills are registered in the skill registry and can be enabled/disabled per agent.
"""

from app.studio.skills.registry import (
    SkillDefinition,
    register_skill,
    get_skill,
    list_skills,
    get_agent_skills,
)

__all__ = [
    "SkillDefinition",
    "register_skill",
    "get_skill",
    "list_skills",
    "get_agent_skills",
]
