"""
FastAPI router for the Studio agent registry.

All endpoints use the synchronous Supabase Python client.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.utils.db import client
from app.studio.triage import triage_chat_stream, HANDOFF_DELIMITER
from app.studio.executor import start_agent_lesson, agent_lesson_chat
from app.studio.events import record_event, get_session_events
from app.studio.report_agent import generate_session_report
from app.studio.pov_agent import update_student_pov, get_student_pov, list_student_povs
from app.studio.skills.quiz import (
    generate_quiz_batch,
    check_answer,
    adapt_difficulty,
    stream_whiteboard_explanation,
)
from app.studio.skills.registry import list_skills, get_agent_skills, get_agent_skill_config
from app.studio.archetypes import (
    list_archetypes as _list_archetypes,
    get_archetype as _get_archetype,
    create_archetype as _create_archetype,
    update_archetype as _update_archetype,
    delete_archetype as _delete_archetype,
    create_agent_from_archetype,
    clone_agent,
    ArchetypeCreate,
    ArchetypeUpdate,
)
from app.studio.models import (
    AgentCreate,
    AgentDetail,
    AgentSummary,
    AgentUpdate,
    ConfigSectionOut,
    ConfigSectionUpdate,
    CONFIG_SECTION_MODELS,
    DeploymentCreate,
    DeploymentOut,
    PromptSlotCreate,
    PromptSlotSummary,
    PromptSlotUpdate,
    PromptValidateRequest,
    PromptValidateResponse,
    PromptVersionCreate,
    PromptVersionOut,
    SessionDetail,
    SessionSummary,
)
from app.studio.prompt_resolver import extract_variables, resolve_prompt, validate_template

router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _get_agent_or_404(agent_id: str) -> dict:
    resp = client().table("studio_agents").select("*").eq("id", agent_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Agent '{agent_id}' not found")
    return resp.data[0]


def _get_prompt_slot(agent_id: str, slug: str) -> dict:
    resp = (
        client()
        .table("studio_agent_prompts")
        .select("*")
        .eq("agent_id", agent_id)
        .eq("slug", slug)
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=404,
            detail=f"Prompt slot '{slug}' not found for agent '{agent_id}'",
        )
    return resp.data[0]


def _get_latest_version(prompt_id: str) -> dict | None:
    resp = (
        client()
        .table("studio_agent_prompt_versions")
        .select("*")
        .eq("prompt_id", prompt_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def _next_version_number(prompt_id: str) -> int:
    latest = _get_latest_version(prompt_id)
    return (latest["version"] + 1) if latest else 1


def _next_deployment_version(agent_id: str) -> int:
    resp = (
        client()
        .table("studio_agent_deployments")
        .select("version")
        .eq("agent_id", agent_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]["version"] + 1
    return 1


# ─── Agent CRUD ───────────────────────────────────────────────────────────────


@router.get("", response_model=list[AgentSummary])
def list_agents(
    status: str | None = Query(None),
    domain: str | None = Query(None),
):
    """List all agents, optionally filtered by status or domain."""
    query = client().table("studio_agents").select(
        "id, display_name, tagline, icon_url, avatar_color, domain, status, sort_order, archetype_id, agent_config, cloned_from, created_at"
    )
    if status:
        query = query.eq("status", status)
    if domain:
        query = query.eq("domain", domain)
    query = query.order("sort_order")
    resp = query.execute()
    return resp.data or []


@router.get("/all-sessions", response_model=list[SessionSummary])
def list_all_sessions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List all sessions across all agents, paginated, newest first."""
    resp = (
        client()
        .table("studio_live_sessions")
        .select(
            "id, agent_id, deployment_id, skill_id, skill_name, title, subtitle, "
            "current_phase, started_at, completed_at, duration_secs, score"
        )
        .order("started_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return resp.data or []


# NOTE: routes with path params like /{agent_id} MUST come after
# static routes like /all-sessions to avoid FastAPI matching the
# static path as a parameter value.


class EventRecordRequest(BaseModel):
    session_id: str
    event_type: str
    event_data: dict = {}


@router.post("/events", status_code=201)
def record_event_early(body: EventRecordRequest):
    """Record a session interaction event (route placed before /{agent_id})."""
    record_event(body.session_id, body.event_type, body.event_data)
    return {"status": "ok"}


@router.get("/students")
def list_students_early():
    """List all students with POV documents (route placed before /{agent_id})."""
    return list_student_povs()


# ─── Skills Registry ─────────────────────────────────────────────────────────


@router.get("/skills")
def list_available_skills():
    """List all registered skill definitions."""
    return [
        {
            "slug": s.slug,
            "name": s.name,
            "description": s.description,
            "default_config": s.default_config,
        }
        for s in list_skills()
    ]


# ─── Archetypes ──────────────────────────────────────────────────────────────


@router.get("/archetypes")
def list_archetypes_endpoint():
    """List all archetypes with summary info."""
    return _list_archetypes()


@router.get("/archetypes/{archetype_id}")
def get_archetype_endpoint(archetype_id: str):
    """Get full archetype detail."""
    arch = _get_archetype(archetype_id)
    if not arch:
        raise HTTPException(status_code=404, detail=f"Archetype '{archetype_id}' not found")
    return arch


@router.post("/archetypes", status_code=201)
def create_archetype_endpoint(body: ArchetypeCreate):
    """Create a new archetype."""
    existing = _get_archetype(body.id)
    if existing:
        raise HTTPException(status_code=409, detail=f"Archetype '{body.id}' already exists")
    return _create_archetype(body)


@router.put("/archetypes/{archetype_id}")
def update_archetype_endpoint(archetype_id: str, body: ArchetypeUpdate):
    """Update an existing archetype."""
    existing = _get_archetype(archetype_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Archetype '{archetype_id}' not found")
    result = _update_archetype(archetype_id, body)
    if not result:
        raise HTTPException(status_code=500, detail="Failed to update archetype")
    return result


@router.delete("/archetypes/{archetype_id}", status_code=204)
def delete_archetype_endpoint(archetype_id: str):
    """Delete an archetype."""
    existing = _get_archetype(archetype_id)
    if not existing:
        raise HTTPException(status_code=404, detail=f"Archetype '{archetype_id}' not found")
    _delete_archetype(archetype_id)
    return None


# ─── Clone Agent ─────────────────────────────────────────────────────────────


class CloneAgentRequest(BaseModel):
    new_id: str
    display_name: str
    tagline: str | None = None


@router.post("/clone/{agent_id}", status_code=201)
def clone_agent_endpoint(agent_id: str, body: CloneAgentRequest):
    """Clone an existing agent into a new one."""
    try:
        return clone_agent(
            source_agent_id=agent_id,
            new_agent_id=body.new_id,
            display_name=body.display_name,
            tagline=body.tagline,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Agent Config (archetype-based) ─────────────────────────────────────────


@router.get("/agent-config/{agent_id}")
def get_agent_config(agent_id: str):
    """Get an agent's archetype-based config values."""
    agent = _get_agent_or_404(agent_id)
    archetype_id = agent.get("archetype_id")
    archetype = _get_archetype(archetype_id) if archetype_id else None

    return {
        "agent_config": agent.get("agent_config") or {},
        "config_schema": archetype.get("config_schema", []) if archetype else [],
        "archetype_id": archetype_id,
    }


class AgentConfigUpdateRequest(BaseModel):
    agent_config: dict


@router.put("/agent-config/{agent_id}")
def update_agent_config(agent_id: str, body: AgentConfigUpdateRequest):
    """Update an agent's archetype-based config values."""
    _get_agent_or_404(agent_id)
    resp = (
        client()
        .table("studio_agents")
        .update({"agent_config": body.agent_config, "updated_at": _now_iso()})
        .eq("id", agent_id)
        .execute()
    )
    return {"agent_config": resp.data[0]["agent_config"] if resp.data else body.agent_config}


class SkillEnableRequest(BaseModel):
    skill_slug: str
    config: dict = {}


@router.post("/skills/agent/{agent_id}")
def enable_skill_for_agent(agent_id: str, body: SkillEnableRequest):
    """Enable a skill for an agent with optional config overrides."""
    _get_agent_or_404(agent_id)
    row = {
        "agent_id": agent_id,
        "skill_slug": body.skill_slug,
        "enabled": True,
        "config": body.config,
    }
    resp = (
        client()
        .table("studio_agent_skills")
        .upsert(row, on_conflict="agent_id,skill_slug")
        .execute()
    )
    return resp.data[0] if resp.data else row


@router.get("/skills/agent/{agent_id}")
def list_agent_skills(agent_id: str):
    """Get all enabled skills for an agent."""
    _get_agent_or_404(agent_id)
    skills = get_agent_skills(agent_id)
    return skills


# ─── Quiz Skill ──────────────────────────────────────────────────────────────


class QuizGenerateRequest(BaseModel):
    topic: str
    count: int = 3
    difficulty: str = "medium"
    session_id: str | None = None
    agent_id: str | None = None


class QuizCheckRequest(BaseModel):
    question_id: str
    selected_option: int


class QuizNextDifficultyRequest(BaseModel):
    session_id: str


class QuizExplainRequest(BaseModel):
    question_id: str
    student_option: int | None = None


@router.post("/quiz/generate")
async def generate_quiz(body: QuizGenerateRequest):
    """Generate pre-validated quiz questions."""
    questions = await generate_quiz_batch(
        topic=body.topic,
        count=body.count,
        difficulty=body.difficulty,
        session_id=body.session_id,
        agent_id=body.agent_id,
    )
    return {"questions": questions}


@router.post("/quiz/check")
def check_quiz_answer(body: QuizCheckRequest):
    """Check a student's answer -- deterministic, no AI."""
    result = check_answer(body.question_id, body.selected_option)
    return result


@router.post("/quiz/next-difficulty")
def get_next_difficulty(body: QuizNextDifficultyRequest):
    """Get the recommended difficulty for the next question."""
    difficulty = adapt_difficulty(body.session_id)
    return {"difficulty": difficulty}


@router.post("/quiz/whiteboard-explain/stream")
async def quiz_whiteboard_explain(body: QuizExplainRequest):
    """Stream a whiteboard mini-lesson explaining a quiz question the student got wrong."""
    from main import stream_with_whiteboard

    async def event_generator():
        try:
            raw = stream_whiteboard_explanation(
                question_id=body.question_id,
                student_option=body.student_option,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except ValueError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{agent_id}", response_model=AgentDetail)
def get_agent(agent_id: str):
    """Get full agent detail including config sections and prompt slots."""
    agent = _get_agent_or_404(agent_id)

    # Fetch config sections
    config_resp = (
        client()
        .table("studio_agent_config_sections")
        .select("*")
        .eq("agent_id", agent_id)
        .execute()
    )
    config_sections = config_resp.data or []

    # Fetch prompt slots with latest versions
    prompts_resp = (
        client()
        .table("studio_agent_prompts")
        .select("*")
        .eq("agent_id", agent_id)
        .order("sort_order")
        .execute()
    )
    prompt_slots = prompts_resp.data or []

    prompts_with_versions: list[dict] = []
    for slot in prompt_slots:
        latest = _get_latest_version(slot["id"])
        prompts_with_versions.append({
            **slot,
            "latest_version": latest,
        })

    return {
        **agent,
        "config_sections": config_sections,
        "prompts": prompts_with_versions,
    }


@router.post("", response_model=AgentDetail, status_code=201)
def create_agent(body: AgentCreate):
    """Create a new agent with default config sections.

    If archetype_id is provided, delegates to create_agent_from_archetype
    which scaffolds prompt slots, skills, and config from the archetype.
    """
    # Check for ID collision
    existing = client().table("studio_agents").select("id").eq("id", body.id).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"Agent '{body.id}' already exists")

    # If archetype_id is provided, use archetype-based creation
    if body.archetype_id:
        try:
            agent = create_agent_from_archetype(
                archetype_id=body.archetype_id,
                agent_id=body.id,
                display_name=body.display_name,
                tagline=body.tagline,
                description=body.description,
                avatar_color=body.avatar_color or "#58a6ff",
                agent_config=body.agent_config,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        # Fetch full detail to return
        config_resp = (
            client()
            .table("studio_agent_config_sections")
            .select("*")
            .eq("agent_id", body.id)
            .execute()
        )
        prompts_resp = (
            client()
            .table("studio_agent_prompts")
            .select("*")
            .eq("agent_id", body.id)
            .order("sort_order")
            .execute()
        )
        prompt_slots = prompts_resp.data or []
        prompts_with_versions = []
        for slot in prompt_slots:
            latest = _get_latest_version(slot["id"])
            prompts_with_versions.append({**slot, "latest_version": latest})

        return {
            **agent,
            "config_sections": config_resp.data or [],
            "prompts": prompts_with_versions,
        }

    now = _now_iso()
    agent_data = {
        **body.model_dump(exclude={"archetype_id", "agent_config"}),
        "created_at": now,
        "updated_at": now,
    }
    resp = client().table("studio_agents").insert(agent_data).execute()
    agent = resp.data[0]

    # Create default config sections
    default_sections = [
        {"agent_id": body.id, "section": "model", "data": CONFIG_SECTION_MODELS["model"]().model_dump()},
        {"agent_id": body.id, "section": "ui", "data": CONFIG_SECTION_MODELS["ui"]().model_dump()},
        {"agent_id": body.id, "section": "interaction_rules", "data": CONFIG_SECTION_MODELS["interaction_rules"]().model_dump()},
    ]
    config_resp = client().table("studio_agent_config_sections").insert(default_sections).execute()
    config_sections = config_resp.data or []

    return {
        **agent,
        "config_sections": config_sections,
        "prompts": [],
    }


@router.put("/{agent_id}", response_model=AgentSummary)
def update_agent(agent_id: str, body: AgentUpdate):
    """Update agent metadata."""
    _get_agent_or_404(agent_id)

    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = _now_iso()
    resp = client().table("studio_agents").update(update_data).eq("id", agent_id).execute()
    return resp.data[0]


@router.delete("/{agent_id}", status_code=204)
def delete_agent(agent_id: str):
    """Soft-delete an agent by setting status to archived."""
    _get_agent_or_404(agent_id)
    client().table("studio_agents").update(
        {"status": "archived", "updated_at": _now_iso()}
    ).eq("id", agent_id).execute()
    return None


# ─── Prompt Management ────────────────────────────────────────────────────────


@router.get("/{agent_id}/prompts", response_model=list[PromptSlotSummary])
def list_prompts(agent_id: str):
    """List all prompt slots for an agent, with latest version."""
    _get_agent_or_404(agent_id)

    resp = (
        client()
        .table("studio_agent_prompts")
        .select("*")
        .eq("agent_id", agent_id)
        .order("sort_order")
        .execute()
    )
    slots = resp.data or []

    result = []
    for slot in slots:
        latest = _get_latest_version(slot["id"])
        result.append({**slot, "latest_version": latest})
    return result


@router.post("/{agent_id}/prompts", response_model=PromptSlotSummary, status_code=201)
def create_prompt_slot(agent_id: str, body: PromptSlotCreate):
    """Create a new prompt slot for an agent."""
    _get_agent_or_404(agent_id)

    # Check for slug collision
    existing = (
        client()
        .table("studio_agent_prompts")
        .select("id")
        .eq("agent_id", agent_id)
        .eq("slug", body.slug)
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=f"Prompt slot '{body.slug}' already exists for agent '{agent_id}'",
        )

    slot_data = {
        "agent_id": agent_id,
        **body.model_dump(),
    }
    resp = client().table("studio_agent_prompts").insert(slot_data).execute()
    slot = resp.data[0]
    return {**slot, "latest_version": None}


@router.put("/{agent_id}/prompts/{slug}", response_model=PromptSlotSummary)
def update_prompt_slot(agent_id: str, slug: str, body: PromptSlotUpdate):
    """Update a prompt slot's metadata."""
    slot = _get_prompt_slot(agent_id, slug)

    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    resp = (
        client()
        .table("studio_agent_prompts")
        .update(update_data)
        .eq("id", slot["id"])
        .execute()
    )
    updated_slot = resp.data[0]
    latest = _get_latest_version(updated_slot["id"])
    return {**updated_slot, "latest_version": latest}


@router.delete("/{agent_id}/prompts/{slug}", status_code=204)
def delete_prompt_slot(agent_id: str, slug: str):
    """Delete a prompt slot and all its versions."""
    slot = _get_prompt_slot(agent_id, slug)

    # Delete versions first
    client().table("studio_agent_prompt_versions").delete().eq("prompt_id", slot["id"]).execute()
    # Delete the slot
    client().table("studio_agent_prompts").delete().eq("id", slot["id"]).execute()
    return None


@router.get("/{agent_id}/prompts/{slug}/versions", response_model=list[PromptVersionOut])
def list_prompt_versions(agent_id: str, slug: str):
    """List all versions of a prompt slot, newest first."""
    slot = _get_prompt_slot(agent_id, slug)

    resp = (
        client()
        .table("studio_agent_prompt_versions")
        .select("*")
        .eq("prompt_id", slot["id"])
        .order("version", desc=True)
        .execute()
    )
    return resp.data or []


@router.post("/{agent_id}/prompts/{slug}/versions", response_model=PromptVersionOut, status_code=201)
def create_prompt_version(agent_id: str, slug: str, body: PromptVersionCreate):
    """Create a new version for a prompt slot."""
    slot = _get_prompt_slot(agent_id, slug)

    version_number = _next_version_number(slot["id"])
    version_data = {
        "prompt_id": slot["id"],
        "version": version_number,
        "content": body.content,
        "variables": [v.model_dump() for v in body.variables],
        "status": "draft",
        "author": body.author or None,
        "change_note": body.change_note or None,
    }
    resp = client().table("studio_agent_prompt_versions").insert(version_data).execute()
    return resp.data[0]


@router.get("/prompt-versions/{version_id}", response_model=PromptVersionOut)
def get_prompt_version(version_id: str):
    """Get a specific prompt version by ID."""
    resp = (
        client()
        .table("studio_agent_prompt_versions")
        .select("*")
        .eq("id", version_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Prompt version '{version_id}' not found")
    return resp.data[0]


@router.patch("/prompt-versions/{version_id}/publish", response_model=PromptVersionOut)
def publish_prompt_version(version_id: str):
    """Transition a prompt version from draft to published."""
    resp = (
        client()
        .table("studio_agent_prompt_versions")
        .select("*")
        .eq("id", version_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Prompt version '{version_id}' not found")

    version = resp.data[0]
    if version["status"] != "draft":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot publish version with status '{version['status']}' (must be 'draft')",
        )

    resp = (
        client()
        .table("studio_agent_prompt_versions")
        .update({"status": "published"})
        .eq("id", version_id)
        .execute()
    )
    return resp.data[0]


@router.patch("/prompt-versions/{version_id}/archive", response_model=PromptVersionOut)
def archive_prompt_version(version_id: str):
    """Transition a prompt version from published to archived."""
    resp = (
        client()
        .table("studio_agent_prompt_versions")
        .select("*")
        .eq("id", version_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Prompt version '{version_id}' not found")

    version = resp.data[0]
    if version["status"] != "published":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot archive version with status '{version['status']}' (must be 'published')",
        )

    resp = (
        client()
        .table("studio_agent_prompt_versions")
        .update({"status": "archived"})
        .eq("id", version_id)
        .execute()
    )
    return resp.data[0]


# ─── Config Sections ──────────────────────────────────────────────────────────


@router.get("/{agent_id}/config", response_model=list[ConfigSectionOut])
def list_config_sections(agent_id: str):
    """List all config sections for an agent."""
    _get_agent_or_404(agent_id)

    resp = (
        client()
        .table("studio_agent_config_sections")
        .select("*")
        .eq("agent_id", agent_id)
        .execute()
    )
    return resp.data or []


@router.get("/{agent_id}/config/{section}", response_model=ConfigSectionOut)
def get_config_section(agent_id: str, section: str):
    """Get a specific config section."""
    _get_agent_or_404(agent_id)

    resp = (
        client()
        .table("studio_agent_config_sections")
        .select("*")
        .eq("agent_id", agent_id)
        .eq("section", section)
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=404,
            detail=f"Config section '{section}' not found for agent '{agent_id}'",
        )
    return resp.data[0]


@router.put("/{agent_id}/config/{section}", response_model=ConfigSectionOut)
def update_config_section(agent_id: str, section: str, body: ConfigSectionUpdate):
    """Update a config section with Pydantic validation."""
    _get_agent_or_404(agent_id)

    # Validate against known section models
    if section in CONFIG_SECTION_MODELS:
        model_cls = CONFIG_SECTION_MODELS[section]
        try:
            model_cls.model_validate(body.data)
        except Exception as e:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid config data for section '{section}': {e}",
            )

    resp = (
        client()
        .table("studio_agent_config_sections")
        .upsert(
            {"agent_id": agent_id, "section": section, "data": body.data},
            on_conflict="agent_id,section",
        )
        .execute()
    )
    return resp.data[0]


# ─── Deployments ──────────────────────────────────────────────────────────────


@router.get("/{agent_id}/deployments", response_model=list[DeploymentOut])
def list_deployments(agent_id: str):
    """List all deployments for an agent, newest first."""
    _get_agent_or_404(agent_id)

    resp = (
        client()
        .table("studio_agent_deployments")
        .select("*")
        .eq("agent_id", agent_id)
        .order("version", desc=True)
        .execute()
    )
    return resp.data or []


@router.post("/{agent_id}/deployments", response_model=DeploymentOut, status_code=201)
def create_deployment(agent_id: str, body: DeploymentCreate):
    """Create a new deployment.

    Validates that all pinned versions exist and are published.
    Snapshots current config sections.
    """
    _get_agent_or_404(agent_id)

    # Validate prompt pins — all pinned versions must be published
    if body.prompt_pins:
        version_ids = list(body.prompt_pins.values())
        resp = (
            client()
            .table("studio_agent_prompt_versions")
            .select("id, status")
            .in_("id", version_ids)
            .execute()
        )
        found_versions = {row["id"]: row for row in (resp.data or [])}

        for slot_id, version_id in body.prompt_pins.items():
            if version_id not in found_versions:
                raise HTTPException(
                    status_code=400,
                    detail=f"Prompt version '{version_id}' not found",
                )
            if found_versions[version_id]["status"] != "published":
                raise HTTPException(
                    status_code=400,
                    detail=f"Prompt version '{version_id}' is not published (status: '{found_versions[version_id]['status']}')",
                )

    # Snapshot config
    config_resp = (
        client()
        .table("studio_agent_config_sections")
        .select("section, data")
        .eq("agent_id", agent_id)
        .execute()
    )
    config_snapshot = {row["section"]: row["data"] for row in (config_resp.data or [])}

    version_number = _next_deployment_version(agent_id)
    deployment_data = {
        "agent_id": agent_id,
        "version": version_number,
        "status": "staging",
        "prompt_pins": body.prompt_pins,
        "config_snapshot": config_snapshot,
        "change_note": body.change_note or None,
        "deployed_by": body.deployed_by or None,
    }
    resp = client().table("studio_agent_deployments").insert(deployment_data).execute()
    return resp.data[0]


@router.get("/deployments/{deployment_id}", response_model=DeploymentOut)
def get_deployment(deployment_id: str):
    """Get a specific deployment by ID."""
    resp = (
        client()
        .table("studio_agent_deployments")
        .select("*")
        .eq("id", deployment_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Deployment '{deployment_id}' not found")
    return resp.data[0]


@router.patch("/deployments/{deployment_id}/promote", response_model=DeploymentOut)
def promote_deployment(deployment_id: str):
    """Promote a staging deployment to live. Retires any existing live deployment."""
    resp = (
        client()
        .table("studio_agent_deployments")
        .select("*")
        .eq("id", deployment_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Deployment '{deployment_id}' not found")

    deployment = resp.data[0]
    if deployment["status"] != "staging":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot promote deployment with status '{deployment['status']}' (must be 'staging')",
        )

    now = _now_iso()

    # Retire current live deployment for this agent
    client().table("studio_agent_deployments").update(
        {"status": "retired", "retired_at": now}
    ).eq("agent_id", deployment["agent_id"]).eq("status", "live").execute()

    # Promote this deployment
    resp = (
        client()
        .table("studio_agent_deployments")
        .update({"status": "live", "promoted_at": now})
        .eq("id", deployment_id)
        .execute()
    )
    return resp.data[0]


@router.patch("/deployments/{deployment_id}/retire", response_model=DeploymentOut)
def retire_deployment(deployment_id: str):
    """Retire a live deployment."""
    resp = (
        client()
        .table("studio_agent_deployments")
        .select("*")
        .eq("id", deployment_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Deployment '{deployment_id}' not found")

    deployment = resp.data[0]
    if deployment["status"] != "live":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot retire deployment with status '{deployment['status']}' (must be 'live')",
        )

    resp = (
        client()
        .table("studio_agent_deployments")
        .update({"status": "retired", "retired_at": _now_iso()})
        .eq("id", deployment_id)
        .execute()
    )
    return resp.data[0]


@router.patch("/deployments/{deployment_id}/rollback", response_model=DeploymentOut)
def rollback_deployment(deployment_id: str):
    """Rollback: promote a retired deployment back to live (retires current live)."""
    resp = (
        client()
        .table("studio_agent_deployments")
        .select("*")
        .eq("id", deployment_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Deployment '{deployment_id}' not found")

    deployment = resp.data[0]
    if deployment["status"] != "retired":
        raise HTTPException(
            status_code=409,
            detail=f"Cannot rollback deployment with status '{deployment['status']}' (must be 'retired')",
        )

    now = _now_iso()

    # Retire current live deployment
    client().table("studio_agent_deployments").update(
        {"status": "retired", "retired_at": now}
    ).eq("agent_id", deployment["agent_id"]).eq("status", "live").execute()

    # Promote the retired deployment
    resp = (
        client()
        .table("studio_agent_deployments")
        .update({"status": "live", "promoted_at": now, "retired_at": None})
        .eq("id", deployment_id)
        .execute()
    )
    return resp.data[0]


# ─── Sessions (all-sessions route is defined at the top, before /{agent_id}) ─


@router.get("/{agent_id}/sessions", response_model=list[SessionSummary])
def list_sessions(
    agent_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List sessions for an agent, paginated, newest first."""
    _get_agent_or_404(agent_id)

    resp = (
        client()
        .table("studio_live_sessions")
        .select(
            "id, agent_id, deployment_id, skill_id, skill_name, title, subtitle, "
            "current_phase, started_at, completed_at, duration_secs, score"
        )
        .eq("agent_id", agent_id)
        .order("started_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return resp.data or []


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(session_id: str):
    """Get full session detail."""
    resp = (
        client()
        .table("studio_live_sessions")
        .select("*")
        .eq("id", session_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")
    return resp.data[0]


# ─── Validation ───────────────────────────────────────────────────────────────


@router.post("/{agent_id}/validate-prompt", response_model=PromptValidateResponse)
def validate_prompt(agent_id: str, body: PromptValidateRequest):
    """Validate and test-resolve a prompt template."""
    _get_agent_or_404(agent_id)

    extracted = extract_variables(body.content)
    is_valid, missing = validate_template(body.content, body.variables)

    error: str | None = None
    resolved = body.content
    try:
        resolved = resolve_prompt(body.content, body.variables)
    except Exception as e:
        error = str(e)
        is_valid = False

    return PromptValidateResponse(
        resolved=resolved,
        extracted_variables=extracted,
        missing_variables=missing,
        is_valid=is_valid,
        error=error,
    )


# ─── Triage Chat (SSE Streaming) ────────────────────────────────────────────


class TriageChatMessage(BaseModel):
    role: str
    content: str


class TriageAvailableAgent(BaseModel):
    id: str
    display_name: str
    tagline: str | None = None
    domain: str | None = None


class TriageChatRequest(BaseModel):
    message: str
    history: list[TriageChatMessage] = []
    available_agents: list[TriageAvailableAgent] = []


async def stream_with_handoff(raw_stream):
    """Parse a triage agent's mixed text+handoff stream into separate SSE events.

    Before <<<HANDOFF>>>: emit {"token": "..."} events.
    After <<<HANDOFF>>>: emit {"handoff": {...}} event with the parsed JSON.
    """
    state = "text"
    buffer = ""

    async for chunk in raw_stream:
        if state == "text":
            buffer += chunk

            if HANDOFF_DELIMITER in buffer:
                before, after = buffer.split(HANDOFF_DELIMITER, 1)
                text_to_send = before.rstrip("\n")
                if text_to_send:
                    yield f"data: {json.dumps({'token': text_to_send})}\n\n"
                state = "handoff"
                buffer = after
            else:
                # Hold back potential partial delimiter
                hold_back = 0
                for i in range(1, min(len(HANDOFF_DELIMITER), len(buffer) + 1)):
                    if buffer.endswith(HANDOFF_DELIMITER[:i]):
                        hold_back = i

                safe_end = len(buffer) - hold_back
                if safe_end > 0:
                    flush = buffer[:safe_end]
                    buffer = buffer[safe_end:]
                    yield f"data: {json.dumps({'token': flush})}\n\n"
        else:
            buffer += chunk

    # Flush remaining
    if state == "text" and buffer.strip():
        if HANDOFF_DELIMITER in buffer:
            before, after = buffer.split(HANDOFF_DELIMITER, 1)
            if before.strip():
                yield f"data: {json.dumps({'token': before.rstrip()})}\n\n"
            # Try to parse the JSON
            try:
                handoff_data = json.loads(after.strip())
                yield f"data: {json.dumps({'handoff': handoff_data})}\n\n"
            except json.JSONDecodeError:
                pass
        else:
            yield f"data: {json.dumps({'token': buffer})}\n\n"
    elif state == "handoff" and buffer.strip():
        try:
            handoff_data = json.loads(buffer.strip())
            yield f"data: {json.dumps({'handoff': handoff_data})}\n\n"
        except json.JSONDecodeError:
            # If JSON is incomplete, send as token
            yield f"data: {json.dumps({'token': buffer})}\n\n"

    yield "data: [DONE]\n\n"


@router.post("/triage/chat")
async def triage_chat_endpoint(req: TriageChatRequest):
    """SSE streaming endpoint for the triage/receptionist agent."""
    history = [m.model_dump() for m in req.history] if req.history else None
    agents = [a.model_dump() for a in req.available_agents] if req.available_agents else None

    async def event_generator():
        try:
            raw = triage_chat_stream(
                message=req.message,
                history=history,
                available_agents=agents,
            )
            async for event in stream_with_handoff(raw):
                yield event
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─── Session Report ──────────────────────────────────────────────────────────


class SessionReportRequest(BaseModel):
    score: float | None = None
    phases_completed: list[str] = []
    areas_of_struggle: list[str] = []
    recommendation: str | None = None
    summary: str | None = None


@router.post("/sessions/{session_id}/report")
def submit_session_report(session_id: str, body: SessionReportRequest):
    """Store a tutor's end-of-session report in the session metadata."""
    resp = (
        client()
        .table("studio_live_sessions")
        .select("id, metadata")
        .eq("id", session_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    existing_metadata = resp.data[0].get("metadata") or {}
    existing_metadata["report"] = body.model_dump()

    client().table("studio_live_sessions").update(
        {"metadata": existing_metadata, "completed_at": _now_iso()}
    ).eq("id", session_id).execute()

    return {"status": "ok"}


# ─── Session Events ──────────────────────────────────────────────────────────
# NOTE: EventRecordRequest and /events endpoint are defined above /{agent_id}
# for route ordering. The /sessions/{id}/events endpoint below is fine since
# it has a 2-segment path.
# See the version above /{agent_id} — this one is kept for reference only.
# @router.post("/events", status_code=201)
# def record_session_event(body: EventRecordRequest):
#     """Record a session interaction event."""
#     record_event(body.session_id, body.event_type, body.event_data)
#     return {"status": "ok"}


@router.get("/sessions/{session_id}/events")
def get_session_events_endpoint(session_id: str):
    """Get all events for a session, ordered chronologically."""
    events = get_session_events(session_id)
    return events


# ─── AI Session Reports ──────────────────────────────────────────────────────


@router.post("/sessions/{session_id}/ai-report")
def generate_ai_session_report(session_id: str):
    """Generate (or regenerate) an AI session report from interaction events."""
    # Verify session exists
    resp = (
        client()
        .table("studio_live_sessions")
        .select("id")
        .eq("id", session_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    report = generate_session_report(session_id)
    return {"report": report}


@router.get("/sessions/{session_id}/ai-report")
def get_ai_session_report(session_id: str):
    """Get existing AI report from session metadata."""
    resp = (
        client()
        .table("studio_live_sessions")
        .select("id, metadata")
        .eq("id", session_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    metadata = resp.data[0].get("metadata") or {}
    report = metadata.get("ai_report")
    if not report:
        raise HTTPException(status_code=404, detail="No AI report generated for this session")
    return {"report": report}


# ─── Student POV ─────────────────────────────────────────────────────────────


@router.get("/students")
def list_students():
    """List all students with POV documents."""
    return list_student_povs()


@router.get("/students/{student_id}/pov")
def get_student_pov_endpoint(student_id: str):
    """Get the student's POV markdown document."""
    pov = get_student_pov(student_id)
    if not pov:
        raise HTTPException(status_code=404, detail=f"No POV found for student '{student_id}'")
    return pov


class PovUpdateRequest(BaseModel):
    session_id: str | None = None


@router.post("/students/{student_id}/pov/update")
def update_student_pov_endpoint(student_id: str, body: PovUpdateRequest):
    """Trigger POV update from latest (or specified) session."""
    # Determine which session to use
    session_id = body.session_id
    if not session_id:
        # Use most recent session for this student
        resp = (
            client()
            .table("studio_live_sessions")
            .select("id")
            .eq("metadata->>student_id", student_id)
            .order("started_at", desc=True)
            .limit(1)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail=f"No sessions found for student '{student_id}'")
        session_id = resp.data[0]["id"]

    # Get or generate the AI report for this session
    session_resp = (
        client()
        .table("studio_live_sessions")
        .select("*")
        .eq("id", session_id)
        .execute()
    )
    if not session_resp.data:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    session = session_resp.data[0]
    metadata = session.get("metadata") or {}
    report = metadata.get("ai_report")

    if not report:
        # Generate report first
        report = generate_session_report(session_id)

    # Update POV
    updated_pov = update_student_pov(
        student_id=student_id,
        session_report=report,
        session_id=session_id,
        session_metadata=session,
    )
    return {"markdown": updated_pov}


# ─── Combined: Generate report + update POV ─────────────────────────────────


class SessionCompleteRequest(BaseModel):
    student_id: str


@router.post("/sessions/{session_id}/complete")
def complete_session_with_report(session_id: str, body: SessionCompleteRequest):
    """Generate report, then update student POV. Used at end of lesson."""
    # Verify session exists
    session_resp = (
        client()
        .table("studio_live_sessions")
        .select("*")
        .eq("id", session_id)
        .execute()
    )
    if not session_resp.data:
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found")

    session = session_resp.data[0]

    # 1. Generate AI report
    report = generate_session_report(session_id)

    # 2. Update student POV
    updated_pov = update_student_pov(
        student_id=body.student_id,
        session_report=report,
        session_id=session_id,
        session_metadata=session,
    )

    return {
        "report": report,
        "pov": updated_pov,
    }


# ─── Lesson Streaming ────────────────────────────────────────────────────────


class StudioLessonRequest(BaseModel):
    agent_id: str
    skill_name: str
    skill_description: str | None = None
    student_context: dict | None = None


class StudioLessonChatMessage(BaseModel):
    role: str
    content: str


class StudioLessonChatRequest(BaseModel):
    agent_id: str
    session_id: str
    question: str
    lesson_summary: str
    lesson_steps: list[dict] = []
    history: list[StudioLessonChatMessage] = []


@router.post("/lesson/stream")
async def studio_lesson_stream(req: StudioLessonRequest):
    """Stream a lesson from a studio agent. Uses <<<WHITEBOARD>>> format.

    Collects whiteboard steps during streaming and saves them to the
    session in DB after the stream completes, so sessions can be resumed.
    """
    from main import stream_with_whiteboard

    async def event_generator():
        collected_steps: list[dict] = []
        session_id: str | None = None
        try:
            raw_stream, sid = await start_agent_lesson(
                agent_id=req.agent_id,
                skill_name=req.skill_name,
                skill_description=req.skill_description,
                student_context=req.student_context,
            )
            session_id = sid
            # Emit session_id as first event
            yield f"data: {json.dumps({'session_id': session_id})}\n\n"
            async for event in stream_with_whiteboard(raw_stream):
                # Intercept wb_step events to collect them
                if event.startswith("data: ") and "wb_step" in event:
                    try:
                        payload = json.loads(event[6:].strip())
                        if "wb_step" in payload:
                            collected_steps.append(payload["wb_step"])
                    except (json.JSONDecodeError, ValueError):
                        pass
                yield event
        except ValueError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
        finally:
            # Save collected steps to session DB row
            if session_id and collected_steps:
                try:
                    client().table("studio_live_sessions").update(
                        {"steps": collected_steps}
                    ).eq("id", session_id).execute()
                except Exception:
                    pass  # non-fatal

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/lesson/chat/stream")
async def studio_lesson_chat_stream(req: StudioLessonChatRequest):
    """Follow-up chat within a studio agent lesson."""
    from main import stream_with_whiteboard

    history = [m.model_dump() for m in req.history] if req.history else None

    async def event_generator():
        try:
            raw = agent_lesson_chat(
                agent_id=req.agent_id,
                session_id=req.session_id,
                question=req.question,
                lesson_summary=req.lesson_summary,
                lesson_steps=req.lesson_steps or None,
                history=history,
            )
            async for event in stream_with_whiteboard(raw):
                yield event
        except ValueError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
