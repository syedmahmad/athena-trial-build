"""
Supabase persistence layer for content generation workflow.
"""

import os
from supabase import create_client, Client


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


_client: Client | None = None


def client() -> Client:
    global _client
    if _client is None:
        _client = get_client()
    return _client


# ── Queries (for idempotency) ──


def get_topic_by_slug(slug: str) -> dict | None:
    resp = client().table("topics").select("*").eq("slug", slug).execute()
    return resp.data[0] if resp.data else None


def get_subtopic(topic_id: str, slug: str) -> dict | None:
    resp = (
        client()
        .table("subtopics")
        .select("*")
        .eq("topic_id", topic_id)
        .eq("slug", slug)
        .execute()
    )
    return resp.data[0] if resp.data else None


def get_practice_problem_count(topic_slug: str, subtopic_slug: str) -> int:
    resp = (
        client()
        .table("problems")
        .select("id", count="exact")
        .eq("source", "practice")
        .eq("topic_slug", topic_slug)
        .eq("subtopic_slug", subtopic_slug)
        .execute()
    )
    return resp.count or 0


def get_problem_count(subtopic_id: str) -> int:
    resp = (
        client()
        .table("problems")
        .select("id", count="exact")
        .eq("source", "sat")
        .eq("subtopic_id", subtopic_id)
        .execute()
    )
    return resp.count or 0


# ── Writes ──


def save_topic(topic_data: dict) -> dict:
    """Upsert a topic row. Returns the saved row."""
    resp = (
        client()
        .table("topics")
        .upsert(topic_data, on_conflict="slug")
        .execute()
    )
    return resp.data[0]


def save_subtopic(subtopic_data: dict) -> dict:
    """Upsert a subtopic row. Returns the saved row."""
    resp = (
        client()
        .table("subtopics")
        .upsert(subtopic_data, on_conflict="topic_id,slug")
        .execute()
    )
    return resp.data[0]


def save_problems(problems_list: list[dict]) -> list[dict]:
    """Batch insert SAT problems. Returns saved rows.

    Plain insert, not upsert: the only unique index on `problems` for SAT rows
    is the PARTIAL index `(subtopic_id, order_index) WHERE source = 'sat'`, which
    PostgREST's column-list `on_conflict` cannot target (it raises 42P10).
    Idempotency is handled upstream in content_workflow, which skips subtopics
    that already have enough problems; the partial unique index still guards
    against duplicate (subtopic_id, order_index) for SAT rows.
    """
    if not problems_list:
        return []
    # Ensure source is set for all problems
    for p in problems_list:
        p.setdefault("source", "sat")
    resp = (
        client()
        .table("problems")
        .insert(problems_list)
        .execute()
    )
    return resp.data


def save_practice_problems(problems: list[dict]) -> None:
    """Insert practice problems into the problems table."""
    if not problems:
        return
    rows = [
        {
            "source": "practice",
            "subtopic_id": p.get("subtopic_id"),
            "topic_slug": p["topic_slug"],
            "subtopic_slug": p["subtopic_slug"],
            "order_index": p["order_index"],
            "difficulty": p["difficulty"],
            "question_text": p["question_text"],
            "question_phonetic": p.get("question_phonetic"),
            "options": p["options"],
            "correct_option": p["correct_option"],
            "explanation": p["explanation"],
            "solution_steps": p.get("solution_steps", []),
            "concept_tags": p.get("concept_tags", []),
            "common_errors": p.get("common_errors", []),
            "time_recommendation_seconds": p.get("time_recommendation_seconds", 90),
            "sat_frequency": p.get("sat_frequency"),
            "hint": p.get("hint", ""),
            "detailed_hint": p.get("detailed_hint", ""),
        }
        for p in problems
    ]
    client().table("problems").insert(rows).execute()


# ── Full SAT ──


def get_full_sat_problem_count(subtopic_id: str) -> int:
    """Count existing full_sat problems for a subtopic."""
    resp = (
        client()
        .table("problems")
        .select("id", count="exact")
        .eq("source", "full_sat")
        .eq("subtopic_id", subtopic_id)
        .execute()
    )
    return resp.count or 0


def save_full_sat_problems(problems: list[dict]) -> None:
    """Insert full_sat problems into the problems table."""
    if not problems:
        return
    rows = [
        {
            "source": "full_sat",
            "subtopic_id": p["subtopic_id"],
            "topic_slug": p.get("topic_slug"),
            "subtopic_slug": p.get("subtopic_slug"),
            "order_index": p["order_index"],
            "difficulty": p["difficulty"],
            "difficulty_level": p.get("difficulty_level", 5),
            "question_text": p["question_text"],
            "options": p["options"],
            "correct_option": p["correct_option"],
            "explanation": p["explanation"],
            "solution_steps": p.get("solution_steps", []),
            "concept_tags": p.get("concept_tags", []),
            "common_errors": p.get("common_errors", []),
            "time_recommendation_seconds": p.get("time_recommendation_seconds", 90),
            "sat_frequency": p.get("sat_frequency"),
            "hint": p.get("hint", ""),
            "detailed_hint": p.get("detailed_hint", ""),
        }
        for p in problems
    ]
    client().table("problems").insert(rows).execute()


def get_full_sat_tests() -> list[dict]:
    """Get all full_sat test blueprints."""
    resp = client().table("full_sat_tests").select("*").order("test_number").execute()
    return resp.data or []


def create_full_sat_test(test_number: int, name: str) -> dict:
    """Create a new full SAT test blueprint. Returns the saved row."""
    resp = (
        client()
        .table("full_sat_tests")
        .insert({"test_number": test_number, "name": name, "status": "active"})
        .execute()
    )
    return resp.data[0]


def add_test_problems(test_id: str, problems: list[dict]) -> None:
    """Bulk-insert problem mappings for a full SAT test."""
    if not problems:
        return
    rows = [
        {
            "test_id": test_id,
            "problem_id": p["problem_id"],
            "section": p["section"],
            "module": p["module"],
            "order_index": p["order_index"],
        }
        for p in problems
    ]
    client().table("full_sat_test_problems").insert(rows).execute()


def get_used_full_sat_problem_ids() -> set[str]:
    """Get all problem IDs already assigned to a full SAT test."""
    resp = (
        client()
        .table("full_sat_test_problems")
        .select("problem_id")
        .execute()
    )
    return {row["problem_id"] for row in (resp.data or [])}


def get_full_sat_problems_for_subtopic(subtopic_id: str) -> list[dict]:
    """Get all full_sat problems for a subtopic."""
    resp = (
        client()
        .table("problems")
        .select("id, difficulty, difficulty_level")
        .eq("source", "full_sat")
        .eq("subtopic_id", subtopic_id)
        .execute()
    )
    return resp.data or []
