"""Repair problems flagged by audit_practice_options — regenerate IN PLACE.

For every row that currently fails option validation (duplicate /
numerically-equal / symbolically-equivalent options, or a bad answer index),
this generates a fresh, validated problem on the SAME subtopic and difficulty
and UPDATEs the row. Identity and linkage are preserved — id, source,
subtopic_id / custom_topic_id / slugs, order_index, difficulty, difficulty_level
all stay — so counts hold and any `full_sat_test_problems` FK references keep
pointing at a valid (now fixed) problem. Nothing is ever deleted.

Three modes, escalating:
  (default)    dry-run — list the rows that need repair. No LLM, no writes.
  PREVIEW=1    generate replacements and print old -> new. Still no writes.
  APPLY=1      generate replacements and UPDATE the rows.

Re-runnable safely: it only touches rows that currently fail validation, so a
second pass is a no-op on rows already fixed.

Usage:
    cd agents && python -m app.pre_generation.repair_practice_options              # dry-run, all sources
    cd agents && SOURCE=practice python -m app.pre_generation.repair_practice_options
    cd agents && IDS=uuid1,uuid2 python -m app.pre_generation.repair_practice_options
    cd agents && PREVIEW=1 LIMIT=3 python -m app.pre_generation.repair_practice_options
    cd agents && APPLY=1 python -m app.pre_generation.repair_practice_options       # regenerate + write
    cd agents && APPLY=1 FORCE=1 IDS=uuid python -m app.pre_generation.repair_practice_options  # force-regenerate specific rows
"""
import asyncio
import os
import random

from dotenv import load_dotenv

load_dotenv(override=True)  # bash sandbox blanks secrets; reload from .env

from app.utils.db import client, get_subtopic, get_topic_by_slug
from app.pre_generation.option_validation import validate_problem_options
from app.pre_generation.problem_generator import generate_problems_batch

APPLY = os.getenv("APPLY") == "1"
PREVIEW = os.getenv("PREVIEW") == "1"
GENERATE = APPLY or PREVIEW  # both need a fresh problem; only APPLY writes
SOURCE = os.getenv("SOURCE", "").strip()  # "" = all sources
LIMIT = int(os.getenv("LIMIT", "0"))  # 0 = every flagged row
IDS = [x.strip() for x in os.getenv("IDS", "").split(",") if x.strip()]
# Regenerate the given IDS even if they currently pass validation — for
# rows with a defect the validator doesn't model (e.g. a garbled LaTeX
# option that happens to parse to a distinct value). Only honored with IDS,
# so it can never blanket-regenerate a whole source.
FORCE = os.getenv("FORCE") == "1" and bool(IDS)
SKIP_SYMBOLIC = os.getenv("SKIP_SYMBOLIC") == "1"
CONCURRENCY = int(os.getenv("CONCURRENCY", "4"))
PAGE = 1000

# Content fields to overwrite. Everything else (id / source / linkage /
# order_index / difficulty / difficulty_level / category / created_at) is left
# untouched so the row keeps its identity and place.
CONTENT_FIELDS = [
    "question_text",
    "question_phonetic",
    "options",
    "correct_option",
    "explanation",
    "solution_steps",
    "concept_tags",
    "common_errors",
    "hint",
    "detailed_hint",
    "time_recommendation_seconds",
    "sat_frequency",
]

sb = client()


def _fetch_flagged() -> list[tuple[dict, str]]:
    """All rows that currently fail validation (respecting SOURCE / IDS / LIMIT)."""
    rows: list[dict] = []
    if IDS:
        for i in range(0, len(IDS), 100):
            rows.extend(
                sb.table("problems").select("*").in_("id", IDS[i : i + 100]).execute().data
                or []
            )
    else:
        offset = 0
        while True:
            q = sb.table("problems").select("*")
            if SOURCE:
                q = q.eq("source", SOURCE)
            page = q.order("id").range(offset, offset + PAGE - 1).execute().data or []
            if not page:
                break
            rows.extend(page)
            if len(page) < PAGE:
                break
            offset += PAGE

    flagged: list[tuple[dict, str]] = []
    for r in rows:
        if FORCE:
            flagged.append((r, "forced"))
            continue
        ok, reason = validate_problem_options(
            r.get("options"), r.get("correct_option"), skip_symbolic=SKIP_SYMBOLIC
        )
        if not ok:
            flagged.append((r, reason))
            if LIMIT and len(flagged) >= LIMIT:
                break
    return flagged


def _resolve_context(row: dict) -> tuple[str, str, str] | None:
    """(topic_name, subtopic_name, subject) for regeneration, or None if the
    row's linkage can't be resolved to a subtopic."""
    if row.get("custom_topic_id"):
        ct = (
            sb.table("custom_topics")
            .select("title")
            .eq("id", row["custom_topic_id"])
            .execute()
            .data
        )
        if ct:
            title = ct[0]["title"]
            return (title, title, "general")
        return None

    if row.get("subtopic_id"):
        st = (
            sb.table("subtopics")
            .select("name, topic_id")
            .eq("id", row["subtopic_id"])
            .execute()
            .data
        )
        if st:
            tp = (
                sb.table("topics")
                .select("name, subject")
                .eq("id", st[0]["topic_id"])
                .execute()
                .data
            )
            if tp:
                return (tp[0]["name"], st[0]["name"], tp[0].get("subject") or "math")

    if row.get("topic_slug") and row.get("subtopic_slug"):
        tp = get_topic_by_slug(row["topic_slug"])
        if tp:
            sub = get_subtopic(tp["id"], row["subtopic_slug"])
            if sub:
                return (tp["name"], sub["name"], tp.get("subject") or "math")

    return None


async def _repair(row: dict, reason: str, sem: asyncio.Semaphore) -> dict:
    """Regenerate one row. Returns a result dict with a `status` of
    repaired / unresolved / genfail."""
    async with sem:
        ctx = _resolve_context(row)
        if not ctx:
            return {"status": "unresolved", "row": row, "reason": reason}
        topic_name, subtopic_name, subject = ctx
        difficulty = row.get("difficulty") or "medium"
        try:
            probs = await generate_problems_batch(
                subtopic_name=subtopic_name,
                topic_name=topic_name,
                subtopic_id="repair",
                batch_number=random.randint(0, 4),  # rotate problem-type focus
                difficulty=difficulty,
                batch_size=1,
                subject=subject or "math",
            )
        except Exception as e:  # noqa: BLE001 — generator raises after retries
            return {"status": "genfail", "row": row, "reason": reason, "error": str(e)}

        if not probs:
            return {"status": "genfail", "row": row, "reason": reason, "error": "empty"}

        new = probs[0]
        payload = {k: new.get(k) for k in CONTENT_FIELDS}
        # generate_problems_batch already validates, but be certain before write.
        ok, r2 = validate_problem_options(payload["options"], payload["correct_option"])
        if not ok:
            return {
                "status": "genfail",
                "row": row,
                "reason": reason,
                "error": f"replacement still invalid: {r2}",
            }

        if APPLY:
            sb.table("problems").update(payload).eq("id", row["id"]).execute()
        return {"status": "repaired", "row": row, "reason": reason, "payload": payload}


def _row_label(row: dict) -> str:
    return (
        f"[{row.get('source')}/{row.get('subtopic_slug')}/{row.get('difficulty')}] "
        f"id={row.get('id')}"
    )


async def main() -> None:
    flagged = _fetch_flagged()
    scope = f"source={SOURCE!r}" if SOURCE else "all sources"
    mode = "APPLY (writing)" if APPLY else ("PREVIEW (no writes)" if PREVIEW else "DRY-RUN (list only)")
    print("\n=== Practice option repair ===")
    print(f"scope: {scope}   mode: {mode}   symbolic pass: {'OFF' if SKIP_SYMBOLIC else 'on'}")
    print(f"rows needing repair: {len(flagged)}\n")

    if not flagged:
        return

    if not GENERATE:
        for row, reason in flagged:
            print(f"  {_row_label(row)}")
            print(f"    options={row.get('options')!r} correct={row.get('correct_option')!r}")
            print(f"    reason: {reason}")
        print("\nRun with PREVIEW=1 to see replacements, or APPLY=1 to regenerate & update.")
        return

    sem = asyncio.Semaphore(max(1, CONCURRENCY))
    results = await asyncio.gather(*[_repair(r, reason, sem) for r, reason in flagged])

    tally = {"repaired": 0, "unresolved": 0, "genfail": 0}
    for res in results:
        tally[res["status"]] += 1

    verb = "repaired" if APPLY else "would repair"
    print(f"{verb}: {tally['repaired']}   unresolved: {tally['unresolved']}   genfail: {tally['genfail']}\n")

    for res in results:
        if res["status"] != "repaired":
            continue
        row, payload = res["row"], res["payload"]
        print(f"  ✓ {_row_label(row)}")
        print(f"    was: {row.get('options')!r} (correct={row.get('correct_option')})")
        print(f"    now: {payload['options']!r} (correct={payload['correct_option']})")

    for res in results:
        if res["status"] == "unresolved":
            print(f"  ⚠ unresolved linkage — left as-is: {_row_label(res['row'])}")
        elif res["status"] == "genfail":
            print(f"  ✗ regeneration failed — left as-is: {_row_label(res['row'])} :: {res.get('error')}")

    if not APPLY:
        print("\nNo rows were written. Re-run with APPLY=1 to persist these replacements.")


if __name__ == "__main__":
    asyncio.run(main())
