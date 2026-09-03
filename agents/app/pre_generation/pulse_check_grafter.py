"""Graft `pulse_check` interactions onto existing prod `micro_lessons`.

Production lessons authored before the `pulse_check` interaction type
shipped (PR #45) have none. Rather than re-running the full lesson agent
to harvest its pulse_checks, we run the dedicated pulse-check inserter
agent directly against the prod step list — same agent the main
generation pipeline uses, but operating on already-saved content.

Subtopics whose prod lesson already contains any pulse_check step are
skipped.
"""

from __future__ import annotations

import sys
from typing import Any

from app.utils.db import client, get_topic_by_slug
from app.run_time.sat.micro_lesson_agent import (
    build_pulse_check_inserter_agent,
    insert_pulse_checks_into_steps,
)


def _has_pulse_check(steps: list[dict]) -> bool:
    return any((s.get("action") or {}).get("type") == "pulse_check" for s in steps)


def _subtopic_metadata(subtopic_row: dict) -> dict:
    return {
        "description": subtopic_row.get("description") or "",
        "learning_objectives": subtopic_row.get("learning_objectives") or [],
        "key_formulas": subtopic_row.get("key_formulas") or [],
        "common_mistakes": subtopic_row.get("common_mistakes") or [],
        "tips_and_tricks": subtopic_row.get("tips_and_tricks") or [],
        "conceptual_overview": subtopic_row.get("conceptual_overview") or None,
    }


async def graft_subtopic(
    *,
    topic_name: str,
    subtopic_row: dict,
    dry_run: bool,
    force: bool = False,
) -> dict:
    """Run the pulse-check inserter against one subtopic's prod lesson
    and write the spliced result back. Returns a summary.

    When `force=True`, existing pulse_check steps in the prod lesson
    are stripped before the inserter runs — useful for re-grafting
    lessons authored under a previous (lower-yield) version of the
    pass."""
    subtopic_id = subtopic_row["id"]
    subtopic_name = subtopic_row["name"]
    summary: dict[str, Any] = {
        "subtopic": subtopic_name,
        "subtopic_id": subtopic_id,
        "status": "pending",
        "grafted": 0,
        "skipped_reason": None,
    }

    lesson_resp = (
        client()
        .table("micro_lessons")
        .select("*")
        .eq("subtopic_id", subtopic_id)
        .limit(1)
        .execute()
    )
    if not lesson_resp.data:
        summary["status"] = "skipped"
        summary["skipped_reason"] = "no micro_lessons row"
        return summary

    prod_lesson = lesson_resp.data[0]
    prod_steps: list[dict] = prod_lesson.get("whiteboard_steps") or []
    if _has_pulse_check(prod_steps):
        if not force:
            summary["status"] = "skipped"
            summary["skipped_reason"] = "prod lesson already contains pulse_check"
            return summary
        # --force: strip existing pulse_checks and renumber so the
        # inserter sees the lesson as it was before any prior graft.
        prod_steps = [
            s
            for s in prod_steps
            if (s.get("action") or {}).get("type") != "pulse_check"
        ]
        for idx, s in enumerate(prod_steps):
            s["id"] = idx

    print(f"  → running pulse-check inserter for '{subtopic_name}' ...", flush=True)
    inserter = build_pulse_check_inserter_agent()
    spliced = await insert_pulse_checks_into_steps(
        prod_steps,
        topic=topic_name,
        subtopic=subtopic_name,
        subtopic_metadata=_subtopic_metadata(subtopic_row),
        agent=inserter,
    )

    grafted = sum(
        1
        for s in spliced
        if (s.get("action") or {}).get("type") == "pulse_check"
    )
    summary["grafted"] = grafted
    if grafted == 0:
        summary["status"] = "skipped"
        summary["skipped_reason"] = "inserter returned no pulse_checks"
        return summary

    summary["status"] = "ok"
    if dry_run:
        return summary

    update = (
        client()
        .table("micro_lessons")
        .update(
            {
                "whiteboard_steps": spliced,
                "updated_at": "now()",
            }
        )
        .eq("subtopic_id", subtopic_id)
        .execute()
    )
    if not update.data:
        summary["status"] = "failed"
        summary["skipped_reason"] = "supabase update returned no rows"
    return summary


async def graft_topic(
    *,
    topic_slug: str,
    subtopic_slug: str | None,
    dry_run: bool,
    force: bool = False,
) -> int:
    """Graft pulse_checks across every subtopic of a topic (or a single
    subtopic if `subtopic_slug` is given). Prints a per-subtopic
    summary; returns the number of subtopics where at least one
    pulse_check landed."""
    topic = get_topic_by_slug(topic_slug)
    if not topic:
        print(f"✗ Topic '{topic_slug}' not found.", file=sys.stderr)
        return 0

    q = (
        client()
        .table("subtopics")
        .select("*")
        .eq("topic_id", topic["id"])
        .order("order_index")
    )
    if subtopic_slug:
        q = q.eq("slug", subtopic_slug)
    sub_resp = q.execute()
    subtopics = sub_resp.data or []
    if not subtopics:
        target = f"topic '{topic_slug}'"
        if subtopic_slug:
            target += f", subtopic '{subtopic_slug}'"
        print(f"✗ No subtopics found for {target}.", file=sys.stderr)
        return 0

    print(f"Topic: {topic['name']} ({len(subtopics)} subtopic(s))")
    if dry_run:
        print("[DRY RUN — no writes]")
    print()

    success = 0
    for st in subtopics:
        summary = await graft_subtopic(
            topic_name=topic["name"],
            subtopic_row=st,
            dry_run=dry_run,
            force=force,
        )
        status = summary["status"]
        if status == "ok":
            success += 1
            tag = "✓"
        elif status == "skipped":
            tag = "·"
        else:
            tag = "✗"
        line = f"  {tag} {summary['subtopic']}: {status}"
        if summary["grafted"]:
            line += f" — grafted {summary['grafted']}"
        if summary["skipped_reason"]:
            line += f" ({summary['skipped_reason']})"
        print(line, flush=True)
    return success
