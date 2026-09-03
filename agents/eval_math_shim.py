#!/usr/bin/env python3
"""
Thin subprocess-friendly shim over SymPy for the TS math evaluator.

Reads a JSON envelope from stdin:
  { "task": "equivalence", "a": "2*x + 3 - 3", "b": "2*x" }
  { "task": "fidelity", "operation": "subtract", "operand": "3",
    "exprBefore": "2x + 3 = 7", "exprAfter": "2x = 4" }

Writes one JSON object per request to stdout (one per line), so the TS side
can pipeline many requests into one process.
"""

import json
import sys
import re
from typing import Any, Optional

from sympy import And, Eq, Ge, Gt, Le, Lt, Symbol, simplify, symbols, sympify
from sympy.core.relational import Relational
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)

TRANSFORMS = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)


def _strip_latex_wrappers(s: str) -> str:
    """Strip \\htmlClass{op-*}{body}, \\textcolor{...}{body}, etc., keeping body."""
    while True:
        new = re.sub(
            r"\\(htmlClass|htmlId|cssId|textcolor|color)\{[^{}]*\}\{([^{}]*)\}",
            r"\2",
            s,
        )
        if new == s:
            break
        s = new
    return s


# Order matters: `<=` before `<` so the longer match wins.
_REL_OPS: list[tuple[str, Any]] = [
    ("<=", Le),
    (">=", Ge),
    ("==", Eq),
    ("=", Eq),
    ("<", Lt),
    (">", Gt),
]


def _find_relational_ops(cleaned: str) -> list[tuple[int, str, Any]]:
    """Walk left-to-right through `cleaned` and return all non-overlapping
    relational operators as (start_idx, op_str, op_class). Greedily
    prefers the longer operator at any position (`<=` over `<`)."""
    ops: list[tuple[int, str, Any]] = []
    i = 0
    while i < len(cleaned):
        matched = False
        for op_str, op_cls in _REL_OPS:
            if cleaned[i : i + len(op_str)] == op_str:
                ops.append((i, op_str, op_cls))
                i += len(op_str)
                matched = True
                break
        if not matched:
            i += 1
    return ops


def _parse(expr: str):
    if not expr:
        raise ValueError("empty expression")
    cleaned = _strip_latex_wrappers(expr).strip()
    # Normalize common shortcuts. These are intentionally conservative —
    # better to say "unparseable" than to silently munge.
    cleaned = cleaned.replace("\\cdot", "*").replace("\\times", "*")
    cleaned = cleaned.replace("\\frac", "/")
    cleaned = cleaned.replace("\\le", "<=").replace("\\leq", "<=")
    cleaned = cleaned.replace("\\ge", ">=").replace("\\geq", ">=")

    ops = _find_relational_ops(cleaned)
    if not ops:
        return parse_expr(cleaned, transformations=TRANSFORMS)
    if len(ops) == 1:
        idx, op_str, op_cls = ops[0]
        return op_cls(
            parse_expr(cleaned[:idx], transformations=TRANSFORMS),
            parse_expr(cleaned[idx + len(op_str):], transformations=TRANSFORMS),
        )
    # Compound relational like `-1 <= 2*x + 3 <= 9` — split into pairwise
    # relations and combine with And. Result type is `Boolean`/`And`,
    # not `Relational`; downstream comparison code treats this as a
    # structured object with a `.args` tuple of pairwise relations.
    parts: list[str] = []
    last = 0
    for idx, op_str, _ in ops:
        parts.append(cleaned[last:idx])
        last = idx + len(op_str)
    parts.append(cleaned[last:])
    rels = []
    for i, (_idx, _op_str, op_cls) in enumerate(ops):
        rels.append(
            op_cls(
                parse_expr(parts[i], transformations=TRANSFORMS),
                parse_expr(parts[i + 1], transformations=TRANSFORMS),
            )
        )
    return And(*rels)


def _both_sides(e1, e2):
    """Return (lhs1 - lhs2, rhs1 - rhs2) for relational expressions
    (equations and inequalities); else (e1 - e2, 0)."""
    if isinstance(e1, Relational) and isinstance(e2, Relational):
        return (simplify(e1.lhs - e2.lhs), simplify(e1.rhs - e2.rhs))
    return (simplify(e1 - e2), 0)


def _compound_relations(node):
    """If `node` is a compound relational (an `And` of `Relational`
    children), return the list of children. Otherwise return None."""
    if isinstance(node, And):
        kids = list(node.args)
        if all(isinstance(k, Relational) for k in kids):
            return kids
    return None


def task_equivalence(req: dict[str, Any]) -> dict[str, Any]:
    a_raw = req.get("a", "")
    b_raw = req.get("b", "")
    try:
        a = _parse(a_raw)
        b = _parse(b_raw)
    except Exception as exc:
        return {"ok": False, "reason": f"parse failed: {exc}", "checkable": False}
    try:
        def _is_zero(x) -> bool:
            try:
                return bool(simplify(x) == 0)
            except Exception:
                return False

        # Compound relational case (`-1 <= 2*x+3 <= 9`): both sides parse
        # to an `And` of pairwise relations. Equivalent if every paired
        # relation is equivalent component-wise. We simplify each side
        # of each pair before comparison so that algebraically-equivalent
        # forms compare equal (`-4/2 <= 2*x/2` → `-2 <= x`).
        comp_a = _compound_relations(a)
        comp_b = _compound_relations(b)
        if comp_a is not None and comp_b is not None and len(comp_a) == len(comp_b):
            ok = True
            for ra, rb in zip(comp_a, comp_b):
                if type(ra) is not type(rb):
                    ok = False
                    break
                lhs_eq = _is_zero(simplify(ra.lhs) - simplify(rb.lhs))
                rhs_eq = _is_zero(simplify(ra.rhs) - simplify(rb.rhs))
                if not (lhs_eq and rhs_eq):
                    ok = False
                    break
            return {
                "ok": True,
                "checkable": True,
                "equivalent": bool(ok),
                "lhsDelta": "compound",
                "rhsDelta": "compound",
            }

        lhs_delta, rhs_delta = _both_sides(a, b)
        # Same-side equivalence: lhs1 - lhs2 == 0 AND rhs1 - rhs2 == 0.
        equivalent = _is_zero(lhs_delta) and _is_zero(rhs_delta)
        # Side-swap equivalence: equations like `15/6 = x` and `x = 5/2`
        # are the same equation with sides flipped (and possibly
        # simplified). Check lhs1 - rhs2 and rhs1 - lhs2 too. Only
        # applies when both sides are equations (Relational); skip for
        # bare expressions where this comparison is meaningless.
        if (
            not equivalent
            and isinstance(a, Relational)
            and isinstance(b, Relational)
            and type(a) is type(b)
        ):
            try:
                swap_lhs = simplify(a.lhs - b.rhs)
                swap_rhs = simplify(a.rhs - b.lhs)
                if _is_zero(swap_lhs) and _is_zero(swap_rhs):
                    equivalent = True
            except Exception:
                pass
        return {
            "ok": True,
            "checkable": True,
            "equivalent": bool(equivalent),
            "lhsDelta": str(lhs_delta),
            "rhsDelta": str(rhs_delta),
        }
    except Exception as exc:
        return {"ok": False, "reason": f"compare failed: {exc}", "checkable": False}


def task_fidelity(req: dict[str, Any]) -> dict[str, Any]:
    op = req.get("operation", "")
    operand_raw = req.get("operand", "")
    before_raw = req.get("exprBefore", "")
    after_raw = req.get("exprAfter", "")
    try:
        before = _parse(before_raw)
        after = _parse(after_raw)
    except Exception as exc:
        return {"ok": False, "reason": f"parse failed: {exc}", "checkable": False}

    # Extract (lhs, rhs) pairs uniformly: equations, inequalities, and
    # compound (`And` of relations) all share this representation. Each
    # pair gets the operation applied; we check pairwise per-side
    # simplification matches.
    def _pairs(node):
        if isinstance(node, Relational):
            return [(node.lhs, node.rhs)]
        comp = _compound_relations(node)
        if comp is not None:
            return [(r.lhs, r.rhs) for r in comp]
        return None

    before_pairs = _pairs(before)
    after_pairs = _pairs(after)
    if before_pairs is None or after_pairs is None:
        return {
            "ok": False,
            "reason": "fidelity check requires both before/after to be relational expressions (equation, inequality, or compound)",
            "checkable": False,
        }
    if len(before_pairs) != len(after_pairs):
        return {
            "ok": False,
            "reason": f"fidelity: relational structure changed (before has {len(before_pairs)} pair(s), after has {len(after_pairs)})",
            "checkable": True,
            "match": False,
        }

    # Parse operand as a SymPy expression (so "3" and "2x" both work).
    # Handle authoring slop: the model sometimes writes the operand as an
    # assignment ("y=0") instead of the bare value ("0"), expecting
    # substituteVar to carry the variable name. Extract the RHS in that
    # case rather than rejecting the job as unparseable.
    cleaned_operand = operand_raw.strip() if operand_raw else operand_raw
    if cleaned_operand and "=" in cleaned_operand and "," not in cleaned_operand:
        # var=val form — keep just the value
        cleaned_operand = cleaned_operand.split("=", 1)[1].strip()
    try:
        operand = parse_expr(cleaned_operand, transformations=TRANSFORMS) if cleaned_operand else None
    except Exception as exc:
        return {"ok": False, "reason": f"bad operand: {exc}", "checkable": False}

    # Fidelity safety net: if the parsed operand introduces free symbols
    # the equation doesn't have, the model probably wrote prose
    # (e.g. "the equation itself", "both sides squared") that sympy's
    # implicit-multiplication parser silently turned into a product of
    # single-letter symbols. Comparing that against the actual operation
    # produces nonsensical errors like
    # "expected a*b*d*e**2*h*i*o*q*r*s**3*t*u*sqrt(...) = ...". Better to
    # mark the check as not-runnable than to false-positive.
    if operand is not None:
        equation_syms = set(getattr(before, "free_symbols", set())) | set(
            getattr(after, "free_symbols", set())
        )
        operand_syms = set(getattr(operand, "free_symbols", set()))
        novel = operand_syms - equation_syms
        if len(novel) >= 2:
            return {
                "ok": False,
                "reason": (
                    f"operand introduces {len(novel)} symbols not in the equation "
                    f"({sorted(str(s) for s in novel)[:6]}); likely prose, not a math operand"
                ),
                "checkable": False,
            }

    try:
        # Apply the operation to each (lhs, rhs) pair in `before` to
        # compute the expected pair, then compare against the matching
        # pair in `after`. For compound relations (`-1 <= 2x+3 <= 9`)
        # the same operation is applied to every pair.
        def _apply_op(lhs_b, rhs_b):
            if op == "add":
                if operand is None:
                    raise ValueError("add requires operand")
                return lhs_b + operand, rhs_b + operand
            if op == "subtract":
                if operand is None:
                    raise ValueError("subtract requires operand")
                return lhs_b - operand, rhs_b - operand
            if op == "multiply":
                if operand is None:
                    raise ValueError("multiply requires operand")
                return lhs_b * operand, rhs_b * operand
            if op == "divide":
                if operand is None:
                    raise ValueError("divide requires operand")
                return lhs_b / operand, rhs_b / operand
            if op == "substitute":
                var_name = req.get("substituteVar")
                if var_name:
                    var = Symbol(var_name)
                else:
                    free = list(lhs_b.free_symbols | rhs_b.free_symbols)
                    if len(free) != 1:
                        raise ValueError(
                            f"substitute needs substituteVar when multiple free symbols present: {free}"
                        )
                    var = free[0]
                if operand is None:
                    raise ValueError("substitute requires operand")
                return lhs_b.subs(var, operand), rhs_b.subs(var, operand)
            raise ValueError(f"fidelity for op {op!r} not supported in v1")

        all_match = True
        first_expected: Optional[tuple] = None
        first_actual: Optional[tuple] = None
        for (lb, rb), (la, ra) in zip(before_pairs, after_pairs):
            exp_lhs, exp_rhs = _apply_op(lb, rb)
            if first_expected is None:
                first_expected = (exp_lhs, exp_rhs)
                first_actual = (la, ra)
            lhs_match = simplify(la - exp_lhs) == 0
            rhs_match = simplify(ra - exp_rhs) == 0
            if not (lhs_match and rhs_match):
                all_match = False
                break

        return {
            "ok": True,
            "checkable": True,
            "match": all_match,
            "expectedLhs": str(first_expected[0]) if first_expected else "",
            "expectedRhs": str(first_expected[1]) if first_expected else "",
            "actualLhs": str(first_actual[0]) if first_actual else "",
            "actualRhs": str(first_actual[1]) if first_actual else "",
        }
    except ValueError as exc:
        return {"ok": False, "reason": str(exc), "checkable": False}
    except Exception as exc:
        return {"ok": False, "reason": f"fidelity check failed: {exc}", "checkable": False}


def task_point_satisfies(req: dict[str, Any]) -> dict[str, Any]:
    """Check whether a 2D point (x, y) satisfies a line equation.

    Used by the lesson evaluator to verify that `coordinate_plane` line
    elements actually plot what their `label` claims (e.g. label
    "x - y = 1" with from=[3, 2], to=[5, 4] should pass; from=[2, 0],
    to=[5, 1] should fail).

    Request:
      { "task": "point_satisfies", "equation": "x - y = 1",
        "x": 3, "y": 2, "tolerance"?: 1e-6 }

    Response:
      { "ok": True, "checkable": True, "satisfies": True,
        "residual": 0.0 }
      Residual = lhs - rhs after substitution. If equation is missing
      "=", we assume it's of form `expr = 0` and use the expr as lhs.
    """
    try:
        equation = (req.get("equation") or "").strip()
        x_val = req.get("x")
        y_val = req.get("y")
        tol = float(req.get("tolerance", 1e-6))
        if not equation or x_val is None or y_val is None:
            return {"ok": False, "checkable": False, "reason": "missing equation or point"}

        cleaned = _strip_latex_wrappers(equation).strip()
        # Strip leading $ and trailing $ if wrapped as inline math
        cleaned = cleaned.strip("$").strip()
        if "=" in cleaned:
            lhs_str, rhs_str = cleaned.split("=", 1)
        else:
            lhs_str, rhs_str = cleaned, "0"
        lhs = _parse(lhs_str)
        rhs = _parse(rhs_str)

        x_sym, y_sym = symbols("x y")
        residual = float((lhs - rhs).subs({x_sym: float(x_val), y_sym: float(y_val)}))
        return {
            "ok": True,
            "checkable": True,
            "satisfies": abs(residual) <= tol,
            "residual": residual,
        }
    except Exception as exc:
        return {"ok": False, "checkable": False, "reason": f"point_satisfies failed: {exc}"}


HANDLERS = {
    "equivalence": task_equivalence,
    "fidelity": task_fidelity,
    "point_satisfies": task_point_satisfies,
}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            handler = HANDLERS.get(req.get("task", ""))
            if not handler:
                out = {"ok": False, "reason": f"unknown task {req.get('task')!r}"}
            else:
                out = handler(req)
        except Exception as exc:
            out = {"ok": False, "reason": f"handler error: {exc}"}
        sys.stdout.write(json.dumps(out) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
