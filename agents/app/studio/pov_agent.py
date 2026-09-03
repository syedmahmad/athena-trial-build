"""
Studio Student POV Agent.

Maintains a living markdown document about each student, updated after
sessions to help any tutor quickly understand who the student is.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.utils.db import client
from app.utils.llm_client import anthropic_client

POV_SYSTEM_PROMPT = """You are maintaining a living "Point of View" document about a student. This document helps any tutor quickly understand who this student is and how they're doing.

You will receive:
1. The current POV document (may be empty for new students)
2. A session report from the most recent tutoring session

Your job is to UPDATE the POV document by incorporating the new session information. The document should be in markdown format with these sections:

# Student Profile
Brief description: grade level, learning style, preferences, personality notes

# Current Status
What they're working on, where they are in their learning journey

# Strengths
What they consistently do well

# Areas for Growth
Recurring challenges, common mistakes, concepts that need reinforcement

# Session History
Brief bullet points summarizing each session (most recent first), including date, topic, and key takeaway

# Tutor Notes
Important things any tutor should know — triggers, preferences, what works, what doesn't

---

Rules:
- Keep it concise but comprehensive — a new tutor should be able to read this in 60 seconds
- Update existing sections, don't just append
- If information conflicts with previous entries, use the most recent
- Remove outdated information (e.g., if a weakness has been resolved)
- Keep Session History to the last 10 sessions max
- Write in third person ("The student...", "They tend to...")
- Be objective and constructive — no negative judgments"""


def update_student_pov(
    student_id: str,
    session_report: str,
    session_id: str | None = None,
    session_metadata: dict | None = None,
) -> str:
    """Update the student's POV document with a new session report."""
    # Fetch current POV
    resp = (
        client()
        .table("studio_student_povs")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    current_pov = ""
    sessions_count = 0
    if resp.data:
        current_pov = resp.data[0].get("markdown", "")
        sessions_count = resp.data[0].get("sessions_incorporated", 0)

    # Build prompt
    user_content = (
        f"## Current POV Document\n\n"
        f"{current_pov or '(New student — no existing POV)'}\n\n"
        f"---\n\n"
        f"## Latest Session Report\n\n{session_report}"
    )
    if session_metadata:
        user_content += (
            f"\n\n## Session Context\n"
            f"Agent: {session_metadata.get('agent_id', 'unknown')}\n"
            f"Topic: {session_metadata.get('skill_name', 'unknown')}\n"
            f"Date: {session_metadata.get('started_at', 'unknown')}"
        )

    # Call Claude (via Majordomo gateway — see app/utils/llm_client.py)
    ai = anthropic_client(feature="studio-pov")
    response = ai.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2000,
        system=POV_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    updated_pov = response.content[0].text

    # Upsert POV
    upsert_data: dict = {
        "student_id": student_id,
        "markdown": updated_pov,
        "sessions_incorporated": sessions_count + 1,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if session_id:
        upsert_data["last_session_id"] = session_id

    client().table("studio_student_povs").upsert(
        upsert_data, on_conflict="student_id"
    ).execute()

    return updated_pov


def get_student_pov(student_id: str) -> dict | None:
    """Get the current POV record for a student."""
    resp = (
        client()
        .table("studio_student_povs")
        .select("*")
        .eq("student_id", student_id)
        .execute()
    )
    if resp.data:
        return resp.data[0]
    return None


def list_student_povs() -> list[dict]:
    """List all student POV records."""
    resp = (
        client()
        .table("studio_student_povs")
        .select("id, student_id, sessions_incorporated, last_session_id, created_at, updated_at")
        .order("updated_at", desc=True)
        .execute()
    )
    return resp.data or []
