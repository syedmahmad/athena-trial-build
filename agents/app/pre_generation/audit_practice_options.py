"""Audit existing problems for broken answer sets — REPORT ONLY.

Scans the ``problems`` table with the SAME validator the generator uses
(``option_validation.validate_problem_options``) and reports how many rows have:

  - duplicate options
  - numerically-equal options (0.5 vs 1/2)
  - symbolically-equivalent options (2x+4 vs 4+2x)
  - a bad ``correct_option`` index
  - malformed options

It never writes, updates, or deletes. Reviewing the report is how we decide
whether a follow-up repair/regeneration pass is worth it.

Usage:
    cd agents && python -m app.pre_generation.audit_practice_options              # all rows, all sources
    cd agents && SOURCE=practice python -m app.pre_generation.audit_practice_options
    cd agents && LIMIT=2000 python -m app.pre_generation.audit_practice_options   # cap rows scanned
    cd agents && SKIP_SYMBOLIC=1 python -m app.pre_generation.audit_practice_options  # fast pass (no sympy)
    cd agents && SAMPLES=40 python -m app.pre_generation.audit_practice_options   # more examples per class
"""
import os

from dotenv import load_dotenv

load_dotenv(override=True)  # bash sandbox blanks secrets; reload from .env

from app.utils.db import client
from app.pre_generation.option_validation import (
    REASON_BAD_INDEX,
    REASON_DUPLICATE,
    REASON_MALFORMED,
    REASON_NUMERIC,
    REASON_SYMBOLIC,
    validate_problem_options,
)

SOURCE = os.getenv("SOURCE", "").strip()  # "" = all sources
LIMIT = int(os.getenv("LIMIT", "0"))  # 0 = scan every row
SKIP_SYMBOLIC = os.getenv("SKIP_SYMBOLIC") == "1"
SAMPLES = int(os.getenv("SAMPLES", "20"))  # examples shown per failure class
PAGE = 1000  # Supabase caps a single select at ~1000 rows

# Order buckets from most to least actionable for the printed report.
CLASSES = [
    ("duplicate", REASON_DUPLICATE),
    ("numeric_equal", REASON_NUMERIC),
    ("symbolic_equal", REASON_SYMBOLIC),
    ("bad_correct_option", REASON_BAD_INDEX),
    ("malformed", REASON_MALFORMED),
]


def _classify(reason: str) -> str:
    for name, prefix in CLASSES:
        if reason.startswith(prefix):
            return name
    return "other"


def main() -> None:
    sb = client()
    scanned = 0
    counts: dict[str, int] = {name: 0 for name, _ in CLASSES}
    counts["other"] = 0
    samples: dict[str, list[dict]] = {k: [] for k in counts}

    offset = 0
    while True:
        q = sb.table("problems").select(
            "id, source, subtopic_slug, difficulty, options, correct_option"
        )
        if SOURCE:
            q = q.eq("source", SOURCE)
        # Deterministic order so pagination is stable across pages.
        rows = q.order("id").range(offset, offset + PAGE - 1).execute().data or []
        if not rows:
            break

        for row in rows:
            if LIMIT and scanned >= LIMIT:
                break
            scanned += 1
            ok, reason = validate_problem_options(
                row.get("options"),
                row.get("correct_option"),
                skip_symbolic=SKIP_SYMBOLIC,
            )
            if ok:
                continue
            cls = _classify(reason)
            counts[cls] += 1
            if len(samples[cls]) < SAMPLES:
                samples[cls].append({**row, "reason": reason})

        if LIMIT and scanned >= LIMIT:
            break
        if len(rows) < PAGE:
            break
        offset += PAGE

    total_bad = sum(v for k, v in counts.items())
    scope = f"source={SOURCE!r}" if SOURCE else "all sources"
    print("\n=== Practice option audit (report only) ===")
    print(f"scope: {scope}   symbolic pass: {'OFF' if SKIP_SYMBOLIC else 'on'}")
    print(f"scanned: {scanned} rows")
    print(f"flagged: {total_bad} rows ({(total_bad / scanned * 100) if scanned else 0:.1f}%)\n")
    for name in [n for n, _ in CLASSES] + ["other"]:
        print(f"  {name:20s} {counts[name]}")

    for name in [n for n, _ in CLASSES] + ["other"]:
        rows = samples[name]
        if not rows:
            continue
        print(f"\n--- {name} (showing {len(rows)} of {counts[name]}) ---")
        for r in rows:
            print(
                f"  [{r.get('source')}/{r.get('subtopic_slug')}/{r.get('difficulty')}] "
                f"id={r.get('id')}"
            )
            print(f"    options={r.get('options')!r} correct={r.get('correct_option')!r}")
            print(f"    reason: {r.get('reason')}")


if __name__ == "__main__":
    main()
