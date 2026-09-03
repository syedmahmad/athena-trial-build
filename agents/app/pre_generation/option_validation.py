"""Shared validation for multiple-choice answer options.

Catches the three ways a generated problem can ship a broken answer set:

  1. Duplicate options   — the same choice appears twice (verbatim or after
     whitespace/case normalization).
  2. Numerically-equal options — e.g. both ``0.5`` and ``1/2`` present, so a
     student who picks the equivalent form is graded wrong even though it is
     the same value.
  3. Symbolically-equivalent options — e.g. ``2x+4`` and ``4+2x``, ``x=3`` and
     ``3=x`` — the same expression written differently.

Plus a structural check that ``correct_option`` is a real integer index into
``options``.

The heavy lifting for (3) reuses ``eval_math_shim.task_equivalence`` — the same
sympy-backed comparator the offline evaluator and the ``/math-equiv`` endpoint
use. That comparator FALSE-POSITIVES on prose (implicit multiplication makes
``"cat"`` ≡ ``"act"``), so the symbolic pass is gated behind ``_looks_like_math``
and never runs on word/sentence options (Reading & Writing, Social Studies).

``validate_problem_options`` is a pure function (no LLM, no DB) so the generator,
the studio quiz path, and the audit script can all share one source of truth.
The ``reason`` strings begin with the documented prefixes below; the audit
script buckets failures on them.
"""

import math
import re

# Reason-string prefixes — a mini-contract with audit_practice_options.py.
REASON_DUPLICATE = "duplicate options"
REASON_NUMERIC = "numerically equal options"
REASON_SYMBOLIC = "symbolically equivalent options"
REASON_BAD_INDEX = "bad correct_option"
REASON_MALFORMED = "malformed options"

# Reuse the evaluator's sympy comparator + LaTeX-wrapper stripper. Wrapped so
# this module still imports (for the textual/numeric/structural checks and the
# audit) even if sympy or the shim is unavailable — the symbolic pass just
# no-ops in that case.
try:  # pragma: no cover - import wiring
    from eval_math_shim import task_equivalence as _task_equivalence
    from eval_math_shim import _strip_latex_wrappers
except Exception:  # noqa: BLE001
    _task_equivalence = None

    def _strip_latex_wrappers(s: str) -> str:
        return s


_UNICODE_MINUS = "−"

# Matches a value written with thousands separators, e.g. 1,000 or 12,345.67.
_THOUSANDS_RE = re.compile(r"-?\d{1,3}(,\d{3})+(\.\d+)?$")
# Matches a plain fraction a/b (integers or decimals, optional signs).
_FRACTION_RE = re.compile(r"(-?(?:\d+\.?\d*|\.\d+))/(-?(?:\d+\.?\d*|\.\d+))$")
# \frac{a}{b} or \dfrac{a}{b} with numeric numerator/denominator.
_LATEX_FRAC_RE = re.compile(r"\\d?frac\{(-?[0-9.]+)\}\{(-?[0-9.]+)\}$")


def _try_parse_number(raw: object) -> float | None:
    """Parse an option into a single finite number, or ``None`` if it is not
    cleanly one value.

    Handles decimals, fractions (``a/b`` and ``\\frac{a}{b}``), leading/trailing
    zeros, unicode minus, currency (``$``/``\\$``), trailing percent, and
    thousands separators. Returns ``None`` for anything ambiguous — ratios
    (``3:2``), mixed numbers (``1 1/2``), ranges, expressions, prose — so the
    numeric equality check never fires on values it can't be sure about.
    """
    if raw is None:
        return None
    s = raw if isinstance(raw, str) else str(raw)
    s = s.strip()
    if not s:
        return None

    # Strip inline-math delimiters and LaTeX wrappers (htmlClass/textcolor/…).
    if len(s) >= 2 and s.startswith("$") and s.endswith("$"):
        s = s[1:-1].strip()
    s = _strip_latex_wrappers(s).strip()

    s = s.replace(_UNICODE_MINUS, "-")
    s = s.replace("\\$", "").replace("$", "").strip()
    if not s:
        return None

    # \frac{a}{b} -> a/b (numeric only).
    m = _LATEX_FRAC_RE.fullmatch(s)
    if m:
        s = f"{m.group(1)}/{m.group(2)}"

    percent = False
    if s.endswith("%"):
        percent = True
        s = s[:-1].strip()

    # Thousands separators only when the whole token is grouping-shaped.
    if _THOUSANDS_RE.fullmatch(s):
        s = s.replace(",", "")
    if "," in s:
        return None  # ambiguous comma (decimal comma, list, etc.)

    def _finish(val: float) -> float | None:
        if not math.isfinite(val):
            return None
        return val / 100 if percent else val

    m = _FRACTION_RE.fullmatch(s)
    if m:
        try:
            den = float(m.group(2))
            if den == 0:
                return None
            return _finish(float(m.group(1)) / den)
        except ValueError:
            return None

    try:
        return _finish(float(s))
    except ValueError:
        return None


def _looks_like_math(s: str) -> bool:
    """True when ``s`` is a single algebraic expression/equation, not prose,
    code, a ratio, a fill-in, or a sequence of values.

    Gate for the symbolic-equivalence pass. sympy's implicit multiplication is
    powerful but indiscriminate: it turns ``"cat"`` into ``c*a*t`` and the
    number list ``"0 1 2 3"`` into ``0*1*2*3 == 0``, which produces false
    equivalences. We only let genuine expressions through:

      - reject a 3+ letter alphabetic run (a real word: "cat", "affect", "int")
      - reject code / ratio / fill-in punctuation (``__``, ``==``, ``:``, ``;``, ``#``)
      - reject juxtaposed bare numbers (``\\d \\d`` — a sequence like "0 1 2 3")

    Variables are single letters, so ``2x+4``, ``x=3``, ``(x-1)(x+1)`` still
    qualify.
    """
    t = _strip_latex_wrappers(s)
    t = re.sub(r"\\[a-zA-Z]+", " ", t)  # drop latex commands (\frac, \sqrt, …)
    t = t.replace("$", " ")
    if re.search(r"[A-Za-z]{3,}", t):
        return False
    if re.search(r"__|==|:|;|#", t):
        return False
    if re.search(r"\d\s+\d", t):
        return False
    return bool(re.search(r"[0-9]", t) or re.search(r"[+\-*/^=<>]", t))


# An inequality anywhere means the sympy comparator can't be trusted: it
# compares lhs/rhs but ignores the relational-operator TYPE, so `x<0` vs `x>0`
# and `x>3` vs `x>=3` (and even `x=3` vs `x>3`) would wrongly compare equal.
# SAT answer sets routinely use x>3 / x>=3 / x<3 / x<=3 as the four distinct
# choices — flagging those would drop valid problems. So skip any inequality.
_INEQUALITY_RE = re.compile(r"<|>|\\le\b|\\ge\b|\\leq\b|\\geq\b|≤|≥|≠")
# A letter immediately followed by a digit (y2, x1) is a subscript-style name
# that implicit multiplication mis-reads as a product (y2 -> 2*y), collapsing
# distinct options. `2x` (digit-then-letter) and `x^2` are unaffected.
_LETTER_DIGIT_RE = re.compile(r"[A-Za-z]\d")
# \frac{a}{b} / \dfrac / \tfrac -> ((a)/(b)). The shim's own handling only does
# a naive `\frac`->`/` that leaves the braces (`/{a}{b}`, unparseable), and it
# never strips `$`, so without this every `$`-wrapped fraction option is
# silently skipped by the symbolic check.
_FRAC_CMD_RE = re.compile(r"\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}")


def _normalize_math(s: str) -> str:
    """Rewrite an option into something sympy's parser can actually read:
    strip LaTeX wrappers and `$` delimiters, expand `\\frac`, and map unicode
    operators (minus/dash/times/divide) to ASCII. The shim does none of this,
    so subtraction and fractions would otherwise silently drop out."""
    s = _strip_latex_wrappers(s).replace("$", " ")
    for _ in range(3):  # a few passes cover simple nesting
        new = _FRAC_CMD_RE.sub(r"((\1)/(\2))", s)
        if new == s:
            break
        s = new
    for dash in ("−", "–", "—"):  # minus sign, en dash, em dash
        s = s.replace(dash, "-")
    return s.replace("×", "*").replace("÷", "/").strip()  # × ÷


def _symbolically_equivalent(a: str, b: str) -> bool:
    """True iff the sympy comparator can parse BOTH and finds them equivalent.

    Gated for precision — a false positive here silently drops a valid problem
    in the generator. We skip inequalities and subscript-style variables (both
    of which the comparator mis-handles) and normalize unicode operators first.
    Parse failures / uncheckable comparisons return False (safe).
    """
    if _task_equivalence is None:
        return False
    if not (_looks_like_math(a) and _looks_like_math(b)):
        return False
    if _INEQUALITY_RE.search(a) or _INEQUALITY_RE.search(b):
        return False
    if _LETTER_DIGIT_RE.search(a) or _LETTER_DIGIT_RE.search(b):
        return False
    try:
        res = _task_equivalence({"a": _normalize_math(a), "b": _normalize_math(b)})
    except Exception:  # noqa: BLE001
        return False
    return bool(res.get("ok") and res.get("checkable") and res.get("equivalent"))


def validate_problem_options(
    options: object, correct_option: object, *, skip_symbolic: bool = False
) -> tuple[bool, str]:
    """Return ``(is_valid, reason)`` for a problem's answer set.

    ``reason`` is empty when valid; otherwise it begins with one of the
    ``REASON_*`` prefixes. Checks run cheapest-first and short-circuit on the
    first failure. Pass ``skip_symbolic=True`` to skip the (slower) sympy pass —
    useful for a fast first sweep over a large table.
    """
    if not isinstance(options, list) or len(options) < 2:
        return (False, f"{REASON_MALFORMED}: expected a list of >=2 options, got {options!r}")

    cleaned: list[str] = []
    for o in options:
        if o is None:
            return (False, f"{REASON_MALFORMED}: null option in {options!r}")
        s = o if isinstance(o, str) else str(o)
        if not s.strip():
            return (False, f"{REASON_MALFORMED}: empty option in {options!r}")
        cleaned.append(s)

    # correct_option must be a real int index (bool is an int subclass — reject).
    if isinstance(correct_option, bool) or not isinstance(correct_option, int):
        return (False, f"{REASON_BAD_INDEX}: not an integer ({correct_option!r})")
    if not (0 <= correct_option < len(cleaned)):
        return (
            False,
            f"{REASON_BAD_INDEX}: {correct_option} out of range for {len(cleaned)} options",
        )

    # 1. Textual dedup (whitespace-collapsed, case-insensitive).
    normed = [" ".join(s.split()).strip().lower() for s in cleaned]
    if len(set(normed)) != len(normed):
        return (False, f"{REASON_DUPLICATE}: {cleaned!r}")

    # 2. Numeric equivalence (always on) and 3. symbolic equivalence (gated).
    nums = [_try_parse_number(s) for s in cleaned]
    n = len(cleaned)
    for i in range(n):
        for j in range(i + 1, n):
            a, b = nums[i], nums[j]
            if a is not None and b is not None:
                if math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12):
                    return (
                        False,
                        f"{REASON_NUMERIC}: {cleaned[i]!r} == {cleaned[j]!r}",
                    )
                continue  # both numeric but distinct — symbolic can't disagree
            if not skip_symbolic and _symbolically_equivalent(cleaned[i], cleaned[j]):
                return (
                    False,
                    f"{REASON_SYMBOLIC}: {cleaned[i]!r} == {cleaned[j]!r}",
                )

    return (True, "")
