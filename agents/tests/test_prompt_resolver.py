"""Tests for the Studio prompt template resolution engine."""

import pytest
from app.studio.prompt_resolver import (
    extract_variables,
    validate_template,
    resolve_prompt,
    _apply_defaults,
    build_runtime_context,
)


class TestExtractVariables:
    def test_no_variables(self):
        assert extract_variables("Hello world") == []

    def test_single_variable(self):
        assert extract_variables("Hello {{name}}") == ["name"]

    def test_multiple_variables(self):
        result = extract_variables("{{a}} and {{b}} and {{c}}")
        assert result == ["a", "b", "c"]

    def test_duplicate_variables_deduped(self):
        result = extract_variables("{{x}} and {{x}} again")
        assert result == ["x"]

    def test_preserves_order(self):
        result = extract_variables("{{zebra}} then {{alpha}}")
        assert result == ["zebra", "alpha"]

    def test_empty_string(self):
        assert extract_variables("") == []

    def test_whitespace_in_braces(self):
        result = extract_variables("{{ name }} and {{  age  }}")
        assert result == ["name", "age"]

    def test_underscores_in_name(self):
        result = extract_variables("{{skill_name}}")
        assert result == ["skill_name"]

    def test_single_braces_ignored(self):
        result = extract_variables("{not_a_var} and {{real_var}}")
        assert result == ["real_var"]


class TestValidateTemplate:
    def test_all_provided(self):
        is_valid, missing = validate_template(
            "Hello {{name}}", {"name": "Alice"}
        )
        assert is_valid is True
        assert missing == []

    def test_missing_variable(self):
        is_valid, missing = validate_template(
            "Hello {{name}} {{age}}", {"name": "Alice"}
        )
        assert is_valid is False
        assert missing == ["age"]

    def test_multiple_missing(self):
        is_valid, missing = validate_template(
            "{{a}} {{b}} {{c}}", {}
        )
        assert is_valid is False
        assert len(missing) == 3

    def test_no_variables_always_valid(self):
        is_valid, missing = validate_template("Hello world", {})
        assert is_valid is True
        assert missing == []

    def test_extra_variables_ok(self):
        is_valid, _ = validate_template(
            "Hello {{name}}", {"name": "Alice", "extra": "ignored"}
        )
        assert is_valid is True


class TestResolvePrompt:
    def test_basic_substitution(self):
        result = resolve_prompt("Hello {{name}}", {"name": "Alice"})
        assert result == "Hello Alice"

    def test_multiple_variables(self):
        result = resolve_prompt(
            "{{greeting}} {{name}}, welcome to {{place}}",
            {"greeting": "Hi", "name": "Bob", "place": "class"},
        )
        assert result == "Hi Bob, welcome to class"

    def test_repeated_variable(self):
        result = resolve_prompt("{{x}} + {{x}}", {"x": "a"})
        assert result == "a + a"

    def test_unknown_variable_left_as_is(self):
        result = resolve_prompt("Hello {{unknown}}", {})
        assert result == "Hello {{unknown}}"

    def test_no_variables_passthrough(self):
        result = resolve_prompt("No variables here", {})
        assert result == "No variables here"

    def test_empty_value(self):
        result = resolve_prompt("Hello {{name}}", {"name": ""})
        assert result == "Hello "

    def test_whitespace_in_braces(self):
        result = resolve_prompt("Hello {{ name }}", {"name": "Alice"})
        assert result == "Hello Alice"


class TestApplyDefaults:
    def test_applies_missing_defaults(self):
        result = _apply_defaults(
            {"a": "1"},
            [
                {"name": "a", "default": "X"},
                {"name": "b", "default": "Y"},
            ],
        )
        assert result == {"a": "1", "b": "Y"}

    def test_no_override_existing(self):
        result = _apply_defaults(
            {"x": "existing"},
            [{"name": "x", "default": "default"}],
        )
        assert result["x"] == "existing"

    def test_no_default_no_add(self):
        result = _apply_defaults({}, [{"name": "x"}])
        assert "x" not in result

    def test_none_default_not_added(self):
        result = _apply_defaults({}, [{"name": "x", "default": None}])
        assert "x" not in result

    def test_empty_everything(self):
        result = _apply_defaults({}, [])
        assert result == {}


class TestBuildRuntimeContext:
    def test_merges_defaults(self):
        result = build_runtime_context(
            {"skill_name": "Algebra"},
            [
                {"name": "skill_name", "default": "Math"},
                {"name": "domain", "default": "general"},
            ],
        )
        assert result == {"skill_name": "Algebra", "domain": "general"}

    def test_empty_vars_with_defaults(self):
        result = build_runtime_context(
            {},
            [{"name": "level", "default": "beginner"}],
        )
        assert result == {"level": "beginner"}
