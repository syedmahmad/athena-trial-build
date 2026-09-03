"""
Prompt template resolution for the Studio agent registry.

Handles variable extraction, validation, and runtime composition
of system prompts from pinned prompt versions.
"""

from __future__ import annotations

import re
from typing import Any


# Template variable pattern: {{variable_name}}
VARIABLE_PATTERN = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")


def extract_variables(template: str) -> list[str]:
    """Extract all variable names from a prompt template."""
    return list(dict.fromkeys(VARIABLE_PATTERN.findall(template)))


def validate_template(template: str, provided_vars: dict[str, str]) -> tuple[bool, list[str]]:
    """Validate that all required variables are provided.

    Returns (is_valid, missing_variables).
    """
    required = extract_variables(template)
    missing = [v for v in required if v not in provided_vars]
    return len(missing) == 0, missing


def resolve_prompt(template: str, variables: dict[str, str]) -> str:
    """Resolve a prompt template by substituting variables.

    Variables use the {{variable_name}} syntax.
    Unknown variables are left as-is.
    """

    def replacer(match: re.Match) -> str:
        var_name = match.group(1).strip()
        return variables.get(var_name, match.group(0))

    return VARIABLE_PATTERN.sub(replacer, template)


def _apply_defaults(
    variables: dict[str, str],
    variable_defs: list[dict[str, Any]],
) -> dict[str, str]:
    """Merge provided variables with defaults from variable definitions."""
    result = dict(variables)
    for vdef in variable_defs:
        name = vdef.get("name", "")
        if name and name not in result and vdef.get("default") is not None:
            result[name] = vdef["default"]
    return result


def build_runtime_context(
    variables: dict[str, str],
    variable_defs: list[dict[str, Any]],
) -> dict[str, str]:
    """Build the full runtime variable context by applying defaults."""
    return _apply_defaults(variables, variable_defs)


def compose_system_prompt(
    deployment: dict,
    context: dict[str, str],
) -> tuple[str, dict[str, str]]:
    """Compose the full system prompt for a deployment.

    Fetches all pinned prompt versions from Supabase, resolves their
    templates with the provided context, and concatenates them in
    sort_order.

    Args:
        deployment: A deployment dict with prompt_pins and agent_id.
        context: Runtime variables to substitute into templates.

    Returns:
        A tuple of (resolved_system_prompt, resolved_prompts_map) where
        resolved_prompts_map is {prompt_slug: resolved_content}.
    """
    from app.utils.db import client

    prompt_pins = deployment.get("prompt_pins") or {}
    if not prompt_pins:
        return "", {}

    # Fetch all pinned versions
    version_ids = list(prompt_pins.values())
    resp = (
        client()
        .table("studio_agent_prompt_versions")
        .select("id, prompt_id, content, variables")
        .in_("id", version_ids)
        .execute()
    )
    versions_by_id = {row["id"]: row for row in (resp.data or [])}

    # Fetch prompt slots for ordering and slug mapping
    prompt_ids = list(prompt_pins.keys())
    resp = (
        client()
        .table("studio_agent_prompts")
        .select("id, slug, sort_order")
        .in_("id", prompt_ids)
        .order("sort_order")
        .execute()
    )
    prompt_slots = resp.data or []

    resolved_parts: list[str] = []
    resolved_map: dict[str, str] = {}

    for slot in prompt_slots:
        slot_id = slot["id"]
        version_id = prompt_pins.get(slot_id)
        if not version_id:
            continue
        version = versions_by_id.get(version_id)
        if not version:
            continue

        # Apply defaults from variable definitions
        variable_defs = version.get("variables") or []
        full_context = build_runtime_context(context, variable_defs)

        # Resolve the template
        resolved = resolve_prompt(version["content"], full_context)
        resolved_parts.append(resolved)
        resolved_map[slot["slug"]] = resolved

    system_prompt = "\n\n".join(resolved_parts)
    return system_prompt, resolved_map
