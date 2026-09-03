"""
Pydantic models for the Studio agent registry.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────


class AgentStatus(str, Enum):
    active = "active"
    draft = "draft"
    archived = "archived"


class PromptVersionStatus(str, Enum):
    draft = "draft"
    published = "published"
    archived = "archived"


class DeploymentStatus(str, Enum):
    staging = "staging"
    live = "live"
    retired = "retired"


# ─── Config Section Models ────────────────────────────────────────────────────


class ModelSettings(BaseModel):
    provider: str = "anthropic"
    model: str = "claude-sonnet-4-20250514"
    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float | None = None
    stop_sequences: list[str] = Field(default_factory=list)


class ChromeSettings(BaseModel):
    layout: str = "panel"
    theme: str = "default"
    show_steps: bool = True
    show_sources: bool = False


class ExtensionDeclaration(BaseModel):
    name: str
    enabled: bool = True
    config: dict[str, Any] = Field(default_factory=dict)


class UISettings(BaseModel):
    chrome: ChromeSettings = Field(default_factory=ChromeSettings)
    extensions: list[ExtensionDeclaration] = Field(default_factory=list)
    input_placeholder: str = "Ask me anything..."
    welcome_message: str | None = None


class InteractionRules(BaseModel):
    max_turns: int | None = None
    timeout_seconds: int | None = None
    allow_file_upload: bool = False
    allow_voice: bool = False
    require_authentication: bool = True
    rate_limit_per_minute: int | None = None


CONFIG_SECTION_MODELS: dict[str, type[BaseModel]] = {
    "model": ModelSettings,
    "ui": UISettings,
    "interaction_rules": InteractionRules,
}


# ─── Prompt Variable ─────────────────────────────────────────────────────────


class PromptVariable(BaseModel):
    name: str
    description: str = ""
    default: str | None = None
    required: bool = True


# ─── Agent CRUD ───────────────────────────────────────────────────────────────


class AgentCreate(BaseModel):
    id: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    display_name: str = Field(..., min_length=1, max_length=200)
    tagline: str = ""
    description: str = ""
    icon_url: str | None = None
    avatar_color: str | None = None
    domain: str | None = None
    status: AgentStatus = AgentStatus.draft
    sort_order: int = 0
    archetype_id: str | None = None
    agent_config: dict[str, Any] | None = None


class AgentUpdate(BaseModel):
    display_name: str | None = None
    tagline: str | None = None
    description: str | None = None
    icon_url: str | None = None
    avatar_color: str | None = None
    domain: str | None = None
    status: AgentStatus | None = None
    sort_order: int | None = None


class AgentSummary(BaseModel):
    id: str
    display_name: str
    tagline: str
    icon_url: str | None
    avatar_color: str | None
    domain: str | None
    status: str
    sort_order: int
    archetype_id: str | None = None
    agent_config: dict[str, Any] | None = None
    cloned_from: str | None = None
    created_at: str | None = None


class AgentDetail(BaseModel):
    id: str
    display_name: str
    tagline: str
    description: str
    icon_url: str | None
    avatar_color: str | None
    domain: str | None
    status: str
    sort_order: int
    archetype_id: str | None = None
    agent_config: dict[str, Any] | None = None
    cloned_from: str | None = None
    created_by: str | None
    created_at: str | None
    updated_at: str | None
    config_sections: list[ConfigSectionOut] = Field(default_factory=list)
    prompts: list[PromptSlotSummary] = Field(default_factory=list)


# ─── Prompt Models ────────────────────────────────────────────────────────────


class PromptSlotCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9_-]+$")
    display_name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    sort_order: int = 0


class PromptSlotUpdate(BaseModel):
    display_name: str | None = None
    description: str | None = None
    sort_order: int | None = None


class PromptVersionCreate(BaseModel):
    content: str = Field(..., min_length=1)
    variables: list[PromptVariable] = Field(default_factory=list)
    change_note: str = ""
    author: str = ""


class PromptVersionOut(BaseModel):
    id: str
    prompt_id: str
    version: int
    content: str
    variables: list[dict[str, Any]] | None = None
    status: str
    author: str | None
    change_note: str | None
    created_at: str | None = None


class PromptSlotSummary(BaseModel):
    id: str
    agent_id: str
    slug: str
    display_name: str
    description: str
    sort_order: int
    latest_version: PromptVersionOut | None = None


# ─── Config Models ────────────────────────────────────────────────────────────


class ConfigSectionUpdate(BaseModel):
    data: dict[str, Any]


class ConfigSectionOut(BaseModel):
    id: str
    agent_id: str
    section: str
    data: dict[str, Any]


# ─── Deployment Models ────────────────────────────────────────────────────────


class DeploymentCreate(BaseModel):
    prompt_pins: dict[str, str] = Field(
        default_factory=dict,
        description="Mapping of prompt_slot_id -> prompt_version_id",
    )
    change_note: str = ""
    deployed_by: str = ""


class DeploymentOut(BaseModel):
    id: str
    agent_id: str
    version: int
    status: str
    prompt_pins: dict[str, Any] | None = None
    config_snapshot: dict[str, Any] | None = None
    change_note: str | None
    deployed_by: str | None
    created_at: str | None = None
    promoted_at: str | None = None
    retired_at: str | None = None


# ─── Session Models ───────────────────────────────────────────────────────────


class SessionSummary(BaseModel):
    id: str
    agent_id: str
    deployment_id: str | None
    skill_id: str | None
    skill_name: str | None
    title: str | None
    subtitle: str | None
    current_phase: str | None
    started_at: str | None
    completed_at: str | None
    duration_secs: int | None
    score: float | None


class SessionDetail(BaseModel):
    id: str
    agent_id: str
    deployment_id: str | None
    skill_id: str | None
    skill_name: str | None
    skill_description: str | None
    agent_config_snapshot: dict[str, Any] | None
    resolved_prompts: dict[str, Any] | None
    messages: list[dict[str, Any]] | None
    steps: list[dict[str, Any]] | None
    current_phase: str | None
    phases_completed: list[str] | None
    title: str | None
    subtitle: str | None
    started_at: str | None
    completed_at: str | None
    duration_secs: int | None
    evaluator_run_id: str | None
    score: float | None
    metadata: dict[str, Any] | None


# ─── Validation Models ────────────────────────────────────────────────────────


class PromptValidateRequest(BaseModel):
    content: str
    variables: dict[str, str] = Field(default_factory=dict)


class PromptValidateResponse(BaseModel):
    resolved: str
    extracted_variables: list[str]
    missing_variables: list[str]
    is_valid: bool
    error: str | None = None
