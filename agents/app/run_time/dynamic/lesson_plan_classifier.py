"""
Lesson Plan Classifier — maps a free-form lesson plan (a student's class
handout, a syllabus excerpt, a teacher's notes) onto our existing
math + reading/writing subtopic taxonomy.

Returns a ranked list of subtopic matches with weights that sum to 1.0,
plus a detected ``subject`` ("math" | "reading-writing"). Downstream the
orchestrator splits a target problem count across the matched subtopics
in proportion to ``weight``.
"""

from __future__ import annotations

import json
import re
from typing import Literal

from agno.agent import Agent
from pydantic import BaseModel, ValidationError

from app.utils.db import client
from app.utils.llm_client import claude

MAX_RETRIES = 3
MAX_MATCHES = 4

Subject = Literal["math", "reading-writing"]


class SubtopicMatch(BaseModel):
    topic_slug: str
    subtopic_slug: str
    weight: float
    rationale: str


class ClassificationResult(BaseModel):
    subject: Subject
    matches: list[SubtopicMatch]
    notes: str | None = None


def _load_taxonomy() -> tuple[list[dict], dict[str, dict]]:
    """Return (subtopic_index, topic_by_slug).

    Each subtopic_index entry is a flat dict with topic + subtopic slug,
    name, description — small enough that we embed all rows in the
    classifier prompt (~36 total across math + reading/writing).
    """
    topic_rows = client().table("topics").select("id, slug, name").execute().data or []
    topic_by_slug: dict[str, dict] = {t["slug"]: t for t in topic_rows}
    topic_by_id: dict[str, dict] = {t["id"]: t for t in topic_rows}

    subtopic_rows = (
        client()
        .table("subtopics")
        .select("id, topic_id, slug, name, description")
        .execute()
        .data
        or []
    )

    subtopic_index: list[dict] = []
    for s in subtopic_rows:
        topic = topic_by_id.get(s["topic_id"])
        if not topic:
            continue
        subtopic_index.append(
            {
                "subtopic_id": s["id"],
                "subtopic_slug": s["slug"],
                "subtopic_name": s["name"],
                "subtopic_description": s.get("description") or "",
                "topic_id": topic["id"],
                "topic_slug": topic["slug"],
                "topic_name": topic["name"],
            }
        )

    return subtopic_index, topic_by_slug


def _format_taxonomy(subtopic_index: list[dict]) -> str:
    """Render the taxonomy as a compact slug-first table for the prompt."""
    lines = ["topic_slug › subtopic_slug — subtopic name"]
    for s in subtopic_index:
        desc = s["subtopic_description"].strip().replace("\n", " ")
        if len(desc) > 140:
            desc = desc[:137] + "..."
        suffix = f" — {desc}" if desc else ""
        lines.append(
            f"  {s['topic_slug']} › {s['subtopic_slug']} — {s['subtopic_name']}{suffix}"
        )
    return "\n".join(lines)


def _extract_json_object(text: str) -> dict:
    content = text.strip()
    if content.startswith("```"):
        content = re.sub(r"^```[a-z]*\n?", "", content)
        content = re.sub(r"\n?```$", "", content.strip())

    try:
        return json.loads(content)
    except json.JSONDecodeError:
        pass

    start = content.find("{")
    if start == -1:
        raise ValueError("No JSON object found in classifier response")
    depth = 0
    for i, ch in enumerate(content[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(content[start : i + 1])
    raise ValueError("Could not parse JSON object from classifier response")


def build_lesson_plan_classifier_agent(metadata: dict[str, str] | None = None) -> Agent:
    """Factory for the Agno classifier agent, pre-wired with Majordomo metadata."""
    return Agent(
        name="Lesson Plan Subtopic Classifier",
        model=claude(
            id="claude-sonnet-4-6",
            feature="lesson-plan-classifier",
            metadata=metadata,
        ),
        description=(
            "You map a student's lesson plan onto Athena's existing subtopic "
            "taxonomy. You are precise about which subtopics are actually "
            "covered and conservative when a topic is out of scope."
        ),
        instructions=[
            "You will receive (a) a TAXONOMY listing every available topic + subtopic "
            "and (b) a LESSON PLAN written by or for a student.",
            "Identify the subtopics from the taxonomy that the lesson plan covers.",
            "Return ONLY valid JSON (no markdown fences, no extra text) with this exact shape:",
            """{
  "subject": "math" | "reading-writing",
  "matches": [
    {
      "topic_slug": "<exact slug from taxonomy>",
      "subtopic_slug": "<exact slug from taxonomy>",
      "weight": <number in (0, 1]>,
      "rationale": "<one sentence explaining which parts of the plan map here>"
    }
  ],
  "notes": "<optional: short note if part of the plan does NOT fit any taxonomy subtopic, or null>"
}""",
            f"Return at most {MAX_MATCHES} matches. Use only slugs that appear verbatim in the taxonomy.",
            "Weights MUST be positive and sum to 1.0 across all matches (split proportionally to how much of the plan each subtopic covers).",
            "If the plan does not meaningfully fit any subtopic in the taxonomy (e.g., calculus, biology, history), return matches: [] and explain in notes.",
            "subject must reflect the matched subtopics — 'math' for any math topic, 'reading-writing' for the SAT R&W topics. If matches is empty, pick the closer one.",
            "Be conservative — do not pad with low-relevance matches. A single tight match with weight 1.0 is preferred when only one subtopic applies.",
            "Return ONLY the JSON object, nothing else.",
        ],
        markdown=False,
    )


def _normalize_matches(
    raw: ClassificationResult,
    subtopic_by_slug: dict[str, dict],
) -> ClassificationResult:
    """Filter matches whose slugs don't resolve, re-normalize weights to sum to 1.0,
    and clamp to MAX_MATCHES."""
    cleaned: list[SubtopicMatch] = []
    for m in raw.matches:
        key = (m.topic_slug, m.subtopic_slug)
        if key not in subtopic_by_slug:
            continue
        if m.weight <= 0:
            continue
        cleaned.append(m)

    cleaned = cleaned[:MAX_MATCHES]
    total = sum(m.weight for m in cleaned)
    if total > 0:
        for m in cleaned:
            m.weight = m.weight / total

    return ClassificationResult(subject=raw.subject, matches=cleaned, notes=raw.notes)


async def classify_lesson_plan(
    plan_text: str,
    *,
    metadata: dict[str, str] | None = None,
) -> tuple[ClassificationResult, list[dict]]:
    """Classify a free-form lesson plan against the live taxonomy.

    Returns ``(classification, subtopic_index)`` — the subtopic_index is
    handed back to the caller so it can resolve subtopic_id / topic_name
    for the matched slugs without re-querying.
    """
    if not plan_text or not plan_text.strip():
        raise ValueError("plan_text is required")

    subtopic_index, _topic_by_slug = _load_taxonomy()
    subtopic_by_slug = {
        (s["topic_slug"], s["subtopic_slug"]): s for s in subtopic_index
    }

    taxonomy_block = _format_taxonomy(subtopic_index)
    prompt = (
        "TAXONOMY:\n"
        f"{taxonomy_block}\n\n"
        "LESSON PLAN:\n"
        "<<<\n"
        f"{plan_text.strip()}\n"
        ">>>\n\n"
        "Return the JSON object as described in your instructions."
    )

    agent = build_lesson_plan_classifier_agent(metadata=metadata)

    last_error: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            response = await agent.arun(prompt)
            raw_obj = _extract_json_object(response.content)
            result = ClassificationResult.model_validate(raw_obj)
            return _normalize_matches(result, subtopic_by_slug), subtopic_index
        except (ValueError, ValidationError, json.JSONDecodeError) as e:
            last_error = e
            if attempt < MAX_RETRIES - 1:
                print(f"⚠ Retry {attempt + 1} for classifier: {e}", flush=True)

    raise RuntimeError(
        f"Failed to classify lesson plan after {MAX_RETRIES} attempts: {last_error}"
    )
