"""Tests for the mentor structured solve path (MENTOR_TOOL_USE).

These are offline, pure-function tests — they exercise the schema, the
intent pre-filter, the reused IR flattening, and the render helper with a
fake agent. No gateway / network. We force MAJORDOMO_ENABLED=0 before
importing so the module-level agent singletons construct without a key.
"""

import os

os.environ["MAJORDOMO_ENABLED"] = "0"  # offline: no gateway/key for these tests

import json

import pytest

import main
from app.run_time.sat.micro_lesson_agent import (
    StepUnit,
    TripletUnit,
    _flatten_units_to_steps,
    _parse_function_label_to_evaluator,
)
from app.run_time.sat.mentor_agent import _densify_coord_plane_functions
from app.run_time.sat.mentor_agent import (
    MentorSolveOutput,
    _looks_like_solve_request,
    _render_mentor_solve,
    _strip_math_for_narration,
)


def _phase(name: str) -> dict:
    return {"narration": f"{name} step", "displayText": f"{name} step $x$"}


def make_triplet(
    operation: str = "subtract",
    operand: str = "5",
    before: str = "3*x + 5 = 14",
    applied: str = "3*x + 5 - 5 = 14 - 5",
    simplified: str = "3*x = 9",
) -> TripletUnit:
    return TripletUnit(
        operation=operation,
        operand=operand,
        exprBefore=before,
        exprAfterApplied=applied,
        exprAfterSimplified=simplified,
        apply=_phase("apply"),
        collapse=_phase("collapse"),
        state=_phase("state"),
    )


# ── Schema ───────────────────────────────────────────────────────────────


class TestMentorSolveOutput:
    def test_allows_empty_units(self):
        """Must NOT inherit LessonOutputSchema's min_length=8."""
        out = MentorSolveOutput(reply_text="Let's work through it.", units=[])
        assert out.units == []

    def test_units_defaults_to_empty(self):
        out = MentorSolveOutput(reply_text="hi")
        assert out.units == []

    def test_accepts_two_triplets(self):
        out = MentorSolveOutput(
            reply_text="Here's how to solve it.",
            units=[
                make_triplet(),
                make_triplet(
                    operation="divide",
                    operand="3",
                    before="3*x = 9",
                    applied="3*x / 3 = 9 / 3",
                    simplified="x = 3",
                ),
            ],
        )
        assert len(out.units) == 2
        assert out.units[0].operation == "subtract"


# ── Intent pre-filter ──────────────────────────────────────────────────────


class TestLooksLikeSolveRequest:
    @pytest.mark.parametrize(
        "text",
        [
            "solve 3x + 5 = 14",
            "can you simplify this expression",
            "factor x^2 - 9",
            "2x = 6",
            "walk me through it step by step",
        ],
    )
    def test_positive(self, text):
        assert _looks_like_solve_request(text) is True

    @pytest.mark.parametrize(
        "text",
        [
            "how am I doing?",
            "what should I study next?",
            "I'm feeling discouraged",
            "thanks!",
            "tell me about slope",
        ],
    )
    def test_negative(self, text):
        assert _looks_like_solve_request(text) is False


def test_strip_math_for_narration():
    out = _strip_math_for_narration("The answer is $x=3$.")
    assert "$" not in out and "\\" not in out and "{" not in out
    # Collapses the gap left by the removed math span.
    assert _strip_math_for_narration("We get $x = 3$ here") == "We get here"


# ── Flattening: triplets carry groupId + phase, leading step is write_text ──


class TestFlattenTriplets:
    def test_leading_write_text_then_triplet_phases(self):
        units = [
            StepUnit(operation="setup", narration="intro", displayText="intro"),
            make_triplet(),
            make_triplet(
                operation="divide",
                operand="3",
                before="3*x = 9",
                applied="3*x / 3 = 9 / 3",
                simplified="x = 3",
            ),
        ]
        lines = _flatten_units_to_steps(units)
        steps = [json.loads(line) for line in lines]

        # Leading step renders as write_text.
        assert steps[0]["action"]["type"] == "write_text"

        # Each triplet expands to apply/collapse/state under one groupId.
        gids = {s.get("operationGroupId") for s in steps if s.get("operationGroupId")}
        assert gids == {"g1", "g2"}

        g1 = [s for s in steps if s.get("operationGroupId") == "g1"]
        phases = [s.get("phase") for s in g1]
        assert phases == ["apply", "collapse", "state"]
        # apply/collapse/state carry the algebra the renderer/eval read.
        assert g1[0]["exprBefore"] == "3*x + 5 = 14"
        assert all(s["action"]["type"] == "write_math" for s in g1)


# ── Round-trip: triplet fields survive main._extract_steps (the SSE parser) ─


def test_extract_steps_preserves_triplet_fields():
    lines = _flatten_units_to_steps([make_triplet()])
    parsed = main._extract_steps("\n".join(lines))
    apply_step = next(s for s in parsed if s.get("phase") == "apply")
    assert apply_step["operationGroupId"] == "g1"
    assert apply_step["exprBefore"] == "3*x + 5 = 14"
    # _extract_steps applies the streaming defaults.
    assert "durationMs" in apply_step and "delayMs" in apply_step


# ── Render helper: prepends reply, falls back on empty units ────────────────


class _FakeRunOutput:
    def __init__(self, content):
        self.content = content


class _FakeAgent:
    def __init__(self, output):
        self._output = output
        self.calls = 0

    async def arun(self, prompt, *, stream=False, output_schema=None):
        self.calls += 1
        return _FakeRunOutput(self._output)


@pytest.mark.asyncio
async def test_render_prepends_reply_as_write_text():
    out = MentorSolveOutput(
        reply_text="Let's solve it together.",
        units=[make_triplet()],
    )
    lines = await _render_mentor_solve("prompt", _FakeAgent(out))
    assert lines is not None
    steps = [json.loads(line) for line in lines]
    assert steps[0]["action"]["type"] == "write_text"
    assert "solve it together" in steps[0]["action"]["text"]
    # Followed by the triplet phases.
    assert [s.get("phase") for s in steps if s.get("operationGroupId") == "g1"] == [
        "apply",
        "collapse",
        "state",
    ]


@pytest.mark.asyncio
async def test_render_empty_units_returns_none():
    out = MentorSolveOutput(reply_text="No math here.", units=[])
    lines = await _render_mentor_solve("prompt", _FakeAgent(out))
    assert lines is None


# ── Coord-plane densify: Unicode-superscript labels parse + densify ─────────


class TestCoordPlaneDensify:
    @pytest.mark.parametrize(
        "label",
        ["y = x^2 + 4x + 3", "y = x² + 4x + 3", "y = x²+4x+3", "y = 2x² − 4x − 6"],
    )
    def test_label_parses(self, label):
        # The model authors pretty Unicode (x², minus sign) for display;
        # the parser must still evaluate it (else densify silently skips).
        assert _parse_function_label_to_evaluator(label) is not None

    def test_densify_unicode_label_sparse_points(self):
        # Sparse, on-curve author points + a Unicode-² label → densified to
        # a full on-curve set (the spline-wiggle regression).
        step = {
            "action": {
                "type": "coordinate_plane",
                "xRange": [-6, 3],
                "yRange": [-3, 6],
                "elements": [
                    {
                        "type": "function",
                        "label": "y = x² + 4x + 3",
                        "points": [[-6, 15], [-2, -1], [3, 24]],
                    }
                ],
            }
        }
        out = _densify_coord_plane_functions([json.dumps(step)])
        el = json.loads(out[0])["action"]["elements"][0]
        f = lambda x: x * x + 4 * x + 3  # noqa: E731
        pts = el["points"]
        assert len(pts) >= 25
        assert all(abs(p[1] - f(p[0])) <= 0.05 for p in pts)
