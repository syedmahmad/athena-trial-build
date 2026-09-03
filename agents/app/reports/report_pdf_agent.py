"""
Structured analysis for the student PDF report.

Input: precomputed aggregates from the Next.js orchestrator (quiz
event counts + per-question metrics, OR micro-lesson session counts +
optional chat-transcript excerpt + per-step attempt history).

Output: a strict JSON shape (ReportAnalysis) emitted via Claude
tool-use so the renderer can rely on label lengths and icon names.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from app.utils.llm_client import anthropic_client

# Must match REPORT_ICONS in src/lib/reports/types.ts. Update both
# sides together — the React renderer falls back to a generic Circle
# for anything outside this list.
ICON_WHITELIST = [
    "zap",
    "target",
    "trending-up",
    "compass",
    "brain",
    "clock",
    "scale",
    "lightbulb",
    "shield-check",
    "alert-triangle",
    "footprints",
    "telescope",
    "check-circle",
    "book-open",
    "message-circle-question",
]

CHIP_SCHEMA = {
    "type": "object",
    "required": ["icon", "label"],
    "properties": {
        "icon": {"type": "string", "enum": ICON_WHITELIST},
        "label": {"type": "string", "maxLength": 48},
        "detail": {"type": "string", "maxLength": 90},
    },
    "additionalProperties": False,
}

REPORT_TOOL = {
    "name": "emit_report",
    "description": "Emit the structured beautiful-report analysis.",
    "input_schema": {
        "type": "object",
        "required": [
            "headline",
            "scoreContext",
            "strengths",
            "growthAreas",
            "speedInsight",
            "nextStepSuggestion",
        ],
        "properties": {
            "headline": {"type": "string", "maxLength": 60},
            "scoreContext": {"type": "string", "maxLength": 130},
            "strengths": {
                "type": "array",
                "minItems": 2,
                "maxItems": 4,
                "items": CHIP_SCHEMA,
            },
            "growthAreas": {
                "type": "array",
                "minItems": 2,
                "maxItems": 4,
                "items": CHIP_SCHEMA,
            },
            "speedInsight": {"type": "string", "maxLength": 130},
            "nextStepSuggestion": {"type": "string", "maxLength": 130},
        },
        "additionalProperties": False,
    },
}

SYSTEM_PROMPT = (
    "You are a perceptive teaching analyst preparing a printed "
    "one-page report for a student. Bias toward concrete, "
    "non-prose observations. Each label is a chip on a printed page: "
    "1–6 words, no full sentences. The optional detail line is a "
    "brief clarifier (one short sentence at most), not a paragraph. "
    "Strengths and growth areas must each have 2 to 4 distinct items. "
    "The headline goes under a circular score badge — 6 words max, "
    "warm but specific. "
    "\n\nFor scoreContext, speedInsight, and nextStepSuggestion: "
    "write ONE short sentence each, under 120 characters. Better to "
    "stop early than be cut off mid-word — the print layout shows "
    "exactly what you write, no scrollbar. "
    "\n\nIMPORTANT: the `system_difficulty` value on each question is "
    "set by the curriculum, not chosen by the student. NEVER tell the "
    "student to 'pick a lower difficulty', 'start at level 1', or "
    "anything that implies they control problem difficulty — they "
    "don't. Recommend specific concept reviews, subtopic restarts, "
    "or pacing changes instead."
)


def _truncate_transcript(messages: list[dict[str, str]], max_chars: int = 3000) -> str:
    """Render and trim the chat transcript. Keep the first 2 turns
    (which usually carry the originating question) plus the most
    recent turns until we hit the budget."""
    if not messages:
        return ""

    lines: list[str] = []
    for m in messages:
        role = m.get("role", "user")
        speaker = "Student" if role == "user" else "Tutor"
        content = " ".join((m.get("content") or "").split())
        if content:
            lines.append(f"{speaker}: {content}")

    full = "\n".join(lines)
    if len(full) <= max_chars:
        return full

    # Keep first 2 turns + tail until budget. Cheap heuristic.
    head = "\n".join(lines[:2])
    tail_budget = max_chars - len(head) - len("\n...\n")
    tail = "\n".join(lines[-6:])
    if len(tail) > tail_budget:
        tail = tail[-tail_budget:]
    return f"{head}\n...\n{tail}"


def _format_quiz_user_message(aggregates: dict[str, Any]) -> str:
    per_q = aggregates.get("perQuestion", [])
    per_q_lines = []
    for q in per_q:
        bits = [
            f"Q{q['index'] + 1}",
            "correct" if q["isCorrect"] else "wrong",
            # Renamed from `diff=` to make the prompt unambiguous:
            # this is curriculum-assigned difficulty, not user-picked.
            # See SYSTEM_PROMPT for the explicit non-recommendation.
            f"system_difficulty={q.get('difficultyLevel')}",
            f"{q['responseTimeMs']}ms" if q.get("responseTimeMs") else "no-time",
        ]
        flags = []
        if q.get("hintUsed"):
            flags.append("hint")
        if q.get("tutorUsed"):
            flags.append("tutor")
        if q.get("practiceCompleted"):
            flags.append("practice✓")
        if flags:
            bits.append("/".join(flags))
        if q.get("wrongCount", 0) > 1:
            bits.append(f"wrong×{q['wrongCount']}")
        per_q_lines.append("  " + " ".join(bits))

    summary = (
        f"Quiz report — topic: {aggregates.get('topicName')!r}, subtopic: {aggregates.get('subtopicName')!r}.\n"
        f"Score {aggregates.get('score')}/{aggregates.get('totalQuestions')} "
        f"({round(aggregates.get('accuracy', 0) * 100)}% accuracy) in "
        f"{aggregates.get('timeElapsedSeconds')}s.\n"
        f"Median response: {aggregates.get('medianResponseTimeMs')}ms, "
        f"mean: {aggregates.get('meanResponseTimeMs')}ms.\n"
        f"Hint rate: {round(aggregates.get('hintRate', 0) * 100)}%, "
        f"tutor rate: {round(aggregates.get('tutorRate', 0) * 100)}%, "
        f"recovery rate (practiced-after-tutor): {round(aggregates.get('recoveryRate', 0) * 100)}%.\n"
        f"Event counts: {json.dumps(aggregates.get('events', {}))}\n"
    )
    skill = aggregates.get("skill") or {}
    if skill:
        summary += (
            f"Subsection skill: level {skill.get('level')}, "
            f"xp {skill.get('xp')}, streak +{skill.get('streakCorrect')}.\n"
        )
    summary += "Per-question:\n" + "\n".join(per_q_lines)
    return summary


def _format_micro_lesson_user_message(
    aggregates: dict[str, Any], snapshot: Optional[dict[str, Any]]
) -> str:
    out = (
        f"Micro-lesson report — topic: {aggregates.get('topicName')!r}, "
        f"subtopic: {aggregates.get('subtopicName')!r}.\n"
        f"Duration: {aggregates.get('durationSeconds')}s. "
        f"Steps viewed: {aggregates.get('stepsViewed')}/{aggregates.get('totalSteps')}. "
        f"Check-ins: {aggregates.get('checkinsCorrect')}/{aggregates.get('checkinsTotal')} correct. "
        f"Chat messages: {aggregates.get('chatMessageCount')}. "
        f"Completed: {aggregates.get('completed')}.\n"
    )
    skill = aggregates.get("skill") or {}
    if skill:
        out += (
            f"Subsection skill: level {skill.get('level')}, "
            f"xp {skill.get('xp')}, streak +{skill.get('streakCorrect')}.\n"
        )

    if snapshot:
        objectives = snapshot.get("learningObjectives") or []
        if objectives:
            out += "Learning objectives:\n  - " + "\n  - ".join(objectives) + "\n"

        formulas = snapshot.get("keyFormulas") or []
        if formulas:
            out += "Key formulas:\n  - " + "\n  - ".join(
                f"{f.get('description', '')} ({f.get('latex', '')})" for f in formulas
            ) + "\n"

        per_step = snapshot.get("perStepAttempts") or []
        if per_step:
            lines = []
            for s in per_step:
                bits = [
                    f"step {s.get('stepIndex')}",
                    s.get("kind", "check_in"),
                    f"wrong×{s.get('wrongCount', 0)}",
                    f"hint={s.get('hintReached', 'none')}",
                ]
                if s.get("tutorEntered"):
                    bits.append("tutor")
                lines.append("  " + " ".join(bits))
            out += "Per-step attempts:\n" + "\n".join(lines) + "\n"

        timings = snapshot.get("stepTimings") or []
        if timings:
            ms_values = [t.get("responseMs") for t in timings if t.get("responseMs")]
            if ms_values:
                avg_ms = sum(ms_values) // len(ms_values)
                out += f"Avg response time on interactive steps: {avg_ms}ms across {len(ms_values)} samples.\n"

        transcript = _truncate_transcript(snapshot.get("chatMessages") or [])
        if transcript:
            out += "Chat transcript:\n" + transcript + "\n"

    return out


def _normalize_chip(chip: Any) -> dict[str, Any] | None:
    if not isinstance(chip, dict):
        return None
    icon = chip.get("icon")
    label = chip.get("label")
    if not isinstance(label, str) or not label.strip():
        return None
    if icon not in ICON_WHITELIST:
        icon = "compass"
    out: dict[str, Any] = {"icon": icon, "label": _clamp_words(label, 48)}
    detail = chip.get("detail")
    if isinstance(detail, str) and detail.strip():
        out["detail"] = _clamp_words(detail, 90)
    return out


def _safe_string(value: Any, fallback: str = "") -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _clamp_words(text: str, max_chars: int) -> str:
    """Cap `text` at `max_chars` without breaking mid-word.

    The plain `[:N]` slice produced reports like
    "indicating the solutio" — the print layout has no scrollbar,
    so the truncated tail is the final rendered string. Walk back
    to the nearest space and trim trailing punctuation. If the
    last space lands too far back (more than 25% of the budget
    lost), keep the hard cut — better than emitting two words.
    """
    text = (text or "").strip()
    if len(text) <= max_chars:
        return text
    cut = text[:max_chars]
    last_space = cut.rfind(" ")
    if last_space >= int(max_chars * 0.75):
        cut = cut[:last_space]
    return cut.rstrip(" ,.;:—-")


def _normalize_response(raw: dict[str, Any]) -> dict[str, Any]:
    strengths = [n for c in (raw.get("strengths") or []) if (n := _normalize_chip(c))]
    growth = [n for c in (raw.get("growthAreas") or []) if (n := _normalize_chip(c))]

    # Ensure at least 2 chips per side so the renderer doesn't show
    # an empty column. If the model under-delivered, pad with a
    # generic placeholder.
    while len(strengths) < 2:
        strengths.append({"icon": "shield-check", "label": "Solid effort"})
    while len(growth) < 2:
        growth.append({"icon": "compass", "label": "Practice this again"})

    return {
        "headline": _clamp_words(_safe_string(raw.get("headline"), "Nice work"), 60),
        "scoreContext": _clamp_words(_safe_string(raw.get("scoreContext")), 130),
        "strengths": strengths[:4],
        "growthAreas": growth[:4],
        "speedInsight": _clamp_words(_safe_string(raw.get("speedInsight")), 130),
        "nextStepSuggestion": _clamp_words(_safe_string(raw.get("nextStepSuggestion")), 130),
    }


def analyze_report(
    *,
    kind: str,
    aggregates: dict[str, Any],
    snapshot: Optional[dict[str, Any]],
    headers: Optional[dict[str, str]] = None,
) -> dict[str, Any]:
    if kind == "quiz":
        user_message = _format_quiz_user_message(aggregates)
    elif kind == "micro-lesson":
        user_message = _format_micro_lesson_user_message(aggregates, snapshot)
    else:
        raise ValueError(f"Unknown report kind: {kind}")

    client = anthropic_client(feature="report-pdf", metadata=headers or {})
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1200,
        system=SYSTEM_PROMPT,
        tools=[REPORT_TOOL],
        tool_choice={"type": "tool", "name": "emit_report"},
        messages=[{"role": "user", "content": user_message}],
    )

    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "emit_report":
            raw = block.input if isinstance(block.input, dict) else json.loads(block.input)  # type: ignore[arg-type]
            return _normalize_response(raw)

    raise RuntimeError("Model did not emit emit_report tool call")
