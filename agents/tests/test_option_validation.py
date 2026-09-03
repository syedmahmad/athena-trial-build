"""Tests for the shared multiple-choice option validator.

Covers the three defects it exists to catch (duplicate, numerically-equal, and
symbolically-equivalent options) plus the structural answer-index check, and —
just as important — the cases it must NOT flag (prose, ratios, currency,
percentages, thousands separators, genuinely distinct values).
"""

from app.pre_generation.option_validation import (
    REASON_BAD_INDEX,
    REASON_DUPLICATE,
    REASON_MALFORMED,
    REASON_NUMERIC,
    REASON_SYMBOLIC,
    _looks_like_math,
    _try_parse_number,
    validate_problem_options,
)


def _reason(options, correct=0):
    ok, reason = validate_problem_options(options, correct)
    return ok, reason


class TestDuplicateOptions:
    def test_verbatim_duplicate(self):
        ok, reason = _reason(["3", "3", "4", "5"])
        assert ok is False
        assert reason.startswith(REASON_DUPLICATE)

    def test_whitespace_and_case_duplicate(self):
        ok, reason = _reason(["Cat ", "cat", "dog", "fish"])
        assert ok is False
        assert reason.startswith(REASON_DUPLICATE)


class TestNumericEquivalence:
    def test_half_as_fraction_and_decimal(self):
        # The exact bug the user reported: 0.5 and 1/2 both present.
        ok, reason = _reason(["1/2", "0.5", "3/4", "2/3"])
        assert ok is False
        assert reason.startswith(REASON_NUMERIC)

    def test_trailing_zero(self):
        ok, reason = _reason(["0.50", "0.5", "1", "2"])
        assert ok is False
        assert reason.startswith(REASON_NUMERIC)

    def test_percent_vs_decimal(self):
        ok, reason = _reason(["50%", "0.5", "1", "2"])
        assert ok is False
        assert reason.startswith(REASON_NUMERIC)

    def test_latex_frac_vs_decimal(self):
        ok, reason = _reason(["\\frac{1}{2}", "0.5", "1", "2"])
        assert ok is False
        assert reason.startswith(REASON_NUMERIC)

    def test_reduced_fraction(self):
        # 6/4 and 3/2 both equal 1.5.
        ok, reason = _reason(["6/4", "3/2", "1", "2"])
        assert ok is False
        assert reason.startswith(REASON_NUMERIC)

    def test_distinct_numbers_ok(self):
        ok, _ = _reason(["1/2", "1/3", "1/4", "1/5"])
        assert ok is True


class TestSymbolicEquivalence:
    def test_commutative_expression(self):
        ok, reason = _reason(["2x+4", "4+2x", "x+1", "x-1"])
        assert ok is False
        assert reason.startswith(REASON_SYMBOLIC)

    def test_equation_side_swap(self):
        ok, reason = _reason(["x=3", "3=x", "x=4", "x=5"])
        assert ok is False
        assert reason.startswith(REASON_SYMBOLIC)

    def test_factored_vs_expanded_flagged(self):
        # 2x(x+4) = 2(x^2+4x) = x(2x+8) — genuinely equivalent, must be caught.
        ok, reason = _reason(["2x(x + 4)", "2(x^2 + 4x)", "x(2x + 8)", "2x(x + 8)"])
        assert ok is False
        assert reason.startswith(REASON_SYMBOLIC)

    def test_latex_frac_with_variables_flagged(self):
        # $\frac{30x}{45x}$ = 2/3 — same value as $\frac{2}{3}$. Requires
        # stripping $ and expanding \frac before sympy sees it.
        ok, reason = _reason(
            ["$\\frac{2}{3}$", "$\\frac{30x}{45x}$", "$\\frac{1}{3}$", "$\\frac{3}{2}$"]
        )
        assert ok is False
        assert reason.startswith(REASON_SYMBOLIC)

    def test_dollar_wrapped_distinct_ok(self):
        ok, _ = _reason(["$2x + 4$", "$2x + 5$", "$2x + 6$", "$2x + 7$"])
        assert ok is True

    def test_distinct_expressions_ok(self):
        ok, _ = _reason(["2x+4", "2x+5", "2x+6", "2x+7"])
        assert ok is True

    def test_inequality_distractors_ok(self):
        # The classic SAT answer set — direction/strictness differ, so these
        # are DISTINCT even though lhs/rhs match. Must not be flagged.
        ok, _ = _reason(["x > 3", "x >= 3", "x < 3", "x <= 3"])
        assert ok is True

    def test_opposite_inequalities_ok(self):
        ok, _ = _reason(["\\lambda < 0", "\\lambda > 0", "\\lambda = 0", "\\lambda \\neq 0"])
        assert ok is True

    def test_different_factorizations_unicode_minus_ok(self):
        # Uses unicode minus; the factorizations are genuinely different once
        # the minus is normalized (they only "collapse" if − is dropped).
        ok, _ = _reason(
            ["(x − 3)(x − 4)", "(x + 3)(x + 4)", "(x − 2)(x − 6)", "(x − 1)(x − 12)"]
        )
        assert ok is True

    def test_subscript_variables_ok(self):
        # Slope-formula distractors: y2/y1/x2/x1 are subscript names, not 2*y.
        ok, _ = _reason(
            [
                "m = (y2 - y1) / (x2 - x1)",
                "m = (x2 - x1) / (y2 - y1)",
                "m = (y2 + y1) / (x2 + x1)",
                "m = (x2 + x1) / (y2 - y1)",
            ]
        )
        assert ok is True

    def test_skip_symbolic_flag(self):
        # With the symbolic pass off, an algebraic-only duplicate slips through.
        ok, _ = validate_problem_options(
            ["2x+4", "4+2x", "x+1", "x-1"], 0, skip_symbolic=True
        )
        assert ok is True


class TestBadCorrectOption:
    def test_out_of_range(self):
        ok, reason = _reason(["a", "b", "c", "d"], correct=4)
        assert ok is False
        assert reason.startswith(REASON_BAD_INDEX)

    def test_bool_rejected(self):
        # bool is an int subclass — must not be accepted as an index.
        ok, reason = validate_problem_options(["a", "b", "c", "d"], True)
        assert ok is False
        assert reason.startswith(REASON_BAD_INDEX)

    def test_none_rejected(self):
        ok, reason = validate_problem_options(["a", "b", "c", "d"], None)
        assert ok is False
        assert reason.startswith(REASON_BAD_INDEX)


class TestMalformed:
    def test_too_few_options(self):
        ok, reason = _reason(["only one"])
        assert ok is False
        assert reason.startswith(REASON_MALFORMED)

    def test_empty_option(self):
        ok, reason = _reason(["", "b", "c", "d"])
        assert ok is False
        assert reason.startswith(REASON_MALFORMED)


class TestProseAndNotationNotFlagged:
    """The dangerous false positives: prose that sympy would mangle, and
    numeric-looking notation that isn't a single value."""

    def test_prose_anagram_ok(self):
        # "cat sat" and "sat cat" become the same sympy product — must be
        # excluded by the _looks_like_math gate, not flagged.
        ok, _ = _reason(["cat sat", "sat cat", "dog ran", "fish swam"])
        assert ok is True

    def test_prose_homophones_ok(self):
        ok, _ = _reason(["affect", "effect", "accept", "except"])
        assert ok is True

    def test_ratios_ok(self):
        ok, _ = _reason(["3:2", "2:3", "1:1", "4:5"])
        assert ok is True

    def test_currency_ok(self):
        ok, _ = _reason(["\\$5", "\\$6", "\\$7", "\\$8"])
        assert ok is True

    def test_percentages_ok(self):
        ok, _ = _reason(["25%", "50%", "75%", "100%"])
        assert ok is True

    def test_thousands_separator_ok(self):
        ok, _ = _reason(["1,000", "2,000", "3,000", "4,000"])
        assert ok is True

    def test_plain_numbers_ok(self):
        ok, _ = _reason(["3", "4", "5", "6"])
        assert ok is True

    def test_number_sequences_ok(self):
        # "0 1 2 3" and "0 1 2" both collapse to 0 under implicit
        # multiplication — they must NOT be flagged as symbolically equal.
        ok, _ = _reason(["0 1 2 3", "0 1 2", "1 2 3", "0 0 0"])
        assert ok is True

    def test_code_equality_vs_assignment_ok(self):
        # A coding question: == (comparison) vs = (assignment) are different.
        ok, _ = _reason(["x == 10", "x = 10", "int x = 10", "x := 10"])
        assert ok is True

    def test_worksheet_fillins_ok(self):
        # Fill-in worksheet expressions ("= __", x as a times sign).
        ok, _ = _reason(
            [
                "(405 x 3) / (15 x 3) = __",
                "(405 x 10) / (15 x 10) = __",
                "(300 + 105) / (10 + 5) = __",
                "(400 + 5) / 15 = __",
            ]
        )
        assert ok is True


class TestHelpers:
    def test_parse_number_forms(self):
        assert _try_parse_number("1/2") == 0.5
        assert _try_parse_number("0.50") == 0.5
        assert _try_parse_number("50%") == 0.5
        assert _try_parse_number("\\$5") == 5.0
        assert _try_parse_number("1,000") == 1000.0
        assert _try_parse_number("\\frac{3}{4}") == 0.75
        # Ambiguous / non-numeric → None
        assert _try_parse_number("3:2") is None
        assert _try_parse_number("1 1/2") is None
        assert _try_parse_number("x") is None
        assert _try_parse_number("cat") is None
        assert _try_parse_number("1/0") is None

    def test_looks_like_math_gate(self):
        assert _looks_like_math("2x+4") is True
        assert _looks_like_math("x=3") is True
        assert _looks_like_math("(x-1)(x+1)") is True
        assert _looks_like_math("3:2") is False  # ratio, not an expression
        assert _looks_like_math("0 1 2 3") is False  # sequence
        assert _looks_like_math("x == 10") is False  # code
        assert _looks_like_math("cat") is False
        assert _looks_like_math("sat cat") is False
        assert _looks_like_math("affect") is False
