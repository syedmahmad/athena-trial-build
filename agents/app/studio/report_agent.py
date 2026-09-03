"""
Studio Session Report Agent.

Generates a structured session report from interaction event history
using Claude. Called on demand after a session completes.
"""

from __future__ import annotations

from app.studio.events import get_session_events
from app.utils.db import client
from app.utils.llm_client import anthropic_client

REPORT_SYSTEM_PROMPT = """You are a teaching analyst. Given a record of interactions from a tutoring session, generate a concise session report.

The report should include:
- **Summary**: 1-2 sentences describing what happened
- **Topic Covered**: What was taught
- **Student Performance**: How the student did (correct/incorrect answers, areas of confusion)
- **Engagement**: Was the student engaged, asking questions, rushing?
- **Areas of Struggle**: Specific concepts or steps where the student had difficulty
- **Strengths**: What the student did well
- **Recommendations**: What should be covered next, what to review

Output as clean markdown. Be specific and actionable — this will be read by another tutor who needs to pick up where you left off."""


def generate_session_report(session_id: str) -> str:
    """Generate a report for a session from its interaction events."""
    # Fetch session + events
    session_resp = (
        client()
        .table("studio_live_sessions")
        .select("*")
        .eq("id", session_id)
        .execute()
    )
    session = session_resp.data[0] if session_resp.data else {}
    events = get_session_events(session_id)

    # Build context for the LLM
    context = format_session_for_report(session, events)

    # Call Claude (via Majordomo gateway — see app/utils/llm_client.py)
    ai = anthropic_client(feature="studio-report")
    response = ai.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1000,
        system=REPORT_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": context}],
    )

    report_md = response.content[0].text

    # Store report in session metadata
    if session:
        existing_meta = session.get("metadata") or {}
        existing_meta["ai_report"] = report_md
        client().table("studio_live_sessions").update(
            {"metadata": existing_meta}
        ).eq("id", session_id).execute()

    return report_md


def format_session_for_report(session: dict, events: list[dict]) -> str:
    """Format session data and events into a readable context string for the LLM."""
    lines = []
    lines.append(f"Session ID: {session.get('id', 'unknown')}")
    lines.append(f"Agent: {session.get('agent_id', 'unknown')}")
    lines.append(f"Topic: {session.get('skill_name', 'unknown')}")
    lines.append(f"Started: {session.get('started_at', 'unknown')}")
    lines.append(f"Phase reached: {session.get('current_phase', 'unknown')}")
    lines.append("")
    lines.append("## Interaction Timeline")

    if not events:
        lines.append("(No granular events recorded — session may have used legacy flow)")
        # Fall back to session messages if available
        messages = session.get("messages") or []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")[:300]
            lines.append(f"  {role}: {content}")
        return "\n".join(lines)

    for event in events:
        etype = event.get("event_type", "")
        edata = event.get("event_data", {})
        ts = event.get("created_at", "")

        if etype == "message_sent":
            lines.append(f"[{ts}] Student: {edata.get('content', '')}")
        elif etype == "message_received":
            lines.append(f"[{ts}] Tutor: {edata.get('content', '')[:200]}...")
        elif etype == "step_viewed":
            lines.append(f"[{ts}] Viewed step {edata.get('step_index', '?')}: {edata.get('title', '')}")
        elif etype == "check_in_answered":
            correct = edata.get("correct", False)
            lines.append(f"[{ts}] Check-in: {'correct' if correct else 'incorrect'} (answer: {edata.get('answer', '?')})")
        elif etype == "prediction_answered":
            correct = edata.get("correct", False)
            lines.append(f"[{ts}] Prediction: {'correct' if correct else 'incorrect'}")
        elif etype == "fill_blank_answered":
            correct = edata.get("correct", False)
            lines.append(f"[{ts}] Fill-blank: {'correct' if correct else 'incorrect'} (answer: {edata.get('answer', '?')})")
        elif etype == "session_started":
            lines.append(f"[{ts}] Session started")
        elif etype == "session_ended":
            lines.append(f"[{ts}] Session ended")
        elif etype == "triage_handoff":
            lines.append(f"[{ts}] Triage handoff to agent: {edata.get('agent_id', '?')}")
        else:
            lines.append(f"[{ts}] {etype}: {edata}")

    return "\n".join(lines)
