"""
Flashcard deck generator.

Pulls SAT / practice problems for a given topic+subtopic from Supabase and
streams them card-by-card as SSE events. Each card carries the question on
the front and the worked-out explanation on the back.

The agent is deterministic shuffling for v1 — no LLM call. The "AI authors
deck on whiteboard" UX is delivered by the streaming cadence plus a per-card
regenerate endpoint. A future v2 can layer Claude-driven solution
compression on top without changing the wire format.
"""

from __future__ import annotations

import asyncio
import json
import random
from typing import AsyncGenerator, Iterable

from app.utils.db import client


_OPTION_LETTERS = ("A", "B", "C", "D")


def _serialize_options(raw: object) -> list[dict[str, str]]:
    """Normalize the `options` jsonb column into a [{letter, text}] list.

    Supabase returns the column as either a list of strings (legacy SAT
    seeds) or a list of `{letter, text}` objects (newer practice seeds).
    """
    if not isinstance(raw, list):
        return []
    out: list[dict[str, str]] = []
    for idx, opt in enumerate(raw[:4]):
        letter = _OPTION_LETTERS[idx]
        if isinstance(opt, str):
            out.append({"letter": letter, "text": opt})
        elif isinstance(opt, dict):
            text = opt.get("text") or opt.get("label") or opt.get("value") or ""
            out.append({"letter": letter, "text": str(text)})
    return out


def _serialize_solution_steps(raw: object) -> list[str]:
    """Flatten the per-row solution_steps jsonb into render-ready strings.

    SAT and practice rows store steps as
        {step: int, instruction: str, math: str}
    where `math` is a LaTeX expression wrapped in `$...$`. We collapse the
    pair into a single line so the back-of-card render is one bullet per
    step — KaTeX rendering happens at the React layer.
    """
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for step in raw:
        if isinstance(step, str):
            text = step.strip()
            if text:
                out.append(text)
        elif isinstance(step, dict):
            instruction = str(step.get("instruction") or step.get("text") or step.get("description") or "").strip()
            math = str(step.get("math") or "").strip()
            if instruction and math:
                out.append(f"{instruction} — {math}")
            elif instruction:
                out.append(instruction)
            elif math:
                out.append(math)
    return out


def _problem_to_card(row: dict, deck_index: int) -> dict:
    options = _serialize_options(row.get("options"))
    correct_idx = row.get("correct_option") or 0
    correct_letter = _OPTION_LETTERS[correct_idx] if 0 <= correct_idx < 4 else "A"
    return {
        "id": f"card-{deck_index}",
        "problemId": row["id"],
        "difficulty": row.get("difficulty") or "medium",
        "front": {
            "questionText": row.get("question_text") or "",
            "questionPhonetic": row.get("question_phonetic"),
            "options": options,
        },
        "back": {
            "correctLetter": correct_letter,
            "explanation": row.get("explanation") or "",
            "solutionSteps": _serialize_solution_steps(row.get("solution_steps")),
        },
    }


def _resolve_subtopic_id(topic_slug: str, subtopic_slug: str) -> str | None:
    topic = (
        client()
        .table("topics")
        .select("id")
        .eq("slug", topic_slug)
        .limit(1)
        .execute()
    )
    if not topic.data:
        return None
    topic_id = topic.data[0]["id"]
    sub = (
        client()
        .table("subtopics")
        .select("id")
        .eq("topic_id", topic_id)
        .eq("slug", subtopic_slug)
        .limit(1)
        .execute()
    )
    return sub.data[0]["id"] if sub.data else None


def _resolve_names(topic_slug: str, subtopic_slug: str) -> tuple[str, str]:
    topic = (
        client()
        .table("topics")
        .select("id, name")
        .eq("slug", topic_slug)
        .limit(1)
        .execute()
    )
    if not topic.data:
        return (topic_slug, subtopic_slug)
    topic_name = topic.data[0].get("name") or topic_slug
    sub = (
        client()
        .table("subtopics")
        .select("name")
        .eq("topic_id", topic.data[0]["id"])
        .eq("slug", subtopic_slug)
        .limit(1)
        .execute()
    )
    subtopic_name = sub.data[0]["name"] if sub.data else subtopic_slug
    return (topic_name, subtopic_name)


def fetch_problems_for_subtopic(
    topic_slug: str,
    subtopic_slug: str,
    *,
    limit: int = 12,
    exclude_problem_ids: Iterable[str] = (),
) -> list[dict]:
    """Return up to `limit` problems for the subtopic, shuffled.

    Queries SAT problems first (linked via subtopic_id) and falls back to
    practice problems (linked via slug pair) if the SAT pool is empty —
    practice seeds are a superset for some subtopics.
    """
    excluded = set(exclude_problem_ids)

    rows: list[dict] = []
    subtopic_id = _resolve_subtopic_id(topic_slug, subtopic_slug)
    if subtopic_id:
        sat_resp = (
            client()
            .table("problems")
            .select(
                "id, difficulty, question_text, question_phonetic, options, "
                "correct_option, explanation, solution_steps"
            )
            .eq("source", "sat")
            .eq("subtopic_id", subtopic_id)
            .execute()
        )
        rows.extend(sat_resp.data or [])

    if not rows:
        practice_resp = (
            client()
            .table("problems")
            .select(
                "id, difficulty, question_text, question_phonetic, options, "
                "correct_option, explanation, solution_steps"
            )
            .eq("source", "practice")
            .eq("topic_slug", topic_slug)
            .eq("subtopic_slug", subtopic_slug)
            .execute()
        )
        rows.extend(practice_resp.data or [])

    rows = [r for r in rows if r["id"] not in excluded]
    random.shuffle(rows)
    return rows[:limit]


async def stream_flashcard_deck(
    topic_slug: str,
    subtopic_slug: str,
    *,
    count: int = 12,
    delay_seconds: float = 0.18,
) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted strings for the flashcard stream.

    Wire format mirrors the micro-lesson stream:
        data: {"meta": {...}}\n\n
        data: {"card": {...}}\n\n
        ...
        data: [DONE]\n\n
    """
    topic_name, subtopic_name = _resolve_names(topic_slug, subtopic_slug)
    yield "data: " + json.dumps({
        "meta": {
            "topicSlug": topic_slug,
            "subtopicSlug": subtopic_slug,
            "topicName": topic_name,
            "subtopicName": subtopic_name,
            "requestedCount": count,
        }
    }) + "\n\n"

    problems = fetch_problems_for_subtopic(topic_slug, subtopic_slug, limit=count)
    if not problems:
        yield "data: " + json.dumps({
            "error": "No problems found for this subtopic yet.",
        }) + "\n\n"
        yield "data: [DONE]\n\n"
        return

    for idx, row in enumerate(problems):
        card = _problem_to_card(row, idx)
        yield "data: " + json.dumps({"card": card}) + "\n\n"
        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)

    yield "data: " + json.dumps({"done": True}) + "\n\n"
    yield "data: [DONE]\n\n"


def regenerate_one_card(
    topic_slug: str,
    subtopic_slug: str,
    *,
    exclude_problem_ids: list[str],
    deck_index: int,
) -> dict | None:
    """Pull a single replacement card excluding the given problem IDs."""
    rows = fetch_problems_for_subtopic(
        topic_slug,
        subtopic_slug,
        limit=1,
        exclude_problem_ids=exclude_problem_ids,
    )
    if not rows:
        return None
    return _problem_to_card(rows[0], deck_index)
