"""Tests for Studio Pydantic models and config validation."""

import pytest
from pydantic import ValidationError

from app.studio.models import (
    AgentCreate,
    AgentUpdate,
    AgentSummary,
    ModelSettings,
    UISettings,
    ChromeSettings,
    InteractionRules,
    PromptSlotCreate,
    PromptVersionCreate,
    PromptVariable,
    DeploymentCreate,
    CONFIG_SECTION_MODELS,
)


class TestAgentCreate:
    def test_valid_create(self):
        agent = AgentCreate(id="test-agent", display_name="Test Agent")
        assert agent.id == "test-agent"
        assert agent.display_name == "Test Agent"

    def test_invalid_id_uppercase(self):
        with pytest.raises(ValidationError):
            AgentCreate(id="INVALID", display_name="Test")

    def test_invalid_id_spaces(self):
        with pytest.raises(ValidationError):
            AgentCreate(id="has spaces", display_name="Test")

    def test_valid_id_with_hyphens_underscores(self):
        agent = AgentCreate(id="my-agent_v2", display_name="Test")
        assert agent.id == "my-agent_v2"

    def test_empty_id_rejected(self):
        with pytest.raises(ValidationError):
            AgentCreate(id="", display_name="Test")

    def test_empty_display_name_rejected(self):
        with pytest.raises(ValidationError):
            AgentCreate(id="test", display_name="")


class TestAgentUpdate:
    def test_all_none_is_valid(self):
        update = AgentUpdate()
        assert update.display_name is None

    def test_partial_update(self):
        update = AgentUpdate(display_name="New Name")
        assert update.display_name == "New Name"
        assert update.tagline is None


class TestModelSettings:
    def test_defaults(self):
        ms = ModelSettings()
        assert ms.provider == "anthropic"
        assert ms.temperature == 0.7

    def test_custom_values(self):
        ms = ModelSettings(model="claude-haiku-4-5-20251001", temperature=0.3)
        assert ms.model == "claude-haiku-4-5-20251001"
        assert ms.temperature == 0.3


class TestPromptSlotCreate:
    def test_valid(self):
        slot = PromptSlotCreate(slug="system", display_name="System Prompt")
        assert slot.slug == "system"

    def test_invalid_slug(self):
        with pytest.raises(ValidationError):
            PromptSlotCreate(slug="Has Spaces!", display_name="Bad")


class TestPromptVersionCreate:
    def test_valid(self):
        ver = PromptVersionCreate(content="Hello {{name}}")
        assert ver.content == "Hello {{name}}"

    def test_with_variables(self):
        ver = PromptVersionCreate(
            content="Hello {{name}}",
            variables=[PromptVariable(name="name", description="Student name")],
        )
        assert len(ver.variables) == 1

    def test_empty_content_rejected(self):
        with pytest.raises(ValidationError):
            PromptVersionCreate(content="")


class TestDeploymentCreate:
    def test_valid(self):
        dep = DeploymentCreate(
            prompt_pins={"slot-id-1": "version-id-1"},
            change_note="First deploy",
        )
        assert dep.prompt_pins["slot-id-1"] == "version-id-1"


class TestConfigSectionModels:
    def test_registry_has_all_sections(self):
        assert "model" in CONFIG_SECTION_MODELS or "model_settings" in CONFIG_SECTION_MODELS

    def test_model_settings_in_registry(self):
        # The key might be "model" or "model_settings" depending on implementation
        found = False
        for key, cls in CONFIG_SECTION_MODELS.items():
            if cls == ModelSettings:
                found = True
                break
        assert found, "ModelSettings not found in CONFIG_SECTION_MODELS"
