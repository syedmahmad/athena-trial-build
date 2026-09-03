"""
Studio Agent Executor — streams lessons from studio agents.

Loads the live deployment, composes the system prompt from pinned prompt
versions, calls Claude directly via the Anthropic SDK, and streams the
response using the <<<WHITEBOARD>>> format.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator

from app.utils.db import client
from app.utils.llm_client import anthropic_async_client
from app.studio.prompt_resolver import compose_system_prompt, build_runtime_context
from app.studio.skills.registry import get_agent_skills, get_skill


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_live_deployment(agent_id: str) -> dict | None:
    """Fetch the live deployment for an agent."""
    resp = (
        client()
        .table("studio_agent_deployments")
        .select("*")
        .eq("agent_id", agent_id)
        .eq("status", "live")
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def create_session(
    agent_id: str,
    deployment: dict,
    config_snapshot: dict,
    resolved_prompts: dict[str, str],
    skill_name: str,
    skill_description: str | None = None,
) -> str:
    """Create a studio_live_sessions row. Returns the session ID."""
    session_id = str(uuid.uuid4())
    row = {
        "id": session_id,
        "agent_id": agent_id,
        "deployment_id": deployment.get("id"),
        "skill_id": skill_name,
        "skill_name": skill_name,
        "skill_description": skill_description,
        "current_phase": "teaching",
        "started_at": _now_iso(),
        "agent_config_snapshot": config_snapshot,
        "resolved_prompts": resolved_prompts,
        "messages": [],
        "steps": [],
        "phases_completed": [],
        "metadata": {},
    }
    client().table("studio_live_sessions").insert(row).execute()
    return session_id


def complete_session(session_id: str) -> None:
    """Mark session as completed."""
    now = _now_iso()
    # Fetch started_at to compute duration
    resp = (
        client()
        .table("studio_live_sessions")
        .select("started_at")
        .eq("id", session_id)
        .execute()
    )
    duration_secs = None
    if resp.data:
        started = resp.data[0].get("started_at")
        if started:
            try:
                start_dt = datetime.fromisoformat(started.replace("Z", "+00:00"))
                duration_secs = int((datetime.now(timezone.utc) - start_dt).total_seconds())
            except (ValueError, TypeError):
                pass

    update: dict = {
        "completed_at": now,
        "current_phase": "complete",
    }
    if duration_secs is not None:
        update["duration_secs"] = duration_secs

    client().table("studio_live_sessions").update(update).eq("id", session_id).execute()


def _build_skills_prompt(agent_id: str) -> str:
    """Build a prompt section describing the agent's enabled skills."""
    agent_skills = get_agent_skills(agent_id)
    if not agent_skills:
        return ""

    lines = ["\n\n---\n\nYou have the following skills available:"]
    for skill_row in agent_skills:
        slug = skill_row.get("skill_slug", "")
        skill_def = get_skill(slug)
        if skill_def:
            lines.append(f"- {slug}: {skill_def.description}")
            if skill_def.prompt_template:
                lines.append(f"  Instructions: {skill_def.prompt_template}")

    lines.append(
        "\nWhen you want to trigger a quiz break, include <<<QUIZ>>> followed "
        "by a JSON object on the same line specifying the topic and difficulty, "
        'e.g.: <<<QUIZ>>>{"topic": "quadratic equations", "difficulty": "medium"}'
    )
    return "\n".join(lines)


def build_lesson_request(
    skill_name: str,
    skill_description: str | None = None,
    student_context: dict | None = None,
) -> str:
    """Build the user message for lesson generation.

    Includes all available student context from the triage handoff so
    the tutor agent knows what the student asked for.
    """
    parts = [f"Teach me about: {skill_name}"]

    if skill_description:
        parts.append(f"\nDescription: {skill_description}")

    if student_context:
        # Include ALL context fields — this is what the student told the triage agent
        ctx_lines = []
        for key, value in student_context.items():
            if value and key not in ("topic",):  # topic is already in skill_name
                label = key.replace("_", " ").title()
                ctx_lines.append(f"- {label}: {value}")
        if ctx_lines:
            parts.append("\n\nStudent context from triage conversation:")
            parts.extend(ctx_lines)

    return "\n".join(parts)


async def start_agent_lesson(
    agent_id: str,
    skill_name: str,
    skill_description: str | None = None,
    student_context: dict | None = None,
) -> tuple[AsyncGenerator[str, None], str]:
    """Start a lesson with a studio agent.

    Returns a tuple of (async_generator_of_text_chunks, session_id).
    Raises ValueError if no live deployment is found.
    """
    # 1. Load live deployment
    deployment = get_live_deployment(agent_id)
    if not deployment:
        raise ValueError(f"No live deployment found for agent '{agent_id}'")

    # 2. Compose system prompt
    # Build runtime context variables (skill_name, skill_description, etc.)
    context_vars: dict[str, str] = {
        "skill_name": skill_name,
        "skill_description": skill_description or "",
        "student_context": str(student_context or {}),
    }
    if student_context:
        for k, v in student_context.items():
            if isinstance(v, str):
                context_vars[k] = v

    system_prompt, resolved_prompts = compose_system_prompt(deployment, context_vars)

    if not system_prompt:
        raise ValueError(f"No prompts configured for agent '{agent_id}'")

    # Append skill-awareness to the system prompt
    skills_prompt = _build_skills_prompt(agent_id)
    if skills_prompt:
        system_prompt += skills_prompt

    # 3. Get model settings from config snapshot
    config = deployment.get("config_snapshot") or {}
    model_config = config.get("model", {})
    model = model_config.get("model", "claude-sonnet-4-5-20250929")
    max_tokens = model_config.get("max_tokens", 4096)

    # 4. Build user message
    user_msg = build_lesson_request(skill_name, skill_description, student_context)

    # 5. Create session in DB
    session_id = create_session(
        agent_id=agent_id,
        deployment=deployment,
        config_snapshot=config,
        resolved_prompts=resolved_prompts,
        skill_name=skill_name,
        skill_description=skill_description,
    )

    # 6. Stream from Claude (via Majordomo gateway — see app/utils/llm_client.py)
    async def stream() -> AsyncGenerator[str, None]:
        anthropic_client = anthropic_async_client(feature="studio-executor")
        async with anthropic_client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        ) as response:
            async for text in response.text_stream:
                yield text

        # 7. Mark session complete
        complete_session(session_id)

    return stream(), session_id


async def agent_lesson_chat(
    agent_id: str,
    session_id: str,
    question: str,
    lesson_summary: str,
    lesson_steps: list[dict] | None = None,
    history: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Follow-up chat within a studio agent lesson.

    Reuses the agent's system prompt but adds lesson context.
    """
    # Load the session's deployment info
    resp = (
        client()
        .table("studio_live_sessions")
        .select("agent_id, deployment_id, resolved_prompts, agent_config_snapshot")
        .eq("id", session_id)
        .execute()
    )
    if not resp.data:
        raise ValueError(f"Session '{session_id}' not found")

    session = resp.data[0]
    config = session.get("agent_config_snapshot") or {}
    model_config = config.get("model", {})
    model = model_config.get("model", "claude-sonnet-4-5-20250929")
    max_tokens = model_config.get("max_tokens", 4096)

    # Rebuild the system prompt from resolved prompts
    resolved_prompts = session.get("resolved_prompts") or {}
    system_prompt = "\n\n".join(resolved_prompts.values()) if resolved_prompts else ""

    # Append lesson context to system prompt
    lesson_context = f"\n\n---\n\nYou already taught a lesson. Here is the lesson summary:\n{lesson_summary}"
    if lesson_steps:
        lesson_context += f"\n\nLesson steps (whiteboard):\n{lesson_steps[:10]}"  # Limit for token budget
    system_prompt += lesson_context

    # Build messages
    messages: list[dict] = []
    if history:
        for msg in history:
            role = msg.get("role", "user")
            if role == "tutor":
                role = "assistant"
            messages.append({"role": role, "content": msg.get("content", "")})
    messages.append({"role": "user", "content": question})

    anthropic_client = anthropic_async_client(feature="studio-executor")
    async with anthropic_client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system_prompt,
        messages=messages,
    ) as response:
        async for text in response.text_stream:
            yield text
