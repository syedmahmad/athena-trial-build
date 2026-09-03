"""
Studio session event recording.

Provides functions to record and query granular interaction events
that occur during tutoring sessions.
"""

from __future__ import annotations

from app.utils.db import client


def record_event(session_id: str, event_type: str, event_data: dict) -> None:
    """Record a session interaction event."""
    client().table("studio_session_events").insert({
        "session_id": session_id,
        "event_type": event_type,
        "event_data": event_data,
    }).execute()


def get_session_events(session_id: str) -> list[dict]:
    """Get all events for a session, ordered chronologically."""
    resp = (
        client()
        .table("studio_session_events")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return resp.data or []


def get_student_sessions(student_id: str) -> list[dict]:
    """Get all sessions for a student with their events."""
    resp = (
        client()
        .table("studio_live_sessions")
        .select("*")
        .eq("metadata->>student_id", student_id)
        .order("started_at", desc=True)
        .execute()
    )
    return resp.data or []
