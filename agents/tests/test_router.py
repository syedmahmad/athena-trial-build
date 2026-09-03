"""Tests for Studio router endpoints using mocked Supabase client."""

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch, PropertyMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def test_client():
    return TestClient(app)


class FakeResponse:
    """Mock Supabase query response."""
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count


class FakeQueryBuilder:
    """Mock Supabase query builder with chainable methods."""
    def __init__(self, data=None):
        self._data = data if data is not None else []

    def select(self, *args, **kwargs): return self
    def insert(self, data, **kwargs):
        self._data = [data] if not isinstance(data, list) else data
        return self
    def update(self, data, **kwargs):
        for row in self._data:
            if isinstance(row, dict):
                row.update(data)
        return self
    def upsert(self, data, **kwargs):
        self._data = [data] if not isinstance(data, list) else data
        return self
    def delete(self): return self
    def eq(self, *args): return self
    def neq(self, *args): return self
    def in_(self, *args): return self
    def order(self, *args, **kwargs): return self
    def limit(self, *args): return self
    def range(self, *args): return self
    def execute(self):
        return FakeResponse(data=list(self._data))


NOW = datetime.now(timezone.utc).isoformat()

def make_agent(id="test-agent", **kw):
    return {
        "id": id, "display_name": kw.get("display_name", "Test Agent"),
        "tagline": kw.get("tagline", "A test"), "description": "",
        "icon_url": None, "avatar_color": "#58a6ff",
        "domain": kw.get("domain", "general"), "status": kw.get("status", "active"),
        "sort_order": 0, "created_by": None, "created_at": NOW, "updated_at": NOW,
    }


class SmartMockClient:
    """A mock Supabase client that routes table() calls to pre-configured data."""

    def __init__(self):
        self._table_data: dict[str, list] = {}

    def set_table(self, name: str, data: list):
        self._table_data[name] = data

    def table(self, name: str):
        data = self._table_data.get(name, [])
        return FakeQueryBuilder(data)


@pytest.fixture
def mock_db():
    """Mock the Supabase client used by the router."""
    smart = SmartMockClient()
    # Default: agents table has a test agent
    smart.set_table("studio_agents", [make_agent("test")])
    smart.set_table("studio_agent_prompts", [])
    smart.set_table("studio_agent_prompt_versions", [])
    smart.set_table("studio_agent_config_sections", [])
    smart.set_table("studio_agent_deployments", [])
    smart.set_table("studio_live_sessions", [])

    with patch("app.studio.router.client", return_value=smart):
        yield smart


# ═══════════════════════════════════════════════════════════════════════════════
# AGENTS CRUD
# ═══════════════════════════════════════════════════════════════════════════════


class TestListAgents:
    def test_returns_agents(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("alice"), make_agent("bart")])
        resp = test_client.get("/studio/agents/")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_empty_list(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [])
        resp = test_client.get("/studio/agents/")
        assert resp.status_code == 200


class TestCreateAgent:
    def test_create_conflict(self, test_client, mock_db):
        # Agent already exists → 409
        mock_db.set_table("studio_agents", [make_agent("existing")])
        resp = test_client.post(
            "/studio/agents/",
            json={"id": "existing", "display_name": "Existing"},
        )
        assert resp.status_code == 409

    def test_create_invalid_id(self, test_client, mock_db):
        resp = test_client.post(
            "/studio/agents/",
            json={"id": "INVALID ID!", "display_name": "Bad"},
        )
        assert resp.status_code == 422


class TestGetAgent:
    def test_get_found(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("alice")])
        mock_db.set_table("studio_agent_config_sections", [
            {"id": str(uuid4()), "agent_id": "alice", "section": "model", "data": {}},
        ])
        mock_db.set_table("studio_agent_prompts", [])
        resp = test_client.get("/studio/agents/alice")
        assert resp.status_code == 200

    def test_get_not_found(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [])
        resp = test_client.get("/studio/agents/nonexistent")
        assert resp.status_code == 404


class TestUpdateAgent:
    def test_update(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("alice", display_name="Alice Updated")])
        resp = test_client.put(
            "/studio/agents/alice",
            json={"display_name": "Alice Updated"},
        )
        assert resp.status_code == 200


class TestDeleteAgent:
    def test_soft_delete(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("alice", status="archived")])
        resp = test_client.delete("/studio/agents/alice")
        assert resp.status_code in (200, 204)


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════


class TestPromptSlots:
    def test_list(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("test")])
        mock_db.set_table("studio_agent_prompts", [
            {"id": str(uuid4()), "agent_id": "test", "slug": "system",
             "display_name": "System", "description": "", "sort_order": 0,
             "created_at": NOW},
        ])
        resp = test_client.get("/studio/agents/test/prompts")
        assert resp.status_code == 200

    def test_create_conflict(self, test_client, mock_db):
        # Prompt slot already exists → 409
        mock_db.set_table("studio_agents", [make_agent("test")])
        mock_db.set_table("studio_agent_prompts", [
            {"id": str(uuid4()), "agent_id": "test", "slug": "system",
             "display_name": "System", "description": "", "sort_order": 0,
             "created_at": NOW},
        ])
        resp = test_client.post(
            "/studio/agents/test/prompts",
            json={"slug": "system", "display_name": "System"},
        )
        assert resp.status_code == 409


# ═══════════════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════════════


class TestConfigSections:
    def test_list(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("test")])
        mock_db.set_table("studio_agent_config_sections", [
            {"id": str(uuid4()), "agent_id": "test", "section": "model", "data": {"provider": "anthropic"}},
        ])
        resp = test_client.get("/studio/agents/test/config")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# DEPLOYMENTS
# ═══════════════════════════════════════════════════════════════════════════════


class TestDeployments:
    def test_list(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("test")])
        mock_db.set_table("studio_agent_deployments", [])
        resp = test_client.get("/studio/agents/test/deployments")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# SESSIONS
# ═══════════════════════════════════════════════════════════════════════════════


class TestSessions:
    def test_list(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("test")])
        mock_db.set_table("studio_live_sessions", [])
        resp = test_client.get("/studio/agents/test/sessions")
        assert resp.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════


class TestValidatePrompt:
    def test_valid(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("test")])
        resp = test_client.post(
            "/studio/agents/test/validate-prompt",
            json={"content": "Hello {{name}}", "variables": {"name": "Alice"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("is_valid") is True or data.get("resolved") is not None

    def test_missing_var(self, test_client, mock_db):
        mock_db.set_table("studio_agents", [make_agent("test")])
        resp = test_client.post(
            "/studio/agents/test/validate-prompt",
            json={"content": "Hello {{name}}", "variables": {}},
        )
        assert resp.status_code == 200
        data = resp.json()
        has_error = (
            data.get("is_valid") is False
            or len(data.get("missing_variables", [])) > 0
            or len(data.get("errors", [])) > 0
        )
        assert has_error
