"""Tests for the /math-equiv endpoint (algebraic equivalence for the
fill_blank student-answer comparator).

The TS caller (`src/lib/answer-equivalence.ts`) only hits this endpoint
AFTER case-insensitive string equality and numeric equivalence have
already failed — these tests cover the algebra-only cases that path
exists to catch.
"""

import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client():
    return TestClient(app)


class TestExpressionEquivalence:
    """Bare expressions — no `=`."""

    def test_commutative_addition(self, client):
        r = client.post(
            "/math-equiv",
            json={"user": "4 + 2*x", "candidates": ["2*x + 4"]},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["equivalent"] is True
        assert body["matched"] == "2*x + 4"

    def test_implicit_multiplication(self, client):
        # `2x` should parse as `2*x` via implicit_multiplication transform
        r = client.post(
            "/math-equiv",
            json={"user": "2x + 4", "candidates": ["4 + 2x"]},
        )
        assert r.json()["equivalent"] is True

    def test_distribution(self, client):
        # `2(x + 2)` ≡ `2x + 4` (sympy expands automatically)
        r = client.post(
            "/math-equiv",
            json={"user": "2(x + 2)", "candidates": ["2*x + 4"]},
        )
        assert r.json()["equivalent"] is True

    def test_factoring(self, client):
        # `x^2 - 1` ≡ `(x-1)(x+1)`
        r = client.post(
            "/math-equiv",
            json={"user": "(x - 1)(x + 1)", "candidates": ["x^2 - 1"]},
        )
        assert r.json()["equivalent"] is True

    def test_fraction_simplification(self, client):
        # `6/4` ≡ `3/2` ≡ `1.5`
        r = client.post(
            "/math-equiv",
            json={"user": "6/4", "candidates": ["3/2"]},
        )
        assert r.json()["equivalent"] is True

    def test_clearly_different_rejected(self, client):
        r = client.post(
            "/math-equiv",
            json={"user": "2*x + 4", "candidates": ["3*x + 4"]},
        )
        body = r.json()
        assert body["equivalent"] is False
        assert body["matched"] is None


class TestEquationEquivalence:
    """Expressions with `=` (sympy parses into a `Relational`)."""

    def test_same_equation(self, client):
        r = client.post(
            "/math-equiv",
            json={"user": "x = 3", "candidates": ["x = 3"]},
        )
        assert r.json()["equivalent"] is True

    def test_side_swap(self, client):
        # `3 = x` ≡ `x = 3` — both sides flipped is the same equation.
        r = client.post(
            "/math-equiv",
            json={"user": "3 = x", "candidates": ["x = 3"]},
        )
        assert r.json()["equivalent"] is True

    def test_commutative_within_equation(self, client):
        # `4 + 2x = 10` ≡ `2x + 4 = 10`
        r = client.post(
            "/math-equiv",
            json={"user": "4 + 2x = 10", "candidates": ["2x + 4 = 10"]},
        )
        assert r.json()["equivalent"] is True


class TestMultipleCandidates:
    """The endpoint accepts a list of candidates and returns the first
    match — matches the IR's `acceptedAnswers: string[]` shape."""

    def test_picks_first_matching_candidate(self, client):
        r = client.post(
            "/math-equiv",
            json={
                "user": "0.5",
                "candidates": ["1/2", "0.5", "50%"],
            },
        )
        body = r.json()
        assert body["equivalent"] is True
        # 1/2 is also 0.5 numerically — sympy matches it first.
        assert body["matched"] in {"1/2", "0.5"}

    def test_no_match_among_many(self, client):
        r = client.post(
            "/math-equiv",
            json={
                "user": "x + 1",
                "candidates": ["x + 2", "x - 1", "2x"],
            },
        )
        assert r.json()["equivalent"] is False


class TestEdgeCases:
    def test_empty_user_rejected(self, client):
        r = client.post(
            "/math-equiv",
            json={"user": "", "candidates": ["x"]},
        )
        body = r.json()
        assert body["equivalent"] is False

    def test_whitespace_user_rejected(self, client):
        r = client.post(
            "/math-equiv",
            json={"user": "   ", "candidates": ["x"]},
        )
        assert r.json()["equivalent"] is False

    def test_empty_candidates_rejected(self, client):
        r = client.post(
            "/math-equiv",
            json={"user": "x", "candidates": []},
        )
        assert r.json()["equivalent"] is False

    def test_unparseable_user_flagged(self, client):
        # Literal English input — would fail in sympy parse_expr.
        r = client.post(
            "/math-equiv",
            json={"user": "i don't know", "candidates": ["x = 3"]},
        )
        body = r.json()
        assert body["equivalent"] is False
        # If sympy can't parse the user at all, we surface that so the
        # caller can decide whether to log/treat it differently.
        assert body["unparseable"] is True

    def test_latex_wrappers_stripped(self, client):
        # The shim's _strip_latex_wrappers handles \htmlClass / \textcolor.
        r = client.post(
            "/math-equiv",
            json={
                "user": "\\htmlClass{op-result}{3}",
                "candidates": ["3"],
            },
        )
        assert r.json()["equivalent"] is True
